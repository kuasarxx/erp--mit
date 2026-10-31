// ============================================================
// ERP ÜMİT v2 — Firma Ayarları servisi
// Legacy'deki `ayar = { firma, firmaResmi, sesAcik, sesSeviye }`
// nesnesinin modüler hali. Kalıcılık anahtarı legacy ile birebir:
//   umit_erp_ayar_v1
// ============================================================

import { state, setState } from './store.js';
import { readKey, writeKey } from './storage.js';

const K_AYAR = 'umit_erp_ayar_v1';

/** Varsayılan ayarlar (legacy ile aynı). */
export function varsayilanAyar() {
  return {
    firma: 'Genel',        // kısa firma adı (rapor başlıkları)
    firmaResmi: '',        // tersane Excel'indeki resmi ad (eğitim filtreleme)
    sesAcik: true,
    sesSeviye: 0.6,
  };
}

/** Açılışta localStorage'dan ayarları store'a yükler. */
export function loadAyarlar() {
  const saved = readKey(K_AYAR);
  const merged = { ...varsayilanAyar(), ...(saved && typeof saved === 'object' ? saved : {}) };
  setState('ayar', merged, { persist: false });
  return merged;
}

/** Bir alanı günceller + kalıcı yazar. */
export function setAyar(patch) {
  const next = { ...state.ayar, ...patch };
  setState('ayar', next);          // persist: '@ayar' -> umit_erp_ayar_v1
  writeKey(K_AYAR, next);          // emniyet kemeri (aynı anahtar, idempotent)
  return next;
}

/** Okunabilir yardımcı. */
export function firmaAdi() {
  return state.ayar?.firmaResmi || state.ayar?.firma || 'Genel';
}
