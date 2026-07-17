'use strict';
/**
 * src/services/phoneParser.js
 *
 * Extracts structured phone attributes from a listing title.
 * All fields are optional — returns null when not detected.
 *
 * Extracted fields:
 *   brand, model, storage, ram, battery_health, condition, color, warranty
 */

// ── Brand → canonical model patterns ────────────────────────────────────────

const BRANDS = [
  { name: 'Apple',    re: /\biphone\b/i },
  { name: 'Samsung',  re: /\bsamsung\b|\bgalaxy\b|\bs\d{2}(?:\s*ultra|\s*plus|\s*fe|\+)?/i },
  { name: 'Redmi',    re: /\bredmi\b/i },
  { name: 'Xiaomi',   re: /\bxiaomi\b|\bmi\s+\d/i },
  { name: 'OnePlus',  re: /\boneplus\b|\bone\s*plus\b/i },
  { name: 'Realme',   re: /\brealme\b/i },
  { name: 'Vivo',     re: /\bvivo\b/i },
  { name: 'Oppo',     re: /\boppo\b/i },
  { name: 'Poco',     re: /\bpoco\b/i },
  { name: 'Motorola', re: /\bmoto(?:rola)?\b|\bmoto\s+[ge]\b/i },
  { name: 'Nokia',    re: /\bnokia\b/i },
  { name: 'Google',   re: /\bgoogle\s*pixel\b|\bpixel\s*\d/i },
  { name: 'Nothing',  re: /\bnothing\s*phone\b/i },
  { name: 'iQOO',     re: /\biqoo\b/i },
  { name: 'Lava',     re: /\blava\b/i },
];

// iPhone model numbers — ordered longest-first to avoid partial matches
const IPHONE_MODELS = [
  '17 pro max', '17 pro', '17 plus', '17',
  '16 pro max', '16 pro', '16 plus', '16',
  '15 pro max', '15 pro', '15 plus', '15',
  '14 pro max', '14 pro', '14 plus', '14',
  '13 pro max', '13 pro', '13 mini', '13',
  '12 pro max', '12 pro', '12 mini', '12',
  '11 pro max', '11 pro', '11',
  'xs max', 'xs', 'xr', 'x',
  'se 3rd gen', 'se 2nd gen', 'se',
];

// ── Extractors ───────────────────────────────────────────────────────────────

function detectBrand(title) {
  for (const b of BRANDS) {
    if (b.re.test(title)) return b.name;
  }
  return null;
}

function detectModel(title, brand) {
  const t = title.toLowerCase();

  if (brand === 'Apple') {
    for (const m of IPHONE_MODELS) {
      const re = new RegExp(`\\biphone\\s*${m.replace(/\s+/g, '\\s*')}\\b`, 'i');
      if (re.test(t)) return `iPhone ${m.replace(/\b\w/g, c => c.toUpperCase())}`;
    }
    // fallback: just "iPhone"
    if (/\biphone\b/i.test(t)) {
      const num = t.match(/\biphone\s*(\d+)\b/i);
      return num ? `iPhone ${num[1]}` : 'iPhone';
    }
  }

  if (brand === 'Samsung') {
    const m = title.match(/galaxy\s+([a-z]\d+\s*(?:ultra|plus|fe|\+|s|e)?)/i);
    if (m) return `Galaxy ${m[1].trim()}`;
    const s = title.match(/\bs(\d{2})\s*(ultra|plus|\+|fe|e)?\b/i);
    if (s) return `Galaxy S${s[1]}${s[2] ? ' ' + s[2] : ''}`;
  }

  if (brand === 'Redmi') {
    const m = title.match(/redmi\s+(note\s+\d+[a-z]*(?:\s*(?:pro|pro\+|turbo|ultra))?|\d+[a-z]*(?:\s*(?:pro|prime))?)/i);
    if (m) return `Redmi ${m[1].trim()}`;
  }

  if (brand === 'OnePlus') {
    const m = title.match(/one\s*plus\s*(\d+[a-z]*(?:\s*(?:pro|t|r|nord\s*\w*))?)/i);
    if (m) return `OnePlus ${m[1].trim()}`;
  }

  return null;
}

