// ============================================================
// ERP ÜMİT v2 — Dönem servisi
// Legacy'deki donemKey()/donemIdOlustur() mantığının modüler hali.
// Puantaj verisi döneme göre saklanır: umit_erp_<donemId>_puantaj_v1
// Dönem yoksa (ilk kullanım) bugünün ayından otomatik oluşturulur.
// ============================================================

import { state, setState } from './store.js';
import { readKey, writeKey, periodKey } from './storage.js';

const AYLAR_KISA = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran',
  'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];

export const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** 'ekim-2026' gibi dönem kimliği üretir (legacy ile aynı). */
export function makeDonemId(yil, ay) {
  return `${AYLAR_KISA[ay]}-${yil}`;
}

/** Aktif dönemin puantaj anahtarı; dönem yoksa null. */
export function aktifPuantajKey() {
  return periodKey(state.aktifDonemId, 'puantaj');
}

/**
 * Aktif dönemi yükler ve store.puantaj'ı doldurur.
 * @param {{yil:number, ay:number}} hedef - belirtilmezse aktif dönem / bugün
 */
export function ensureDonem(hedef = null) {
  // 1) Dönem listesi kalıcı yerden
  if (!Array.isArray(state.donemler) || state.donemler.length === 0) {
    const saved = readKey('umit_erp_donemler_v1');
    if (Array.isArray(saved) && saved.length) setState('donemler', saved, { persist: false });
  }

  // 2) Hedef dönem id'si
  const yil = hedef?.yil ?? new Date().getFullYear();
  const ay = hedef?.ay ?? new Date().getMonth();
  const id = makeDonemId(yil, ay);

  if (!state.donemler.find((d) => d.id === id)) {
    const donem = { id, ad: `${AYLAR[ay]} ${yil}`, yil, ay, olusturma: new Date().toISOString() };
    setState('donemler', [...state.donemler, donem]);
  }
  setState('aktifDonemId', id);

  // 3) Puantaj dilimini dönem anahtarından yükle
  const data = readKey(periodKey(id, 'puantaj'));
  const varsayilan = { yil, ay, personeller: [], pazarRenk: true, meslekGizli: false };
  setState('puantaj', { ...varsayilan, ...(data || {}), yil, ay }, { persist: false });
  return state.puantaj;
}

/** Store'daki puantaj dilimini aktif dönem anahtarına yazar. */
export function savePuantaj() {
  const key = aktifPuantajKey();
  if (!key) { ensureDonem({ yil: state.puantaj.yil, ay: state.puantaj.ay }); }
  writeKey(aktifPuantajKey(), state.puantaj);
}

/** Ay/yıl değiştirince ilgili döneme geçiş yapar (veri yeniden yüklenir). */
export function switchDonem(yil, ay) {
  const id = makeDonemId(yil, ay);
  // Mevcut dönemi kaydet (üzerinde çalışılan değişiklikler kaybolsun istemeyiz)
  savePuantaj();
  ensureDonem({ yil, ay });
}
