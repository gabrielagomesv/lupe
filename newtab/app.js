/**
 * app.js — orquestra tudo: carrega items, renderiza grid/spaces, gerencia views
 */

(async () => {
  // ── State ─────────────────────────────────────────────────────────────────
  let items            = [];
  let allCollections   = [];         // all known collection names (includes empty ones)
  let currentView      = 'grid';     // 'grid' | 'spaces'
  let activeCollection = '';         // '' = all
  let searchQuery      = '';
  let cardMode         = 'preview';  // 'preview' | 'compact'

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const gridView          = document.getElementById('gridView');
  const spacesView        = document.getElementById('spacesView');
  const collectionBar     = document.getElementById('collectionBar');
  const btnGrid           = document.getElementById('btnGrid');
  const btnSpaces         = document.getElementById('btnSpaces');
  const searchInput       = document.getElementById('searchInput');
  const searchClear       = document.getElementById('searchClear');
  const navbar            = document.querySelector('.navbar');
  const btnModeToggle     = document.getElementById('btnModeToggle');
  const modeMenu          = document.getElementById('modeMenu');
  const addMenuWrap       = document.getElementById('addMenuWrap');
  const addMenu           = document.getElementById('addMenu');
  const addMenuLink       = document.getElementById('addMenuLink');
  const addMenuCollection = document.getElementById('addMenuCollection');
  const collectionModalOverlay = document.getElementById('collectionModalOverlay');
  const collectionModalInput   = document.getElementById('collectionModalInput');
  const collectionModalSave    = document.getElementById('collectionModalSave');
  const collectionModalCancel  = document.getElementById('collectionModalCancel');

  // ── Boot ──────────────────────────────────────────────────────────────────
  // Show skeleton cards immediately while storage loads.
  // Use the cached count from last session so the number matches reality.
  const cachedCount = Math.min(parseInt(localStorage.getItem('lupe-item-count') || '6', 10), 16);
  for (let i = 0; i < cachedCount; i++) gridView.appendChild(Skeleton.create());
  requestAnimationFrame(() => applyMasonry(gridView));

  [items, allCollections] = await Promise.all([Storage.getAll(), Storage.getCollections()]);
  localStorage.setItem('lupe-item-count', items.length);

  renderCollectionBar();
  renderGrid();
  Drawer.updateCollections(allCollections);

  // ── Save a link (used by drawer callback and tab drag-drop) ─────────────
  async function saveLink(url, collection, tabId) {
    console.log('[Lupe] saveLink start', { url, collection, tabId });
    const type        = Detector.detect(url);
    console.log('[Lupe] detected type:', type);
    const inSpaces    = currentView === 'spaces';

    // Only use the skeleton in grid view — running masonry on the hidden
    // gridView while in spaces view would override its `position: absolute`
    // and push the spaces content down the page.
    let skeleton = null;
    if (!inSpaces) {
      skeleton = Skeleton.create();
      gridView.prepend(skeleton);
      if (cardMode === 'preview') requestAnimationFrame(() => applyMasonry(gridView));
    }

    const meta = await Metadata.fetch(url, type, tabId);
    console.log('[Lupe] meta result:', meta);
    const item = await Storage.save({
      url, type, collection,
      title:       meta.title,
      image:       meta.image,
      description: meta.description,
    });
    console.log('[Lupe] Storage.save done, item:', item);
    items.unshift(item);

    if (!inSpaces) {
      Skeleton.replace(skeleton, item, onDeleteCard, onFilterCollection);
      if (cardMode === 'preview') requestAnimationFrame(() => applyMasonry(gridView));
    }

    await refreshCollections();
    Snackbar.show('Saved');
    if (currentView === 'spaces') renderSpaces();
  }

  // ── Drawer init ───────────────────────────────────────────────────────────
  Drawer.init(saveLink);

  // Switch to spaces view when a tab drag starts from the drawer
  document.addEventListener('lupe-tab-dragstart', () => {
    if (currentView !== 'spaces') switchView('spaces');
  });

  // Allow drops anywhere on the page while a tab is being dragged from the drawer.
  // Without this, Chrome blocks the drop over any element that lacks its own dragover handler.
  document.addEventListener('dragover', (e) => {
    if (window.lupeTabDrag) e.preventDefault();
  });

  // ── Search ────────────────────────────────────────────────────────────────
  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim().toLowerCase();
    const hasClear = searchQuery.length > 0;
    searchClear.style.opacity = hasClear ? '1' : '0';
    searchClear.style.pointerEvents = hasClear ? 'auto' : 'none';
    renderCurrent();
  });

  searchInput.addEventListener('focus', () => {
    navbar.classList.add('navbar--searching');
  });

  searchInput.addEventListener('blur', () => {
    if (!searchQuery) navbar.classList.remove('navbar--searching');
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClear.style.opacity = '0';
    searchClear.style.pointerEvents = 'none';
    searchInput.focus();
    renderCurrent();
  });

  // ── View toggle ───────────────────────────────────────────────────────────
  btnGrid.addEventListener('click', () => switchView('grid'));
  btnSpaces.addEventListener('click', () => switchView('spaces'));

  function switchView(view) {
    if (view === currentView) return;
    currentView = view;

    btnGrid.classList.toggle('active',   view === 'grid');
    btnSpaces.classList.toggle('active', view === 'spaces');

    if (view === 'grid') {
      spacesView.classList.add('hidden');
      gridView.classList.remove('hidden');
      collectionBar.style.visibility = '';
      renderGrid();
    } else {
      gridView.classList.add('hidden');
      // Masonry sets position/height inline; those beat .grid-view.hidden and would
      // keep the grid in normal flow, leaving a huge gap above Collections.
      gridView.style.position = '';
      gridView.style.height = '';
      spacesView.classList.remove('hidden');
      collectionBar.style.visibility = 'hidden';
      renderSpaces();
    }
  }

  // ── Card mode toggle (preview / compact) ──────────────────────────────────
  btnModeToggle.addEventListener('click', () => {
    setCardMode(cardMode === 'preview' ? 'compact' : 'preview');
  });

  function setCardMode(mode) {
    if (mode === cardMode) return;
    cardMode = mode;
    btnModeToggle.querySelector('.material-symbols-outlined').textContent =
      mode === 'preview' ? 'grid_view' : 'view_list';
    renderCurrent();
  }

  // ── Add menu (dropdown) ───────────────────────────────────────────────────
  document.getElementById('btnAdd').addEventListener('click', (e) => {
    e.stopPropagation();
    addMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!addMenuWrap.contains(e.target)) addMenu.classList.remove('open');
  });

  addMenuLink.addEventListener('click', () => {
    addMenu.classList.remove('open');
    document.getElementById('btnAdd').dispatchEvent(new CustomEvent('open-drawer'));
  });

  addMenuCollection.addEventListener('click', () => {
    addMenu.classList.remove('open');
    collectionModalInput.value = '';
    collectionModalOverlay.classList.remove('hidden');
    setTimeout(() => collectionModalInput.focus(), 50);
  });

  // ── Collection modal ──────────────────────────────────────────────────────
  async function saveNewCollection() {
    const name = collectionModalInput.value.trim();
    if (!name) return;
    await Storage.saveCollectionName(name);
    collectionModalOverlay.classList.add('hidden');
    await refreshCollections();
    if (currentView === 'spaces') renderSpaces();
    Snackbar.show('Collection created');
  }

  collectionModalSave.addEventListener('click', saveNewCollection);
  collectionModalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveNewCollection();
    if (e.key === 'Escape') collectionModalOverlay.classList.add('hidden');
  });
  collectionModalCancel.addEventListener('click', () => collectionModalOverlay.classList.add('hidden'));
  collectionModalOverlay.addEventListener('click', (e) => {
    if (e.target === collectionModalOverlay) collectionModalOverlay.classList.add('hidden');
  });

  // ── Masonry layout ────────────────────────────────────────────────────────
  // Aspect height ratios: for aspect-ratio W/H, height = width * (H/W)
  const MASONRY_RATIOS = { site: 2/3, video: 9/16, image: 1, book: 3/2 };
  const MASONRY_COLS_BY_WIDTH = [
    [1600, 5], [900, 4], [600, 3], [0, 2],
  ];

  function getMasonryCols(containerWidth) {
    for (const [minW, cols] of MASONRY_COLS_BY_WIDTH) {
      if (containerWidth >= minW) return cols;
    }
    return 2;
  }

  function applyMasonry(container) {
    const cards = [...container.querySelectorAll('.card:not(.card--compact)')];
    if (cards.length === 0) {
      container.style.height = '';
      return;
    }

    const gap           = 16;
    const containerWidth = container.clientWidth;
    const cols          = getMasonryCols(containerWidth);
    const colWidth      = (containerWidth - (cols - 1) * gap) / cols;
    const colHeights    = new Array(cols).fill(0);

    container.style.position = 'relative';

    cards.forEach((card) => {
      const type        = card.dataset.type || 'site';
      const MAX_RATIO   = MASONRY_RATIOS.book; // 3/2 — same max height as a book card
      const naturalRatio = (type !== 'book' && card.dataset.naturalRatio)
        ? parseFloat(card.dataset.naturalRatio)
        : (MASONRY_RATIOS[type] ?? 2/3);
      const ratio      = Math.min(naturalRatio, MAX_RATIO);
      const cardHeight = colWidth * ratio;
      const isCapped   = ratio < naturalRatio;

      console.log('[Lupe masonry]', {
        id: card.dataset.id,
        type,
        naturalRatio: card.dataset.naturalRatio,
        naturalRatioParsed: naturalRatio,
        ratio,
        isCapped,
        cardHeight,
        classes: card.className,
      });

      // Find shortest column
      let shortCol = 0;
      for (let i = 1; i < cols; i++) {
        if (colHeights[i] < colHeights[shortCol]) shortCol = i;
      }

      card.style.position = 'absolute';
      card.style.width    = colWidth + 'px';
      card.style.left     = shortCol * (colWidth + gap) + 'px';
      card.style.top      = colHeights[shortCol] + 'px';
      card.style.marginBottom = '0';

      // Fixed height for: books, fallbacks, skeletons, and images capped at MAX_RATIO
      if (type === 'book' || card.classList.contains('card--fallback') || card.classList.contains('card--skeleton') || isCapped) {
        card.style.height      = cardHeight + 'px';
        card.style.aspectRatio = '';
      } else {
        card.style.height      = '';
        card.style.aspectRatio = 'auto'; // overrides CSS aspect-ratio rules; image sets height
      }
      // Capped images: contain (no crop) instead of cover
      card.classList.toggle('card--img-contain', isCapped);
      console.log('[Lupe masonry] after toggle, has card--img-contain:', card.classList.contains('card--img-contain'));

      colHeights[shortCol] += cardHeight + gap;
    });

    container.style.height = (Math.max(...colHeights) - gap) + 'px';
  }

  // Re-sync when a card's collection is changed from the action menu
  document.addEventListener('collection-changed', async (e) => {
    const { id, collection } = e.detail;
    const target = items.find((i) => i.id === id);
    if (target) target.collection = collection;
    await refreshCollections();
    if (currentView === 'spaces') renderSpaces();
  });

  // Re-layout when a card type changes (aspect ratio changes)
  document.addEventListener('retype', () => {
    if (cardMode === 'preview') {
      if (currentView === 'grid') applyMasonry(gridView);
      else document.querySelectorAll('.space-group__grid').forEach(applyMasonry);
    }
  });

  // Re-layout when an image loads so the card height uses the real image ratio
  // Debounced to batch rapid loads (e.g. multiple images loading at once)
  let imageLoadedTimer;
  document.addEventListener('image-loaded', () => {
    if (cardMode !== 'preview') return;
    clearTimeout(imageLoadedTimer);
    imageLoadedTimer = setTimeout(() => {
      if (currentView === 'grid') applyMasonry(gridView);
      else document.querySelectorAll('.space-group__grid').forEach(applyMasonry);
    }, 50);
  });

  // Debounced resize handler
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (cardMode !== 'preview') return;
      if (currentView === 'grid') {
        applyMasonry(gridView);
      } else {
        document.querySelectorAll('.space-group__grid').forEach(applyMasonry);
      }
    }, 120);
  });

  // ── Render: grid ──────────────────────────────────────────────────────────
  function renderGrid() {
    gridView.innerHTML = '';
    const filtered = filterItems(items);

    if (filtered.length === 0) {
      const msg = activeCollection ? `<p class="empty-state__text">there's none here.</p>` : '';
      gridView.innerHTML = `<div class="empty-state">${msg}</div>`;
      gridView.style.height = '';
      gridView.style.position = '';
      gridView.classList.remove('compact-mode');
      return;
    }

    if (cardMode === 'compact') {
      gridView.classList.add('compact-mode');
      gridView.style.height   = '';
      gridView.style.position = '';
      filtered.forEach((item) => {
        gridView.appendChild(Card.createCompact(item, onDeleteCard, onFilterCollection));
      });
    } else {
      gridView.classList.remove('compact-mode');
      filtered.forEach((item) => {
        gridView.appendChild(Card.create(item, onDeleteCard, onFilterCollection));
      });
      requestAnimationFrame(() => applyMasonry(gridView));
    }
  }

  // Tracks which collection is being dragged for reordering
  let draggingCollection = null;

  // ── Render: spaces ────────────────────────────────────────────────────────
  function renderSpaces() {
    spacesView.innerHTML = '';
    const filtered = filterItems(items);

    if (filtered.length === 0) {
      spacesView.innerHTML = `<div class="empty-state"></div>`;
      return;
    }

    // Group by collection
    const groups = {};
    const NO_COL = '__none__';

    // Seed all known collections (so empty ones still show)
    allCollections.forEach((col) => { groups[col] = []; });

    filtered.forEach((item) => {
      const key = item.collection || NO_COL;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });

    // Render each group in stored order, uncategorized always last
    const sortedKeys = [
      ...allCollections.filter((col) => groups[col] !== undefined),
      ...Object.keys(groups).filter((k) => k !== NO_COL && !allCollections.includes(k)),
      ...(groups[NO_COL] !== undefined ? [NO_COL] : []),
    ];

    sortedKeys.forEach((key) => {
      const group = document.createElement('div');
      group.className = 'space-group';

      const name  = key === NO_COL ? 'Uncategorized' : key;
      const count = groups[key].length;

      group.innerHTML = `
        <div class="space-group__header">
          ${key !== NO_COL ? `<button class="space-group__drag-handle" title="Drag to reorder">
            <span class="material-symbols-outlined">drag_indicator</span>
          </button>` : ''}
          <span class="space-group__name">${escHtml(name)}</span>
          <span class="space-group__count">(${String(count).padStart(2, '0')})</span>
          ${key !== NO_COL ? `<button class="space-group__delete" title="Delete collection">
            <span class="material-symbols-outlined">delete</span>
          </button>` : ''}
        </div>
        <div class="space-group__grid"></div>
      `;

      // Delete collection
      group.querySelector('.space-group__delete')?.addEventListener('click', async () => {
        await Promise.all([Storage.deleteCollection(key), Storage.deleteCollectionName(key)]);
        items = items.filter((i) => i.collection !== key);
        await refreshCollections();
        renderSpaces();
      });

      // Rename collection on name click
      const nameEl = group.querySelector('.space-group__name');
      if (key !== NO_COL) {
        nameEl.style.cursor = 'text';
        nameEl.addEventListener('click', () => {
          const input = document.createElement('input');
          input.className = 'space-group__rename-input';
          input.value = name;
          nameEl.replaceWith(input);
          input.focus();
          input.select();

          let saved = false;
          const save = async () => {
            if (saved) return;
            saved = true;
            const newName = input.value.trim();
            if (newName && newName !== name) {
              await Promise.all([
                Storage.renameCollection(name, newName),
                Storage.deleteCollectionName(name).then(() => Storage.saveCollectionName(newName)),
              ]);
              items.forEach((i) => { if (i.collection === name) i.collection = newName; });
            }
            await refreshCollections();
            renderSpaces();
          };

          input.addEventListener('blur', save);
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { saved = true; renderSpaces(); }
          });
        });
      }

      const grid = group.querySelector('.space-group__grid');

      if (cardMode === 'compact') {
        grid.classList.add('compact-mode');
        groups[key].forEach((item) => {
          const card = Card.createCompact(item, onDeleteCard, onFilterCollection);
          makeDraggable(card, item.id);
          grid.appendChild(card);
        });
      } else {
        grid.classList.remove('compact-mode');
        groups[key].forEach((item) => {
          const card = Card.create(item, onDeleteCard, onFilterCollection);
          makeDraggable(card, item.id);
          grid.appendChild(card);
        });
        requestAnimationFrame(() => applyMasonry(grid));
      }

      // Drag handle: reorder collections
      const handle = group.querySelector('.space-group__drag-handle');
      if (handle) {
        handle.addEventListener('mousedown', () => { group.draggable = true; });
        group.addEventListener('dragstart', (e) => {
          draggingCollection = key;
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', '');
          setTimeout(() => group.classList.add('group-dragging'), 0);
        });
        group.addEventListener('dragend', () => {
          group.draggable = false;
          group.classList.remove('group-dragging');
          draggingCollection = null;
          document.querySelectorAll('.space-group').forEach((g) => g.classList.remove('group-drag-over'));
        });
      }

      // Drop target: cards into collection OR reorder collections
      group.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (draggingCollection !== null) {
          if (draggingCollection !== key && key !== NO_COL) group.classList.add('group-drag-over');
        } else {
          e.dataTransfer.dropEffect = 'move';
          group.classList.add('drag-over');
        }
      });
      group.addEventListener('dragleave', (e) => {
        if (!group.contains(e.relatedTarget)) {
          group.classList.remove('drag-over');
          group.classList.remove('group-drag-over');
        }
      });
      group.addEventListener('drop', async (e) => {
        e.preventDefault();
        group.classList.remove('drag-over');
        group.classList.remove('group-drag-over');

        if (draggingCollection !== null) {
          if (draggingCollection === key || key === NO_COL) return;
          const srcIdx = allCollections.indexOf(draggingCollection);
          const dstIdx = allCollections.indexOf(key);
          if (srcIdx === -1 || dstIdx === -1) return;
          allCollections.splice(srcIdx, 1);
          allCollections.splice(dstIdx, 0, draggingCollection);
          await Storage.saveCollectionsOrder([...allCollections]);
          renderSpaces();
          return;
        }

        // Tab dragged from drawer → save it into this collection
        if (window.lupeTabDrag) {
          const url = window.lupeTabDrag;
          window.lupeTabDrag = null;
          const col = key === NO_COL ? '' : key;
          Drawer.close();
          await saveLink(url, col);
          return;
        }

        const itemId = e.dataTransfer.getData('text/plain');
        if (!itemId) return;
        const targetCollection = key === NO_COL ? '' : key;
        const target = items.find((i) => i.id === itemId);
        if (!target || target.collection === targetCollection) return;
        target.collection = targetCollection;
        await Storage.updateCollection(itemId, targetCollection);
        await refreshCollections();
        renderSpaces();
        Snackbar.show(`Moved to ${targetCollection || 'Uncategorized'}`);
      });

      spacesView.appendChild(group);
    });
  }

  // ── Refresh collections state + UI ───────────────────────────────────────
  async function refreshCollections() {
    allCollections = await Storage.getCollections();
    renderCollectionBar();
    Drawer.updateCollections(allCollections);
  }

  // ── Render: collection bar ────────────────────────────────────────────────
  function renderCollectionBar() {
    collectionBar.innerHTML = '';

    if (allCollections.length === 0) return;

    const allPill = makePill('All', activeCollection === '');
    allPill.addEventListener('click', () => {
      activeCollection = '';
      renderCollectionBar();
      renderCurrent();
    });
    collectionBar.appendChild(allPill);

    allCollections.forEach((col) => {
      const pill = makePill(col, activeCollection === col);
      pill.addEventListener('click', () => {
        activeCollection = col;
        renderCollectionBar();
        renderCurrent();
      });
      collectionBar.appendChild(pill);
    });
  }

  function makePill(label, isActive) {
    const btn = document.createElement('button');
    btn.className = 'collection-pill' + (isActive ? ' active' : '');
    btn.textContent = label;
    return btn;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function filterItems(arr) {
    let result = activeCollection
      ? arr.filter((i) => i.collection === activeCollection)
      : arr;
    if (searchQuery) {
      result = result.filter((i) =>
        (i.title  || '').toLowerCase().includes(searchQuery) ||
        (i.url    || '').toLowerCase().includes(searchQuery)
      );
    }
    return result;
  }

  function renderCurrent() {
    if (currentView === 'grid') renderGrid();
    else renderSpaces();
  }

  async function onDeleteCard(id) {
    items = items.filter((i) => i.id !== id);
    await refreshCollections();
    if (currentView === 'spaces') renderSpaces();
    else if (cardMode === 'preview') requestAnimationFrame(() => applyMasonry(gridView));
  }

  function onFilterCollection(col) {
    activeCollection = col;
    renderCollectionBar();
    renderCurrent();
  }

  function makeDraggable(card, itemId) {
    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', itemId);
      e.dataTransfer.effectAllowed = 'move';
      // Defer so the drag image captures the normal state
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
})();
