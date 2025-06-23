const puppeteer = require('puppeteer');
require('dotenv').config();

const RIDGID_URL = process.env.RIDGID_URL;
const SKU = "RP 251";

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: [
      '--window-position=920,0',
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
    await page.goto(RIDGID_URL + SKU, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    // Load content
    await page.waitForSelector('main .zone-content');
    console.log('✅ Posts loaded.');

    // Tìm tất cả post
    const posts = await page.$$('main .zone-content .search-result');
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

            const description = await page.$eval('.marketing-content', el => el.innerText.trim());
            console.log("description: " + description);

            const specifications = await page.$eval('#specifications table', el => el.innerText.trim());
            console.log("specifications: " + specifications);

            const imgs_url = [];

            await page.waitForSelector('div.thumbnails ul.thumbs li:not(.hide) .thumb-sizer img[src]', { timeout: 60000 });
            console.log('✅ Thumb Imgs loaded.');

            const thumbLis = await page.$$('div.thumbnails ul.thumbs li:not(.hide)');
            console.log(`🔎 Found ${thumbLis.length} <li> thumb items.`);

            let count = 0;
            for (const li of thumbLis) {
              count++;
              const icon = await li.$('.Magic360_icon');

              if (icon) {
                // Kiểm tra xem có class "ng-hide" không
                const className = await icon.evaluate(el => el.className);
                const isHidden = className.includes('ng-hide');

                if (!isHidden) {
                  console.log(`⏭️ Skipping image ${count} (360 icon is visible)`);
                  continue;
                }
              }

              const thumbSizer = await li.$('.thumb-sizer');
              if (!thumbSizer) {
                console.log(`⚠️ No .thumb-sizer found in li #${count}`);
                continue;
              }

              const imgEl = await thumbSizer.$('img');
              if (imgEl) {
                console.log(`✅ Clicking image ${count}`);
                await imgEl.click();
              } else {
                console.log(`❌ No img tag found in image ${count}`);
              }
            }
            
            await page.waitForSelector('ul.images li.mobile-image img[src]', { timeout: 60000 });
            console.log('✅ Imgs loaded.');

            const anchors = await page.$$('ul.images li.mobile-image a');
            console.log(`🔎 Found ${anchors.length} anchors.`);

            // Check nếu có ảnh Magic360 → click nút kích hoạt
            const hasMagic360 = await page.$('a.Magic360');
            if (hasMagic360) {
              const magicBtn = await page.$('.thumbs .Magic360_icon:not(.ng-hide)');
              if (magicBtn) {
                console.log('🎯 Clicking .Magic360_icon to trigger 360 image...');
                await magicBtn.click();
                await new Promise(resolve => setTimeout(resolve, 3000)); // Chờ ảnh 360 render
              } else {
                console.log('⚠️ .Magic360_icon not found or hidden.');
              }
            }

            for (const anchor of anchors) {
              const imgEl = await anchor.$('img');
              if (!imgEl) continue;

              const src = await imgEl.evaluate(el => el.src?.trim()).catch(() => null);
              if (!src) continue;

              imgs_url.push({ link: src });

              // Nếu link chứa 360-images và kết thúc bằng _C01
              if (src.includes('/360-images/') && /_C01\b/.test(src)) {
                const base = src.replace(/_C01\b/, '');
                for (let i = 2; i <= 12; i++) {
                  const suffix = `_C${i.toString().padStart(2, '0')}`;
                  imgs_url.push({ link: base + suffix });
                }
              }
            }

            console.log("✅ Imgs list", imgs_url);


            const videoBtn = await page.$('.thumbnails li a.vidToggle');
            if (videoBtn) {
              console.log('🎯 Clicking video button to move to the video section...');
              await page.evaluate(() => {
                const btn = document.querySelector('.thumbnails li a.vidToggle');
                if (btn) btn.click();
              });
              await new Promise(resolve => setTimeout(resolve, 3000)); // Chờ video render
            } else {
              console.log('⚠️ Video button not found or hidden.');
            }

            const videoBtn2 = await page.$('.thumbnails li a.vidToggle');
            if (videoBtn2) {
              console.log('🎯 Clicking video button to trigger video...');
              await page.evaluate(() => {
                const btn2 = document.querySelector('.thumbnails li a.vidToggle');
                if (btn2) btn2.click();
              });
              await new Promise(resolve => setTimeout(resolve, 3000)); // Chờ video render
            } else {
              console.log('⚠️ Video button not found or hidden.');
            }

            const video_urls = [];

            // Lấy tất cả các selector của <li> hợp lệ
            const videoLinks = await page.$$(`.ytPlaylist li:not(.tmplt) a.ytFallbackLink`);

            console.log(`🔎 Found ${videoLinks.length} video links`);

            for (let i = 0; i < videoLinks.length; i++) {
              const link = videoLinks[i];

              // Scroll vào link (phòng bị offscreen hoặc cần scroll để render)
              await link.evaluate(el => el.scrollIntoView());

              console.log(`🎯 Clicking video ${i + 1}...`);

              // Click thủ công qua browser context
              await page.evaluate((idx) => {
                const items = document.querySelectorAll('.ytPlaylist li:not(.tmplt) a.ytFallbackLink');
                if (items[idx]) items[idx].click();
              }, i);

              // Đợi video render (nếu iframe load chậm, có thể tăng timeout)
              try {
                await page.waitForSelector('.ytOuter iframe', { timeout: 10000 });

                const video_url = await page.$eval('.ytOuter iframe', el => el.src);
                console.log(`✅ Video URL ${i + 1}: ${video_url}`);
                video_urls.push(video_url);
              } catch (err) {
                console.log(`⚠️ Không tìm thấy iframe sau khi click video ${i + 1}`, err);
              }
            }

            console.log("video_url: " + video_urls);

            results.push({
              description,
              specifications,
              link,
              imgs_url,
              video_urls
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
    // await browser.close();
  }
})();