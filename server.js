const express = require('express');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const puppeteer = require('puppeteer');
const dayjs = require('dayjs');
const customParse = require('dayjs/plugin/customParseFormat');
const isSameOrAfter = require('dayjs/plugin/isSameOrAfter');

dayjs.extend(customParse);
dayjs.extend(isSameOrAfter);
puppeteerExtra.use(StealthPlugin());

const app = express();
app.use(express.json());

let activeBrowser = null;

process.on('SIGTERM', async () => {
  console.log('[SHUTDOWN] SIGTERM recebido, fechando browser...');
  if (activeBrowser) {
    try { await activeBrowser.close(); } catch {}
    activeBrowser = null;
  }
  process.exit(0);
});

const DEFAULT_LIMIT = 20;
const VIEWPORT = { width: 1280, height: 800 };

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36'
];

const getRandomUA = () => USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

// ----------------- PARSE DE DATAS -----------------
function parsePortugueseRelativeDate(text) {
  if (!text) return null;
  const t = text.trim().toLowerCase();
  try {
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

    const MONTHS = { 'jan':0,'fev':1,'mar':2,'abr':3,'mai':4,'jun':5,'jul':6,'ago':7,'set':8,'out':9,'nov':10,'dez':11 };
    const mPt = t.match(/(\d{1,2})\s*de\s*(\w+)/);
    if (mPt) {
      const monthIdx = MONTHS[mPt[2].substring(0,3)];
      if (monthIdx !== undefined) {
        const d = parseInt(mPt[1], 10);
        const now = dayjs();
        const year = monthIdx > now.month() ? now.year() - 1 : now.year();
        const parsed = dayjs(new Date(year, monthIdx, d));
        return parsed.isValid() ? parsed.startOf('day') : null;
      }
    }
  } catch (e) {
    console.log(`Erro ao parsear data: ${text}`);
  }
  return null;
}

// ----------------- EXTRAÇÃO NO BROWSER -----------------
async function extractListingsFromPage(page) {
  return await page.evaluate(() => {
    const results = [];
    const seen = new Set();
    const cards = document.querySelectorAll(
      '.olx-adcard, [data-lurker_list_id], [data-lurker_dimension_listing_id]'
    );
    cards.forEach(card => {
      try {
        let link = null;
        let title = null;
        const linkEl = card.querySelector('a.olx-adcard__link');
        const titleEl = card.querySelector('.olx-adcard__title, h2');

        if (linkEl) {
          link = linkEl.href;
          title = linkEl.title || (titleEl ? titleEl.textContent.trim() : '');
        } else if (titleEl) {
          const a = titleEl.tagName === 'A' ? titleEl : titleEl.closest('a');
          if (a) {
            link = a.href;
            title = titleEl.textContent.trim();
          }
        }

        if (!link || !title || seen.has(link)) return;
        seen.add(link);

        const priceEl = card.querySelector('.olx-adcard__price');
        const price = priceEl ? priceEl.textContent.trim() : null;

        const locEl = card.querySelector('.olx-adcard__location');
        const location = locEl ? locEl.textContent.trim() : null;

        let dateText = null;
        const dateEl = card.querySelector('.olx-adcard__date') || card.querySelector('[class*="date"], time');
        if (dateEl) dateText = dateEl.textContent.trim();
        
        let image = null;
        const imgEl = card.querySelector('img');

        if (imgEl) {          
          const srcset = imgEl.getAttribute('srcset');   // Formato: "url1 1x, url2 2x"
          const dataSrc = imgEl.getAttribute('data-src'); // Lazy load
          const src = imgEl.getAttribute('src');

          if (srcset) {
            image = srcset.split(',')[0].trim().split(' ')[0];
          } else if (dataSrc) {
            image = dataSrc;
          } else {
            image = src;
          }

          // Se a imagem capturada for o placeholder (base64), anulamos ou tentamos fallback
          if (image && image.includes('data:image')) {
            image = imgEl.getAttribute('data-splide-lazy') || null;
          }
        }

        results.push({ title, price, link, location, date_text: dateText, image });
      } catch {}
    });
    return results;
  });
}

