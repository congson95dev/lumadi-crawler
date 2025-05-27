const puppeteer = require('puppeteer');
require('dotenv').config();

const DEWALT_URL = process.env.DEWALT_URL;
const SKU = "DEWDCB205-2";

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
    await page.goto(DEWALT_URL + SKU, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    // Load content
    await page.waitForSelector('#block-mainpagecontent');
    console.log('✅ Posts loaded.');

    // Tìm tất cả post
    const posts = await page.$$('#block-mainpagecontent .results-column.coh-column .coh-column .coh-column');
    console.log(`🔎 Found item.`);

    const data = [];
    for (const post of posts) {
        const link = await post.$eval('a', el => el.href);

        data.push({link: link });
    }
    console.log("✅ Posts list", data);

    const results = [];

    let n = 0;
    for (const item of data) {
        // crawl only first item
        n++;
        if (n > 1) {continue;}
        const { link } = item;
        try {
            await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

            page.click(".coh-accordion-tabs-content-wrapper .coh-accordion-tabs-content .description-container-wrapper a");

            const description = await page.$eval('.coh-accordion-tabs-content-wrapper .coh-accordion-tabs-content .description-container-wrapper .description', el => el.innerText.trim());
            console.log("description: " + description);

            const parentId = await page.$eval('.coh-style-specifications', el => el.parentElement.id);

            await page.click(`.coh-accordion-title a[href="#${parentId}"]`);

            const specifications = await page.$eval('.coh-style-specifications', el => el.innerText.trim());
            console.log("specifications: " + specifications);
            
            await page.waitForSelector('.thumbnail-slider:not(.thumbnail-slider-mobile) .slick-track .slick-slide:not(.slick-cloned) button:not(.thumbnail-image-video):not(.view-less) img');
            console.log('✅ Imgs loaded.');

            const imgs = await page.$$('.thumbnail-slider:not(.thumbnail-slider-mobile) .slick-track .slick-slide:not(.slick-cloned) button:not(.thumbnail-image-video):not(.view-less)');
            console.log(`🔎 Found ${imgs.length} imgs.`);

            const imgs_url = [];
            for (const img of imgs) {
                const link = await img.$eval('img', el => el.src);
                imgs_url.push({link: link });
            }
            console.log("✅ Imgs list", imgs_url);

            const video_url = await page.$eval('.video-container source', el => el.src);
            console.log("video_url: " + video_url);

            results.push({
              description,
              specifications,
              link,
              imgs_url,
              video_url
            });
        } catch (err) {
            console.log(`❌ Lỗi khi xử lý link: ${link}`, err);
        }
    }
    console.log("Result: " + JSON.stringify(results));
    console.log('🎉 Xong rồi!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình xử lý:', err.message);
  } finally {
    await browser.close();
  }
})();