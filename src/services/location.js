'use strict';
/**
 * src/services/location.js
 *
 * Fuzzy location matching for OLX India listings.
 *
 * Strategy:
 *   1. Normalize both query and listing location to lowercase.
 *   2. Fast path: direct substring match.
 *   3. Expand query via config/locations.js → list of nearby area strings.
 *   4. Check if listing location includes any of the nearby area strings.
 *
 * Returns { matched: boolean, closeness: 'exact'|'nearby'|null }
 */

const { NEARBY_MAP: LOCATION_MAP } = require('../../config/locations');

/**
 * Normalize a location string for comparison.
 * Lowercases, removes extra spaces, strips punctuation.
 *
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Find the best matching key in LOCATION_MAP for the given query.
 *
 * @param {string} normQuery  Normalized query string
 * @returns {string[]|null}   Array of nearby area strings, or null
 */
function lookupNearbyAreas(normQuery) {
  // Exact key match
  if (LOCATION_MAP[normQuery]) return LOCATION_MAP[normQuery];

  // Check if query contains any key as a substring
  for (const key of Object.keys(LOCATION_MAP)) {
    if (normQuery.includes(key) || key.includes(normQuery)) {
      return LOCATION_MAP[key];
    }
  }
  return null;
}

/**
 * Test whether a listing location matches the user's requested location.
 *
 * @param {string|null} listingLocation  - Location string from parsed listing
 * @param {string}      queryLocation    - User-supplied location query
 * @returns {{ matched: boolean, closeness: 'exact'|'nearby'|null }}
 */
function matchLocation(listingLocation, queryLocation) {
  if (!queryLocation) return { matched: true, closeness: null }; // no filter → always pass
  if (!listingLocation) return { matched: false, closeness: null };

  const normListing = normalize(listingLocation);
  const normQuery   = normalize(queryLocation);

  // Exact / direct substring match
  if (normListing.includes(normQuery) || normQuery.includes(normListing)) {
    return { matched: true, closeness: 'exact' };
  }

  // Expand via location map
  const nearbyAreas = lookupNearbyAreas(normQuery);
  if (nearbyAreas) {
    for (const area of nearbyAreas) {
      if (normListing.includes(normalize(area))) {
        return { matched: true, closeness: 'nearby' };
      }
    }
  }

  return { matched: false, closeness: null };
}

/**
 * Parse the `location` query param which may be:
 *   - a single string:          "Sangam Vihar"
 *   - comma-separated string:   "Sangam Vihar, Kalkaji, Delhi"
 *   - repeated param:           location=Sangam+Vihar&location=Delhi (Express gives array)
 */
function parseLocations(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.flatMap(l => l.split(',').map(s => s.trim())).filter(Boolean);
  }
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Filter an array of listings by location, attaching closeness info.
 *
 * @param {object[]} listings
 * @param {string}   queryLocation
 * @returns {object[]}  Listings that pass the filter, with `_locationCloseness` added
 */
function filterByLocation(listings, queryLocation) {
  if (!queryLocation) return listings; // no filter

  return listings.reduce((acc, item) => {
    const { matched, closeness } = matchLocation(item.location, queryLocation);
    if (matched) {
      acc.push({ ...item, _locationCloseness: closeness });
    }
    return acc;
  }, []);
}

/**
 * Filter listings by ANY of the given locations (OR logic).
 */
function filterByAnyLocation(listings, locations) {
  if (!locations || locations.length === 0) return listings;

  return listings.reduce((acc, item) => {
    for (const loc of locations) {
      const { matched, closeness } = matchLocation(item.location, loc);
      if (matched) {
        acc.push({ ...item, _locationCloseness: closeness, _matchedLocation: loc });
        return acc;
      }
    }
    return acc;
  }, []);
}

module.exports = {
  matchLocation,
  filterByLocation,
  filterByAnyLocation,
  parseLocations,
  normalize,
};
