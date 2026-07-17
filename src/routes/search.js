'use strict';
/**
 * src/routes/search.js
 *
 * GET /search — keyword search with filters, sorting, and pagination.
 *
 * Query parameters:
 *   q           Search term (required)
 *   category    OLX category slug (optional, e.g. "mobile-phones_c1453")
 *   min_price   Minimum price (INR)
 *   max_price   Maximum price (INR)
 *   location    Location string for fuzzy filtering
 *   page        Page number (default: 1)
 *   limit       Items per page (default: 20, max: 100)
 *   sort        "price_asc" | "price_desc" | "newest" | "score" (default: "newest")
 *   date_from   Filter listings on or after this date (YYYY-MM-DD or DD/MM/YYYY)
 */

const express = require('express');
const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');
const { fetchViaJina, buildOlxSearchUrl, buildOlxLocationUrl, hasOlxLocationSlug } = require('../services/fetcher');
const { parseListingsFromMarkdown, normalizeListing } = require('../services/parser');
const { parsePhoneAttributes } = require('../services/phoneParser');
const { filterByAnyLocation, parseLocations } = require('../services/location');
const { rankListings } = require('../services/ranking');

dayjs.extend(customParse);
dayjs.extend(isSameOrAfter);

const router = express.Router();

router.get('/', async (req, res) => {
  req.setTimeout(180000);
  console.log('\n--- /search ---', req.query);

  const {
    q, category,
    min_price, max_price,
    location,
    page = '1',
    limit = '20',
    sort = 'newest',
    date_from,
  } = req.query;

  if (!q) return res.status(400).json({ error: '"q" (search query) is required' });

  const pageNum  = Math.max(1, parseInt(page, 10));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const minPrice = min_price ? parseFloat(min_price) : null;
  const maxPrice = max_price ? parseFloat(max_price) : null;

  let dateFromObj = null;
  if (date_from) {
    dateFromObj = dayjs(date_from, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
    if (!dateFromObj.isValid()) {
      return res.status(400).json({ error: 'Invalid date_from. Use YYYY-MM-DD or DD/MM/YYYY' });
    }
  }

  try {
    const locations = parseLocations(location);
    const primaryLoc = locations[0] || null;

    // 1. Build OLX URL and fetch
    let olxUrl;
    if (primaryLoc && hasOlxLocationSlug(primaryLoc)) {
      olxUrl = buildOlxLocationUrl(primaryLoc, q, category || 'mobile-phones_c1453', pageNum);
      console.log(`[SEARCH] Using OLX location URL strategy for "${primaryLoc}"`);
    } else {
      olxUrl = buildOlxSearchUrl(q, pageNum, category || null);
      if (primaryLoc) {
        console.log(`[SEARCH] No OLX slug for "${primaryLoc}" — falling back to generic search`);
      }
    }

    console.log(`[SEARCH] URL: ${olxUrl}`);
    const markdown = await fetchViaJina(olxUrl);

    // 2. Parse listings
    const raw = parseListingsFromMarkdown(markdown);
    let items = raw.map((r, i) => {
      const base = normalizeListing(r, i);
      const phone = parsePhoneAttributes(r.title);
      return { ...base, ...phone };
    });

    console.log(`[SEARCH] Parsed: ${items.length}`);

    // 3. Apply filters
    if (minPrice != null) items = items.filter(x => x.price != null && x.price >= minPrice);
    if (maxPrice != null) items = items.filter(x => x.price != null && x.price <= maxPrice);

    if (dateFromObj) {
      items = items.filter(x => {
        if (!x.date_parsed) return false;
        return dayjs(x.date_parsed).isSameOrAfter(dateFromObj, 'day');
      });
    }

    if (locations.length > 0) {
      items = filterByAnyLocation(items, locations);
    }

    // 4. Sort
    switch (sort) {
      case 'price_asc':
        items.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        break;
      case 'price_desc':
        items.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
        break;
      case 'score':
        items = rankListings(items, { budget: maxPrice, location });
        break;
      case 'newest':
      default:
        items.sort((a, b) => {
          if (!a.date_parsed && !b.date_parsed) return 0;
          if (!a.date_parsed) return 1;
          if (!b.date_parsed) return -1;
          return dayjs(b.date_parsed).valueOf() - dayjs(a.date_parsed).valueOf();
        });
    }

    // 5. Deduplicate
    const seen = new Set();
    items = items.filter(x => { if (seen.has(x.link)) return false; seen.add(x.link); return true; });

    console.log(`[SEARCH] Returning ${items.length} items`);

    res.json({
      success: true,
      query: { q, category, min_price: minPrice, max_price: maxPrice, locations: locations.length > 0 ? locations : null, page: pageNum, limit: limitNum, sort, date_from },
      count: items.length,
      page: pageNum,
      items: items.slice(0, limitNum),
    });

  } catch (err) {
    console.error('[SEARCH ERROR]', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

module.exports = router;
