'use strict';
/**
 * src/services/fetcher.js
 *
 * Fetches OLX India pages via the r.jina.ai reader proxy.
 * Features:
 *   - Retry with exponential backoff (3 attempts)
 *   - Configurable timeout
 *   - 60-second response cache (per URL)
 *   - Structured logging
 */

const axios = require('axios');
const cache = require('./cache');
const { OLX_LOCATION_SLUGS } = require('../../config/locations');

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const TIMEOUT_MS = 120000;

const JINA_HEADERS = {
  'Accept': 'text/plain, text/markdown, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch a URL via r.jina.ai and return its Markdown text.
 * Results are cached for 60 seconds.
 *
 * @param {string} url - The OLX India search/listing URL to render.
 * @returns {Promise<string>} Markdown content
 */
async function fetchViaJina(url) {
  const cached = cache.get(url);
  if (cached) {
    console.log(`[CACHE HIT] ${url}`);
    return cached;
  }

  const jinaUrl = `https://r.jina.ai/${encodeURIComponent(url)}`;
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[FETCH] attempt=${attempt} ${jinaUrl}`);
      const resp = await axios.get(jinaUrl, {
        timeout: TIMEOUT_MS,
        headers: JINA_HEADERS,
      });

      const markdown = resp.data;
      const kb = (markdown.length / 1024).toFixed(1);
      console.log(`[FETCH OK] ${kb}KB received`);

      cache.set(url, markdown);
      return markdown;

    } catch (err) {
      lastError = err;
      const status = err.response ? err.response.status : 'network';
      console.error(`[FETCH ERR] attempt=${attempt} status=${status} msg=${err.message}`);

      if (attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        console.log(`[RETRY] waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`Failed to fetch after ${MAX_RETRIES} attempts: ${lastError.message}`);
}

/**
 * Build a generic OLX India keyword search URL.
 *
 * @param {string} q           - Search term (e.g. "iphone 14")
 * @param {number} [page=1]    - Page number
 * @param {string} [category]  - Optional OLX category path (e.g. "mobile-phones_c1453")
 * @returns {string}
 */
function buildOlxSearchUrl(q, page = 1, category = null) {
  const encoded = encodeURIComponent(q.trim());
  let base;
  if (category) {
    base = `https://www.olx.in/${category}?q=${encoded}`;
  } else {
    base = `https://www.olx.in/items/q-${encodeURIComponent(q.trim().replace(/\s+/g, '-'))}`;
  }
  if (page > 1) {
    const sep = base.includes('?') ? '&' : '?';
    base += `${sep}page=${page}`;
  }
  return base;
}

/**
 * Build an OLX India location-specific search URL.
 *
 * OLX pre-filters results by location on their own servers when you use
 * their location slug URLs. This is far more accurate than fetching all
 * of India and post-filtering by locality text.
 *
 * Example output:
 *   https://www.olx.in/sangam-vihar_g5327991/mobile-phones_c1453?q=iphone
 *
 * @param {string} location   - Location name (e.g. "Sangam Vihar", "Delhi")
 * @param {string} [q]        - Optional search keyword
 * @param {string} [category] - OLX category slug (default: mobile-phones_c1453)
 * @param {number} [page=1]   - Page number
 * @returns {string|null}     - URL, or null if location slug is unknown
 */
function buildOlxLocationUrl(location, q = null, category = 'mobile-phones_c1453', page = 1) {
  const key = location.trim().toLowerCase();
  const slug = OLX_LOCATION_SLUGS[key];

  if (!slug) {
    console.warn(`[FETCH] No OLX slug found for location: "${location}"`);
    return null;
  }

  let url = `https://www.olx.in/${slug}/${category}`;
  const params = [];
  if (q) params.push(`q=${encodeURIComponent(q.trim())}`);
  if (page > 1) params.push(`page=${page}`);
  if (params.length) url += `?${params.join('&')}`;

  return url;
}

/**
 * Look up whether a location name has an OLX location slug.
 * @param {string} location
 * @returns {boolean}
 */
function hasOlxLocationSlug(location) {
  return !!(OLX_LOCATION_SLUGS[location.trim().toLowerCase()]);
}

module.exports = { fetchViaJina, buildOlxSearchUrl, buildOlxLocationUrl, hasOlxLocationSlug };
