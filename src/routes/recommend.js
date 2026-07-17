'use strict';
/**
 * src/routes/recommend.js
 *
 * GET /recommend — smart deal finder.
 *
 * Pipeline:
 *   1. Parse multi-location input (comma-separated or repeated param)
 *   2. Build fetch URLs (OLX location-specific if slug known, else generic)
 *   3. Fetch pages in parallel with 60s cache
 *   4. Merge + deduplicate all listings
 *   5. Apply phoneParser to every listing
 *   6. Apply budget filter
 *   7. Apply multi-location fuzzy filter (OR across all given locations)
 *   8. Score and rank via ranking engine
 *   9. Call Gemini AI for deal analysis (optional, fails gracefully)
 *  10. Return top `limit` results + AI analysis
 *
 * Query parameters:
 *   q         Search term (required)
 *   budget    Max price in INR (optional but recommended)
 *   location  Target location(s) — comma-separated or repeated
 *             e.g. "Sangam Vihar,Kalkaji" or location=Sangam+Vihar&location=Delhi
 *   pages     OLX pages to scrape (default: 3, max: 5)
 *   limit     Max results to return (default: 10, max: 50)
 *   ai        Pass ai=0 to skip Gemini analysis
 */

const express = require('express');
const { fetchViaJina, buildOlxSearchUrl, buildOlxLocationUrl, hasOlxLocationSlug } = require('../services/fetcher');
const { parseListingsFromMarkdown, normalizeListing } = require('../services/parser');
const { parsePhoneAttributes } = require('../services/phoneParser');
const { filterByLocation, parseLocations, filterByAnyLocation } = require('../services/location');
const { rankListings } = require('../services/ranking');
const { analyzeDeals } = require('../services/gemini');

const router = express.Router();


router.get('/', async (req, res) => {
  req.setTimeout(300000); // 5 min for multi-page + AI
  console.log('\n--- /recommend ---', req.query);

  const {
    q,
    budget,
    pages  = '3',
    limit  = '10',
    ai     = '1',
  } = req.query;

  if (!q) return res.status(400).json({ error: '"q" (search query) is required' });

  const locations   = parseLocations(req.query.location);
  const maxPages    = Math.min(5, Math.max(1, parseInt(pages, 10)));
  const limitNum    = Math.min(50, Math.max(1, parseInt(limit, 10)));
  const budgetNum   = budget ? parseFloat(budget) : null;
  const useAI       = ai !== '0' && ai !== 'false';
  const primaryLoc  = locations[0] || null;

  try {
    // ── Step 1: Build URLs ─────────────────────────────────────────────────
    //
    // Strategy A: If primary location has an OLX slug → use OLX's own
    //   location-filtered pages (pre-scoped, far more accurate).
    //
    // Strategy B: Generic India-wide search + post-filter by locality text.
    //
    const pageNumbers = Array.from({ length: maxPages }, (_, i) => i + 1);
    let pageUrls;
    let locationSource;

    if (primaryLoc && hasOlxLocationSlug(primaryLoc)) {
      pageUrls = pageNumbers
        .map(p => buildOlxLocationUrl(primaryLoc, q, 'mobile-phones_c1453', p))
        .filter(Boolean);
      locationSource = 'olx_location_filter';
      console.log(`[RECOMMEND] Strategy A — OLX location URL for "${primaryLoc}"`);
    } else {
      pageUrls = pageNumbers.map(p => buildOlxSearchUrl(q, p));
      locationSource = 'post_filter';
      if (primaryLoc) console.log(`[RECOMMEND] Strategy B — no OLX slug for "${primaryLoc}", using post-filter`);
    }

    console.log(`[RECOMMEND] Fetching ${pageUrls.length} page(s) for "${q}"...`);

    // ── Step 2: Parallel fetch ─────────────────────────────────────────────
    const markdowns = await Promise.allSettled(pageUrls.map(url => fetchViaJina(url)));

    // ── Step 3: Parse + merge ──────────────────────────────────────────────
    const allRaw = [];
    markdowns.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        const parsed = parseListingsFromMarkdown(result.value);
        console.log(`[RECOMMEND] Page ${idx + 1}: ${parsed.length} raw items`);
        allRaw.push(...parsed);
      } else {
        console.error(`[RECOMMEND] Page ${idx + 1} failed: ${result.reason?.message}`);
      }
    });

    // ── Step 4: Normalize + deduplicate ───────────────────────────────────
    const seen = new Set();
    let items  = [];
    allRaw.forEach(raw => {
      if (seen.has(raw.link)) return;
      seen.add(raw.link);
      try {
        const base  = normalizeListing(raw, items.length);
        const phone = parsePhoneAttributes(raw.title);
        items.push({ ...base, ...phone });
      } catch (e) {
        console.error(`[RECOMMEND] Normalize error: ${e.message}`);
      }
    });
    console.log(`[RECOMMEND] Unique items after merge: ${items.length}`);

    // ── Step 5: Budget filter ──────────────────────────────────────────────
    if (budgetNum != null) {
      items = items.filter(x => x.price != null && x.price <= budgetNum);
      console.log(`[RECOMMEND] After budget ≤₹${budgetNum}: ${items.length}`);
    }

    // ── Step 6: Multi-location filter ─────────────────────────────────────
    if (locations.length > 0) {
      items = filterByAnyLocation(items, locations);
      console.log(`[RECOMMEND] After location filter ${JSON.stringify(locations)}: ${items.length}`);
    }

    // ── Step 7: Rank ───────────────────────────────────────────────────────
    const ranked = rankListings(items, { budget: budgetNum, location: primaryLoc });
    const top    = ranked.slice(0, limitNum);

    // ── Step 8: Gemini AI analysis ─────────────────────────────────────────
    let ai_analysis = null;
    if (useAI && top.length > 0) {
      ai_analysis = await analyzeDeals(top, { q, budget: budgetNum, locations });
    }

    // ── Step 9: Shape response ─────────────────────────────────────────────
    const responseItems = top.map(item => ({
      score:          item.score,
      title:          item.title,
      brand:          item.brand  || null,
      model:          item.model  || null,
      price:          item.price,
      price_text:     item.price_text,
      currency:       item.currency || 'INR',
      location:       item.location,
      distance:       item._locationCloseness || null,
      matched_location: item._matchedLocation || null,
      date_text:      item.date_text,
      date_parsed:    item.date_parsed,
      image:          item.image,
      url:            item.link,
      storage:        item.storage        || null,
      ram:            item.ram            || null,
      battery_health: item.battery_health || null,
      condition:      item.condition      || null,
      color:          item.color          || null,
      warranty:       item.warranty       || null,
    }));

    console.log(`[RECOMMEND] Returning ${responseItems.length} results. AI: ${ai_analysis ? 'yes' : 'no'}`);

    res.json({
      success: true,
      query: {
        q,
        budget:          budgetNum,
        locations:       locations.length > 0 ? locations : null,
        location_source: locationSource,
        pages:           maxPages,
        limit:           limitNum,
        ai_enabled:      useAI,
      },
      count:       responseItems.length,
      ai_analysis: ai_analysis,
      items:       responseItems,
    });

  } catch (err) {
    console.error('[RECOMMEND ERROR]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
