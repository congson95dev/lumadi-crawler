const puppeteer = require('puppeteer');
require('dotenv').config();

// const MERCARI_PRODUCT_URL =
//   process.env.MERCARI_PRODUCT_URL ||
//   'https://jp.mercari.com/item/m16615838547';

const MERCARI_PRODUCT_URL =
  process.env.MERCARI_PRODUCT_URL ||
  'https://jp.mercari.com/shops/product/2JTuDCLsTaPJJuYGx4Pn6B';

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

async function crawlMercariProductCategory() {
  const browser = await launchBrowserSafe();
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
  );
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
  });

  try {
    await page.goto(MERCARI_PRODUCT_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    await page.waitForFunction(
      () =>
        !!document.querySelector('[data-testid="item-detail-category"], [data-testid="product-detail-category"]'),
      { timeout: 60000 }
    );

    const category = await page.evaluate(() => {
      const container = document.querySelector(
        '[data-testid="item-detail-category"], [data-testid="product-detail-category"]'
      );
      if (!container) return [];

      const breadcrumbItems = Array.from(
        container.querySelectorAll('a[data-location="item_details:item_info:category_link"]')
      );

      if (breadcrumbItems.length === 0) return [];

      return breadcrumbItems
        .map((item) => item.textContent?.trim() || null)
        .filter(Boolean);
    });

    console.log(
      JSON.stringify(
        {
          url: MERCARI_PRODUCT_URL,
          category,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

crawlMercariProductCategory().catch((error) => {
  console.error('Crawler failed:', error.message);
  process.exit(1);
});
