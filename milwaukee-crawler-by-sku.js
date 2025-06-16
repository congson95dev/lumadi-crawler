const puppeteer = require('puppeteer');
require('dotenv').config();

const MILWAUKEE_URL = process.env.MILWAUKEE_URL;
const SKU = "2997-22";

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
    const link = MILWAUKEE_URL + SKU;
    await page.goto(MILWAUKEE_URL + SKU, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    // Load content
    const product = await page.waitForSelector('.product-split', { visible: true, timeout: 5000 });
    if (!product) {
      console.log('❌ Product not found.');
      results.push({
        link
      });
    }

    console.log('✅ Product found.');
    const results = [];
    try {
        const description = await page.$eval('.product-info__overview div div', el => el.innerText.trim());
        console.log("description: " + description);

        let specifications = null;
        const specEl = await page.$('.product-specs__table');
        if (specEl) {
          specifications = await page.evaluate(el => el.innerText.trim(), specEl);
        }
        console.log("specifications:", specifications);
        
        await page.waitForSelector('ul#splide02-list li img', { visible: true, timeout: 5000 });
        console.log('✅ Imgs loaded.');

        const items = await page.$$('ul#splide02-list li');
        const imgs_url = [];
        for (const item of items) {
            const imgEl = await item.$('img');
            if (!imgEl) continue;

            const parentTagName = await imgEl.evaluate(el => el.parentElement.tagName.toLowerCase());
            let src = await imgEl.evaluate(el => el.src);

            if (parentTagName !== 'span') {
                // ✅ Xóa tham số `mw=150` khỏi URL
                src = src.replace(/([&?])mw=150(&)?/, (match, p1, p2) => {
                    if (p1 === '?' && !p2) return ''; // ?mw=150 => ''
                    if (p1 === '?' && p2) return '?'; // ?mw=150& => '?'
                    if (p1 === '&' && p2) return '&'; // &mw=150& => '&'
                    return '';                        // &mw=150 => ''
                });

                imgs_url.push({ link: src });
            }
        }
        console.log(`🔎 Found ${imgs_url.length} images.`);
        console.log("✅ Images list", imgs_url);


        const videos_url = [];
        const videos = await page.$$('ul#splide01-list li span');
        console.log(`🔎 Found ${videos.length} videos.`);
        for (const video of videos) {
            let videoID = await video.evaluate(el => el.getAttribute('data-vimeovideoid'));
            if (!videoID) continue;
            let src = `https://player.vimeo.com/video/${videoID}?title=0&byline=0&portrait=0&muted=1&autoplay=1&app_id=122963`;
            videos_url.push({ link: src });
        }
        console.log("🎥 Videos list", videos_url);

        results.push({
          description,
          specifications,
          link,
          imgs_url,
          videos_url
        });
    } catch (err) {
        console.log(`❌ Lỗi khi xử lý link: ${link}`, err);
    }
    console.log("Result: " + JSON.stringify(results));
    console.log('🎉 Xong rồi!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình xử lý:', err.message);
  } finally {
    await browser.close();
  }
})();