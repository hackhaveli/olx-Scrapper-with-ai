'use strict';
/**
 * src/services/ranking.js
 *
 * Scores each listing on a 0–100 scale and sorts by score descending.
 *
 * Weights:
 *   +25  Posted today or yesterday
 *   +25  Price is within budget (price <= budget)
 *   +20  Premium model keyword (Pro / Max / Ultra / Plus)
 *   +20  Location is an exact or nearby match
 *   +5   Has a thumbnail image
 *   +5   Storage mentioned in title
 *   +5   Battery health mentioned in title
 *
 * Total max: 105 (capped at 100)
 */

const dayjs = require('dayjs');

const WEIGHTS = {
  RECENT:         25,
  WITHIN_BUDGET:  25,
  PREMIUM_MODEL:  20,
  LOCATION_MATCH: 20,
  HAS_IMAGE:       5,
  HAS_STORAGE:     5,
  HAS_BATTERY:     5,
};

/**
 * Score a single listing.
 *
 * @param {object} item    - Normalized listing (post phoneParser + location enrichment)
 * @param {object} opts
 * @param {number} [opts.budget]           - User budget (max price)
 * @param {string} [opts.location]         - User query location (already matched via filterByLocation)
 * @returns {number} score 0–100
 */
function scoreItem(item, opts = {}) {
  let score = 0;

  // ── Recency ─────────────────────────────────────────────────────────────
  if (item.date_parsed) {
    const daysOld = dayjs().diff(dayjs(item.date_parsed), 'day');
    if (daysOld <= 1) score += WEIGHTS.RECENT;          // today or yesterday
    else if (daysOld <= 3) score += WEIGHTS.RECENT * 0.5; // within 3 days — partial
  }

  // ── Budget ───────────────────────────────────────────────────────────────
  if (opts.budget && item.price != null) {
    if (item.price <= opts.budget) score += WEIGHTS.WITHIN_BUDGET;
    else if (item.price <= opts.budget * 1.1) score += WEIGHTS.WITHIN_BUDGET * 0.4; // 10% over → partial
  } else if (!opts.budget) {
    // No budget provided — give everyone partial credit so scores aren't skewed
    score += WEIGHTS.WITHIN_BUDGET * 0.5;
  }

  // ── Premium model ────────────────────────────────────────────────────────
  if (/\b(?:pro|max|ultra|plus)\b/i.test(item.title)) {
    score += WEIGHTS.PREMIUM_MODEL;
  }

  // ── Location match ───────────────────────────────────────────────────────
  if (item._locationCloseness === 'exact') {
    score += WEIGHTS.LOCATION_MATCH;
  } else if (item._locationCloseness === 'nearby') {
    score += WEIGHTS.LOCATION_MATCH * 0.6;
  } else if (!opts.location) {
    // No location filter — give partial credit
    score += WEIGHTS.LOCATION_MATCH * 0.3;
  }

  // ── Bonus signals ────────────────────────────────────────────────────────
  if (item.image) score += WEIGHTS.HAS_IMAGE;
  if (item.storage || /\b\d+\s*gb\b/i.test(item.title)) score += WEIGHTS.HAS_STORAGE;
  if (item.battery_health || /\bbattery\b/i.test(item.title)) score += WEIGHTS.HAS_BATTERY;

  return Math.min(Math.round(score), 100);
}

/**
 * Score and sort an array of listings.
 *
 * @param {object[]} items
 * @param {object}   opts   - { budget, location }
 * @returns {object[]}      - Items with `score` field, sorted descending
 */
function rankListings(items, opts = {}) {
  return items
    .map(item => ({ ...item, score: scoreItem(item, opts) }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { rankListings, scoreItem };
