const searchUrl =
  $json.searchUrl ||
  'https://jp.mercari.com/en/search?keyword=short&sort=created_time&order=desc&status=on_sale';
const topLimit = Number($json.topLimit || 10);
const timeoutMs = Number($json.timeoutMs || 60000);
const maxScrollRounds = Number($json.maxScrollRounds || 30);
const scrollDelayMs = Number($json.scrollDelayMs || 900);

function parsePriceAndTitle(ariaLabel) {
  if (!ariaLabel) return { title: null, priceYen: null, priceVnd: null };
  const cleaned = ariaLabel.replace(/^Image of\s*/i, '').trim();
  const vndMatch = cleaned.match(/\bVND([\d,]+)\b/i);
  const yenMatch = cleaned.match(/([\d,]+)\s*yen/i);
  const title = cleaned.replace(/\s*[\d,]+\s*yen.*$/i, '').trim();

  return {
    title: title || null,
    priceYen: yenMatch ? Number(yenMatch[1].replace(/,/g, '')) : null,
    priceVnd: vndMatch ? Number(vndMatch[1].replace(/,/g, '')) : null,
  };
}

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

await $page.waitForSelector('#item-grid', { timeout: timeoutMs });

for (let round = 0; round < maxScrollRounds; round += 1) {
  const realCardCount = await $page.evaluate(() => {
    return document.querySelectorAll('#item-grid a[data-testid="thumbnail-link"]').length;
  });

  if (realCardCount >= topLimit) break;

  await $page.evaluate(() => {
    window.scrollBy(0, Math.round(window.innerHeight * 1.5));
  });

  await new Promise((resolve) => setTimeout(resolve, scrollDelayMs));
}

const products = await $page.evaluate((limit) => {
  const cells = Array.from(document.querySelectorAll('#item-grid li[data-testid="item-cell"]'));

  return cells
    .map((cell) => {
      const linkEl = cell.querySelector('a[data-testid="thumbnail-link"]');
      if (!linkEl) return null;

      const href = linkEl.getAttribute('href');
      const url = href ? new URL(href, 'https://jp.mercari.com').toString() : null;
      const thumbnail = linkEl.querySelector('.merItemThumbnail');
      const ariaLabel = thumbnail?.getAttribute('aria-label') || '';
      const imageUrl =
        linkEl.querySelector('picture img')?.getAttribute('src') ||
        linkEl.querySelector('img')?.getAttribute('src') ||
        null;

      return {
        id: thumbnail?.getAttribute('id') || null,
        url,
        ariaLabel,
        imageUrl,
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}, topLimit);

return products.map((product) => ({
  json: {
    ...$json,
    ...product,
    ...parsePriceAndTitle(product.ariaLabel),
  },
}));
