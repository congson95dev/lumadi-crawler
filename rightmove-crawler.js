const puppeteer = require('puppeteer');
require('dotenv').config();

const RIGHTMOVE_URL = process.env.RIGHTMOVE_URL;

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--window-position=2920,0',
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ],
  });

  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8'
  });

  try {
    await page.goto(RIGHTMOVE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    await page.waitForSelector('article section div[data-test="agent-card"] h2 a');
    await page.waitForSelector('article section div[data-test="microsite-card"] h2 a');
    console.log('✅ Posts loaded.');

    const posts_1 = await page.$$('article section div[data-test="agent-card"] h2');
    const posts_2 = await page.$$('article section div[data-test="microsite-card"] h2');
    console.log(`🔎 Found ${posts_1.length} agent-card & ${posts_2.length} microsite-card.`);

    const data = [];
    for (const post of posts_1) {
      const name = await post.$eval('a', el => el.innerText.trim());
      const link = await post.$eval('a', el => el.href);
      data.push({ name, link });
    }

    const results = [];

    // 👇 Push post_2 name only (NO crawling)
    for (const post of posts_2) {
      try {
        const name = await post.$eval('a', el => el.innerText.trim());
        results.push({ name, property_list: '' });
      } catch (err) {
        console.warn('⚠️ Không lấy được name từ post_2:', err.message);
      }
    }

    // 👇 Crawl only posts with link (from posts_1)
    let n = 0;
    for (const item of data) {
      n++;
      if (n > 10) continue;

      console.log("link: " + item.link);
      console.log("name: " + item.name);

      try {
        await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 60000 });

        const property_list = await page.$eval('div[data-test="propertyList"] div', el => el.innerText.trim());
        console.log("property_list: " + property_list);

        results.push({
          name: item.name,
          link: item.link,
          property_list,
        });
      } catch (err) {
        console.log(`❌ Lỗi khi xử lý link: ${item.link}`, err.message);
        results.push({
          name: item.name,
          link: item.link,
          error: err.message,
        });
      }
    }

    console.log("Result: " + JSON.stringify(results, null, 2));
    console.log('🎉 Xong rồi!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình xử lý:', err.message);
  } finally {
    await browser.close();
  }
})();
