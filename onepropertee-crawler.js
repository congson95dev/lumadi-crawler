const puppeteer = require('puppeteer');
require('dotenv').config();


const LONG_TIME_OUT = process.env.LONG_TIME_OUT;
const AVG_TIME_OUT = process.env.AVG_TIME_OUT;
const SHORT_TIME_OUT = process.env.SHORT_TIME_OUT;
const ONEPROPERTEE_URL = process.env.ONEPROPERTEE_URL;

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
    await page.goto(ONEPROPERTEE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    // Load content
    await page.waitForSelector('.listings-grid .listing');
    console.log('✅ Posts loaded.');

    // Find all post
    const posts = await page.$$('.listings-grid .listing');
    console.log(`🔎 Found ${posts.length} posts.`);

    const data = [];
    const linksSet = new Set();

    for (const post of posts) {
        const link = await post.$eval('a', el => el.href);

        if (!linksSet.has(link)) {
            linksSet.add(link);
            data.push({ link });
        }
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
            const key_informations = await page.$$('.details-property-keywords ul li');
            console.log(`🔎 Found ${key_informations.length} key_informations.`);

            const key_informations_data = [];
            for (const key_information of key_informations) {
                const title = await key_information.$eval('a', el => el.textContent.trim());

                key_informations_data.push(title);
            }
            console.log("✅ key informations list", key_informations_data);

            const amenities = await page.$$('.details-property-amenities ul li');
            console.log(`🔎 Found ${amenities.length} amenities.`);

            const amenities_data = [];
            for (const amenity of amenities) {
                const title = await amenity.$eval('span', el => el.textContent.trim());

                amenities_data.push(title);
            }
            console.log("✅ amenities list", amenities_data);

            const features = await page.$$('.details-property-features ul li');
            console.log(`🔎 Found ${features.length} features.`);

            const features_data = [];
            for (const feature of features) {
                const title = await feature.$eval('span', el => el.textContent.trim());

                features_data.push(title);
            }
            console.log("✅ features list", features_data);

            key_informations_amenity_list = key_informations_data.concat(amenities_data);
            key_informations_amenity_features_list = key_informations_amenity_list.concat(features_data);
            console.log("✅ Result headers list", key_informations_amenity_features_list);

            const address = await page.$eval('.details-property-details address', el => el.textContent.trim());
            console.log("address: " + address);

            const city = await page.$eval('.details-required-propertydetails li.-location .value', el => el.textContent.trim());
            console.log("city: " + city);

            const house_type = await page.$eval('.details-property-details div ul li:nth-child(1) span.value a', el => el.textContent.trim());
            console.log("house_type: " + house_type);

            const selling_price = await page.$eval('.details-price-total strong', el => el.value.trim());
            console.log("selling_price: " + selling_price);

            const bedrooms = await page.$eval('.details-property-details div ul li:nth-child(2) span.value a', el => el.textContent.trim());
            console.log("bedrooms: " + bedrooms);

            const bathrooms = await page.$eval('.details-property-details div ul li:nth-child(3) span.value a', el => el.textContent.trim());
            console.log("bathrooms: " + bathrooms);

            //  ====
            
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

    // console.log("Result: " + JSON.stringify(results));

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