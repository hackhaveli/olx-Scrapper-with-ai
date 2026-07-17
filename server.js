'use strict';
/**
 * server.js - Entry point
 *
 * All application logic lives under src/.
 * This file only starts the HTTP listener.
 */

// Load .env variables into process.env (no dotenv package needed)
const fs   = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .filter(l => l.trim() && !l.startsWith('#'))
    .forEach(line => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) process.env[key.trim()] = rest.join('=').trim();
    });
  console.log('[ENV] Loaded .env');
}

const app  = require('./src/app');
const PORT = process.env.PORT || 3000;


app.listen(PORT, () => {
  console.log(`OLX India Smart Scraper API running on port ${PORT}`);
  console.log('  GET /scrape    - raw scrape (full OLX URL required)');
  console.log('  GET /search    - keyword search with filters');
  console.log('  GET /recommend - smart deal finder with ranking');
});
