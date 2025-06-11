const puppeteer = require('puppeteer');
require('dotenv').config();


const LONG_TIME_OUT = process.env.LONG_TIME_OUT;
const AVG_TIME_OUT = process.env.AVG_TIME_OUT;
const SHORT_TIME_OUT = process.env.SHORT_TIME_OUT;
const LAMUDI_PANGASINAN_URL = process.env.LAMUDI_PANGASINAN_URL;

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
    await page.goto(LAMUDI_PANGASINAN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
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

            const city = await page.$eval(
              '#highlightBox > div > div:nth-of-type(2)',
              el => Array.from(el.childNodes)
                        .filter(n => n.nodeType === Node.TEXT_NODE)
                        .map(n => n.textContent.trim())
                        .join('')
            );
            console.log(city);

            const property_type = await page.$eval('div[data-attr-name="propertyType"]', el => {
              const nextDiv = el.nextElementSibling;
              return nextDiv ? nextDiv.innerText.replace(/\s+/g, ' ').trim() : '';
            }).catch(() => '');
            console.log("property_type: " + property_type);
            
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

            const description = await page.$$eval(
              'div#DescriptionBox',
              elements => elements.map(el => el.innerText.trim()).join('\n')
            ).catch(() => '');
            console.log("description: " + description);

            const contact_name = await page.$eval('#rightColumn div[dir="auto"]', el => el.innerText.trim());
            console.log("contact_name: " + contact_name);

            let button_contact = await page.$('#rightColumn button:nth-child(1)', { timeout: 5000 });
            button_contact.click();
            await page.waitForSelector('input.react-international-phone-input', { visible: true, timeout: 5000 });
            await page.click('div.react-international-phone-country-selector-button__button-content div');
            await page.waitForSelector('ul.react-international-phone-country-selector-dropdown li[data-country="vn"] span', { visible: true });
            await page.click('ul.react-international-phone-country-selector-dropdown li[data-country="vn"] span');
            await new Promise(resolve => setTimeout(resolve, 1000));
            await page.type('input.react-international-phone-input', '379197986');

            await page.click(".PhoneNumber_showButton____jp1");
            await new Promise(resolve => setTimeout(resolve, 2000));
            let contact_number = null;
            let contact_number_element = await page.$('.PhoneNumber_wrapper__oioYb button', { timeout: 2000 });
            if (contact_number_element) {
              contact_number = await page.evaluate(el => el.textContent.trim(), contact_number_element);
            }
            console.log("contact_number: " + contact_number);

            results.push({
                property_type,
                selling_price,
                contact_name,
                link,
                city,
                description,
                contact_number
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

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}