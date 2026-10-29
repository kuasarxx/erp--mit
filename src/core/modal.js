// ============================================================
// ERP ÜMİT v2 — Modal servisi (programatik, tek nokta)
// Legacy'de her modal HTML'e gömülüydü; burada JS tarafında
// üretilir. openModal({title, body, footer}) -> { el, close }
// ============================================================

import { icon } from '../icons/index.js';

let backdropEl = null;
let onCloseKey = null;

function ensureBackdrop() {
  if (backdropEl) return backdropEl;
  backdropEl = document.createElement('div');
  backdropEl.className = 'modal-backdrop';
  backdropEl.addEventListener('mousedown', (e) => {
    if (e.target === backdropEl) closeModal();
  });
  document.body.appendChild(backdropEl);
  return backdropEl;
}

/** Esc ile kapatma desteği */
function onKeydown(e) {
  if (e.key === 'Escape') closeModal();
}

/**
 * @param {object} opts
 * @param {string} opts.title      - başlık metni
 * @param {string|Node} opts.body  - HTML string veya DOM düğümü
 * @param {string|Node} [opts.footer] - alt buton alanı HTML'i
 * @param {(root:HTMLElement)=>void} [opts.onMount] - açılınca çağrılır
 * @param {()=>void} [opts.onClose] - kapanınca çağrılır
 * @returns {{el: HTMLElement, close: Function}}
 */
export function openModal({ title, body, footer = '', onMount, onClose }) {
  closeModal(); // aynı anda tek modal
  onCloseKey = onClose;
  const bd = ensureBackdrop();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.innerHTML = `
    <div class="modal__header">
      <div class="modal__title">${title}</div>
      <button class="icon-btn" data-modal-close aria-label="Kapat">${icon('close')}</button>
    </div>
    <div class="modal__body"></div>
    ${footer ? `<div class="modal__footer">${footer}</div>` : ''}`;
  const bodyEl = modal.querySelector('.modal__body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.appendChild(body);

  bd.appendChild(modal);
  bd.classList.add('is-open');
  document.addEventListener('keydown', onKeydown);

  modal.querySelectorAll('[data-modal-close]').forEach((b) => b.addEventListener('click', closeModal));
  requestAnimationFrame(() => modal.classList.add('is-in'));
  if (onMount) onMount(modal);
  return { el: modal, close: closeModal };
}

export function closeModal() {
  if (!backdropEl || !backdropEl.firstChild) return;
  backdropEl.replaceChildren();
  backdropEl.classList.remove('is-open');
  document.removeEventListener('keydown', onKeydown);
  const cb = onCloseKey;
  onCloseKey = null;
  if (cb) cb();
}

/** Onay diyaloğu — Promise<boolean> */
export function confirmDialog(message, { danger = false, okText = 'Onayla' } = {}) {
  return new Promise((resolve) => {
    let decided = false;
    const finish = (v) => { decided = true; resolve(v); };
    openModal({
      title: danger ? 'Dikkat' : 'Onay',
      body: `<div style="white-space:pre-line;font-size:14px;line-height:1.6">${message}</div>`,
      footer: `
        <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
        <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-ok>${okText}</button>`,
      onMount: (root) => {
        root.querySelector('[data-ok]').addEventListener('click', () => { finish(true); closeModal(); });
        root.querySelector('[data-ok]').focus();
      },
      onClose: () => { if (!decided) resolve(false); },
    });
  });
}
