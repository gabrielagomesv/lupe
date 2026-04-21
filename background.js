chrome.runtime.onInstalled.addListener(() => {
  console.log('Lupe installed');
});

// Runs INSIDE the tab's page context — has full access to the live rendered DOM.
function extractProductImageFromPage() {
  // 1. JSON-LD structured data (@type: Product)
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const raw   = JSON.parse(script.textContent);
      const nodes = raw['@graph']
        ? raw['@graph']
        : (Array.isArray(raw) ? raw : [raw]);
      for (const node of nodes) {
        const types = [].concat(node['@type'] || []);
        if (!types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product')) continue;
        const img = node.image;
        if (!img) continue;
        if (typeof img === 'string' && !img.startsWith('data:')) return img;
        if (Array.isArray(img)) {
          const first = img[0];
          const url = typeof first === 'string' ? first : (first?.url || first?.contentUrl);
          if (url && !url.startsWith('data:')) return url;
        }
        if (typeof img === 'object') {
          const url = img.url || img.contentUrl;
          if (url && !url.startsWith('data:')) return url;
        }
      }
    } catch {}
  }

  // 2. Common product image selectors (covers Amazon, Shopify themes, WooCommerce, etc.)
  const selectors = [
    '#imgTagWrapperId img',           // Amazon
    '#landingImage',                  // Amazon
    '.product__media img',            // Shopify Dawn
    '.product-single__photo img',     // Shopify older themes
    '.product-featured-img',          // Shopify
    '[data-testid="product-image"] img',
    '[id*="main-image"] img',
    '[class*="main-image"] img',
    '[id*="product-image"] img',
    '[class*="product-image"] img',
    '[class*="product-photo"] img',
    '[class*="product-media"] img',
    '[class*="hero-image"] img',
    '[class*="primary-image"] img',
    '[class*="pdp-image"] img',
    '[class*="featured-image"] img',
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (!el) continue;
      const src = el.src || el.dataset.src || el.dataset.lazySrc || el.dataset.original;
      if (src && !src.startsWith('data:') && src.startsWith('http')) return src;
    } catch {}
  }

  return null;
}

// Regex-based extraction from raw HTML (service worker has no DOMParser).
function extractImageFromHtml(html) {
  // JSON-LD
  for (const match of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  )) {
    try {
      const raw   = JSON.parse(match[1]);
      const nodes = raw['@graph']
        ? raw['@graph']
        : (Array.isArray(raw) ? raw : [raw]);
      for (const node of nodes) {
        const types = [].concat(node['@type'] || []);
        if (!types.some((t) => typeof t === 'string' && t.toLowerCase() === 'product')) continue;
        const img = node.image;
        if (!img) continue;
        if (typeof img === 'string' && !img.startsWith('data:')) return img;
        if (Array.isArray(img)) {
          const first = img[0];
          const url = typeof first === 'string' ? first : (first?.url || first?.contentUrl);
          if (url && !url.startsWith('data:')) return url;
        }
        if (typeof img === 'object') {
          const url = img.url || img.contentUrl;
          if (url && !url.startsWith('data:')) return url;
        }
      }
    } catch {}
  }

  // img tags with product-related class/id
  const KEYWORDS = [
    'main-image', 'mainimage', 'product-image', 'productimage',
    'product-photo', 'product-media', 'hero-image', 'primary-image',
    'pdp-image', 'featured-image', 'product-main',
  ];
  for (const imgMatch of html.matchAll(/<img\b[^>]+>/gi)) {
    const tag = imgMatch[0].toLowerCase();
    if (!KEYWORDS.some((kw) => tag.includes(kw))) continue;
    const srcMatch =
      imgMatch[0].match(/\bdata-src=["']([^"']+)["']/i) ||
      imgMatch[0].match(/\bsrc=["']([^"']+)["']/i);
    if (!srcMatch) continue;
    const url = srcMatch[1];
    if (!url || url.startsWith('data:') || !url.startsWith('http')) continue;
    const wMatch = imgMatch[0].match(/\bwidth=["']?(\d+)/i);
    if (wMatch && parseInt(wMatch[1], 10) < 100) continue;
    return url;
  }

  return null;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type !== 'extract-product-image') return false;

  console.log('[Lupe BG] extract-product-image received', { url: msg.url, tabId: msg.tabId });

  (async () => {
    // Strategy 1: inject into the specific tab (already open, fully rendered)
    if (msg.tabId) {
      try {
        console.log('[Lupe BG] Strategy 1: injecting into tab', msg.tabId);
        const results = await chrome.scripting.executeScript({
          target: { tabId: msg.tabId },
          func: extractProductImageFromPage,
        });
        const image = results?.[0]?.result;
        console.log('[Lupe BG] Strategy 1 result:', image);
        if (image) { sendResponse({ image }); return; }
      } catch (err) {
        console.warn('[Lupe BG] Strategy 1 failed:', err.message);
      }
    }

    // Strategy 2: find any open tab whose URL matches
    try {
      console.log('[Lupe BG] Strategy 2: searching open tabs for URL');
      const allTabs = await chrome.tabs.query({});
      const match   = allTabs.find((t) => t.url === msg.url);
      if (match) {
        console.log('[Lupe BG] Strategy 2: found tab', match.id);
        const results = await chrome.scripting.executeScript({
          target: { tabId: match.id },
          func: extractProductImageFromPage,
        });
        const image = results?.[0]?.result;
        console.log('[Lupe BG] Strategy 2 result:', image);
        if (image) { sendResponse({ image }); return; }
      } else {
        console.log('[Lupe BG] Strategy 2: no matching tab found');
      }
    } catch (err) {
      console.warn('[Lupe BG] Strategy 2 failed:', err.message);
    }

    // Strategy 3: fetch raw HTML and parse (works for SSR sites; skipped by JS-heavy sites)
    try {
      console.log('[Lupe BG] Strategy 3: fetching raw HTML');
      const res = await fetch(msg.url, { headers: { Accept: 'text/html' } });
      console.log('[Lupe BG] Strategy 3 response status:', res.status);
      if (res.ok) {
        const image = extractImageFromHtml(await res.text());
        console.log('[Lupe BG] Strategy 3 result:', image);
        if (image) { sendResponse({ image }); return; }
      }
    } catch (err) {
      console.warn('[Lupe BG] Strategy 3 failed:', err.message);
    }

    console.log('[Lupe BG] All strategies exhausted, no product image found');
    sendResponse({});
  })();

  return true;
});
