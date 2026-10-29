// ============================================================
// ERP ÜMİT v2 — Duyuru (toast) servisi
// Emoji yerine SVG ikon + metin kullanır.
// ============================================================

import { icon } from '../icons/index.js';

const ICON_BY_TYPE = {
  success: 'check',
  error: 'alert-triangle',
  info: 'info',
};

/**
 * @param {string} message
 * @param {'success'|'error'|'info'} type
 * @param {number} duration ms
 */
export function toast(message, type = 'info', duration = 3500) {
  const container = document.getElementById('toasts');
  if (!container) return;

  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', 'status');
  el.innerHTML = `${icon(ICON_BY_TYPE[type] ?? 'info')}<span>${message}</span>`;
  container.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 250ms ease';
    setTimeout(() => el.remove(), 260);
  }, duration);
}
