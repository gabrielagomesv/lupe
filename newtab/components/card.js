/**
 * card.js — renderiza os 4 tipos de card com parallax e hover actions
 */

const Card = (() => {
  const TYPES = ['site', 'image', 'video', 'book'];

  const PLACEHOLDER_COLORS = [
    '#2C2F33', '#3B3F45', '#4A3728', '#2A3B3C',
    '#3C2A4A', '#2A3C2A', '#3C3A2A', '#2A2A3C',
  ];

  function placeholderColor(id) {
    let hash = 0;
    for (const c of (id || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
    return PLACEHOLDER_COLORS[Math.abs(hash) % PLACEHOLDER_COLORS.length];
  }

  function getDomain(url) {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
  }

  // Fetch favicon as blob (avoids canvas cross-origin tainting) then
  // sample pixels to find the most prominent non-white/non-black color.
  // Returns a darkened rgb() string suitable for use as a card background,
  // or null if sampling fails.
  async function extractDominantColor(faviconUrl) {
    try {
      const resp = await fetch(faviconUrl);
      if (!resp.ok) return null;
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);

      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const size = Math.max(img.naturalWidth, 1);
            const canvas = document.createElement('canvas');
            canvas.width = size; canvas.height = Math.max(img.naturalHeight, 1);
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
            URL.revokeObjectURL(blobUrl);

            // Count 6-bit color buckets (skip transparent, near-white, near-black)
            const buckets = {};
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
              if (a < 128) continue;
              const bright = (r + g + b) / 3;
              if (bright > 210 || bright < 25) continue;
              const key = `${r >> 2},${g >> 2},${b >> 2}`;
              buckets[key] = (buckets[key] || 0) + 1;
            }

            let best = null, bestCount = 0;
            for (const [key, count] of Object.entries(buckets)) {
              if (count > bestCount) { bestCount = count; best = key; }
            }

            if (best) {
              const [r, g, b] = best.split(',').map(v => (parseInt(v) << 2) | 2);
              // Darken significantly so it works as a dark card background
              resolve(`rgb(${Math.round(r * 0.30)},${Math.round(g * 0.30)},${Math.round(b * 0.30)})`);
            } else {
              resolve(null);
            }
          } catch {
            URL.revokeObjectURL(blobUrl);
            resolve(null);
          }
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
        img.src = blobUrl;
      });
    } catch {
      return null;
    }
  }

  function isNotionUrl(url) {
    try {
      const host = new URL(url).hostname;
      return host === 'notion.so' || host.endsWith('.notion.so') ||
             host === 'notion.site' || host.endsWith('.notion.site');
    } catch { return false; }
  }

  function showFallback(card, item) {
    if (card.classList.contains('card--fallback')) return; // already shown
    const domain     = getDomain(item.url);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.url)}&sz=64`;

    const fallback = document.createElement('div');
    fallback.className = 'card__fallback';

    const titleHtml = item.title
      ? `<span class="card__fallback-title">${escHtml(item.title)}</span>`
      : '';
    fallback.innerHTML = `
      <img class="card__fallback-icon" src="${escHtml(faviconUrl)}" alt="" />
      ${titleHtml}
      <span class="card__fallback-domain">${escHtml(domain)}</span>
    `;
    card.classList.add('card--fallback');
    card.appendChild(fallback);
    // Ask masonry to reflow with an explicit height for this card
    card.dispatchEvent(new CustomEvent('image-loaded', { bubbles: true }));

    // Tint the card background with the favicon's dominant color
    extractDominantColor(faviconUrl).then((color) => {
      if (color) card.style.background = color;
    });
  }

  function create(item, onDelete, onFilterCollection) {
    const card = document.createElement('div');
    card.className = 'card entering';
    card.dataset.id   = item.id;
    card.dataset.type = item.type;

    // Placeholder color always as background base
    card.style.background = placeholderColor(item.id);

    // Image — skip entirely for Notion (login walls make images unusable)
    if (isNotionUrl(item.url)) {
      showFallback(card, item);
    } else if (item.image) {
      const img = document.createElement('img');
      img.className = 'card__image';
      img.src = item.image;
      img.alt = item.title || '';
      img.loading = 'lazy';
      img.draggable = false;

      const triggerFallback = () => {
        clearTimeout(loadTimeout);
        img.style.display = 'none';
        showFallback(card, item);
      };

      // Timeout: show fallback regardless of img.complete —
      // some URLs (login redirects, blank responses) mark the image complete
      // but never produce valid pixels, so we can't rely on that flag.
      const loadTimeout = setTimeout(() => {
        if (!card.classList.contains('card--fallback')) triggerFallback();
      }, 8000);

      img.onload = () => {
        clearTimeout(loadTimeout);
        // naturalWidth ≤ 1 catches blank images and 1×1 tracking pixels
        if (img.naturalWidth > 1 && img.naturalHeight > 1) {
          card.dataset.naturalRatio = img.naturalHeight / img.naturalWidth;
          card.dispatchEvent(new CustomEvent('image-loaded', { bubbles: true }));
        } else {
          triggerFallback();
        }
      };
      img.onerror = triggerFallback;
      card.appendChild(img);
      // Handle images already in cache
      if (img.complete) {
        if (img.naturalWidth > 1 && img.naturalHeight > 1) {
          clearTimeout(loadTimeout);
          card.dataset.naturalRatio = img.naturalHeight / img.naturalWidth;
        } else {
          triggerFallback();
        }
      }
    } else {
      // No image URL at all — show fallback immediately
      showFallback(card, item);
    }

    // Overlay (cyan difference blend on hover)
    const overlay = document.createElement('div');
    overlay.className = 'card__overlay';
    card.appendChild(overlay);

    // Footer (title) — not shown for images
    if (item.type !== 'image' && item.title) {
      const footer = document.createElement('div');
      footer.className = 'card__footer';
      footer.innerHTML = `<p class="card__title">${escHtml(item.title)}</p>`;
      card.appendChild(footer);
    }

    // Actions (top-right on hover)
    const actions = document.createElement('div');
    actions.className = 'card__actions';
    actions.innerHTML = `
      <button class="card__action-btn danger" title="Remove" data-action="delete">
        <span class="material-symbols-outlined">remove</span>
      </button>
      <button class="card__action-btn" title="Open link" data-action="open">
        <span class="material-symbols-outlined">arrow_outward</span>
      </button>
      <button class="card__action-btn" title="Change type" data-action="retype">
        <span class="card__type-label">#${escHtml(item.type)}</span>
      </button>
      <button class="card__action-btn" title="Change collection" data-action="recollect">
        <span class="card__type-label card__collection-label">#${escHtml(item.collection || '—')}</span>
      </button>
    `;
    card.appendChild(actions);

    // Action handlers
    actions.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'delete') {
        handleDelete(card, item, btn, onDelete);
      } else if (action === 'open') {
        window.open(item.url, '_blank');
      } else if (action === 'retype') {
        showRetypeMenu(card, item, actions);
      } else if (action === 'recollect') {
        showCollectionMenu(card, item, actions);
      }
    });

    // Open on card click (not on action buttons)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card__actions, .card__collection')) return;
      window.open(item.url, '_blank');
    });

    // Parallax on mousemove
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width  - 0.5;
      const y = (e.clientY - rect.top)  / rect.height - 0.5;
      card.style.transition = 'box-shadow 200ms ease';
      card.style.transform = `perspective(700px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg) scale(1.02)`;
      card.style.boxShadow = `${-x * 12}px ${-y * 12}px 30px rgba(0,0,0,0.4)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = `transform 500ms cubic-bezier(0.16,1,0.3,1), box-shadow 500ms cubic-bezier(0.16,1,0.3,1)`;
      card.style.transform  = 'perspective(700px) rotateY(0) rotateX(0) scale(1)';
      card.style.boxShadow  = 'none';
    });

    // Remove entering class after animation
    card.addEventListener('animationend', () => card.classList.remove('entering'), { once: true });

    return card;
  }

  function createCompact(item, onDelete, onFilterCollection) {
    const card = document.createElement('div');
    card.className = 'card card--compact entering';
    card.dataset.id   = item.id;
    card.dataset.type = item.type;

    const domain = getDomain(item.url);
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.url)}&sz=32`;

    const faviconWrap = document.createElement('div');
    faviconWrap.className = 'card__favicon-wrap';
    faviconWrap.innerHTML = `<img class="card__favicon" src="${faviconUrl}" alt="" loading="lazy" onerror="this.style.opacity='0'" />`;

    const info = document.createElement('div');
    info.className = 'card__compact-info';
    info.innerHTML = `
      <span class="card__compact-title">${escHtml(item.title || domain)}</span>
      <span class="card__compact-domain">${escHtml(domain)}</span>
    `;

    const actions = document.createElement('div');
    actions.className = 'card__actions';
    actions.innerHTML = `
      <button class="card__action-btn danger" title="Remove" data-action="delete">
        <span class="material-symbols-outlined">remove</span>
      </button>
      <button class="card__action-btn" title="Open link" data-action="open">
        <span class="material-symbols-outlined">arrow_outward</span>
      </button>
    `;

    card.appendChild(faviconWrap);
    card.appendChild(info);
    card.appendChild(actions);

    actions.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'delete') {
        handleDelete(card, item, btn, onDelete);
      } else if (btn.dataset.action === 'open') {
        window.open(item.url, '_blank');
      }
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card__actions')) return;
      window.open(item.url, '_blank');
    });

    card.addEventListener('animationend', () => card.classList.remove('entering'), { once: true });

    return card;
  }

  function handleDelete(card, item, btn, onDelete) {
    const icon = btn.querySelector('.material-symbols-outlined');
    icon.textContent = 'check';
    btn.style.background = '#ffffff';
    btn.style.color = '#1000EB';
    setTimeout(async () => {
      card.style.transition = 'opacity 200ms ease, transform 200ms ease';
      card.style.opacity = '0';
      card.style.transform = 'scale(0.9)';
      await Storage.remove(item.id);
      setTimeout(() => {
        card.remove();
        onDelete && onDelete(item.id);
      }, 200);
    }, 800);
  }

  function showRetypeMenu(card, item, actionsEl) {
    // Remove any existing menu
    card.querySelector('.retype-menu')?.remove();

    const menu = document.createElement('div');
    menu.className = 'retype-menu';
    menu.style.cssText = `
      position:absolute; top:60px; right:12px;
      background:#ffffff;
      border:1px solid rgba(0,0,0,0.12);
      border-radius:0; padding:4px;
      display:flex; flex-direction:column; gap:2px;
      z-index:10;
    `;

    TYPES.forEach((type) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        background:${item.type === type ? 'rgba(16,0,235,0.08)' : 'none'};
        border:none; border-radius:0; padding:6px 12px;
        color:${item.type === type ? '#1000EB' : '#333333'};
        font-family:Arial,sans-serif; font-size:12px;
        letter-spacing:-0.04em; cursor:pointer; text-align:left;
        transition:background 120ms ease;
      `;
      btn.textContent = '#' + type;
      btn.onmouseenter = () => { if (item.type !== type) btn.style.background = 'rgba(0,0,0,0.05)'; };
      btn.onmouseleave = () => { if (item.type !== type) btn.style.background = 'none'; };
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await Storage.updateType(item.id, type);
        item.type = type;
        card.dataset.type = type;
        // Update the type label in the actions bar
        const label = actionsEl.querySelector('.card__type-label');
        if (label) label.textContent = '#' + type;
        menu.remove();
        // Re-run masonry since aspect ratio changed
        card.dispatchEvent(new CustomEvent('retype', { bubbles: true }));
      });
      menu.appendChild(btn);
    });

    card.appendChild(menu);

    // Close on outside click
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  async function showCollectionMenu(card, item, actionsEl) {
    card.querySelector('.collection-menu')?.remove();

    const collections = await Storage.getCollections();

    const menu = document.createElement('div');
    menu.className = 'collection-menu';
    menu.style.cssText = `
      position:absolute; top:60px; right:12px;
      background:#ffffff;
      border:1px solid rgba(0,0,0,0.12);
      border-radius:0; padding:4px;
      display:flex; flex-direction:column; gap:2px;
      z-index:10; max-height:200px; overflow-y:auto;
    `;

    const makeEntry = (col, label) => {
      const isActive = (item.collection || '') === col;
      const btn = document.createElement('button');
      btn.style.cssText = `
        background:${isActive ? 'rgba(16,0,235,0.08)' : 'none'};
        border:none; border-radius:0; padding:6px 12px;
        color:${isActive ? '#1000EB' : '#333333'};
        font-family:Arial,sans-serif; font-size:12px;
        letter-spacing:-0.04em; cursor:pointer; text-align:left;
        transition:background 120ms ease; white-space:nowrap;
      `;
      btn.textContent = label;
      btn.onmouseenter = () => { if (!isActive) btn.style.background = 'rgba(0,0,0,0.05)'; };
      btn.onmouseleave = () => { if (!isActive) btn.style.background = 'none'; };
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await Storage.updateCollection(item.id, col);
        item.collection = col;
        const lbl = actionsEl.querySelector('.card__collection-label');
        if (lbl) lbl.textContent = '#' + (col || '—');
        menu.remove();
        card.dispatchEvent(new CustomEvent('collection-changed', {
          bubbles: true,
          detail: { id: item.id, collection: col },
        }));
      });
      return btn;
    };

    // "None" option first
    menu.appendChild(makeEntry('', '#—'));

    collections.forEach((col) => menu.appendChild(makeEntry(col, '#' + col)));

    card.appendChild(menu);

    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { create, createCompact };
})();
