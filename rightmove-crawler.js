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
            results.push({ 
              name, 
              property_list: '', 
              max_sale: '',
              min_sale: '',
              avg_sale: '',
              max_rent: '',
              min_rent: '',
              avg_rent: ''
            });
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
        // console.log("data: " + JSON.stringify(data))

        // 👇 Crawl only posts with link (from posts_1)
        let n = 0;
        for (const item of data) {
          n++;
          if (n > 1) continue;

          console.log("link: " + item.link);
          console.log("name: " + item.name);

          try {
            let property_list = '';
            let max_sale = '';
            let min_sale = '';
            let avg_sale = '';
            let max_rent = '';
            let min_rent = '';
            let avg_rent = '';
            await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 60000 });

            const property_list_element = await page.$(
              'div[data-test="propertyList"] div'
            );
            if (property_list_element) {
              property_list = await page.$eval('div[data-test="propertyList"] div', el => el.innerText.trim());
              console.log("property_list: " + property_list);

              // Lấy danh sách button trong tabs
              const buttonTexts = await page.$$eval('div[data-test="propertyList"] div > button', buttons =>
                buttons.map(btn => btn.textContent.toLowerCase())
              );

              // Đếm số button, 
              // nếu == 2, thì click vào từng button, sau đó trả type tương ứng với mỗi lần click.
              // nếu số button bằng 1 thì không cần click vào, chỉ cần trả type ra là được.
              console.log("số buttons: " + buttonTexts.length);
              if (buttonTexts.length === 1) {
                const text = buttonTexts[0];
                let type;
                if (text.includes('sale')) type = 'sale';
                else if (text.includes('rent')) type = 'rent';

                console.log(`Only one tab found. Type: ${type}`);
              } else if (buttonTexts.length === 2) {
                for (let i = 1; i <= 2; i++) {
                  // Reload page before each click
                  await page.goto(item.link, { waitUntil: 'domcontentloaded', timeout: 60000 });

                  // click accept cookie
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  const cookieBtnSelector = '#onetrust-button-group-parent #onetrust-accept-btn-handler';
                  const hasCookieButton = await page.$(cookieBtnSelector);

                  if (hasCookieButton) {
                    console.log('🍪 Cookie accept button found. Clicking...');
                    await page.click(cookieBtnSelector);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                  } else {
                    console.log('✅ No cookie banner found.');
                  }

                  const selector = `[data-test="propertyList"] div > button:nth-child(${i})`;

                  // Wait and click
                  await page.waitForSelector(selector, { timeout: 5000 });
                  const btn = await page.$(selector);
                  await btn.evaluate(el => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                  await btn.click({ delay: 100 });

                  await new Promise(resolve => setTimeout(resolve, 1000));

                  // Get the text again after click
                  const text = await page.$eval(selector, btn => btn.textContent.toLowerCase());

                  let type;
                  if (text.includes('sale')) type = 'sale';
                  else if (text.includes('rent')) type = 'rent';

                  console.log(`Clicked tab ${i}: type = ${type}`);

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

                    console.log("prices:", prices);

                    const priceNumbers = prices.map(p => {
                      const cleaned = p.price.replace(/[^\d.]/g, ''); // loại bỏ mọi thứ không phải số
                      return Number(cleaned);
                    });

                    // Tính max, min, avg
                    if (type == "sale") {
                      max_sale = `£${Math.max(...priceNumbers)} pcm`;
                      min_sale = `£${Math.min(...priceNumbers)} pcm`;
                      avg_sale = `£${Math.round(priceNumbers.reduce((sum, val) => sum + val, 0) / priceNumbers.length)} pcm`;

                      console.log(`Max_sale: ${max_sale.toLocaleString('en-US')}`);
                      console.log(`Min_sale: ${min_sale.toLocaleString('en-US')}`);
                      console.log(`Avg_sale: ${avg_sale.toLocaleString('en-US')}`);
                    } else if (type == "rent") {
                      max_rent = `£${Math.max(...priceNumbers)} pcm`;
                      min_rent = `£${Math.min(...priceNumbers)} pcm`;
                      avg_rent = `£${Math.round(priceNumbers.reduce((sum, val) => sum + val, 0) / priceNumbers.length)} pcm`;

                      console.log(`Max_rent: ${max_rent.toLocaleString('en-US')}`);
                      console.log(`Min_rent: ${min_rent.toLocaleString('en-US')}`);
                      console.log(`Avg_rent: ${avg_rent.toLocaleString('en-US')}`);
                    }
                  }
                }
              }
            }

            results.push({
              name: item.name,
              link: item.link,
              property_list,
              max_sale: max_sale,
              min_sale: min_sale,
              avg_sale: avg_sale,
              max_rent: max_rent,
              min_rent: min_rent,
              avg_rent: avg_rent
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
    console.log("Result: " + JSON.stringify(results, null, 2));
    console.log('🎉 Xong rồi!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình xử lý:', err.message);
  } finally {
    await browser.close();
  }
})();
