'use strict';
/**
 * src/services/gemini.js
 *
 * Gemini AI integration for deal analysis.
 * Sends the top-ranked listings to Gemini and gets back:
 *   - best_deal        : which listing is the top pick
 *   - reasoning        : why it is the best deal
 *   - value_score      : 1-10 value rating
 *   - red_flags        : things to check before buying
 *   - negotiation_tip  : how to get a better price
 *
 * Fails gracefully — if the API call fails or key is missing,
 * returns null and the /recommend endpoint continues without AI.
 */

const axios = require('axios');

const GEMINI_KEY  = process.env.GEMINI_API_KEY;
const MODEL       = 'gemini-3.1-flash-lite';
const API_URL     = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const TIMEOUT_MS  = 30000;

/**
 * Ask Gemini to analyze a set of phone listings and pick the best deal.
 *
 * @param {object[]} items      - Ranked listings (post-filter, post-score)
 * @param {object}   context    - { q, budget, locations }
 * @returns {Promise<object|null>}
 */
async function analyzeDeals(items, context = {}) {
  if (!GEMINI_KEY) {
    console.warn('[GEMINI] No API key set — skipping AI analysis');
    return null;
  }
  if (!items || items.length === 0) return null;

  const { q = '', budget, locations = [] } = context;

  // Format top 10 listings for the prompt
  const listText = items.slice(0, 10).map((item, i) => {
    const price   = item.price ? `₹${Number(item.price).toLocaleString('en-IN')}` : 'Price N/A';
    const storage = item.storage        || 'storage unknown';
    const battery = item.battery_health || 'battery unknown';
    const cond    = item.condition      || 'condition unknown';
    const warranty= item.warranty       || 'no warranty info';
    return `${i + 1}. "${item.title}" | ${price} | ${item.location || 'location unknown'} | Score:${item.score} | ${storage} | ${battery} | ${cond} | ${warranty}`;
  }).join('\n');

  const budgetStr   = budget ? `₹${Number(budget).toLocaleString('en-IN')}` : 'no strict budget';
  const locationStr = locations.length > 0 ? locations.join(', ') : 'anywhere in India';

  const prompt = `You are an expert second-hand smartphone deal advisor for India.

The buyer is looking for: "${q}"
Budget: ${budgetStr}
Preferred location(s): ${locationStr}

Here are the top ranked OLX India listings (already filtered by budget and location):
${listText}

Analyze these listings as an expert buyer and respond ONLY with valid JSON in this exact format:
{
  "best_deal_index": <1-based index of the best listing>,
  "best_deal_title": "<exact title of the best listing>",
  "reasoning": "<2-3 sentence explanation of why this is the best deal — mention price, condition, storage, seller reliability signals>",
  "value_score": <integer 1-10 where 10 = exceptional deal>,
  "red_flags": ["<flag 1>", "<flag 2>", "<flag 3 if applicable>"],
  "negotiation_tip": "<one practical tip to get a lower price from this seller>",
  "alternatives": [<1-based index of 2nd best>, <1-based index of 3rd best>]
}`;

  try {
    console.log('[GEMINI] Calling Gemini API for deal analysis...');
    const resp = await axios.post(
      `${API_URL}?key=${GEMINI_KEY}`,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 600 },
      },
      { timeout: TIMEOUT_MS }
    );

    const raw  = resp.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('[GEMINI] Response received');

    // Extract JSON from the response (handles markdown code fences)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[GEMINI] Could not extract JSON from response');
      return { reasoning: raw.trim() };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;

  } catch (err) {
    const status  = err.response?.status;
    const message = err.response?.data?.error?.message || err.message;
    console.error(`[GEMINI] Error status=${status}: ${message}`);
    return null;
  }
}

module.exports = { analyzeDeals };
