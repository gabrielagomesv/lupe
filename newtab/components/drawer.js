/**
 * drawer.js — drawer lateral para adicionar links e tabs
 */

const Drawer = (() => {
  let onSaveCallback     = null;
  let selectedCollection = '';
  let knownCollections   = [];

  const drawer           = document.getElementById('drawer');
  const btnAdd           = document.getElementById('btnAdd');
  const drawerClose      = document.getElementById('drawerClose');
  const urlInput         = document.getElementById('urlInput');
  const btnSave          = document.getElementById('btnSave');
  const btnUrlClear      = document.getElementById('btnUrlClear');
  const collectionRow    = document.getElementById('collectionRow');
  const collectionChips  = document.getElementById('collectionChips');
  const collectionText   = document.getElementById('collectionTextInput');
  const btnCollectionClear = document.getElementById('btnCollectionClear');
  const tabList          = document.getElementById('tabList');

  // Debounced reload — avoids thrashing during rapid tab changes
  let reloadTimer = null;
  function scheduleReload() {
    if (!drawer.classList.contains('open')) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(loadTabs, 150);
  }

  function init(onSave) {
    onSaveCallback = onSave;

    btnAdd.addEventListener('open-drawer', open);
    drawerClose.addEventListener('click', close);

    // Live tab sync
    chrome.tabs.onCreated.addListener(scheduleReload);
    chrome.tabs.onRemoved.addListener(scheduleReload);
    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
      if (changeInfo.title || changeInfo.url || changeInfo.status === 'complete') {
        scheduleReload();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    urlInput.addEventListener('input', onUrlInput);
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnSave.disabled) handleSave();
    });

    btnSave.addEventListener('click', () => handleSave());

    btnUrlClear.addEventListener('click', () => {
      urlInput.value = '';
      onUrlInput();
      urlInput.focus();
    });

    // Collection text input — match existing or create chip on Enter/blur
    collectionText.addEventListener('input', () => {
      const hasVal = collectionText.value.length > 0;
      btnCollectionClear.style.opacity = hasVal ? '1' : '0';
      btnCollectionClear.style.pointerEvents = hasVal ? 'auto' : 'none';
    });
    collectionText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        commitCollectionText();
        collectionText.blur();
      }
    });
    collectionText.addEventListener('blur', commitCollectionText);

    btnCollectionClear.addEventListener('click', () => {
      collectionText.value = '';
      btnCollectionClear.style.opacity = '0';
      btnCollectionClear.style.pointerEvents = 'none';
      collectionText.focus();
    });
  }

  function open() {
    drawer.classList.add('open');
    document.dispatchEvent(new CustomEvent('lupe-tab-dragstart')); // ensure spaces view is rendered
    loadTabs();
    renderChips();
    setTimeout(() => urlInput.focus(), 80);
  }

  function close() {
    drawer.classList.remove('open');
    reset();
  }

  function reset() {
    urlInput.value = '';
    urlInput.classList.remove('valid', 'invalid');
    btnSave.disabled = true;
    btnUrlClear.style.opacity = '0';
    btnUrlClear.style.pointerEvents = 'none';
    collectionRow.classList.remove('visible');
    selectedCollection = '';
    collectionText.value = '';
    btnCollectionClear.style.opacity = '0';
    btnCollectionClear.style.pointerEvents = 'none';
    renderChips();
  }

  function onUrlInput() {
    const val = urlInput.value.trim();
    const hasClear = val.length > 0;
    btnUrlClear.style.opacity = hasClear ? '1' : '0';
    btnUrlClear.style.pointerEvents = hasClear ? 'auto' : 'none';

    if (!val) {
      urlInput.classList.remove('valid', 'invalid');
      btnSave.disabled = true;
      collectionRow.classList.remove('visible');
      return;
    }
    try {
      new URL(val);
      urlInput.classList.add('valid');
      urlInput.classList.remove('invalid');
      btnSave.disabled = false;
      collectionRow.classList.add('visible');
    } catch {
      urlInput.classList.add('invalid');
      urlInput.classList.remove('valid');
      btnSave.disabled = true;
      collectionRow.classList.remove('visible');
    }
  }

  function commitCollectionText() {
    const val = collectionText.value.trim();
    collectionText.value = '';
    if (!val) return;

    // Match existing collection (case-insensitive)
    const match = knownCollections.find((c) => c.toLowerCase() === val.toLowerCase());
    if (match) {
      selectedCollection = match;
    } else {
      // New collection — add to known so it renders as a chip
      if (!knownCollections.includes(val)) knownCollections = [...knownCollections, val];
      selectedCollection = val;
    }
    renderChips();
  }

  function renderChips() {
    collectionChips.innerHTML = '';

    // Existing known collections
    knownCollections.forEach((col) => {
      const chip = document.createElement('button');
      chip.className = 'collection-chip' + (selectedCollection === col ? ' selected' : '');
      chip.type = 'button';

      const label = document.createElement('span');
      label.textContent = col;
      chip.appendChild(label);

      if (selectedCollection === col) {
        const rm = document.createElement('span');
        rm.className = 'collection-chip__remove';
        rm.innerHTML = '<span class="material-symbols-outlined">close</span>';
        rm.addEventListener('click', (e) => {
          e.stopPropagation();
          selectedCollection = '';
          renderChips();
        });
        chip.appendChild(rm);
      }

      chip.addEventListener('click', () => {
        selectedCollection = selectedCollection === col ? '' : col;
        renderChips();
      });

      collectionChips.appendChild(chip);
    });
  }

  async function handleSave(url) {
    const targetUrl = (typeof url === 'string' && url) ? url : urlInput.value.trim();
    if (!targetUrl) return;

    const collection = selectedCollection;
    close();
    onSaveCallback && await onSaveCallback(targetUrl, collection);
  }

  function loadTabs() {
    tabList.innerHTML = '<p class="tab-list-empty">Loading tabs...</p>';

    chrome.tabs.query({}, (tabs) => {
      tabList.innerHTML = '';

      const filtered = (tabs || []).filter(
        (t) => t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://')
      );

      if (filtered.length === 0) {
        tabList.innerHTML = '<p class="tab-list-empty">No open tabs</p>';
        return;
      }

      filtered.forEach((tab) => {
        const item = document.createElement('button');
        item.className = 'tab-item';

        const faviconUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(tab.url)}&sz=32`;
        const domain = getDomain(tab.url);

        item.innerHTML = `
          <div class="tab-item__favicon-wrap">
            <img class="tab-item__favicon" src="${faviconUrl}" alt=""
              onerror="this.style.opacity='0'" />
          </div>
          <div class="tab-item__info">
            <div class="tab-item__title">${escHtml(tab.title || tab.url)}</div>
            <div class="tab-item__domain">${escHtml(domain)}</div>
          </div>
          <span class="tab-item__add">
            <span class="material-symbols-outlined">add</span>
          </span>
        `;

        item.addEventListener('click', () => handleSave(tab.url));

        // Drag tab to a collection in the spaces view
        item.draggable = true;
        item.addEventListener('dragstart', (e) => {
          window.lupeTabDrag = tab.url;
          e.dataTransfer.setData('text/plain', tab.url);
          drawer.classList.add('tab-dragging');
          document.dispatchEvent(new CustomEvent('lupe-tab-dragstart'));

          // Custom floating ghost
          const ghost = document.createElement('div');
          ghost.className = 'tab-drag-ghost';
          ghost.innerHTML = `
            <img class="tab-drag-ghost__favicon" src="${faviconUrl}" onerror="this.style.opacity='0'" />
            <div class="tab-drag-ghost__info">
              <div class="tab-drag-ghost__title">${escHtml(tab.title || domain)}</div>
              <div class="tab-drag-ghost__domain">${escHtml(domain)}</div>
            </div>
          `;
          ghost.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;pointer-events:none;';
          document.body.appendChild(ghost);
          e.dataTransfer.setDragImage(ghost, 16, 24);
          requestAnimationFrame(() => ghost.remove());
        });
        item.addEventListener('dragend', () => {
          if (window.lupeTabDrag) window.lupeTabDrag = null;
          drawer.classList.remove('tab-dragging');
        });

        tabList.appendChild(item);
      });
    });
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  }

  function updateCollections(collections) {
    knownCollections = collections;
    renderChips();
  }

  function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init, updateCollections, close };
})();
