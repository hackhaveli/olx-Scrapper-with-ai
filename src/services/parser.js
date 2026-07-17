'use strict';
/**
 * src/services/parser.js
 *
 * Core OLX India listing parser.
 * Moved verbatim from server.js — zero logic changes.
 *
 * Exports:
 *   parseEnglishDate(text)          -> dayjs | null
 *   parseListingsFromMarkdown(md)   -> RawListing[]
 *   normalizeListing(raw, index)    -> NormalizedListing
 */

const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');

dayjs.extend(customParse);
dayjs.extend(isSameOrAfter);

/**
 * Parse English relative/absolute dates from OLX India listings.
 * Supported: "Today", "Yesterday", "3 days ago", "Jun 28", "Jul 06"
 *
 * @param {string} text
 * @returns {import('dayjs').Dayjs|null}
 */
function parseEnglishDate(text) {
  if (!text) return null;
  const t = text.trim();
  try {
    const lower = t.toLowerCase();

    if (lower === 'today') return dayjs().startOf('day');
    if (lower === 'yesterday') return dayjs().subtract(1, 'day').startOf('day');

    // "X days ago"
    const mDays = lower.match(/(\d+)\s+days?\s+ago/);
    if (mDays) return dayjs().subtract(parseInt(mDays[1], 10), 'day').startOf('day');

    // "Jun 28", "Jul 06" etc.
    const mMonth = t.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})$/i);
    if (mMonth) {
      const parsed = dayjs(`${mMonth[1]} ${mMonth[2]} ${dayjs().year()}`, 'MMM D YYYY');
      // If the resulting date is in the future, it must be from last year
      if (parsed.isAfter(dayjs())) {
        return dayjs(`${mMonth[1]} ${mMonth[2]} ${dayjs().year() - 1}`, 'MMM D YYYY').startOf('day');
      }
      return parsed.isValid() ? parsed.startOf('day') : null;
    }
  } catch (e) {
    console.log(`[WARN] Error parsing date: ${text}`);
  }
  return null;
}

/**
 * Parse OLX India Markdown (from r.jina.ai) into raw listing objects.
 *
 * OLX India list item format:
 *   *   [![Image N: Title](img_url)Featured ₹ 15,000 ### Title Location Date](item_url)
 *   *   [₹ 20,000 ### Title Location Date](item_url)
 *
 * @param {string} md
 * @returns {Array<{title, priceText, priceNum, link, location, date_text, image}>}
 */
function parseListingsFromMarkdown(md) {
  const results = [];
  const lines = md.split('\n');

  const DATE_REGEX = /\b(?:Today|Yesterday|\d+\s+days?\s+ago|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2})\b/i;

  for (const line of lines) {
    // Match list items linking to OLX India item pages
    const match = line.match(/^\*\s+\[([\s\S]*?)\]\((https:\/\/www\.olx\.in\/item\/[^\)]+)\)/);
    if (!match) continue;

    const text = match[1];
    const url = match[2];

    // Must contain a real item ID
    if (!/iid-\d+/.test(url)) continue;

    // Skip promotional "Want to see your stuff here?" lines
    if (/want to see your stuff here/i.test(text)) continue;

    // --- Extract thumbnail image (skip badge/verified pill images) ---
    const imgMatches = [...text.matchAll(/!\[.*?\]\((https?:\/\/[^\)]+)\)/g)];
    const image = imgMatches.map(m => m[1]).find(u => !/verified-info-pill|elite-seller|alias-/i.test(u)) || null;

    // --- Extract date ---
    const dateMatch = text.match(DATE_REGEX);
    const dateText = dateMatch ? dateMatch[0] : null;

    // --- Extract price in INR (₹ or Rs., Indian comma-separated thousands) ---
    const priceMatch = text.match(/(?:₹|Rs\.?)\s*([\d,]+(?:\.\d+)?)/i);
    const priceText = priceMatch ? priceMatch[0].trim() : null;
    const priceNum = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;

    // --- Extract location from URL slug ---
    // OLX India URL: /item/category-in-<location-words>-iid-NNNNN
    const urlMatch = url.match(/-in-(.+?)-iid-\d+/);
    const locationSlug = urlMatch ? urlMatch[1] : null;
    const locationWordCount = locationSlug ? locationSlug.split('-').length : 0;

    // --- Clean text to separate title and location ---
    let cleanText = text
      .replace(/!\[.*?\]\((https?:\/\/[^\)]+)\)/g, '') // remove inline images
      .replace(/Featured/gi, '')                         // remove "Featured" badge
      .replace(/(?:₹|Rs\.?)\s*[\d,]+(?:\.\d+)?/gi, '') // remove price
      .replace(/###/g, '');                              // remove ### markers

    if (dateText) {
      const escapedDate = dateText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      cleanText = cleanText.replace(new RegExp(escapedDate, 'gi'), '');
    }

    cleanText = cleanText.replace(/\s+/g, ' ').trim();
    const words = cleanText.split(' ').filter(Boolean);

    let title = cleanText;
    let location = null;

    if (locationWordCount > 0 && words.length > locationWordCount) {
      location = words.slice(-locationWordCount).join(' ');
      title = words.slice(0, -locationWordCount).join(' ').replace(/,\s*$/, '').trim();
    }

    if (!title) continue;

    results.push({ title, priceText, priceNum, link: url, location, date_text: dateText, image });
  }

  return results;
}

/**
 * Normalize a raw listing into the standard API output shape.
 *
 * @param {object} raw   - Output of parseListingsFromMarkdown
 * @param {number} index - Position in result array (for id assignment)
 * @returns {object}     - Normalized listing
 */
function normalizeListing(raw, index) {
  const parsedDate = raw.date_text ? parseEnglishDate(raw.date_text) : null;
  return {
    id: index + 1,
    title: raw.title,
    price_text: raw.priceText,
    price: raw.priceNum,
    currency: raw.priceNum != null ? 'INR' : null,
    link: raw.link,
    location: raw.location,
    image: raw.image,
    date_text: raw.date_text,
    date_parsed: parsedDate ? parsedDate.format('YYYY-MM-DD') : null,
    scraped_at: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  };
}

module.exports = { parseEnglishDate, parseListingsFromMarkdown, normalizeListing };
