import express from 'express';
import { scrapeResultados, TARGET_URL } from './scraper.js';

const app = express();
const PORT = process.env.PORT ?? 3000;

// Per-URL in-memory cache (5 minutes)
const cache = new Map(); // url -> { data, time }
const CACHE_TTL_MS = 5 * 60 * 1000;

app.get('/resultados', async (req, res) => {
  const force = req.query.force === 'true';
  const rawUrl = req.query.url;

  let targetUrl = TARGET_URL;
  if (rawUrl) {
    try {
      targetUrl = new URL(rawUrl).toString();
    } catch {
      return res.status(400).json({ error: 'Parámetro url inválido' });
    }
  }

  const now = Date.now();
  const cached = cache.get(targetUrl);

  if (!force && cached && now - cached.time < CACHE_TTL_MS) {
    return res.json({ source: 'cache', cached_at: new Date(cached.time).toISOString(), ...cached.data });
  }

  try {
    console.log(`Scraping: ${targetUrl}`);
    const data = await scrapeResultados(targetUrl);
    cache.set(targetUrl, { data, time: now });
    res.json({ source: 'live', ...data });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al hacer scraping', detalle: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Endpoint: http://localhost:${PORT}/resultados`);
});
