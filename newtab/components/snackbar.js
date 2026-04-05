/**
 * snackbar.js — feedback visual após salvar
 */

const Snackbar = (() => {
  let timeout = null;

  function show(message = 'Saved', icon = 'check_circle') {
    // Remove any existing snackbar
    document.querySelector('.snackbar')?.remove();
    if (timeout) clearTimeout(timeout);

    const el = document.createElement('div');
    el.className = 'snackbar';
    el.innerHTML = `<span class="material-symbols-outlined">${icon}</span>${message}`;
    document.getElementById('snackbarContainer').appendChild(el);

    timeout = setTimeout(() => {
      el.classList.add('hiding');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 3000);
  }

  return { show };
})();
