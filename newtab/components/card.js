/**
 * card.js — renderiza os 4 tipos de card com parallax e hover actions
 */

const Card = (() => {
  const TYPES = ['site', 'image', 'video', 'book'];

  const PLACEHOLDER_COLORS_DULL = [
    '#2C2F33', '#3B3F45', '#4A3728', '#2A3B3C',
    '#3C2A4A', '#2A3C2A', '#3C3A2A', '#2A2A3C',
    // warm
    '#4A2C2A', '#3D2B1F', '#4A3520', '#3B2D2A',
    '#5C3317', '#4A2E39', '#3C2020', '#4D3A2A',
    '#5A2D2D', '#4A3020', '#3B2020', '#5C3C2A',
    '#3E2818', '#4A2840', '#3A2030',
    // cool
    '#1C2A3C', '#2A3D4A', '#1E2E3C', '#2C3A4A',
    '#1A2A3A', '#2A3C4A', '#1C3020', '#263040',
    '#1E3048', '#283848', '#1A2C3C', '#2A3848',
    '#1C283A', '#203040', '#1A2838',
  ];

  const PLACEHOLDER_COLORS_NEON = [
    '#FF006E', '#FF4500', '#B2D60F', '#FF8C00',
    '#FF1744', '#E91E8C', '#06D6A0', '#7B2FBE',
    // warm
    '#FF3300', '#FF6B00', '#FF2244', '#FF5500',
    '#FF0044', '#FF7700', '#E63000', '#FF4422',
    '#FF2200', '#FF6600', '#E84400', '#FF5522',
    '#FF1100', '#FF8800', '#E05500',
    // cool
    '#00E5FF', '#00BFFF', '#0091FF', '#00CFFF',
    '#00AAFF', '#00D4FF', '#0BD9A0', '#00FFCC',
    '#00E0B0', '#3DFFEA', '#00C8FF', '#00FFD4',
    '#00B8E8', '#2EFFD4', '#00D8C8',
  ];

  function placeholderColor(id) {
    const palette = localStorage.getItem('lupe-color-palette') === 'neon'
      ? PLACEHOLDER_COLORS_NEON
      : PLACEHOLDER_COLORS_DULL;
    let hash = 0;
    for (const c of (id || '')) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
    return palette[Math.abs(hash) % palette.length];
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

    const looksLikeUrl = item.title && /^https?:\/\//.test(item.title);
    const titleHtml = (item.title && !looksLikeUrl)
      ? `<span class="card__fallback-title">${escHtml(item.title)}</span>`
      : '';
    fallback.innerHTML = `
      <img class="card__fallback-icon" src="${escHtml(faviconUrl)}" alt="" />
      <div class="card__fallback-info">
        ${titleHtml}
        <span class="card__fallback-domain">${escHtml(domain)}</span>
      </div>
    `;
    card.classList.add('card--fallback');
    card.appendChild(fallback);
    // Ask masonry to reflow with an explicit height for this card
    card.dispatchEvent(new CustomEvent('image-loaded', { bubbles: true }));

    // Tint the card background with the favicon's dominant color
    extractDominantColor(faviconUrl).then((color) => {
      if (color) {
        card.style.background = color;
        card.style.setProperty('--card-text-color', textColorForBg(color));
      }
    });
  }

  function create(item, onDelete, onFilterCollection) {
    const card = document.createElement('div');
    card.className = 'card entering';
    card.dataset.id   = item.id;
    card.dataset.type = item.type;

    // Placeholder color always as background base
    const bg = placeholderColor(item.id);
    card.style.background = bg;
    card.style.setProperty('--card-text-color', textColorForBg(bg));

    // Image — skip for Notion (login walls) or when user forced fallback
    if (item.forceFallback || isNotionUrl(item.url)) {
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

    // Footer (title) — not shown for images; always created so title is clickable on hover
    if (item.type !== 'image') {
      const footer = document.createElement('div');
      footer.className = 'card__footer';
      footer.innerHTML = `<p class="card__title">${escHtml(item.title || '')}</p>`;
      footer.addEventListener('click', (e) => {
        e.stopPropagation();
        handleRename(card, item);
      });
      card.appendChild(footer);
    }

    // Actions (top-right on hover)
    const canToggle  = Boolean(item.image) && !isNotionUrl(item.url);
    const isFallback = Boolean(item.forceFallback);

    const actions = document.createElement('div');
    actions.className = 'card__actions';
    actions.innerHTML = `
      ${canToggle ? `
        <button class="card__action-btn" title="${isFallback ? 'Show preview' : 'Show fallback'}" data-action="toggle-fallback">
          <span class="material-symbols-outlined">${isFallback ? 'image' : 'hide_image'}</span>
        </button>
      ` : ''}
      <button class="card__action-btn" title="Change collection" data-action="recollect">
        <span class="card__type-label card__collection-label">#${escHtml(item.collection || '—')}</span>
      </button>
      <button class="card__action-btn danger" title="Remove" data-action="delete">
        <span class="material-symbols-outlined">remove</span>
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
      } else if (action === 'toggle-fallback') {
        handleToggleFallback(card, item, onDelete, onFilterCollection);
      } else if (action === 'retype') {
        showRetypeMenu(card, item, actions);
      } else if (action === 'recollect') {
        showCollectionMenu(card, item, actions);
      }
    });

    // Open on card click (not on action buttons or footer title)
    card.addEventListener('click', (e) => {
      if (e.target.closest('.card__actions, .card__collection, .card__footer')) return;
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
    const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(item.url)}&sz=64`;

    // Row 1: page title (click to rename)
    const name = document.createElement('div');
    name.className = 'card__compact-name';
    name.textContent = item.title || domain;
    name.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRename(card, item);
    });

    // Row 2: favicon + domain url
    const urlRow = document.createElement('div');
    urlRow.className = 'card__compact-url-row';

    const favicon = document.createElement('img');
    favicon.className = 'card__compact-favicon';
    favicon.src = faviconUrl;
    favicon.alt = '';
    favicon.loading = 'lazy';
    favicon.addEventListener('error', () => {
      const fallback = document.createElement('span');
      fallback.className = 'card__compact-favicon card__compact-favicon--fallback';
      favicon.replaceWith(fallback);
    });

    const urlSpan = document.createElement('span');
    urlSpan.className = 'card__compact-url';
    urlSpan.textContent = domain;

    urlRow.appendChild(favicon);
    urlRow.appendChild(urlSpan);

    // Actions: delete, collection tag, open
    const actions = document.createElement('div');
    actions.className = 'card__actions';
    actions.innerHTML = `
      <button class="card__action-btn danger" title="Remove" data-action="delete">
        <span class="material-symbols-outlined">remove</span>
      </button>
      <button class="card__action-btn" title="Change collection" data-action="recollect">
        <span class="card__type-label card__collection-label">#${escHtml(item.collection || '—')}</span>
      </button>
    `;

    card.appendChild(name);
    card.appendChild(urlRow);
    card.appendChild(actions);

    actions.addEventListener('click', (e) => {
      e.stopPropagation();
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'delete') {
        handleDelete(card, item, btn, onDelete);
      } else if (btn.dataset.action === 'open') {
        window.open(item.url, '_blank');
      } else if (btn.dataset.action === 'recollect') {
        showCollectionMenu(card, item, actions);
      }
    });

    card.addEventListener('click', (e) => {
      if (e.target.closest('.card__actions, .card__compact-name')) return;
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

  async function handleToggleFallback(card, item, onDelete, onFilterCollection) {
    item.forceFallback = !item.forceFallback;
    await Storage.updateForceFallback(item.id, item.forceFallback);
    const newCard = Card.create(item, onDelete, onFilterCollection);
    // Preserve masonry position so there's no layout jump
    newCard.style.position = card.style.position;
    newCard.style.width    = card.style.width;
    newCard.style.left     = card.style.left;
    newCard.style.top      = card.style.top;
    card.replaceWith(newCard);
    newCard.dispatchEvent(new CustomEvent('retype', { bubbles: true }));
  }

  function handleRename(card, item) {
    const isCompact = card.classList.contains('card--compact');
    let titleEl;

    if (isCompact) {
      titleEl = card.querySelector('.card__compact-name');
    } else {
      let footer = card.querySelector('.card__footer');
      if (!footer) {
        footer = document.createElement('div');
        footer.className = 'card__footer';
        card.appendChild(footer);
      }
      titleEl = footer.querySelector('.card__title');
      if (!titleEl) {
        titleEl = document.createElement('p');
        titleEl.className = 'card__title';
        titleEl.textContent = '';
        footer.appendChild(titleEl);
      }
    }

    if (!titleEl) return;

    card.classList.add('card--editing');

    const input = document.createElement('input');
    input.className = 'card__rename-input';
    input.value = item.title || '';
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    input.addEventListener('click', (e) => e.stopPropagation());

    let done = false;

    async function commit() {
      if (done) return;
      done = true;
      const newTitle = input.value.trim();
      item.title = newTitle;
      await Storage.updateTitle(item.id, newTitle);
      titleEl.textContent = isCompact ? (newTitle || getDomain(item.url)) : newTitle;
      input.replaceWith(titleEl);
      card.classList.remove('card--editing');
      if (!isCompact) {
        const fallbackTitle = card.querySelector('.card__fallback-title');
        if (fallbackTitle) {
          fallbackTitle.textContent = (newTitle && !/^https?:\/\//.test(newTitle)) ? newTitle : '';
        }
      }
    }

    function cancel() {
      if (done) return;
      done = true;
      input.replaceWith(titleEl);
      card.classList.remove('card--editing');
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
    input.addEventListener('blur', commit);
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
        font-family:Inter,sans-serif; font-size:12px;
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
        font-family:Inter,sans-serif; font-size:12px;
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

  function textColorForBg(bg) {
    let r, g, b;
    const hex = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    const rgb = bg.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (hex) {
      r = parseInt(hex[1], 16); g = parseInt(hex[2], 16); b = parseInt(hex[3], 16);
    } else if (rgb) {
      [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    } else {
      return '#ffffff';
    }
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    return lum > 0.179 ? '#000000' : '#ffffff';
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { create, createCompact };
})();
