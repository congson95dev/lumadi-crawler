const puppeteer = require('puppeteer');
require('dotenv').config();


const LONG_TIME_OUT = process.env.LONG_TIME_OUT;
const AVG_TIME_OUT = process.env.AVG_TIME_OUT;
const SHORT_TIME_OUT = process.env.SHORT_TIME_OUT;
const LAMUDI_URL = process.env.LAMUDI_URL;

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
    await page.goto(LAMUDI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    // Load content
    await page.waitForSelector('.ListingCellItem_cellItemWrapper__t2hO2');
    console.log('✅ Posts loaded.');

    // Tìm tất cả post
    const posts = await page.$$('.ListingCellItem_cellItemWrapper__t2hO2');
    console.log(`🔎 Found ${posts.length} posts.`);

    const data = [];
    for (const post of posts) {
        const link = await post.$eval('a', el => el.href);

        data.push({link: link });
    }
    console.log("✅ Posts list", data);

    const results = [];

    let n = 0;
    for (const item of data) {
        // crawl only 1 posts
        n++;
        if (n > 1) {continue;}
        const { link } = item;
        try {
            await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Tìm tất cả indoors
            const indoors = await page.$$('#featuresBox > .ExpandableContent:nth-of-type(1) div div div');
            console.log(`🔎 Found ${indoors.length} indoors.`);

            const indoors_data = [];
            for (const indoor of indoors) {
                const title = await indoor.$eval('p', el => el.textContent.trim());

                indoors_data.push(title);
            }
            console.log("✅ Indoors list", indoors_data);

            // Tìm tất cả outdoors
            const outdoors = await page.$$('#featuresBox > .ExpandableContent:nth-of-type(2) div div div');
            console.log(`🔎 Found ${outdoors.length} outdoors.`);

            const outdoors_data = [];
            for (const outdoor of outdoors) {
                const title = await outdoor.$eval('p', el => el.textContent.trim());

                outdoors_data.push(title);
            }
            console.log("✅ Outdoors list", outdoors_data);

            indoor_outdoor_list = indoors_data.concat(outdoors_data);
            console.log("✅ Indoors Outdoors list", indoor_outdoor_list);

            const subdivision_name = await page.$eval(
              'div[data-attr-name="subdivisionname"]',
              el => {
                const nextDiv = el.nextElementSibling;
                return nextDiv ? nextDiv.innerText.trim() : '';
              }
            ).catch(() => '');
            console.log("subdivision_name: " + subdivision_name);

            const city = await page.$eval(
              '#highlightBox > div > div:nth-of-type(2)',
              el => Array.from(el.childNodes)
                        .filter(n => n.nodeType === Node.TEXT_NODE)
                        .map(n => n.textContent.trim())
                        .join('')
            );
            console.log(city);

            const house_type = await page.$eval('div[data-attr-name="propertyType"]', el => {
              const nextDiv = el.nextElementSibling;
              return nextDiv ? nextDiv.innerText.replace(/\s+/g, ' ').trim() : '';
            }).catch(() => '');
            console.log("house_type: " + house_type);
            
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

            const selling_price = await page.$eval('#MortgageCalculator input[placeholder="Property Price"]', el => el.value.trim());
            console.log("selling_price: " + selling_price);

            const bedrooms = await page.$eval('div[data-attr-name="bedrooms"]', el => {
              const nextDiv = el.nextElementSibling;
              return nextDiv ? nextDiv.innerText.replace(/\s+/g, ' ').trim() : '';
            }).catch(() => '');
            console.log("bedrooms: " + bedrooms);

            const bathrooms = await page.$eval('div[data-attr-name="bathrooms"]', el => {
              const nextDiv = el.nextElementSibling;
              return nextDiv ? nextDiv.innerText.replace(/\s+/g, ' ').trim() : '';
            }).catch(() => '');
            console.log("bathrooms: " + bathrooms);

            const description = await page.$$eval(
              'div#DescriptionBox',
              elements => elements.map(el => el.innerText.trim()).join('\n')
            ).catch(() => '');
            console.log("description: " + description);

            const contact_name = await page.$eval('#rightColumn div[dir="auto"]', el => el.innerText.trim());
            console.log("contact_name: " + contact_name);

            results.push({
                indoor_outdoor_list,
                subdivision_name,
                city,
                house_type,
                selling_price,
                bedrooms,
                bathrooms,
                description,
                contact_name
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}