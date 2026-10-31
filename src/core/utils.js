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

/** "Ad Soyad - 123" veya tam isim metninden {isim, sicil} çözer (legacy avansKisiParse). */
export function kisiParse(metin, personeller = []) {
  if (!metin) return null;
  const t = String(metin).trim();
  const m = t.match(/^(.+?)\s*-\s*(\S+)$/);
  if (m) return { isim: m[1].trim(), sicil: m[2].trim() };
  const bul = personeller.find((p) => normalizeTR(p.ad) === normalizeTR(t));
  if (bul) return { isim: bul.ad, sicil: bul.sicil };
  return null;
}

/** Dakikayı "X sa Y dk" biçimine çevirir (legacy dkToSaatUzun). */
export function dkToSure(dk) {
  if (!dk || dk <= 0) return '0 dk';
  const h = Math.floor(dk / 60);
  const m = Math.round(dk % 60);
  if (h === 0) return `${m} dk`;
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

/** BOM'lu HTML-tabanlı .xls indirir (legacy Excel aktarımının modüler hali). */
export function downloadXls(htmlBody, dosyaAdi) {
  const h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>'
    + 'table{border-collapse:collapse;font-family:Arial;font-size:12px;width:100%}'
    + 'th{background:#0c4a6e;color:#fff;padding:10px 8px;border:1px solid #333;text-align:left}'
    + 'td{padding:8px;border:1px solid #ccc}td.num{text-align:right;font-weight:bold}'
    + '</style></head><body>' + htmlBody + '</body></html>';
  const blob = new Blob(['\ufeff' + h], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = dosyaAdi.endsWith('.xls') ? dosyaAdi : `${dosyaAdi}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

/** 'YYYY-MM-DD' -> Date (geçersizse null; legacy gecerliTarih). */
export function gecerliTarih(str) {
  if (!str) return null;
  const d = new Date(`${String(str).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