function detectStorage(title) {
  const m = title.match(/\b(\d+)\s*gb\b(?!\s*ram)/i);
  return m ? `${m[1]}GB` : null;
}

function detectRam(title) {
  // "8GB RAM", "8 GB Ram", "8/128", "6GB" when "RAM" follows or precedes
  const explicit = title.match(/\b(\d+)\s*gb\s+ram\b/i) || title.match(/\bram\s+(\d+)\s*gb\b/i);
  if (explicit) return `${explicit[1]}GB`;

  // "6/128" style — first number is RAM
  const slash = title.match(/\b(\d+)\s*\/\s*(\d+)\s*(?:gb)?\b/i);
  if (slash && parseInt(slash[1]) <= 16) return `${slash[1]}GB`;

  return null;
}

function detectBatteryHealth(title) {
  // "95% battery", "battery health 90%", "bh 92%", "100% bh", "battery: 88%"
  const patterns = [
    /battery\s*health\s*[:\-]?\s*(\d{2,3})\s*%/i,
    /bh\s*[:\-]?\s*(\d{2,3})\s*%/i,
    /(\d{2,3})\s*%\s*(?:battery|bh)/i,
    /battery\s*(\d{2,3})\s*%/i,
  ];
  for (const re of patterns) {
    const m = title.match(re);
    if (m) return `${m[1]}%`;
  }
  return null;
}

function detectCondition(title) {
  const t = title.toLowerCase();
  if (/\blike\s+new\b/.test(t)) return 'Like New';
  if (/\bexcellent\b/.test(t)) return 'Excellent';
  if (/\brefurb(?:ished)?\b/.test(t)) return 'Refurbished';
  if (/\bgood\s+condition\b/.test(t)) return 'Good';
  if (/\bgood\b/.test(t)) return 'Good';
  if (/\bfair\b/.test(t)) return 'Fair';
  if (/\bpoor\b/.test(t)) return 'Poor';
  if (/\bbrand\s+new\b/.test(t)) return 'Brand New';
  if (/\bboxed\b/.test(t)) return 'Brand New';
  return null;
}

function detectColor(title) {
  const colors = [
    'black', 'white', 'blue', 'red', 'green', 'gold', 'silver', 'pink',
    'purple', 'yellow', 'orange', 'grey', 'gray', 'rose gold', 'midnight',
    'starlight', 'graphite', 'pacific blue', 'alpine green', 'deep purple',
    'space black', 'natural titanium', 'black titanium', 'white titanium',
    'desert titanium', 'ultramarine', 'teal', 'pinkgold',
  ];
  const t = title.toLowerCase();
  for (const color of colors) {
    if (t.includes(color)) return color.replace(/\b\w/g, c => c.toUpperCase());
  }
  return null;
}

function detectWarranty(title) {
  const t = title.toLowerCase();
  if (/under\s+warranty|in\s+warranty|with\s+warranty/.test(t)) return 'Under Warranty';
  const m = t.match(/(\d+)\s*(?:month|year)s?\s*warranty/i);
  if (m) return `${m[1]} ${t.includes('year') ? 'Year' : 'Month'} Warranty`;
  if (/no\s+warranty/.test(t)) return 'No Warranty';
  return null;
}

/**
 * Extract all phone-specific attributes from a listing title.
 *
 * @param {string} title
 * @returns {{brand, model, storage, ram, battery_health, condition, color, warranty}}
 */
function parsePhoneAttributes(title) {
  if (!title) {
    return { brand: null, model: null, storage: null, ram: null,
             battery_health: null, condition: null, color: null, warranty: null };
  }

  const brand = detectBrand(title);
  return {
    brand,
    model:          detectModel(title, brand),
    storage:        detectStorage(title),
    ram:            detectRam(title),
    battery_health: detectBatteryHealth(title),
    condition:      detectCondition(title),
    color:          detectColor(title),
    warranty:       detectWarranty(title),
  };
}

module.exports = { parsePhoneAttributes };
