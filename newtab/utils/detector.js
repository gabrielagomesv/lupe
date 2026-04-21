/**
 * detector.js — detecta o tipo do link automaticamente
 * Tipos: 'site' | 'image' | 'video' | 'book'
 */

const Detector = (() => {
  const IMAGE_EXTS = /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp|tiff)(\?.*)?$/i;

  const VIDEO_HOSTS = [
    'youtube.com', 'youtu.be', 'vimeo.com',
    'dailymotion.com', 'twitch.tv', 'loom.com',
  ];

  // Amazon ASINs starting with B are general products, not books.
  // Real book ASINs are ISBN-10 format (digits only, e.g. 0321534719).
  const BOOK_RULES = [
    { host: 'amazon.com',        path: /\/dp\/(?!B)[A-Z0-9]{10}/i },
    { host: 'amazon.com.br',     path: /\/dp\/(?!B)[A-Z0-9]{10}/i },
    { host: 'books.google.com',  path: null },
    { host: 'openlibrary.org',   path: null },
    { host: 'goodreads.com',     path: /\/book\//i },
  ];

  function detect(url) {
    try {
      const u = new URL(url);
      const hostname = u.hostname.replace('www.', '');

      // Image: direct file extension
      if (IMAGE_EXTS.test(u.pathname)) return 'image';

      // Video
      if (VIDEO_HOSTS.some((h) => hostname.includes(h))) return 'video';

      // Book
      for (const rule of BOOK_RULES) {
        if (hostname.includes(rule.host)) {
          if (!rule.path || rule.path.test(u.pathname)) return 'book';
        }
      }

      return 'site';
    } catch {
      return 'site';
    }
  }

  return { detect };
})();
