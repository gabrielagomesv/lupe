/**
 * metadata.js — busca título, imagem e descrição de qualquer URL
 * Usa microlink.io (plano free, sem chave de API)
 */

const Metadata = (() => {
  const MICROLINK = 'https://api.microlink.io';

  async function get(url, type) {
    try {
      if (type === 'image') {
        return { title: '', image: url, description: '' };
      }
      if (type === 'video') {
        return await fetchVideo(url);
      }
      if (type === 'book') {
        return await fetchBook(url);
      }
      return await fetchSite(url);
    } catch (err) {
      console.warn('Metadata fetch failed:', err);
      return { title: '', image: '', description: '' };
    }
  }

  async function fetchSite(url) {
    // Try with screenshot first
    try {
      const res = await fetch(`${MICROLINK}?url=${encodeURIComponent(url)}&screenshot=true`);
      if (res.ok) {
        const { data } = await res.json();
        return {
          title:       data.title || '',
          image:       data.screenshot?.url || data.image?.url || '',
          description: data.description || '',
        };
      }
    } catch {}

    // Fallback: fetch without screenshot to at least get OG image + title
    const res = await fetch(`${MICROLINK}?url=${encodeURIComponent(url)}`);
    if (!res.ok) throw new Error('microlink error');
    const { data } = await res.json();
    return {
      title:       data.title || '',
      image:       data.image?.url || '',
      description: data.description || '',
    };
  }

  async function fetchVideo(url) {
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

    return await fetchSite(url);
  }

  async function fetchBook(url) {
    const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i);
    const asin      = asinMatch ? asinMatch[1] : null;

    if (asin) {
      // Try Google Books API — confirms it's a book and gives title/author
      try {
        const res = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${asin}`);
        if (res.ok) {
          const d   = await res.json();
          const vol = d.items?.[0]?.volumeInfo;
          if (vol) {
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

      // Not a book (or Google Books unavailable) — fetch OG image from the product page
      try {
        const res = await fetch(`${MICROLINK}?url=${encodeURIComponent(url)}`);
        if (res.ok) {
          const { data } = await res.json();
          return {
            title:       data.title || '',
            image:       data.image?.url || amazonCoverFallback(asin),
            description: data.description || '',
          };
        }
      } catch {}

      // Last resort: Amazon CDN cover (reliable for books)
      return { title: '', image: amazonCoverFallback(asin), description: '' };
    }

    return await fetchSite(url);
  }

  function amazonCoverFallback(asin) {
    return `https://images-na.ssl-images-amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg`;
  }

  return { fetch: get };
})();
