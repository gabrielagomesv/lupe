/**
 * skeleton.js — card de loading enquanto metadados são buscados
 */

const Skeleton = (() => {
  function create() {
    const el = document.createElement('div');
    el.className = 'card card--skeleton';
    el.dataset.skeleton = 'true';
    return el;
  }

  function replace(skeletonEl, item, onDelete, onFilterCollection) {
    const card = Card.create(item, onDelete, onFilterCollection);
    card.style.opacity = '0';
    skeletonEl.replaceWith(card);
    requestAnimationFrame(() => {
      card.style.transition = 'opacity 300ms cubic-bezier(0.16,1,0.3,1)';
      card.style.opacity = '1';
    });
    return card;
  }

  return { create, replace };
})();
