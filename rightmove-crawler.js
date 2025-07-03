const puppeteer = require('puppeteer');
require('dotenv').config();

const RIGHTMOVE_URL = process.env.RIGHTMOVE_URL;

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
    const per_page = 24;

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
      // if (url != "https://www.rightmove.co.uk/estate-agents/Bedfordshire.html?page=6") continue;
      m++;
      if (m > 1) continue;
      console.log(url);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      console.log('✅ Accessed to Page.');

      const agent_card_element = await page.$(
        'article section div[data-test="agent-card"] h2 a'
      );
      const microsite_card_element = await page.$(
        'article section div[data-test="microsite-card"] h2 a'
      );

      if (microsite_card_element) {
        const posts_2 = await page.$$('article section div[data-test="microsite-card"] h2');
        // 👇 Push post_2 name only (NO crawling)
        for (const post of posts_2) {
          try {
            const name = await post.$eval('a', el => el.innerText.trim());
            results.push({ name, property_list: '', max: '', min: '', avg: ''});
          } catch (err) {
            console.warn('⚠️ Không lấy được name từ post_2:', err.message);
          }
        }
      }

      console.log('✅ Posts loaded.');

      if (agent_card_element) {
        const posts_1 = await page.$$('article section div[data-test="agent-card"] h2');
        const data = [];
        for (const post of posts_1) {
          const name = await post.$eval('a', el => el.innerText.trim());
          const link = await post.$eval('a', el => el.href);
          data.push({ name, link });
        }

        // 👇 Crawl only posts with link (from posts_1)
        let n = 0;
        for (const item of data) {
          n++;
          if (n > 1) continue;

          console.log("link: " + item.link);
          console.log("name: " + item.name);

          try {
            let max = '';
            let min = '';
            let avg = '';
            let property_list = '';
            await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const property_list_element = await page.$(
              'div[data-test="propertyList"] div'
            );
            if (property_list_element) {
              property_list = await page.$eval('div[data-test="propertyList"] div', el => el.innerText.trim());
              console.log("property_list: " + property_list);

              // Click "See all properties" link to access inside
              const see_all_propreties_link_element = await page.$(
                'a[data-testid="propertyResultsLink"]'
              );
              if (see_all_propreties_link_element) {
                const see_all_propreties_link = await page.$eval('a[data-testid="propertyResultsLink"]', el => el.href);
                await page.goto(see_all_propreties_link, { waitUntil: 'domcontentloaded', timeout: 60000 });

                const properties = await page.$$('a[data-testid="property-price"]');
                console.log(`🔎 Found ${properties.length} properties`);

                const prices = [];
                for (const proprety of properties) {
                  const price = await proprety.$eval('.PropertyPrice_price__VL65t', el => el.innerText.trim());
                  console.log("price: " + price);
                  prices.push({ price: price });
                }

                // Đầu tiên kiểm tra xem pagination có tồn tại không
                const paginationElement = await page.$(
                  'div.Pagination_pageSelectContainer__zt0rg span:nth-child(3)'
                );

                if (paginationElement) {
                  // Nếu tồn tại, lấy nội dung rồi trích số
                  const pagination = await page.$eval(
                    'div.Pagination_pageSelectContainer__zt0rg span:nth-child(3)',
                    el => el.innerText.trim()
                  );
                  const onlyNumberMatch = pagination.match(/\d+/);
                  const totalPages = onlyNumberMatch ? onlyNumberMatch[0] : null;

                  console.log("pages: " + totalPages);
                  
                  for (let p = 1; p <= totalPages; p++) {
                    if (p != 1) {
                      const indexParam = `index=${(p - 1) * per_page}`;
                      const urlWithIndex = see_all_propreties_link.includes('?')
                        ? `${see_all_propreties_link}&${indexParam}`
                        : `${see_all_propreties_link}?${indexParam}`;
                      
                      console.log("urlWithIndex: " + urlWithIndex);
                      await page.goto(urlWithIndex, { waitUntil: 'domcontentloaded', timeout: 60000 });

                      const properties = await page.$$('a[data-testid="property-price"]');
                      for (const proprety of properties) {
                        const price = await proprety.$eval('.PropertyPrice_price__VL65t', el => el.innerText.trim());
                        // console.log("price: " + price);
                        prices.push({ price: price });
                      }
                    }
                  }
                }

                console.log("prices: :", prices);

                const priceNumbers = prices.map(p => {
                  const cleaned = p.price.replace(/[^\d.]/g, ''); // loại bỏ mọi thứ không phải số
                  return Number(cleaned);
                });

                // Tính max, min, avg
                max = `£${Math.max(...priceNumbers)} pcm`;
                min = `£${Math.min(...priceNumbers)} pcm`;
                avg = `£${Math.round(priceNumbers.reduce((sum, val) => sum + val, 0) / priceNumbers.length)} pcm`;

                console.log(`Max: ${max.toLocaleString('en-US')}`);
                console.log(`Min: ${min.toLocaleString('en-US')}`);
                console.log(`Avg: ${avg.toLocaleString('en-US')}`);
              }
            }

            results.push({
              name: item.name,
              link: item.link,
              property_list,
              max: max,
              min: min,
              avg: avg
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
    }
    // console.log("Result: " + JSON.stringify(results, null, 2));
    console.log('🎉 Xong rồi!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình xử lý:', err.message);
  } finally {
    // await browser.close();
  }
})();
