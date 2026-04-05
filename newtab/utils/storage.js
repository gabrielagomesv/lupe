/**
 * storage.js — wrapper do chrome.storage.sync
 * Schema: { id, url, type, title, image, description, collection, createdAt }
 */

const Storage = (() => {
  const KEY      = 'lupe_items';
  const COL_KEY  = 'lupe_collections';

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  async function getAll() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([KEY], (result) => {
        resolve(result[KEY] || []);
      });
    });
  }

  async function save(item) {
    const items = await getAll();
    const newItem = {
      id: generateId(),
      url: item.url,
      type: item.type || 'site',
      title: item.title || '',
      image: item.image || '',
      description: item.description || '',
      collection: item.collection || '',
      createdAt: Date.now(),
    };
    items.unshift(newItem);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: items }, () => resolve(newItem));
    });
  }

  async function remove(id) {
    const items = await getAll();
    const filtered = items.filter((i) => i.id !== id);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: filtered }, resolve);
    });
  }

  async function updateCollection(id, collection) {
    const items = await getAll();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    items[idx].collection = collection;
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: items }, resolve);
    });
  }

  async function updateType(id, type) {
    const items = await getAll();
    const idx = items.findIndex((i) => i.id === id);
    if (idx === -1) return;
    items[idx].type = type;
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: items }, resolve);
    });
  }

  async function getCollections() {
    const [items, stored] = await Promise.all([
      getAll(),
      new Promise((resolve) => chrome.storage.sync.get([COL_KEY], (r) => resolve(r[COL_KEY] || []))),
    ]);
    const fromItems = items.map((i) => i.collection).filter(Boolean);
    return [...new Set([...stored, ...fromItems])];
  }

  async function saveCollectionName(name) {
    const stored = await new Promise((resolve) =>
      chrome.storage.sync.get([COL_KEY], (r) => resolve(r[COL_KEY] || []))
    );
    if (stored.includes(name)) return;
    stored.push(name);
    return new Promise((resolve) => chrome.storage.sync.set({ [COL_KEY]: stored }, resolve));
  }

  async function deleteCollectionName(name) {
    const stored = await new Promise((resolve) =>
      chrome.storage.sync.get([COL_KEY], (r) => resolve(r[COL_KEY] || []))
    );
    const filtered = stored.filter((c) => c !== name);
    return new Promise((resolve) => chrome.storage.sync.set({ [COL_KEY]: filtered }, resolve));
  }

  async function deleteCollection(name) {
    const items = await getAll();
    const filtered = items.filter((i) => i.collection !== name);
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: filtered }, resolve);
    });
  }

  async function renameCollection(oldName, newName) {
    const items = await getAll();
    items.forEach((i) => { if (i.collection === oldName) i.collection = newName; });
    return new Promise((resolve) => {
      chrome.storage.sync.set({ [KEY]: items }, resolve);
    });
  }

  async function saveCollectionsOrder(collections) {
    return new Promise((resolve) =>
      chrome.storage.sync.set({ [COL_KEY]: collections }, resolve)
    );
  }

  return { getAll, save, remove, updateType, updateCollection, getCollections, saveCollectionName, deleteCollectionName, deleteCollection, renameCollection, saveCollectionsOrder };
})();
