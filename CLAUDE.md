# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web scraper service that extracts Colombian 2026 election pre-count results from `https://elecciones.rtvc.gov.co/` and exposes them via a REST API. Built for La Silla Vacía.

## Commands

```bash
npm install               # Install Node dependencies
npm run install:browsers  # Install Chromium (required before first run)
npm start                 # Start server on http://localhost:3000
npm run dev               # Start with --watch auto-reload
```

No test suite or linter is configured.

## Architecture

Two-file ESM project:

**`src/index.js`** — Express HTTP server
- `GET /resultados` — returns election results; `?force=true` bypasses cache
- `GET /health` — health check
- 5-minute in-memory cache with a `source: 'cache' | 'live'` field in the response
- Port defaults to `3000`, overridable via `PORT` env var

**`src/scraper.js`** — Playwright scraper
- Launches headless Chromium, navigates to the target URL, waits for `networkidle` + 4 s
- Intercepts XHR/fetch responses before page load
- Extracts data via five parallel strategies: HTML tables, `<script type="application/json">` / JSON-LD blocks, window globals (`__INITIAL_STATE__`, `__NEXT_DATA__`, etc.), CSS-class heuristics (`candidat`, `resultado`, `partido`, `voto`, `percent`), and main content text (capped at 8000 chars)
- Returns a single object: `{ titulo, url, timestamp, tablas, json_ld, window_globals, elementos_resultados, api_responses, texto_principal }`

**Data flow:** `HTTP request → cache check → (miss) Playwright scrape → update cache → JSON response`
