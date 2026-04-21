/**
 * metadata.js — busca título, imagem e descrição de qualquer URL
 * Usa microlink.io (plano free, sem chave de API)
 */

const Metadata = (() => {
  const MICROLINK = 'https://api.microlink.io';

  async function get(url, type, tabId) {
    console.log('[Lupe] Metadata.fetch start', { url, type, tabId });
    try {
      if (type === 'image') {
        return { title: '', image: url, description: '' };
      }
      if (type === 'video') {
        return await fetchVideo(url, tabId);
      }
      if (type === 'book') {
        return await fetchBook(url, tabId);
      }
      return await fetchSite(url, tabId);
    } catch (err) {
      console.warn('[Lupe] Metadata fetch failed:', err);
      return { title: '', image: '', description: '' };
    }
  }

  // Ask the background service worker to extract a product image from the page HTML.
  // Resolves to a URL string or '' — never rejects.
  function extractProductImage(url, tabId) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        console.log('[Lupe] extractProductImage timed out');
        resolve('');
      }, 6000);
      try {
        chrome.runtime.sendMessage({ type: 'extract-product-image', url, tabId }, (response) => {
          clearTimeout(timer);
          if (chrome.runtime.lastError) {
            console.warn('[Lupe] sendMessage error:', chrome.runtime.lastError.message);
            resolve('');
            return;
          }
          console.log('[Lupe] extractProductImage response:', response);
          resolve(response?.image || '');
        });
      } catch (err) {
        clearTimeout(timer);
        console.warn('[Lupe] sendMessage threw:', err);
        resolve('');
      }
    });
  }

  async function fetchMicrolink(url) {
    console.log('[Lupe] fetchMicrolink start', url);
    // Try screenshot first
    try {
      const res = await fetch(`${MICROLINK}?url=${encodeURIComponent(url)}&screenshot=true`);
      if (res.ok) {
        const { data } = await res.json();
        console.log('[Lupe] fetchMicrolink screenshot success, image:', data.screenshot?.url || data.image?.url);
        return {
          title:       data.title || '',
          image:       data.screenshot?.url || data.image?.url || '',
          description: data.description || '',
        };
      }
      console.warn('[Lupe] fetchMicrolink screenshot response not ok:', res.status);
    } catch (err) {
      console.warn('[Lupe] fetchMicrolink screenshot threw:', err);
    }

    // Fallback: OG image + title without screenshot
    console.log('[Lupe] fetchMicrolink fallback (no screenshot)');
    const res = await fetch(`${MICROLINK}?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error(`microlink error ${res.status}`);
    const { data } = await res.json();
    console.log('[Lupe] fetchMicrolink fallback success, image:', data.image?.url);
    return {
      title:       data.title || '',
      image:       data.image?.url || '',
      description: data.description || '',
    };
  }

  async function fetchSite(url, tabId) {
    console.log('[Lupe] fetchSite start', { url, tabId });
    const [productImage, microlink] = await Promise.all([
      extractProductImage(url, tabId),
      fetchMicrolink(url).catch((err) => {
        console.warn('[Lupe] fetchMicrolink failed:', err);
        return null;
      }),
    ]);

    console.log('[Lupe] fetchSite results:', { productImage, microlinkImage: microlink?.image });
    return {
      title:       microlink?.title || '',
      image:       productImage || microlink?.image || '',
      description: microlink?.description || '',
    };
  }

  async function fetchVideo(url, tabId) {
    try {
      const oembed = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
      );
      if (oembed.ok) {
        const d = await oembed.json();
        return {
          title:       d.title || '',
          image:       d.thumbnail_url || '',
          description: d.author_name || '',
        };
      }
    } catch {}

    return await fetchSite(url, tabId);
  }

  async function fetchBook(url, tabId) {
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i);
    const asin      = asinMatch ? asinMatch[1] : null;
    console.log('[Lupe] fetchBook, asin:', asin);

    if (asin) {
      // Only treat as a real book if ASIN looks like an ISBN (doesn't start with B)
      const looksLikeBook = !/^B/i.test(asin);

      if (looksLikeBook) {
        try {
          const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${asin}`);
          if (res.ok) {
            const d   = await res.json();
            const vol = d.items?.[0]?.volumeInfo;
            if (vol) {
              console.log('[Lupe] fetchBook: found book via Google Books');
              const cover = vol.imageLinks?.thumbnail
                ? vol.imageLinks.thumbnail.replace('zoom=1', 'zoom=5').replace('http://', 'https://')
                : amazonCoverFallback(asin);
              return {
                title:       vol.title || '',
                image:       cover,
                description: vol.authors?.join(', ') || '',
              };
            }
          }
        } catch {}
      }

      // ASIN starts with B (general product) or Google Books found nothing — treat as regular site
      console.log('[Lupe] fetchBook: falling through to fetchSite');
      return await fetchSite(url, tabId);
    }

    return await fetchSite(url, tabId);
  }

  function amazonCoverFallback(asin) {
    return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
  }

  return { fetch: get };
})();
