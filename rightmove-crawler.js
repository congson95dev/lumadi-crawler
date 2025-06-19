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

    // scroll to the bottom of the page
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 500;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 200); // delay giữa các lần scroll (200ms)
      });
    });

    const urls = [];

    // Đầu tiên kiểm tra xem pagination có tồn tại không
    const paginationElement = await page.$(
      'nav[aria-label="Page navigation"] ul li.pagination_currentPage__XMXMA span:nth-child(3)'
    );

    if (paginationElement) {
      // Nếu tồn tại, lấy nội dung rồi trích số
      const pagination = await page.$eval(
        'nav[aria-label="Page navigation"] ul li.pagination_currentPage__XMXMA span:nth-child(3)',
        el => el.innerText.trim()
      );
      const onlyNumberMatch = pagination.match(/\d+/);
      const totalPages = onlyNumberMatch ? onlyNumberMatch[0] : null;

      console.log("pages: " + totalPages);
      
      for (let page = 1; page <= totalPages; page++) {
        if (page === 1) {
          urls.push(RIGHTMOVE_URL);
        } else {
          urls.push(`${RIGHTMOVE_URL}?page=${page}`);
        }
      }

      console.log("list urls: " + urls);
    } else {
      console.log("No pagination found, skipping...");
      urls.push(RIGHTMOVE_URL);
    }

    const results = [];
    let m = 0;
    for (const url of urls) {
      m++;
      if (m > 3) continue;
      console.log(url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
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
        if (n > 5) continue;

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
    }
    console.log("Result: " + JSON.stringify(results, null, 2));
    console.log('🎉 Xong rồi!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình xử lý:', err.message);
  } finally {
    await browser.close();
  }
})();
