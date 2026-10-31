// ============================================================
// ERP ÜMİT v2 — Dönem servisi
// Legacy'deki donemKey()/donemIdOlustur() mantığının modüler hali.
// Puantaj verisi döneme göre saklanır: umit_erp_<donemId>_puantaj_v1
// Dönem yoksa (ilk kullanım) bugünün ayından otomatik oluşturulur.
// ============================================================

import { state, setState } from './store.js';
import { readKey, writeKey, periodKey, LEGACY_KEYS } from './storage.js';

const AYLAR_KISA = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran',
  'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];

export const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export const GUNLER = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];

/** 'ekim-2026' gibi dönem kimliği üretir (legacy ile aynı). */
export function makeDonemId(yil, ay) {
  return `${AYLAR_KISA[ay]}-${yil}`;
}

/** Aktif dönemin modül anahtarı; dönem yoksa null. */
export function aktifDonemModulKey(modul) {
  return periodKey(state.aktifDonemId, modul);
}

/** Aktif dönemin puantaj anahtarı; dönem yoksa null. */
export function aktifPuantajKey() {
  return periodKey(state.aktifDonemId, 'puantaj');
}

/** Bir state dilimini aktif dönem anahtarına yazar (ör. 'avanslar' -> <donem>_avans_v1). */
export function saveDonemSlice(dilimAdi, value) {
  const modul = dilimAdi.replace(/lar$/, '').replace(/ler$/, ''); // avanslar -> avans
  const key = aktifDonemModulKey(modul);
  if (!key) return;
  // Muhasebe ambalajı: legacy şeması {ekstra, state} tek anahtarda yaşar
  if (dilimAdi === 'muhasebe') {
    const key2 = aktifDonemModulKey('muhasebe');
    if (key2) writeKey(key2, value);
    return;
  }
  // Kesinti ambalajı: liste ve ayar tek anahtarda {liste, ayar} olarak yaşar
  if (modul === 'kesinti') {
    const mevcut = readKey(key) || {};
    writeKey(key, dilimAdi === 'kesintiler'
      ? { liste: value, ayar: mevcut.ayar || state.kesintiAyar }
      : { liste: mevcut.liste || state.kesintiler, ayar: value });
    return;
  }
  writeKey(key, value);
}

/**
 * Legacy tek-dosya verilerini dönem sistemine taşır (bir kerelik göç).
 * Eski projede puantaj `erp_umit_puantaj_v1`, avans `erp_umit_avans_v1`
 * anahtarlarında tutuluyordu; v2'de her modül dönem bazlıdır:
 *   umit_erp_<donemId>_<modul>_v1
 */
export function migrateLegacy() {
  const donemId = state.aktifDonemId;
  if (!donemId) return false;

  let tasindi = false;

  // Puantaj: legacy global -> aktif dönemin puantaj anahtarı
  const legacyPuantaj = readKey(LEGACY_KEYS.PUANTAJ);
  if (legacyPuantaj && readKey(periodKey(donemId, 'puantaj')) === undefined) {
    writeKey(periodKey(donemId, 'puantaj'), legacyPuantaj);
    tasindi = true;
  }

  // Avans: legacy global -> aktif dönemin avans anahtarı
  const legacyAvans = readKey(LEGACY_KEYS.AVANS);
  if (Array.isArray(legacyAvans) && legacyAvans.length &&
      readKey(periodKey(donemId, 'avans')) === undefined) {
    writeKey(periodKey(donemId, 'avans'), legacyAvans);
    tasindi = true;
  }

  // Mesai: legacy global -> aktif dönemin mesai anahtarı
  const legacyMesai = readKey(LEGACY_KEYS.MESAİ);
  if (legacyMesai && readKey(periodKey(donemId, 'mesai')) === undefined) {
    writeKey(periodKey(donemId, 'mesai'), legacyMesai);
    tasindi = true;
  }

  // Kesinti: legacy global ({liste, ayar}) -> aktif dönem
  const legacyKesinti = readKey(LEGACY_KEYS.KESINTİ);
  if (legacyKesinti && readKey(periodKey(donemId, 'kesinti')) === undefined) {
    writeKey(periodKey(donemId, 'kesinti'), legacyKesinti);
    tasindi = true;
  }

  return tasindi;
}

/**
 * Aktif dönemi yükler ve store.puantaj'ı doldurur.
 * @param {{yil:number, ay:number}} hedef - belirtilmezse aktif dönem / bugün
 */
