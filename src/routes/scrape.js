'use strict';
/**
 * src/routes/scrape.js
 *
 * Backward-compatible /scrape endpoint.
 * Accepts a full OLX India URL directly (original behaviour).
 */

const express = require('express');
const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const { fetchViaJina } = require('../services/fetcher');
const { parseListingsFromMarkdown, normalizeListing, parseEnglishDate } = require('../services/parser');

dayjs.extend(customParse);
dayjs.extend(isSameOrAfter);

const router = express.Router();
const DEFAULT_LIMIT = 20;

async function runScraper(url, maxItems, dateFrom) {
  console.log(`[SCRAPE] Fetching: ${url}`);
  const markdown = await fetchViaJina(url);
  const kb = (markdown.length / 1024).toFixed(1);
  console.log(`[SCRAPE] Markdown received: ${kb}KB`);

  const rawItems = parseListingsFromMarkdown(markdown);
  console.log(`[SCRAPE] Raw items parsed: ${rawItems.length}`);

  const normalized = rawItems.map((raw, i) => {
    try { return normalizeListing(raw, i); }
    catch (e) { console.error(`[SCRAPE] Failed item ${i}: ${e.message}`); return null; }
  }).filter(Boolean);

  // Date filter
  let filtered = normalized;
  if (dateFrom) {
    filtered = normalized.filter(x => {
      if (!x.date_parsed) return false;
      return dayjs(x.date_parsed).isSameOrAfter(dateFrom, 'day');
    });
  }

  // Deduplicate by link
  const seen = new Set();
  const final = [];
  for (const item of filtered) {
    if (!seen.has(item.link)) { seen.add(item.link); final.push(item); }
  }

  console.log(`[SCRAPE] Final: ${final.length} items`);
  return final.slice(0, maxItems);
}

router.get('/', async (req, res) => {
  req.setTimeout(180000);
  console.log('\n--- /scrape ---');

  const { url, date_from, limit } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter is required' });
  if (!url.includes('olx.in')) {
    return res.status(400).json({ error: 'Only OLX India (olx.in) URLs are supported' });
  }

  const maxItems = Math.min(parseInt(limit || DEFAULT_LIMIT, 10), 500);
  let dateFromObj = null;
  if (date_from) {
    dateFromObj = dayjs(date_from, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
    if (!dateFromObj.isValid()) {
      return res.status(400).json({ error: 'Invalid date_from. Use YYYY-MM-DD or DD/MM/YYYY' });
    }
  }

  try {
    const items = await runScraper(url, maxItems, dateFromObj);
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    console.error('[SCRAPE ERROR]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
