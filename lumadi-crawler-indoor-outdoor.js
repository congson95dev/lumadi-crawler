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
    // Access the page
    await page.goto(LAMUDI_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('✅ Accessed to Page.');

    // Load content
    await page.waitForSelector('.ListingCellItem_cellItemWrapper__t2hO2');
    console.log('✅ Posts loaded.');

    // Find all post
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

            const indoors = await page.$$('#featuresBox > .ExpandableContent:nth-of-type(1) div div div');
            console.log(`🔎 Found ${indoors.length} indoors.`);

            const indoors_data = [];
            for (const indoor of indoors) {
                const title = await indoor.$eval('p', el => el.textContent.trim());

                indoors_data.push(title);
            }
            console.log("✅ Indoors list", indoors_data);

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
        } catch (err) {
            console.log(`❌ Lỗi khi xử lý link: ${link}`, err);
        }
    }
    console.log('🎉 Finished!');
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    // await browser.close();
  }
})();

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}