export function ensureDonem(hedef = null) {
  // 0) Aktif dönem zaten hedefse: dilimleri tazele ama silme/yeniden-yazma yapma
  const yilH = hedef?.yil ?? null;
  const ayH = hedef?.ay ?? null;
  if (!hedef && state.aktifDonemId) {
    yukleDonemDilimleri(state.aktifDonemId);
    return state.puantaj;
  }

  // 1) Dönem listesi kalıcı yerden
  if (!Array.isArray(state.donemler) || state.donemler.length === 0) {
    const saved = readKey('umit_erp_donemler_v1');
    if (Array.isArray(saved) && saved.length) setState('donemler', saved, { persist: false });
  }

  // 2) Hedef dönem id'si — aktif dönem varsa O kullanılır (sayfa açılışında
  //    bugünün ayına sıfırlamak yanlış olur; legacy de aktif dönemi korur).
  const yil = yilH ?? new Date().getFullYear();
  const ay = ayH ?? new Date().getMonth();
  let id = makeDonemId(yil, ay);
  if (!hedef && state.aktifDonemId && state.donemler.find((d) => d.id === state.aktifDonemId)) {
    id = state.aktifDonemId;
  } else if (!hedef && state.donemler.length) {
    id = state.donemler[0].id; // aktif işaretli değilse ilk kayıt
  }

  if (!state.donemler.find((d) => d.id === id)) {
    const donem = { id, ad: `${AYLAR[ay]} ${yil}`, yil, ay, olusturma: new Date().toISOString() };
    setState('donemler', [...state.donemler, donem]);
  }
  setState('aktifDonemId', id);

  // 3) Dönem dilimlerini yükle (puantaj + avans)
  yukleDonemDilimleri(id);
  return state.puantaj;
}

/** Bir dönemin puantaj, avans, mesai, kesinti ve ekstra dilimlerini store'a okur. */
function yukleDonemDilimleri(id) {
  const [yilS, ayAdi] = [Number(id.split('-')[1]), id.split('-')[0]];
  const ay = AYLAR_KISA.indexOf(ayAdi);
  const data = readKey(periodKey(id, 'puantaj'));
  const varsayilan = { yil: yilS, ay, personeller: [], pazarRenk: true, meslekGizli: false };
  setState('puantaj', { ...varsayilan, ...(data || {}), yil: yilS, ay }, { persist: false });

  const av = readKey(periodKey(id, 'avans'));
  setState('avanslar', Array.isArray(av) ? av : [], { persist: false });

  // Mesai — legacy şeması: { veriler: {sicil:{gun:saat}}, state: {yil, ay} }
  const ms = readKey(periodKey(id, 'mesai'));
  setState('mesai', {
    veriler: (ms && ms.veriler) || {},
    state: { yil: yilS, ay, ...((ms && ms.state) || {}) },
  }, { persist: false });

  // Kesinti — legacy ambalajı: { liste, ayar }
  const ks = readKey(periodKey(id, 'kesinti'));
  setState('kesintiler', (ks && Array.isArray(ks.liste)) ? ks.liste : [], { persist: false });
  setState('kesintiAyar', { ...state.kesintiAyar, ...((ks && ks.ayar) || {}) }, { persist: false });

  // Ekstra kesintiler — düz dizi
  const ek = readKey(periodKey(id, 'ekstra'));
  setState('ekstraKesintiler', Array.isArray(ek) ? ek : [], { persist: false });

  // İcralar — düz dizi (legacy: donemKey('icra'))
  const ic = readKey(periodKey(id, 'icra'));
  setState('icralar', Array.isArray(ic) ? ic : [], { persist: false });

  // 2. Ödeme manuel alanları — nesne haritası (legacy: donemKey('ikinciOdeme'))
  const io = readKey(periodKey(id, 'ikinciOdeme'));
  setState('ikinciOdeme', (io && typeof io === 'object' && !Array.isArray(io)) ? io : {}, { persist: false });

  // Muhasebe — legacy ambalajı: { ekstra: {sicil:{icra,not,ozelIsim}}, state: {yil, ay} }
  const mh = readKey(periodKey(id, 'muhasebe'));
  setState('muhasebe', {
    ekstra: (mh && mh.ekstra) || {},
    state: { yil: yilS, ay, ...((mh && mh.state) || {}) },
  }, { persist: false });
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
  // Sayfalar dönem dilimlerini yeniden okusun
  window.dispatchEvent(new CustomEvent('donemDegisti', { detail: { id } }));
}
