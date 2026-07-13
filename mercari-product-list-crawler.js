const puppeteer = require('puppeteer');
require('dotenv').config();

const MERCARI_SEARCH_URL =
  process.env.MERCARI_SEARCH_URL ||
  'https://jp.mercari.com/en/search?keyword=short&sort=created_time&order=desc&status=on_sale';
const TOP_LIMIT = Number(process.env.TOP_LIMIT || 10);

function parseBoolean(value, defaultValue) {
  if (value === undefined) return defaultValue;
  return String(value).toLowerCase() === 'true';
}

const HEADLESS = parseBoolean(process.env.HEADLESS, true);

function buildLaunchOptions(overrides = {}) {
  const commonArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--disable-software-rasterizer',
    '--no-zygote',
    '--disable-crash-reporter',
    '--disable-breakpad',
    '--disable-features=Translate,BackForwardCache,AcceptCHFrame',
    '--password-store=basic',
    '--use-mock-keychain',
    '--window-size=1600,1000',
  ];

  const options = {
    headless: HEADLESS ? 'new' : false,
    args: commonArgs,
    defaultViewport: HEADLESS ? { width: 1600, height: 1000 } : null,
    env: {
      ...process.env,
      NO_AT_BRIDGE: '1',
      DBUS_SESSION_BUS_ADDRESS: 'autolaunch:',
    },
    ...overrides,
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    options.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  return options;
}

async function launchBrowserSafe() {
  const baseOptions = buildLaunchOptions();
  const attempts = [
    { name: HEADLESS ? 'bundled Chromium' : 'bundled Chromium (headed)', options: baseOptions },
    {
      name: HEADLESS ? 'single-process fallback' : 'single-process fallback (headed)',
      options: buildLaunchOptions({ args: [...baseOptions.args, '--single-process'] }),
    },
    {
      name: 'headless shell fallback',
      options: buildLaunchOptions({ headless: 'shell' }),
    },
  ];

  const errors = [];

  for (const attempt of attempts) {
    try {
      const browser = await puppeteer.launch(attempt.options);
      console.error(`Browser launch mode: ${attempt.name}`);
      return browser;
    } catch (error) {
      errors.push(`${attempt.name}: ${error.message}`);
    }
  }

  const message = [
    'Failed to launch Chromium in all fallback modes.',
    ...errors.map((item) => `- ${item}`),
    'Tip: set PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome (or your Chromium path) and retry.',
  ].join('\n');

  throw new Error(message);
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilRealCardsLoaded(page, limit) {
  const maxRounds = 30;

  for (let round = 0; round < maxRounds; round += 1) {
    const realCardCount = await page.evaluate(() => {
      return document.querySelectorAll('#item-grid a[data-testid="thumbnail-link"]').length;
    });

    if (realCardCount >= limit) {
      return;
    }

    await page.evaluate(() => {
      window.scrollBy(0, Math.round(window.innerHeight * 1.5));
    });
    await delay(900);
  }
}

async function crawlTopMercariProducts() {
  const browser = await launchBrowserSafe();

  const page = await browser.newPage();
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
  });

  try {
    await page.goto(MERCARI_SEARCH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForSelector('#item-grid', { timeout: 60000 });
    await waitUntilRealCardsLoaded(page, TOP_LIMIT);

    const products = await page.evaluate((limit) => {
      const parseFromAriaLabel = (label) => {
        if (!label) return { title: null, priceYen: null, priceVnd: null };
        const cleaned = label.replace(/^Image of\s*/i, '').trim();

        const vndMatch = cleaned.match(/\bVND([\d,]+)\b/i);
        const yenMatch = cleaned.match(/([\d,]+)\s*yen/i);
        const title = cleaned.replace(/\s*[\d,]+\s*yen.*$/i, '').trim();

        return {
          title: title || null,
          priceYen: yenMatch ? Number(yenMatch[1].replace(/,/g, '')) : null,
          priceVnd: vndMatch ? Number(vndMatch[1].replace(/,/g, '')) : null,
        };
      };

      const cells = Array.from(
        document.querySelectorAll('#item-grid li[data-testid="item-cell"]')
      );

      return cells
        .map((cell) => {
          const linkEl = cell.querySelector('a[data-testid="thumbnail-link"]');
          if (!linkEl) return null;

          const href = linkEl.getAttribute('href');
          const url = href ? new URL(href, 'https://jp.mercari.com').toString() : null;

          const thumbnail = linkEl.querySelector('.merItemThumbnail');
          const ariaLabel = thumbnail?.getAttribute('aria-label') || '';
          const parsed = parseFromAriaLabel(ariaLabel);

          const imageUrl =
            linkEl.querySelector('picture img')?.getAttribute('src') ||
            linkEl.querySelector('img')?.getAttribute('src') ||
            null;

          return {
            id: thumbnail?.getAttribute('id') || null,
            url,
            title: parsed.title,
            priceYen: parsed.priceYen,
            priceVnd: parsed.priceVnd,
            imageUrl,
          };
        })
        .filter(Boolean)
        .slice(0, limit);
    }, TOP_LIMIT);

    console.log(`Found ${products.length} products`);
    console.log(JSON.stringify(products, null, 2));
  } finally {
    await browser.close();
  }
}

crawlTopMercariProducts().catch((error) => {
  console.error('Crawler failed:', error.message);
  process.exit(1);
});
