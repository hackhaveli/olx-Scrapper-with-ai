const express = require('express');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer'); // usado apenas para obter executablePath
const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');

dayjs.extend(customParse);
puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());

// Configs
const DEFAULT_LIMIT = 20;
const VIEWPORT = { width: 1280, height: 800 };

// User agents rotativos (evita bloqueio pelo OLX)
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17 Safari/605.1.15'
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];


// ----------------- PARSE DE DATAS PT-BR -----------------
function parsePortugueseRelativeDate(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();

  if (t.includes('hoje')) return dayjs().startOf('day');
  if (t.includes('ontem')) return dayjs().subtract(1, 'day').startOf('day');

  const mDays = t.match(/(\d+)\s*dias?/);
  if (mDays) return dayjs().subtract(parseInt(mDays[1], 10), 'day').startOf('day');

  const mHours = t.match(/(\d+)\s*hora/);
  if (mHours) return dayjs().subtract(parseInt(mHours[1], 10), 'hour');

  const mDate = t.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
  if (mDate) {
    const parsed = dayjs(mDate[1], ['DD/MM/YYYY', 'D/M/YYYY', 'DD/MM/YY', 'D/M/YY'], true);
    return parsed.isValid() ? parsed.startOf('day') : null;
  }

  return null;
}


// ----------------- EXTRACT SCRAPING -----------------
async function extractListingsFromPage(page) {
  return await page.evaluate(() => {
    const results = [];
    const seen = new Set();

    const cards = document.querySelectorAll(
      '.olx-adcard, [data-lurker_list_id], [data-lurker_dimension_listing_id]'
    );

    cards.forEach(card => {
      try {
        // Título + link
        let link = null;
        let title = null;
        const titleEl = card.querySelector('.olx-adcard__title, h2');

        if (titleEl) {
          const a = titleEl.closest('a');
          if (a) {
            link = a.href;
            title = titleEl.textContent.trim();
          }
        }

        if (!link || !title || seen.has(link)) return;
        seen.add(link);

        // Preço
        const priceEl = card.querySelector('.olx-adcard__price');
        const price = priceEl ? priceEl.textContent.trim() : 'Preço não informado';

        // Localização
        const locEl = card.querySelector('.olx-adcard__location');
        const location = locEl ? locEl.textContent.trim() : 'Localização não informada';

        // Data
        let dateText = null;
        const dateEl = card.querySelector('[class*="date"], time');
        if (dateEl) dateText = dateEl.textContent.trim();

        // Imagem
        const imgEl = card.querySelector('img[src]');
        const image = imgEl && !imgEl.src.includes('data:image') ? imgEl.src : null;

        results.push({ title, price, link, location, date_text: dateText, image });
      } catch {}
    });

    return results;
  });
}


// ----------------- FUNÇÃO PRINCIPAL DO SCRAPER -----------------
async function runScraper(url, maxItems, dateFrom) {
  let execPath = puppeteer.executablePath();

  if (process.env.NODE_ENV === 'production') {
    execPath = '/usr/bin/chromium';
  }

  console.log(`🚀 Usando Chromium em: ${execPath}`);

  constQVbrowser = await puppeteerExtra.launch({
    headless: 'new',
    executablePath: execPath,
    timeout: 0, 
    protocolTimeout: 240000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disableUA-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process', 
      '--disableQb-extensions'
    ]
  });

  try {
    const page = await browser.newPage();
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultNavigationTimeout(0); 
    page.setDefaultTimeout(0);

    await page.setViewport(VIEWPORT);
    await page.setUserAgent(getRandomUA());

    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Referer': 'https://www.olx.com.br/'
    });

    console.log(`Navigating to: ${url}`);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
      console.log(`⚠️ Aviso no goto: ${e.message}`);
    }

    try {
      await page.waitForSelector('.olx-adcard, [data-lurker_list_id]', { timeout: 15000 });
    } catch (e) {
      console.log('⚠️ Seletor de cards não encontrado rapidamente, tentando extrair mesmo assim...');
    }

    // Scroll mais rápido e agressivo (já que não tem imagens)
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await new Promise(r => setTimeout(r, 800)); // Espera menor
    }

    const rawItems = await extractListingsFromPage(page);
    console.log(`Extraídos ${rawItems.length} itens brutos.`);

    const normalized = rawItems.map((it, i) => {
      const parsedDate = it.date_text ? parsePortugueseRelativeDate(it.date_text) : null;

      letQDpriceNum = null;
      const match = it.price?.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/);
      if (match) priceNum = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));

      return {
        id: i + 1,
        title: it.title,
        price_text: it.price,
        price: priceNum || null,
        link: it.link,
        location: it.location,
        image: it.image,
        date_text: it.date_text,
        date_parsed: parsedDate ? parsedDate.format('YYYY-MM-DD') : null,
        scraped_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
      };
    });

    // Filtragem e Deduplicação (código original mantido)
    let filtered = normalized;
    if (dateFrom) {
      filtered = normalized.filter(x => {
        if (!x.date_parsed) return true;
        return dayjs(x.date_parsed).isSameOrAfter(dateFrom, 'day');
      });
    }

    const set = new Set();
    const final = [];

    for (const item of filtered) {
      if (!set.has(item.link)) {
        set.add(item.link);
        final.push(item);
      }
    }

    return final.slice(0, maxItems);

  } finally {
    if (browser) await browser.close();
  }
}

// ----------------- ENDPOINT: /scrape -----------------
app.get('/scrape', async (req, res) => {
  req.setTimeout(600000);
  const { url, date_from, limit } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Parâmetro url é obrigatório' });
  }

  const maxItems = Math.min(300, Math.max(1, parseInt(limit || DEFAULT_LIMIT)));

  let dateFromObj = null;
  if (date_from) {
    dateFromObj = dayjs(date_from, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
    if (!dateFromObj.isValid()) dateFromObj = null;
  }

  try {
    const items = await runScraper(url, maxItems, dateFromObj);
    res.json({ success: true, count: items.length, items });

  } catch (err) {
    console.error('❌ Erro no scraping:', err);
    if (!res.headersSent) {
        res.status(500).json({ error: err.message });
    }
  }
});


// ----------------- ENDPOINT: /scrape-olx -----------------
app.get('/scrape-olx', async (req, res) => {
  req.setTimeout(600000);

  const { q, state = 'mg', category, limit = 20 } = req.query;

  if (!q) {
    return res.status(400).json({ error: 'Parâmetro "q" é obrigatório' });
  }

  let url = `https://www.olx.com.br`;

  if (state !== 'all') url += `/estado-${state}`;
  if (category) url += `/${category}`;

  url += `?q=${encodeURIComponent(q)}&sf=1`;

  req.query.url = url;
  req.query.limit = limit;

  return app._router.handle(req, res);
});


// ----------------- HEALTHCHECK -----------------
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: dayjs().toISOString()
  });
});


// ----------------- ROOT -----------------
app.get('/', (req, res) => {
  res.json({
    service: 'OLX Scraper API',
    version: 'final-long-process-fix',
    docs: ['/scrape', '/scrape-olx', '/health']
  });
});


// ----------------- START SERVER -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 OLX Scraper API rodando na porta ${PORT}`);
});