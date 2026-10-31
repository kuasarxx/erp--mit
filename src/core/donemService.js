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
const DILIM_MODUL = {
  puantaj: 'puantaj', avanslar: 'avans', mesai: 'mesai',
  kesintiler: 'kesinti', kesintiAyar: 'kesinti', ekstraKesintiler: 'ekstra',
  icralar: 'icra', ikinciOdeme: 'ikinciOdeme', muhasebe: 'muhasebe', gemi: 'gemi',
};

export function saveDonemSlice(dilimAdi, value) {
  const modul = DILIM_MODUL[dilimAdi] || dilimAdi.replace(/lar$/, '').replace(/ler$/, '');
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

  // Gemi — legacy ambalajı: { gemiler, goturuler }
  const gm = readKey(periodKey(id, 'gemi'));
  setState('gemi', {
    gemiler: (gm && Array.isArray(gm.gemiler)) ? gm.gemiler : [],
    goturuler: (gm && Array.isArray(gm.goturuler)) ? gm.goturuler : [],
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

// ============================================================
// Dönem yönetimi UI işlemleri (legacy donemGec / yeniDonemKaydet /
// donemArsivle / donemSil / donemYenidenAdlandir karşılıkları)
// ============================================================

import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from './firebase.js';
import { applyDonemDoc } from './syncService.js';

/** Yardımcı: yol parçalarından Firestore doküman referansı üretir. */
function docRef(...yol) { return doc(db, ...yol); }
/** Yardımcı: merge yazımı (legacy setDoc(..., {merge:true}) karşılığı). */
function setDocMerged(yol, veri) { return setDoc(doc(db, ...yol), veri, { merge: true }); }

/** Tüm dönem modül anahtarları (legacy donemSil listesiyle birebir). */
const DONEM_MODULLERI = ['personel', 'puantaj', 'avans', 'mesai', 'kesinti',
  'muhasebe', 'ekstra', 'gemi', 'icra', 'ikinciOdeme'];

/** Aktif dönemin tüm dilimlerini localStorage'a yazar (legacy adim 5 karsiligi). */
function aktifDilimleriYaz(id) {
  writeKey(periodKey(id, 'personel'), state.puantaj.personeller || []);
  writeKey(periodKey(id, 'puantaj'), state.puantaj);
  writeKey(periodKey(id, 'avans'), state.avanslar);
  writeKey(periodKey(id, 'mesai'), state.mesai);
  writeKey(periodKey(id, 'muhasebe'), state.muhasebe);
  writeKey(periodKey(id, 'kesinti'), { liste: state.kesintiler, ayar: state.kesintiAyar });
  writeKey(periodKey(id, 'ekstra'), state.ekstraKesintiler);
  writeKey(periodKey(id, 'gemi'), state.gemi);
  writeKey(periodKey(id, 'icra'), state.icralar);
  writeKey(periodKey(id, 'ikinciOdeme'), state.ikinciOdeme);
}

/**
 * Döneme geçer — legacy donemGec() ile aynı sıra:
 * 1) eski dönemi kaydet (localStorage + Firestore), 2) aktif dönemi değiştir,
 * 3) hedef dönemin verisini yükle (önce LS, yoksa Firestore), 4) duyur.
 */
export async function gecDonem(id) {
  const hedef = state.donemler.find((d) => d.id === id);
  if (!hedef) throw new Error('Dönem bulunamadı');
  if (id === state.aktifDonemId) return { atlandi: true };
  if (hedef.arsiv) throw new Error(`"${hedef.ad}" arşivlenmiş. Düzenlemek için önce arşivden çıkar.`);

  // 1) Eski dönemin verilerini kalıcı yerlere yaz
  const eskiId = state.aktifDonemId;
  if (eskiId) aktifDilimleriYaz(eskiId);
  try { await scheduleCloudSave(); } catch (e) { console.warn('[donem] eski dönem buluta yazılamadı:', e?.message); }

  // 2) Aktif dönemi değiştir
  setState('aktifDonemId', id);
  writeKey('umit_erp_aktif_donem_id_v1', id);

  // 3) Hedef dönemi yükle: localStorage'daki dilimler öncelikli
  yukleDonemDilimleri(id);
  // Puantaj dilimi hiç yoksa ve bulut bağlıysa Firestore'dan çek
  const puantajVar = readKey(periodKey(id, 'puantaj')) !== undefined;
  if (!puantajVar) {
    const user = auth.currentUser;
    if (user) {
      try {
        const snap = await getDoc(docRef('kullanicilar', user.uid, 'donemVerileri', id));
        if (snap.exists()) {
          applyDonemDoc(snap.data());
          aktifDilimleriYaz(id);
        }
      } catch (e) { console.warn('[donem] firestore okuma:', e?.message); }
    }
  }

  // Dönem ay/yıl bilgisi seçicilere yansısın
  setState('puantaj', { ...state.puantaj, yil: hedef.yil, ay: hedef.ay }, { persist: false });
  setState('mesai', { ...state.mesai, state: { yil: hedef.yil, ay: hedef.ay } }, { persist: false });
  setState('muhasebe', { ...state.muhasebe, state: { yil: hedef.yil, ay: hedef.ay } }, { persist: false });

  // Ana dokümana aktif dönemi işle + dönem verisini buluta yaz
  const user = auth.currentUser;
  if (user) {
    try {
      await setDocMerged(['kullanicilar', user.uid], { aktifDonemId: id });
      await syncNowSafe();
    } catch (e) { console.warn('[donem] buluta yazma:', e?.message); }
  }

  window.dispatchEvent(new CustomEvent('donemDegisti', { detail: { id } }));
  return { hedef };
}

/** Bulut bağlıysa hemen senkronla (hata fırlatmaz). */
async function syncNowSafe() {
  try {
    const m = await import('./syncService.js');
    if (auth.currentUser) await m.syncNow();
  } catch (e) { /* çevrimdışı ise sorun değil */ }
}
async function scheduleCloudSave() { await syncNowSafe(); }

/** Yeni dönem açar — legacy yeniDonemKaydet() karşılığı. */
export async function yeniDonemOlustur({ yil, ay, ad = '', personelKopyala = false }) {
  const id = makeDonemId(yil, ay);
  if (state.donemler.find((d) => d.id === id)) throw new Error(`${AYLAR[ay]} ${yil} dönemi zaten var`);

  const donem = { id, ad: ad.trim() || `${AYLAR[ay]} ${yil}`, yil, ay, olusturma: new Date().toISOString() };
  setState('donemler', [...state.donemler, donem]);

  // Boş dönem dilimlerini hazırla (legacy bosVeri şemasıyla birebir)
  const bosPuantaj = { yil, ay, personeller: [], pazarRenk: true, meslekGizli: false };
  if (personelKopyala && state.puantaj.personeller.length) {
    bosPuantaj.personeller = JSON.parse(JSON.stringify(state.puantaj.personeller));
  }
  writeKey(periodKey(id, 'puantaj'), bosPuantaj);
  writeKey(periodKey(id, 'personel'), bosPuantaj.personeller);
  writeKey(periodKey(id, 'avans'), []);
  writeKey(periodKey(id, 'mesai'), { veriler: {}, state: { yil, ay } });
  writeKey(periodKey(id, 'muhasebe'), { ekstra: {}, state: { yil, ay } });
  writeKey(periodKey(id, 'kesinti'), { liste: [], ayar: state.kesintiAyar });
  writeKey(periodKey(id, 'ekstra'), []);
  writeKey(periodKey(id, 'icra'), []);
  writeKey(periodKey(id, 'ikinciOdeme'), {});
  writeKey(periodKey(id, 'gemi'), { gemiler: [], goturuler: [] });

  await gecDonem(id);

  const user = auth.currentUser;
  if (user) {
    try { await setDocMerged(['kullanicilar', user.uid], { donemler: state.donemler }); } catch (e) { /* LS yeterli */ }
  }
  return { donem, kopyalanan: bosPuantaj.personeller.length };
}

/** Dönemi arşivler / arşivden çıkarır — legacy donemArsivle() karşılığı. */
export function arsivleDonem(id) {
  if (id === state.aktifDonemId) throw new Error('Aktif dönem arşivlenemez. Önce başka döneme geç.');
  const d = state.donemler.find((x) => x.id === id);
  if (!d) throw new Error('Dönem bulunamadı');
  d.arsiv = !d.arsiv;
  setState('donemler', [...state.donemler]);
  return d;
}

/** Dönem adını değiştirir — legacy donemYenidenAdlandir() karşılığı. */
export function adlandirDonem(id, yeniAd) {
  const temiz = (yeniAd || '').trim();
  if (!temiz) throw new Error('Ad boş olamaz');
  const d = state.donemler.find((x) => x.id === id);
  if (!d) throw new Error('Dönem bulunamadı');
  d.ad = temiz;
  setState('donemler', [...state.donemler]);
  return d;
}

/** Dönemi tüm verileriyle siler — legacy donemSil() karşılığı. */
export async function silDonem(id) {
  if (id === state.aktifDonemId) throw new Error('Aktif dönem silinemez. Önce başka döneme geç.');
  if (state.donemler.length <= 1) throw new Error('En az bir dönem kalmalı');
  const d = state.donemler.find((x) => x.id === id);
  if (!d) throw new Error('Dönem bulunamadı');

  // 1) localStorage dilimleri
  DONEM_MODULLERI.forEach((modul) => {
    try { localStorage.removeItem(periodKey(id, modul)); } catch (e) { /* yoksay */ }
  });

  // 2) Liste
  setState('donemler', state.donemler.filter((x) => x.id !== id));

  // 3) Firestore
  const user = auth.currentUser;
  if (user) {
    try {
      await deleteDoc(docRef('kullanicilar', user.uid, 'donemVerileri', id));
      await setDocMerged(['kullanicilar', user.uid], { donemler: state.donemler });
    } catch (e) { console.warn('[donem] firestore silme:', e?.message); }
  }
  return d;
}
