# OLX India AI-Powered Deal Finder & Smart Scraper API

An advanced, production-ready Node.js API and web dashboard designed to scrape OLX India listings, filter by budget, perform fuzzy multi-location matching, score listings with a ranking engine, and use **Gemini AI** to find the absolute best deals.

No browser overhead or Puppeteer setup needed. It operates as a super lightweight service utilizing the `r.jina.ai` markdown reader API, making it extremely fast, cache-friendly, and reliable.

---

## ✨ Features

- **⚡ Smart Recommendations (`/recommend`)**: Fetches multiple pages of listings in parallel, deduplicates them, filters by budget and location, ranks them, and calls Gemini AI to perform a comprehensive value-advising analysis.
- **🔍 Advanced Search & Filter (`/search`)**: Allows paginated searches using OLX's internal location slugs for high accuracy, with min/max price constraints, date range filters, and customized sorting.
- **🧠 Gemini AI Deal Advisor**: Evaluates listings using `gemini-3.1-flash-lite`. Provides structural reasoning, a 1–10 value score, negotiation tips, and warning flags. Failsafe implementation guarantees that if Gemini is rate-limited or keyless, the API continues cleanly.
- **📍 Smart Multi-Location System**: 
  - **Strategy A (OLX slug)**: Resolves popular locality names directly to OLX's internal location slug IDs (like `sangam-vihar_g5327991`), forcing OLX servers to pre-filter matching items.
  - **Strategy B (Fuzzy Match)**: Filters and matches listings locally by cross-referencing locality substrings against a customizable map in [`config/locations.js`](./config/locations.js) (supports neighborhoods like Kalkaji, Govindpuri, Sangam Vihar, etc.).
- **⚙️ Scoring & Ranking Engine**: Scores each listing on a 100-point scale based on recency, budget compliance, premium keywords (Pro, Max, Ultra), local proximity, images, and description details.
- **📱 Phone Attribute Extractor**: Automatically parses listing titles to extract structured data: brand, model, storage size, RAM capacity, battery health percentage, condition, color, and warranty status.
- **💾 CSV / JSON Data Export**: Built-in buttons in the frontend UI to download your filtered search results instantly.
- **📦 Reliable & Production Ready**: Armed with a 60-second in-memory response cache, automatic retry with exponential backoff on proxy errors, and structured request logging.

---

## 🛠️ Project Structure

```
olx-scrapper/
├── server.js                 ← Entry point (loads .env & starts port 3000)
├── config/
│   └── locations.js          ← City neighborhoods & OLX location slug maps
├── public/
│   └── index.html            ← Responsive dark-mode dashboard UI
└── src/
    ├── app.js                ← Express app (serves static UI & mounts routes)
    ├── routes/
    │   ├── scrape.js         ← GET /scrape (backward compatible)
    │   ├── search.js         ← GET /search (paginated keyword search & filters)
    │   └── recommend.js      ← GET /recommend (smart rankings + Gemini AI)
    └── services/
        ├── cache.js          ← 60s memory TTL cache
        ├── fetcher.js        ← Jina fetching + retry backoff + URL builder
        ├── parser.js         ← Markdown listing parser (dates & INR prices)
        ├── phoneParser.js    ← regex-based phone specifications extractor
        ├── location.js       ← shared multi-location filters (OR logic)
        ├── ranking.js        ← 0-100 scoring engine
        └── gemini.js         ← Gemini AI integration (gemini-3.1-flash-lite)
```

---

## 🚀 Quick Start

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed (v18 or higher recommended).

### 2. Installation
Clone the repository, navigate into the project folder, and install the dependencies:
```bash
cd olx-scrapper
npm install
```

### 3. Configure Environment
Create a `.env` file in the root of the project to set up your Gemini API key:
```ini
GEMINI_API_KEY=your_gemini_api_key_here
PORT=3000
```
*(A failsafe handles request loads even if the Gemini key is left blank, skipping AI advice while maintaining full search, filter, and score systems.)*

### 4. Run locally
Start the developer server:
```bash
npm run dev
```
Open your browser and navigate to `http://localhost:3000` to interact with the deal-finder dashboard!

---

## 🔌 API Endpoints

### 1. GET `/recommend`
Evaluates the market and returns ranked phone deals, accompanied by Gemini AI's recommended best pick.

- **URL Parameters**:
  - `q` (required): Search keyword (e.g. `iphone 13`)
  - `budget` (optional): Max price in INR (e.g. `16000`)
  - `location` (optional): Location(s) for proximity filters. Accepts comma-separated values (e.g. `Sangam Vihar,Kalkaji`) or repeated parameters.
  - `pages` (optional, default: `3`): Number of pages to scan on OLX (max `5`).
  - `limit` (optional, default: `10`): Number of top results to return.
  - `ai` (optional, default: `1`): Set to `0` to disable Gemini AI analysis.

**Example Request**:
```bash
GET http://localhost:3000/recommend?q=iphone&budget=15000&location=Sangam Vihar,Kalkaji&pages=2
```

---

### 2. GET `/search`
Standard paginated search through OLX India listings with customizable filters.

- **URL Parameters**:
  - `q` (required): Search keyword
  - `min_price` (optional): Min price in INR
  - `max_price` (optional): Max price in INR
  - `location` (optional): Target filter location(s)
  - `sort` (optional, default: `newest`): `newest`, `score`, `price_asc`, `price_desc`
  - `page` (optional, default: `1`): Page offset
  - `limit` (optional, default: `20`): Items returned per page

**Example Request**:
```bash
GET http://localhost:3000/search?q=oneplus&max_price=20000&location=Delhi&sort=price_asc
```

---

### 3. GET `/scrape` (Backward Compatible)
Original endpoint to scrape a raw OLX URL directly.

- **URL Parameters**:
  - `url` (required): A valid `olx.in` search or directory URL.
  - `limit` (optional, default: `20`): Max items.
  - `date_from` (optional): Filter items listed on or after `YYYY-MM-DD`.

**Example Request**:
```bash
GET http://localhost:3000/scrape?url=https://www.olx.in/items/q-iphone&limit=10
```

---

## 🏆 Scoring Criteria

The ranking engine scores each parsed listing out of `100` points using these criteria:
- **Recency (+25 pts)**: Listed today or yesterday.
- **Budget Alignment (+25 pts)**: Price is under or equal to user budget.
- **Premium Model (+20 pts)**: Title contains premium keywords (`Pro`, `Max`, `Ultra`, `Plus`).
- **Location Proximity (+20 pts)**: Exact match gets full points; nearby localities get partial credit.
- **Thumbnail Image (+5 pts)**: Item includes a listing image.
- **Storage Mentioned (+5 pts)**: Title specifies storage size (e.g. `128GB`).
- **Battery Health Mentioned (+5 pts)**: Title highlights battery health details.
