const puppeteer = require('puppeteer');
require('dotenv').config();

const MERCARI_SEARCH_URL =
  process.env.MERCARI_SEARCH_URL ||
  'https://jp.mercari.com/en/search?keyword=Louis%20vuitton%20%E3%82%B9%E3%83%88%E3%83%BC%E3%83%AB%E3%83%BB%E3%82%B7%E3%83%A7%E3%83%BC%E3%83%AB&sort=created_time&order=desc&status=on_sale';
const TOP_LIMIT = Number(process.env.TOP_LIMIT || 10);
const BROWSER_LAUNCH_TIMEOUT = Number(process.env.BROWSER_LAUNCH_TIMEOUT || 120000);

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
    timeout: BROWSER_LAUNCH_TIMEOUT,
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
      return document.querySelectorAll('#search-result a[data-testid="thumbnail-link"]').length;
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

    await page.waitForSelector('#search-result', { timeout: 60000 });
    await waitUntilRealCardsLoaded(page, TOP_LIMIT);

    const products = await page.evaluate((limit) => {
      const numberFromText = (text) => {
        const digits = text?.replace(/[^\d]/g, '');
        return digits ? Number(digits) : null;
      };

      const titleFromImageAlt = (alt) => {
        if (!alt) return null;

        return (
          alt
            .replace(/^Image of\s*/i, '')
            .replace(/(?:\s*の)?(?:サムネイル|thumbnail)$/i, '')
            .trim() || null
        );
      };

      const titleFromAriaLabelledBy = (element) => {
        const ids = element.getAttribute('aria-labelledby')?.trim().split(/\s+/) || [];

        return (
          ids
            .map((id) => document.getElementById(id)?.textContent?.trim())
            .find((text) => text && !/(?:[¥￥]|VND|yen)\s*[\d,.]+|^[\d,\s]+$/i.test(text)) ||
          null
        );
      };

      const cells = Array.from(
        document.querySelectorAll('#search-result li[data-testid="item-cell"]')
      );

      return cells
        .map((cell) => {
          const linkEl = cell.querySelector('a[data-testid="thumbnail-link"]');
          if (!linkEl) return null;

          const href = linkEl.getAttribute('href');
          const url = href ? new URL(href, 'https://jp.mercari.com').toString() : null;
          const imageEl = linkEl.querySelector('picture img, img');
          const title =
            linkEl.querySelector('[data-testid="thumbnail-item-name"]')?.textContent?.trim() ||
            titleFromAriaLabelledBy(linkEl) ||
            titleFromImageAlt(imageEl?.getAttribute('alt'));
          const priceYen = numberFromText(
            linkEl.querySelector('[data-testid="item-tile-price"]')?.textContent
          );
          const id = href?.match(/\/(?:item|shops\/product)\/([^/?#]+)/)?.[1] || null;

          const imageUrl =
            imageEl?.getAttribute('src') ||
            null;

          return {
            id,
            url,
            title: title || null,
            priceYen,
            // The current listing markup only contains a yen price.
            priceVnd: null,
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
