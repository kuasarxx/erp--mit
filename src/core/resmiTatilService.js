// ============================================================
// ERP ÜMİT v2 — Resmi Tatil Servisi
// Legacy'deki RESMI_TATILLER tablosu + elleTatiller/silinenTatiller
// mantığının modüler hali. Kalıcılık anahtarı legacy ile birebir:
//   erp_umit_resmi_tatil_v1 -> { elle: [{tarih,ad}], silinen: ['YYYY-AA-GG'] }
// ============================================================

import { readKey, writeKey } from './storage.js';
import { gunSayisi } from './hesaplamalar.js';

const LS_KEY = 'erp_umit_resmi_tatil_v1';

/* Sabit ulusal günler (her yıl) */
const FIXED = [
  ['01-01', 'Yılbaşı'],
  ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'],
  ['05-01', 'Emek ve Dayanışma Günü'],
  ['05-19', "Atatürk'ü Anma, Gençlik ve Spor Bayramı"],
  ['07-15', 'Demokrasi ve Millî Birlik Günü'],
  ['08-30', 'Zafer Bayramı'],
  ['10-29', 'Cumhuriyet Bayramı'],
];

/* Dini bayramlar (yıl bazlı) — legacy tablosuyla birebir */
const RELIGIOUS = {
  2024: [['01-01', 'Yılbaşı'], ['04-10', 'Ramazan Bayramı 1. Gün'], ['04-11', 'Ramazan Bayramı 2. Gün'], ['04-12', 'Ramazan Bayramı 3. Gün'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-19', 'Atatürkü Anma, Gençlik ve Spor Bayramı'], ['06-16', 'Kurban Bayramı 1. Gün'], ['06-17', 'Kurban Bayramı 2. Gün'], ['06-18', 'Kurban Bayramı 3. Gün'], ['06-19', 'Kurban Bayramı 4. Gün'], ['07-15', 'Demokrasi ve Milli Birlik Günü'], ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı']],
  2025: [['01-01', 'Yılbaşı'], ['03-30', 'Ramazan Bayramı 1. Gün'], ['03-31', 'Ramazan Bayramı 2. Gün'], ['04-01', 'Ramazan Bayramı 3. Gün'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-19', 'Atatürkü Anma, Gençlik ve Spor Bayramı'], ['06-06', 'Kurban Bayramı 1. Gün'], ['06-07', 'Kurban Bayramı 2. Gün'], ['06-08', 'Kurban Bayramı 3. Gün'], ['06-09', 'Kurban Bayramı 4. Gün'], ['07-15', 'Demokrasi ve Milli Birlik Günü'], ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı']],
  2026: [['01-01', 'Yılbaşı'], ['03-20', 'Ramazan Bayramı 1. Gün'], ['03-21', 'Ramazan Bayramı 2. Gün'], ['03-22', 'Ramazan Bayramı 3. Gün'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-19', 'Atatürkü Anma, Gençlik ve Spor Bayramı'], ['05-27', 'Kurban Bayramı 1. Gün'], ['05-28', 'Kurban Bayramı 2. Gün'], ['05-29', 'Kurban Bayramı 3. Gün'], ['05-30', 'Kurban Bayramı 4. Gün'], ['07-15', 'Demokrasi ve Milli Birlik Günü'], ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı']],
  2027: [['01-01', 'Yılbaşı'], ['03-09', 'Ramazan Bayramı 1. Gün'], ['03-10', 'Ramazan Bayramı 2. Gün'], ['03-11', 'Ramazan Bayramı 3. Gün'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-16', 'Kurban Bayramı 1. Gün'], ['05-17', 'Kurban Bayramı 2. Gün'], ['05-18', 'Kurban Bayramı 3. Gün'], ['05-19', 'Kurban Bayramı 4. Gün'], ['07-15', 'Demokrasi ve Milli Birlik Günü'], ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı']],
  2028: [['01-01', 'Yılbaşı'], ['02-26', 'Ramazan Bayramı 1. Gün'], ['02-27', 'Ramazan Bayramı 2. Gün'], ['02-28', 'Ramazan Bayramı 3. Gün'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-05', 'Kurban Bayramı 1. Gün'], ['05-06', 'Kurban Bayramı 2. Gün'], ['05-07', 'Kurban Bayramı 3. Gün'], ['05-08', 'Kurban Bayramı 4. Gün'], ['05-19', 'Atatürkü Anma, Gençlik ve Spor Bayramı'], ['07-15', 'Demokrasi ve Milli Birlik Günü'], ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı']],
  2029: [['01-01', 'Yılbaşı'], ['02-14', 'Ramazan Bayramı 1. Gün'], ['02-15', 'Ramazan Bayramı 2. Gün'], ['02-16', 'Ramazan Bayramı 3. Gün'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['04-24', 'Kurban Bayramı 1. Gün'], ['04-25', 'Kurban Bayramı 2. Gün'], ['04-26', 'Kurban Bayramı 3. Gün'], ['04-27', 'Kurban Bayramı 4. Gün'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-19', 'Atatürkü Anma, Gençlik ve Spor Bayramı'], ['07-15', 'Demokrasi ve Milli Birlik Günü'], ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı']],
  2030: [['01-01', 'Yılbaşı'], ['02-04', 'Ramazan Bayramı 1. Gün'], ['02-05', 'Ramazan Bayramı 2. Gün'], ['02-06', 'Ramazan Bayramı 3. Gün'], ['04-13', 'Kurban Bayramı 1. Gün'], ['04-14', 'Kurban Bayramı 2. Gün'], ['04-15', 'Kurban Bayramı 3. Gün'], ['04-16', 'Kurban Bayramı 4. Gün'], ['04-23', 'Ulusal Egemenlik ve Çocuk Bayramı'], ['05-01', 'Emek ve Dayanışma Günü'], ['05-19', 'Atatürkü Anma, Gençlik ve Spor Bayramı'], ['07-15', 'Demokrasi ve Milli Birlik Günü'], ['08-30', 'Zafer Bayramı'], ['10-29', 'Cumhuriyet Bayramı']],
};

/** Legacy ile aynı birleşik tablo: yıl -> [{t, ad}] */
export const RESMI_TATILLER = (() => {
  const out = {};
  for (let y = 2024; y <= 2030; y++) {
    const merged = [...FIXED, ...(RELIGIOUS[y] || [])]
      .map(([t, ad]) => ({ t, ad }))
      .sort((a, b) => a.t.localeCompare(b.t));
    out[y] = merged;
  }
  return out;
})();

/* ---- kullanıcı state (elle eklenen / silinen) ---- */
let elleTatiller = [];
let silinenTatiller = [];

export function loadResmiTatiller() {
  const s = readKey(LS_KEY);
  if (s) {
    elleTatiller = Array.isArray(s.elle) ? s.elle : [];
    silinenTatiller = Array.isArray(s.silinen) ? s.silinen : [];
  }
}

export function saveResmiTatiller() {
  writeKey(LS_KEY, { elle: elleTatiller, silinen: silinenTatiller });
}

function pad2(n) { return String(n).padStart(2, '0'); }

/** O gün tatil mi? {ad, kaynak} veya null (legacy resmiTatilVarMi ile aynı). */
export function resmiTatilVarMi(yil, ay, gun) {
  const key = `${yil}-${pad2(ay + 1)}-${pad2(gun)}`;
  if (silinenTatiller.includes(key)) return null;
  const elle = elleTatiller.find((t) => t.tarih === key);
  if (elle) return { ad: elle.ad, kaynak: 'elle' };
  const bul = (RESMI_TATILLER[yil] || []).find((t) => t.t === `${pad2(ay + 1)}-${pad2(gun)}`);
  if (bul) return { ad: bul.ad, kaynak: 'sistem' };
  return null;
}

/** Ayın tüm tatilleri: [{gun, ad, kaynak, tarih}] */
export function aylikResmiTatiller(yil, ay) {
  const gs = gunSayisi(yil, ay);
  const sonuc = [];
  for (let g = 1; g <= gs; g++) {
    const r = resmiTatilVarMi(yil, ay, g);
    if (r) sonuc.push({ gun: g, ad: r.ad, kaynak: r.kaynak, tarih: `${yil}-${pad2(ay + 1)}-${pad2(g)}` });
  }
  return sonuc;
}

export function resmiTatilEkle(tarih, ad) {
  if (silinenTatiller.includes(tarih)) silinenTatiller = silinenTatiller.filter((t) => t !== tarih);
  if (!elleTatiller.find((t) => t.tarih === tarih)) elleTatiller.push({ tarih, ad });
  saveResmiTatiller();
}

export function resmiTatilKaldir(tarih, kaynak) {
  if (kaynak === 'elle') elleTatiller = elleTatiller.filter((t) => t.tarih !== tarih);
  else if (!silinenTatiller.includes(tarih)) silinenTatiller.push(tarih);
  saveResmiTatiller();
}
