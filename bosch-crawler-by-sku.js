const puppeteer = require('puppeteer');
require('dotenv').config();

const BOSCH_URL = process.env.BOSCH_URL;
const SKU = "1199VSRK";

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

  // Sử dụng userAgent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({
    'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8'
  });

  try {
    // Mở trang
    await page.goto(BOSCH_URL + SKU, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    // Load content
    await page.waitForSelector('body main');
    console.log('✅ Posts loaded.');

    // Tìm tất cả post
    const posts = await page.$$('body main .category-grid-tiles .category-grid-tile');
    console.log(`🔎 Found item.`);

    const data = [];
    for (const post of posts) {
        const link = await post.$eval('a', el => el.href);

        data.push({link: link });
    }
    console.log("✅ Posts list", data);

    const results = [];

    if (data.length == 0) {
        const error = true;
        results.push({error, SKU});
        console.log("❌ Không tìm thấy sản phẩm với SKU:", SKU);
    }

    let n = 0;
    for (const item of data) {
        // crawl only first item
        n++;
        if (n > 1) {continue;}
        const { link } = item;
        try {
            let error = false;

            await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const titleElements = await page.$$('.product-detail-stage__title');
            const title = await titleElements[0].evaluate(el => el.innerText.trim());
            console.log("title: " + title);

            if (!title.includes(SKU)) {
              error = true;
              results.push({error, SKU});
              console.error(`❌ Title does not contain SKU. Title: "${title}", SKU: "${SKU}"`);
            }

            if (!error) {
              const descriptions = await page.$$('ul.product-detail-stage__list li');
              console.log(`🔎 Found description.`);

              const description = [];
              for (const item of descriptions) {
                  const data = await item.evaluate(el => el.innerText.trim());

                  description.push(data);
              }
              console.log("description: " + description);

              const specifications = await page.$$('section.o-technical_data .table__body .table__body-row');
              console.log(`🔎 Found specification.`);

              const specification = [];
              for (const item of specifications) {
                  const data = await item.evaluate(el => el.innerText.trim());

                  specification.push(data);
              }
              console.log("specification: " + specification);

              const imgs_url = [];

              await page.waitForSelector('.product-detail-stage__thumbnails .product-detail-stage__thumb:not(.thumb--video) img[src]', { timeout: 60000 });
              console.log('✅ Imgs loaded.');

              const anchors = await page.$$('.product-detail-stage__thumbnails .product-detail-stage__thumb:not(.thumb--video)');
              console.log(`🔎 Found ${anchors.length} anchors.`);

              for (const anchor of anchors) {
                const imgEl = await anchor.$('img');
                if (!imgEl) continue;

                const src = await imgEl.evaluate(el => el.src?.trim()).catch(() => null);
                if (!src) continue;

                imgs_url.push({ link: src });
              }

              console.log("✅ Imgs list", imgs_url);

              results.push({
                description,
                specification,
                link,
                imgs_url,
              });
            }
        } catch (err) {
            console.log(`❌ Lỗi khi xử lý link: ${link}`, err);
        }
    }
    console.log("Result: " + JSON.stringify(results));
    console.log('🎉 Xong rồi!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình xử lý:', err.message);
  } finally {
    // await browser.close();
  }
})();