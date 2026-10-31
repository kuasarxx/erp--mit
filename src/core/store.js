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
  normalSaatler: [],        // umit_erp_normal_saatler_v1 (dizi — legacy ile aynı şema)
  vardiyaKurallari: [],     // umit_erp_vardiya_kurallari_v1 (dizi — legacy ile aynı şema)
  notlar: [],               // umit_erp_notlar_v1
  sonPuantajTarihi: null,   // umit_erp_son_puantaj_tarihi
  egitim: {},               // erp_umit_egitim_v1

  // --- Dönem sistemi (legacy: donemKey = umit_erp_<donemId>_<modul>_v1) ---
  donemler: [],             // [{id, ad, yil, ay, olusturma}]
  aktifDonemId: null,       // ör. 'ekim-2026'
  puantaj: {                // payState — dönem anahtarında saklanır
    yil: new Date().getFullYear(),
    ay: new Date().getMonth(),
    personeller: [],        // [{id, isim, meslek, gunler:{g:değer}, notlar:{g:metin}}]
    pazarRenk: true,
    meslekGizli: false,
  },
  avanslar: [],             // dönem bazlı — umit_erp_<donemId>_avans_v1
  mesai: {                  // dönem bazlı — umit_erp_<donemId>_mesai_v1
    veriler: {},            // {sicil: {gun: saat}} (legacy şemasıyla birebir)
    state: { yil: new Date().getFullYear(), ay: new Date().getMonth() },
  },
  kesintiler: [],           // dönem bazlı — umit_erp_<donemId>_kesinti_v1 ({liste, ayar} ambalajının liste kısmı)
  kesintiAyar: {            // aynı anahtarda {liste, ayar} olarak saklanır
    baslangic: '08:00', bitis: '17:00', molaBaslangic: '12:00', molaBitis: '13:00', tolGec: 5, tolErken: 5,
  },
  ekstraKesintiler: [],     // dönem bazlı — umit_erp_<donemId>_ekstra_v1
  icralar: [],              // dönem bazlı — umit_erp_<donemId>_icra_v1
  ikinciOdeme: {},          // dönem bazlı — umit_erp_<donemId>_ikinciOdeme_v1 ({sicil:{ga,rapor,sert,kira,banka}})
  muhasebe: {               // dönem bazlı — umit_erp_<donemId>_muhasebe_v1 (legacy ambalajı: {ekstra, state})
    ekstra: {},             // {sicil: {icra, not, ozelIsim}}
    state: { yil: new Date().getFullYear(), ay: new Date().getMonth() },
  },
};

/** Abonelik: belirli bir state anahtarı değiştiğinde cb çalışır. */
export function subscribe(key, cb) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(cb);
  return () => listeners.get(key).delete(cb);
}

/** Nesne dilimlerini derinlemesine eşit kıyaslar (JSON tabanlı; bu ölçek için yeterli). */
function deepEqual(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

function notify(key) {
  listeners.get(key)?.forEach((cb) => {
    try { cb(state[key]); } catch (err) { console.error('[store] abone hatası:', err); }
  });
}

/** Bir dilimi günceller; kalıcıksa yazar ve aboneleri uyarır. */
export function setState(key, value, { persist = true } = {}) {
  const changed = !deepEqual(state[key], value);
  state[key] = value;
  if (persist && changed) saveSlice(key, value);
  if (changed) notify(key);
}

/**
 * Dilim içindeki nesneyi yerinde değiştirip bildirim tetikler.
 * (Legacy'deki `payState.personeller.push(...); payKaydet()` deseninin karşılığı.)
 */
export function touch(key) {
  saveSlice(key, state[key]);
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
