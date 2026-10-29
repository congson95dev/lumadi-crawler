const searchUrl =
  $json.searchUrl ||
  'https://jp.mercari.com/search?category_id=1&exclude_keyword=%E8%B2%A1%E5%B8%83%20%E3%83%90%E3%83%83%E3%82%B0%20%E3%82%AD%E3%83%BC%E3%82%B1%E3%83%BC%E3%82%B9%20%E8%AD%B0%E5%B0%8F%E9%8A%AD%E5%85%A5%E3%82%8C%20%E3%83%9D%E3%82%B7%E3%82%A7%E3%83%83%E3%83%88%E3%83%84%E3%82%A4%E3%83%B3%20%E5%A0%B4%E5%90%88%20%E3%83%8F%E3%83%B3%E3%83%89%E3%83%90%E3%83%83%E3%82%B0%20%E3%83%86&status=on_sale&sort=created_time&order=desc&brand_id=495';
const topLimit = Number($json.topLimit || 10);
const timeoutMs = Number($json.timeoutMs || 60000);
const maxScrollRounds = Number($json.maxScrollRounds || 30);
const scrollDelayMs = Number($json.scrollDelayMs || 900);

await $page.setUserAgent(
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
);
await $page.setExtraHTTPHeaders({
  'Accept-Language': 'en-US,en;q=0.9,ja;q=0.8',
});

await $page.goto(searchUrl, {
  waitUntil: 'domcontentloaded',
  timeout: timeoutMs,
});

await $page.waitForSelector('#search-result', { timeout: timeoutMs });

for (let round = 0; round < maxScrollRounds; round += 1) {
  const realCardCount = await $page.evaluate(() => {
    return document.querySelectorAll('#search-result a[data-testid="thumbnail-link"]').length;
  });

  if (realCardCount >= topLimit) break;

  await $page.evaluate(() => {
    window.scrollBy(0, Math.round(window.innerHeight * 1.5));
  });

  await new Promise((resolve) => setTimeout(resolve, scrollDelayMs));
}

const products = await $page.evaluate((limit) => {
  const numberFromText = (text) => {
    const digits = text?.replace(/[^\d]/g, '');
    return digits ? Number(digits) : null;
  };

  const titleFromImageAlt = (alt) => {
    if (!alt) return null;

    return (
      alt
        .replace(/^Image of\s*/i, '')
        .replace(/(?:\s*の)?(?:サムネイル|thumbnail)$/i, '')
        .trim() || null
    );
  };

  const titleFromAriaLabelledBy = (element) => {
    const ids = element.getAttribute('aria-labelledby')?.trim().split(/\s+/) || [];

    return (
      ids
        .map((id) => document.getElementById(id)?.textContent?.trim())
        .find((text) => text && !/(?:[¥￥]|VND|yen)\s*[\d,.]+|^[\d,\s]+$/i.test(text)) ||
      null
    );
  };

  const cells = Array.from(document.querySelectorAll('#search-result li[data-testid="item-cell"]'));

  return cells
    .map((cell) => {
      const linkEl = cell.querySelector('a[data-testid="thumbnail-link"]');
      if (!linkEl) return null;

      const href = linkEl.getAttribute('href');
      const url = href ? new URL(href, 'https://jp.mercari.com').toString() : null;
      const imageEl = linkEl.querySelector('picture img, img');
      const title =
        linkEl.querySelector('[data-testid="thumbnail-item-name"]')?.textContent?.trim() ||
        titleFromAriaLabelledBy(linkEl) ||
        titleFromImageAlt(imageEl?.getAttribute('alt'));
      const priceYen = numberFromText(
        linkEl.querySelector('[data-testid="item-tile-price"]')?.textContent
      );
      const id = href?.match(/\/(?:item|shops\/product)\/([^/?#]+)/)?.[1] || null;

      return {
        id,
        url,
        title: title || null,
        priceYen,
        priceVnd: null,
        imageUrl: imageEl?.getAttribute('src') || null,
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}, topLimit);

return products.map((product) => ({
  json: {
    ...$json,
    ...product,
  },
}));
