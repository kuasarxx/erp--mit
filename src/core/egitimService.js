// ============================================================
// ERP ÜMİT v2 — Eğitim Takibi servisi
// Legacy kalıcılık anahtarlarıyla birebir uyumlu:
//   erp_umit_egitim_v1        -> { sonuclar: [...] }  (store: egitimSonuclari)
//   erp_umit_egitim_gecmis_v1 -> [...]                (store: egitimGecmis)
// Şemalar (legacy ile aynı):
//   sonuc : { tarih, tarihGoster, gunAdi, modul, salon, kisiler:[{id,isim}] }
//   gecmis: { id, tarih, modul, salon, gunSayisi, kisiSayisi, ilkGun, sonGun, sonuclar }
// ============================================================

import { state, setState } from './store.js';
import { writeKey } from './storage.js';
import { scheduleSync } from './syncService.js';

const K_EGITIM = 'erp_umit_egitim_v1';
export const K_EGITIM_GECMIS = 'erp_umit_egitim_gecmis_v1';

/** Yüklenen liste değişikliklerini store + legacy anahtara yazar. */
export function egitimKaydet(sonuclar) {
  setState('egitimSonuclari', sonuclar);          // persist '@egitim' -> { sonuclar } ambalajı
  writeKey(K_EGITIM, { sonuclar });               // emniyet kemeri (aynı şema, idempotent)
  scheduleSync();
}

/** Geçmiş listesi değişikliklerini yazar (max 50 kayıt). */
export function egitimGecmisKaydet(gecmis) {
  const liste = Array.isArray(gecmis) ? gecmis.slice(0, 50) : [];
  setState('egitimGecmis', liste);
  writeKey(K_EGITIM_GECMIS, liste);
  scheduleSync();
}

/**
 * Mevcut yüklemeyi geçmişe ekler — legacy egitimGecmiseKaydet() ile aynı:
 * aynı modül + aynı ilk gün varsa üzerine yazılır, yoksa başa eklenir.
 */
export function egitimGecmiseEkle() {
  const s = state.egitimSonuclari;
  if (!s || s.length === 0) return null;
  const kayit = {
    id: Date.now(),
    tarih: new Date().toISOString(),
    modul: s[0].modul || 'Modül',
    salon: s[0].salon || '',
    gunSayisi: s.length,
    kisiSayisi: s.reduce((t, x) => t + x.kisiler.length, 0),
    ilkGun: s[0] ? s[0].tarihGoster : '',
    sonGun: s[s.length - 1] ? s[s.length - 1].tarihGoster : '',
    sonuclar: JSON.parse(JSON.stringify(s)),
  };
  const gecmis = [...state.egitimGecmis];
  const ayniIdx = gecmis.findIndex((k) => k.modul === kayit.modul && k.ilkGun === kayit.ilkGun);
  if (ayniIdx > -1) gecmis[ayniIdx] = kayit;
  else gecmis.unshift(kayit);
  egitimGecmisKaydet(gecmis);
  return kayit;
}

/** Geçmişten bir kaydı aktif yükleme olarak yükler. */
export function egitimGecmisYukle(id) {
  const k = state.egitimGecmis.find((x) => String(x.id) === String(id));
  if (!k) return null;
  egitimKaydet(JSON.parse(JSON.stringify(k.sonuclar || [])));
  return k;
}

export function egitimGecmisSil(id) {
  egitimGecmisKaydet(state.egitimGecmis.filter((x) => String(x.id) !== String(id)));
}

/**
 * WhatsApp mesaj metni — legacy egitimMesajOlustur() ile birebir aynı çıktı.
 * (Bu metin legacy'de olduğu gibi emoji içerir: kullanıcıya gönderilen
 * WhatsApp mesajıdır, arayüzde gösterilmez.)
 */
export function egitimMesajOlustur() {
  const s = state.egitimSonuclari;
  if (!s || s.length === 0) return '';
  const modul = (s[0].modul || 'Modül').toUpperCase();
  const salon = s[0].salon || '';
  let modulAd = modul;
  if (!/EĞİTİM/i.test(modulAd)) modulAd += ' EĞİTİMİ';
  let m = `📚 *${modulAd}*\n━━━━━━━━━━━━━━━━\n\n`;
  s.forEach((g, idx) => {
    const tarihKisa = String(g.tarih).replace(/\//g, '.');
    const gunAdi = g.gunAdi ? g.gunAdi.toUpperCase() : '';
    m += `📅 *${tarihKisa}${gunAdi ? ' ' + gunAdi : ''}*\n`;
    g.kisiler.forEach((k) => { m += `• ${k.isim} - ${k.id}\n`; });
    if (idx < s.length - 1) m += '\n';
  });
  m += '\n━━━━━━━━━━━━━━━━\n';
  m += '⏰ *Kimlik toplama:* 08:10\n';
  m += '🎓 *Eğitim başlama:* 08:20\n';
  if (salon) m += `📍 *Yer:* ${salon}\n`;
  m += '\n⚠️ *Tersane işe giriş kartınızı unutmayınız!*';
  return m;
}
