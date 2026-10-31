// ============================================================
// ERP ÜMİT v2 — Firestore senkronizasyon servisi
// Legacy şemasıyla uyumlu:
//   kullanicilar/{uid}                    -> ana/global veriler
//   kullanicilar/{uid}/donemVerileri/{id} -> dönem verileri
// Debounce'lu yazım: hızlı değişiklikler tek istekte toplanır.
// ============================================================

import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase.js';
import { auth } from './firebase.js';
import { state, setState } from './store.js';
import { readKey, writeKey } from './storage.js';

let timer = null;

/** Bulut yazmaya hazır global + aktif veri kümesi (legacy ile aynı alan adları). */
function anaPayload() {
  return {
    notlar: Array.isArray(state.notlar) ? state.notlar : [],
    vardiyaKurallari: state.vardiyaKurallari || [],
    normalSaatler: state.normalSaatler || [],
    sonPuantajTarihi: state.sonPuantajTarihi || null,
    donemler: state.donemler || [],
    aktifDonemId: state.aktifDonemId || null,
    globalPersoneller: state.personeller || [],
    sonGuncelleme: new Date().toISOString(),
  };
}

/** Dönem verisi — legacy donemGec()/yeniDonemKaydet() alan adlarıyla birebir. */
function donemPayload() {
  return {
    donemId: state.aktifDonemId,
    personeller: state.puantaj?.personeller || [],
    payState: state.puantaj,
    avanslar: state.avanslar || [],
    mesaiVerileri: state.mesai?.veriler || {},
    mesaiState: state.mesai?.state || {},
    muhasebeEkstra: state.muhasebe?.ekstra || {},
    muhasebeState: state.muhasebe?.state || {},
    kesintiler: state.kesintiler || [],
    kesintiAyar: state.kesintiAyar || {},
    ekstraKesintiler: state.ekstraKesintiler || [],
    icralar: state.icralar || [],
    ikinciOdeme: state.ikinciOdeme || {},
    gemiler: state.gemi?.gemiler || [],
    goturuler: state.gemi?.goturuler || [],
    sonGuncelleme: new Date().toISOString(),
  };
}

/** Firestore dönem dokümanını store dilimlerine yazar. */
export function applyDonemDoc(d) {
  if (!d) return;
  setState('puantaj', {
    ...(d.payState || {}),
    personeller: d.payState?.personeller || d.personeller || [],
  }, { persist: false });
  setState('avanslar', d.avanslar || [], { persist: false });
  setState('mesai', {
    veriler: d.mesaiVerileri || {},
    state: d.mesaiState || {},
  }, { persist: false });
  setState('muhasebe', {
    ekstra: d.muhasebeEkstra || {},
    state: d.muhasebeState || {},
  }, { persist: false });
  setState('kesintiler', d.kesintiler || [], { persist: false });
  setState('kesintiAyar', d.kesintiAyar || {}, { persist: false });
  setState('ekstraKesintiler', d.ekstraKesintiler || [], { persist: false });
  setState('icralar', d.icralar || [], { persist: false });
  setState('ikinciOdeme', d.ikinciOdeme || {}, { persist: false });
  setState('gemi', {
    gemiler: d.gemiler || [],
    goturuler: d.goturuler || [],
  }, { persist: false });
}

/** Hemen buluta yazar (KAYDET butonu bunu çağırır). */
export async function syncNow() {
  const user = auth.currentUser;
  if (!user) throw new Error('Giriş yapılmamış');

  await setDoc(doc(db, 'kullanicilar', user.uid), anaPayload(), { merge: true });
  if (state.aktifDonemId) {
    await setDoc(
      doc(db, 'kullanicilar', user.uid, 'donemVerileri', state.aktifDonemId),
      donemPayload(),
      { merge: true },
    );
  }
}

/** 500 ms debounce'lu otomatik yazım (legacy'deki _firebaseTimer karşılığı). */
export function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    syncNow().catch((e) => console.warn('[sync] atlandı:', e?.message || e));
  }, 500);
}

/**
 * Açılışta Firestore'dan çeker; localStorage boşsa veya bulut daha yeni ise
 * store'u doldurur. (Basit "bulut kazanır" stratejisi — legacy'deki gibi.)
 */
export async function pullFromCloud() {
  const user = auth.currentUser;
  if (!user) return false;
  try {
    const snap = await getDoc(doc(db, 'kullanicilar', user.uid));
    if (!snap.exists()) return false;
    const d = snap.data();

    const applyIfNewer = (lsKey, cloudVal) => {
      if (!Array.isArray(cloudVal) && typeof cloudVal !== 'string') return;
      const local = readKey(lsKey);
      const localLen = Array.isArray(local) ? local.length : 0;
      const cloudLen = Array.isArray(cloudVal) ? cloudVal.length : 0;
      if (cloudLen >= localLen && cloudLen > 0) writeKey(lsKey, JSON.parse(JSON.stringify(cloudVal)));
    };

    applyIfNewer('umit_erp_global_personeller_v1', d.globalPersoneller);
    applyIfNewer('umit_erp_notlar_v1', d.notlar);
    applyIfNewer('umit_erp_vardiya_kurallari_v1', d.vardiyaKurallari);
    applyIfNewer('umit_erp_normal_saatler_v1', d.normalSaatler);
    applyIfNewer('umit_erp_donemler_v1', d.donemler);

    if (d.aktifDonemId && !readKey('umit_erp_aktif_donem_id_v1')) {
      writeKey('umit_erp_aktif_donem_id_v1', d.aktifDonemId);
    }
    return true;
  } catch (e) {
    console.warn('[sync] çekilemedi:', e?.message || e);
    return false;
  }
}
