// ============================================================
// ERP ÜMİT v2 — Ortak yardımcı fonksiyonlar (DOM + format)
// ============================================================

/** HTML'e gömülecek dinamik metni kaçırır (XSS önlemi). */
export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** TL para biçimi: 12345.6 -> "₺12.345,60" */
export function formatTRY(n) {
  return new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    minimumFractionDigits: 2,
  }).format(Number(n) || 0);
}

/** Sayı biçimi: 1500 -> "1.500" */
export function formatNumber(n, digits = 0) {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(n) || 0);
}

/** Saat biçimi: 8.5 -> "8,5 sa" */
export function formatHours(h) {
  return `${formatNumber(h, 1)} sa`;
}

/** "YYYY-MM-DD" -> "12.03.2026" */
export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}.${m}.${y}`;
}

/** Bugünün ISO tarihi (lokal saat dilimine göre). */
export function todayISO() {
  const now = new Date();
  const off = now.getTimezoneOffset();
  return new Date(now.getTime() - off * 60_000).toISOString().slice(0, 10);
}

/** Basit arama normalizasyonu (Türkçe karakter duyarlı). */
export function normalizeTR(s) {
  return String(s ?? '')
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ş', 's')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c');
}

/** Dizi içinde Türkçe-duyarlı arama filtresi üretir. */
export function searchFilter(query, fields) {
  const q = normalizeTR(query);
  if (!q) return () => true;
  return (item) => fields.some((f) => normalizeTR(item[f]).includes(q));
}
