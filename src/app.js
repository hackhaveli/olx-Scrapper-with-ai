'use strict';
/**
 * src/app.js
 *
 * Express application factory.
 * Mounts all routes; does not call app.listen() (that lives in server.js).
 */

const express = require('express');
const path    = require('path');

const scrapeRouter    = require('./routes/scrape');
const searchRouter    = require('./routes/search');
const recommendRouter = require('./routes/recommend');

const app = express();
app.use(express.json());

// Serve the frontend UI
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/scrape',    scrapeRouter);
app.use('/search',    searchRouter);
app.use('/recommend', recommendRouter);

// ── Info endpoints ───────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.json({
  status:  'OLX India Smart Scraper API',
  version: '3.0',
  endpoints: {
    'GET /scrape':    'Raw scrape — requires full OLX India URL (?url=...)',
    'GET /search':    'Keyword search with filters (?q=iphone&max_price=20000&location=Delhi)',
    'GET /recommend': 'Smart deals (?q=iphone&budget=16000&location=Sangam+Vihar)',
    'GET /health':    'Health check',
  },
}));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[UNHANDLED]', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
