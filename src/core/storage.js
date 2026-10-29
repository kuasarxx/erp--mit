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
  'ui.theme': `${PREFIX}theme`,
};

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
  const lsKey = PERSIST_MAP[stateKey];
  if (lsKey) writeKey(lsKey, value);
}