// ----------------- RUN SCRAPER -----------------
async function runScraper(url, maxItems, dateFrom) {
  let execPath = process.env.NODE_ENV === 'production'
    ? (process.env.CHROMIUM_PATH || '/usr/bin/chromium')
    : puppeteer.executablePath();

  console.log(`[1] Iniciando Chromium em: ${execPath}`);

  const browser = await puppeteerExtra.launch({
    headless: true,
    executablePath: execPath,
    timeout: 0,
    protocolTimeout: 240000,
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--disable-gpu', '--disable-accelerated-2d-canvas', '--no-first-run',
      '--no-zygote', '--single-process', '--disable-extensions',
      '--disable-background-networking', '--disable-sync', '--disable-translate',
      '--disable-default-apps', '--mute-audio', '--no-err-sandbox'
    ]
  });
  activeBrowser = browser;

  try {
    const page = await browser.newPage();
    
    // Bloqueio de recursos
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (['image', 'media'].includes(req.resourceType())) req.abort();
      else req.continue();
    });

    page.setDefaultNavigationTimeout(0);
    page.setDefaultTimeout(0);
    await page.setViewport(VIEWPORT);
    await page.setUserAgent(getRandomUA());
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      'Referer': 'https://www.olx.com.br/'
    });

    console.log(`[2] Navegando para: ${url}`);
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    } catch (e) {
      console.log(`[AVISO] Goto timeout ou erro: ${e.message}`);
    }

    // Pequena pausa para renderização JS
    await new Promise(r => setTimeout(r, 2000));

    console.log(`[3] Aguardando cards...`);
    try {
      await page.waitForSelector('.olx-adcard', { timeout: 30000 });
    } catch (e) {
      console.log(`[AVISO] Seletor .olx-adcard não apareceu em 30s, tentando extrair direto.`);
    }

    console.log(`[4] Extraindo dados brutos...`);
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 2));
      await new Promise(r => setTimeout(r, 1000));
    }
    await new Promise(r => setTimeout(r, 2000));
    const rawItems = await extractListingsFromPage(page);
    console.log(`[5] Itens brutos: ${rawItems.length}`);
    if (rawItems.length === 0) {
      const debug = await page.evaluate(() => ({
        title: document.title,
        bodyStart: document.body?.innerHTML?.substring(0, 500) || '',
        url: location.href
      }));
      console.log(`[DEBUG] Nenhum item encontrado. Title: "${debug.title}", URL: ${debug.url}`);
    }
    const normalized = [];
    console.log(`[6] Iniciando loop de normalização...`);
    
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      try {
        const parsedDate = it.date_text ? parsePortugueseRelativeDate(it.date_text) : null;
        
        let priceNum = null;
        if (it.price) {
            const match = it.price.match(/(\d{1,3}(?:\.\d{3})*(?:,\d+)?)/);
            if (match) priceNum = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
        }

        normalized.push({
          id: i + 1,
          title: it.title,
          price_text: it.price,
          price: priceNum,
          link: it.link,
          location: it.location,
          image: it.image, 
          date_text: it.date_text,
          date_parsed: parsedDate ? parsedDate.format('YYYY-MM-DD') : null,
          scraped_at: dayjs().format('YYYY-MM-DD HH:mm:ss')
        });
      } catch (err) {
        console.error(`[ERRO] Falha ao processar item ${i}:`, err.message);
      }
    }

    console.log(`[7] Normalização concluída. Filtrando por data...`);

    // Filtrar e Deduplicar
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
    console.log(`[8] Processamento finalizado. Total: ${final.length}. Retornando...`);
    return final.slice(0, maxItems);

  } catch (fatalError) {
    console.error(`[FATAL] Erro dentro do runScraper:`, fatalError);
    throw fatalError;
  } finally {
    if (browser) {
      activeBrowser = null;
      const closePromise = browser.close();
      const timeoutPromise = new Promise(resolve => setTimeout(resolve, 3000));
      await Promise.race([closePromise, timeoutPromise])
        .then(() => console.log(`[10] Navegador fechado (ou timeout forçado).`))
        .catch(e => console.log(`[AVISO] Erro ao fechar browser: ${e.message}`));
    }    
  }
}


// ----------------- ENDPOINT -----------------
app.get('/scrape', async (req, res) => {
  req.setTimeout(600000); // 10 min
  console.log(`\n--- NOVA REQUISIÇÃO /scrape ---`);
  
  const { url, date_from, limit } = req.query;

  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const maxItems = parseInt(limit || DEFAULT_LIMIT);
  let dateFromObj = null;
  if (date_from) {
    dateFromObj = dayjs(date_from, ['YYYY-MM-DD', 'DD/MM/YYYY'], true);
  }

  try {
    const items = await runScraper(url, maxItems, dateFromObj);
    console.log(`[SUCESSO] Enviando resposta JSON com ${items.length} itens.`);
    res.json({ success: true, count: items.length, items });
  } catch (err) {
    console.error('[ERRO API]', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ----------------- ROOT -----------------
app.get('/', (req, res) => res.json({ status: 'API Online' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 API rodando na porta ${PORT}`);
});