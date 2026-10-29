// ============================================================
// ERP ÜMİT v2 — Merkezi durum yönetimi (Store)
// Eski projede dağınık localStorage okuma/yazmaları vardı.
// Yeni mimaride tek doğruluk kaynağı bu store'dur:
//   - state değişince aboneler haberdar olur
//   - kalıcı veri storage.js üzerinden otomatik yazılır
// ============================================================

import { loadState, saveSlice } from './storage.js';

const listeners = new Map(); // key -> Set<fn>

/** Uygulamanın tamamlayıcı durum ağacı. */
export const state = {
  auth: {
    user: null,        // { uid, email, displayName }
    status: 'idle',    // idle | loading | authenticated | anonymous
  },
  ui: {
    theme: 'light',    // light | dark
    page: 'anasayfa',
    sidebarOpen: false,
  },
  // --- İş modülleri (legacy anahtarlarla uyumlu) ---
  personeller: [],          // umit_erp_global_personeller_v1
  normalSaatler: {},        // umit_erp_normal_saatler_v1
  vardiyaKurallari: {},     // umit_erp_vardiya_kurallari_v1
  notlar: [],               // umit_erp_notlar_v1
  sonPuantajTarihi: null,   // umit_erp_son_puantaj_tarihi
  egitim: {},               // erp_umit_egitim_v1
};

/** Abonelik: belirli bir state anahtarı değiştiğinde cb çalışır. */
export function subscribe(key, cb) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(cb);
  return () => listeners.get(key).delete(cb);
}

function notify(key) {
  listeners.get(key)?.forEach((cb) => {
    try { cb(state[key]); } catch (err) { console.error('[store] abone hatası:', err); }
  });
}

/** Bir dilimi günceller; kalıcılıksa yazar ve aboneleri uyarır. */
export function setState(key, value, { persist = true } = {}) {
  state[key] = value;
  if (persist) saveSlice(key, value);
  notify(key);
}

/** Store'u localStorage'daki kalıcı verilerle doldurur (açılışta bir kez). */
export function hydrate() {
  const saved = loadState();
  Object.entries(saved).forEach(([key, value]) => {
    state[key] = value;
    notify(key);
  });
  return state;
}
