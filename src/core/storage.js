// ============================================================
// ERP ÜMİT v2 — Kalıcılık katmanı (localStorage adaptörü)
// Legacy anahtar adlarıyla birebir uyumludur; böylece eski
// veriler yeni projeye taşınır. state.js'teki PERSIST_MAP
// hangi dilimin hangi anahtarda tutulacağını belirler.
// ============================================================

const PREFIX = 'umit_erp_';

/** state anahtarı -> localStorage anahtarı eşlemesi */
export const PERSIST_MAP = {
  personeller: `${PREFIX}global_personeller_v1`,
  normalSaatler: `${PREFIX}normal_saatler_v1`,
  vardiyaKurallari: `${PREFIX}vardiya_kurallari_v1`,
  notlar: `${PREFIX}notlar_v1`,
  sonPuantajTarihi: `${PREFIX}son_puantaj_tarihi`,
  egitim: 'erp_umit_egitim_v1',
  donemler: `${PREFIX}donemler_v1`,
  aktifDonemId: `${PREFIX}aktif_donem_id_v1`,
  // puantaj dönem bazlıdır; anahtar statik değil — saveSlice içinde çözülür
  puantaj: '@puantaj',
  avanslar: '@avans',
  mesai: '@mesai',
  kesintiler: '@kesinti',
  kesintiAyar: '@kesinti',
  ekstraKesintiler: '@ekstra',
  icralar: '@icra',
  ikinciOdeme: '@ikinciOdeme',
  muhasebe: '@muhasebe',
  'ui.theme': `${PREFIX}theme`,
};

/** Legacy'deki K_* sabitleri (uyumluluk için korundu). */
export const LEGACY_KEYS = {
  PUANTAJ: 'erp_umit_puantaj_v1',
  AVANS: 'erp_umit_avans_v1',
  MESAİ: 'erp_umit_mesai_v1',
  KESINTİ: 'erp_umit_kesinti_v1',
  MUHASEBE: 'erp_umit_muhasebe_v1',
};

/**
 * Dönem bazlı anahtar üretimi — legacy'deki donemKey() ile birebir:
 *   umit_erp_<donemId>_<modul>_v1
 */
export function periodKey(donemId, modul) {
  if (!donemId) return null;
  return `${PREFIX}${donemId}_${modul}_v1`;
}

export function readKey(lsKey) {
  try {
    const raw = localStorage.getItem(lsKey);
    return raw == null ? undefined : JSON.parse(raw);
  } catch (err) {
    console.warn(`[storage] okunamadı: ${lsKey}`, err);
    return undefined;
  }
}

export function writeKey(lsKey, value) {
  try {
    localStorage.setItem(lsKey, JSON.stringify(value));
  } catch (err) {
    console.error(`[storage] yazılamadı: ${lsKey}`, err);
  }
}

/** PERSIST_MAP'teki tüm dilimleri tek seferde yükler. */
export function loadState() {
  const out = {};
  for (const [stateKey, lsKey] of Object.entries(PERSIST_MAP)) {
    const value = readKey(lsKey);
    if (value !== undefined) out[stateKey] = value;
  }
  return out;
}

/** İlgili dilimi karşılık gelen anahtara yazar. */
export function saveSlice(stateKey, value) {
  let lsKey = PERSIST_MAP[stateKey];
  if (typeof lsKey === 'string' && lsKey.startsWith('@')) {
    // Dönem bazlı: '@mesai' -> 'mesai', aktifDonemId'den çözülür
    const modul = lsKey.slice(1);
    const donemId = readKey(`${PREFIX}aktif_donem_id_v1`);
    lsKey = donemId ? periodKey(donemId, modul) : null;
  }
  if (!lsKey) return;

  // Kesinti legacy ambalajı: umit_erp_<donem>_kesinti_v1 = { liste, ayar }
  // state'te iki ayrı dilim tutulur; yazarken ambalajı koruyoruz.
  if (stateKey === 'kesintiler' || stateKey === 'kesintiAyar') {
    const mevcut = readKey(lsKey) || {};
    writeKey(lsKey, {
      liste: stateKey === 'kesintiler' ? value : (mevcut.liste || []),
      ayar: stateKey === 'kesintiAyar' ? value : (mevcut.ayar || {}),
    });
    return;
  }

  writeKey(lsKey, value);
}
