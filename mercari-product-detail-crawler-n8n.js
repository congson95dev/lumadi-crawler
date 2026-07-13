const productUrl =
  $json.productUrl ||
  'https://jp.mercari.com/item/m16615838547';
const timeoutMs = Number($json.timeoutMs || 60000);

await $page.setUserAgent(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
);
await $page.setExtraHTTPHeaders({
  'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
});

await $page.goto(productUrl, {
  waitUntil: 'domcontentloaded',
  timeout: timeoutMs,
});

await $page.waitForFunction(
  () =>
    !!document.querySelector('[data-testid="item-detail-category"], [data-testid="product-detail-category"]'),
  { timeout: timeoutMs }
);

const detail = await $page.evaluate(() => {
  const container = document.querySelector(
    '[data-testid="item-detail-category"], [data-testid="product-detail-category"]'
  );

  let category = [];
  if (container) {
    const breadcrumbItems = Array.from(
      container.querySelectorAll('a[data-location="item_details:item_info:category_link"]')
    );

    category = breadcrumbItems
      .map((item) => item.textContent?.trim() || null)
      .filter(Boolean);
  }

  return {
    category,
  };
});

return [
  {
    json: {
      ...$json,
      url: productUrl,
      ...detail,
    },
  },
];
