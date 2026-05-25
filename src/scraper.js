import { chromium } from 'playwright';

export const TARGET_URL = 'https://www.lasillavacia.com/resultados-preconteo-elecciones-2026/';

export async function scrapeResultados(url = TARGET_URL) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  const apiResponses = [];

  const page = await context.newPage();

  // Intercept JSON API responses
  page.on('response', async (response) => {
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType.includes('json') && response.status() === 200) {
      try {
        const body = await response.json();
        apiResponses.push({ url: response.url(), data: body });
      } catch {
        // ignore non-parseable responses
      }
    }
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(4000);

  const title = await page.title();
  const extracted = await extractFromPage(page);

  await browser.close();

  return {
    titulo: title,
    url,
    timestamp: new Date().toISOString(),
    ...extracted,
    ...(apiResponses.length > 0 ? { api_responses: apiResponses } : {}),
  };
}

async function extractFromPage(page) {
  const data = {};

  // Tables
  const tables = await page.evaluate(() => {
    return [...document.querySelectorAll('table')].map((table) => {
      return [...table.querySelectorAll('tr')].map((tr) =>
        [...tr.querySelectorAll('th, td')].map((td) => td.innerText.trim())
      ).filter((row) => row.length > 0);
    }).filter((t) => t.length > 0);
  });
  if (tables.length) data.tablas = tables;

  // JSON-LD / embedded JSON scripts
  const jsonLd = await page.evaluate(() => {
    return [...document.querySelectorAll('script[type="application/json"], script[type="application/ld+json"]')]
      .map((s) => { try { return JSON.parse(s.textContent); } catch { return null; } })
      .filter(Boolean);
  });
  if (jsonLd.length) data.json_ld = jsonLd;

  // Window globals (__NEXT_DATA__, __INITIAL_STATE__, etc.)
  const globals = await page.evaluate(() => {
    const keys = ['__INITIAL_STATE__', '__REDUX_STATE__', '__APP_STATE__', '__DATA__', '__NEXT_DATA__'];
    const found = {};
    for (const k of keys) {
      if (window[k] !== undefined) {
        try {
          found[k] = typeof window[k] === 'string' ? JSON.parse(window[k]) : window[k];
        } catch {
          found[k] = String(window[k]);
        }
      }
    }
    return Object.keys(found).length ? found : null;
  });
  if (globals) data.window_globals = globals;

  // Elements matching election-result class patterns
  const elementos = await page.evaluate(() => {
    const selectors = [
      '[class*="candidat"]', '[class*="resultado"]', '[class*="candidate"]',
      '[class*="result"]', '[class*="partido"]', '[class*="voto"]',
      '[class*="vote"]', '[class*="percent"]', '[class*="porcent"]',
    ];
    const seen = new Set();
    const results = [];
    selectors.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        if (!seen.has(el)) {
          seen.add(el);
          results.push({
            tag: el.tagName,
            clases: el.className,
            texto: el.innerText.trim().substring(0, 500),
          });
        }
      });
    });
    return results;
  });
  if (elementos.length) data.elementos_resultados = elementos;

  // Main visible text
  const textoPrincipal = await page.evaluate(() => {
    const el = document.querySelector('main, article, #content, .content, [class*="content"], [class*="main"]');
    return (el ?? document.body).innerText.trim().substring(0, 8000);
  });
  data.texto_principal = textoPrincipal;

  return data;
}
