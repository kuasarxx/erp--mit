// ============================================================
// ERP ÜMİT v2 — 2. Ödeme Sayfası
// Legacy page-ikinciOdeme modülünün modüler karşılığı (emoji yok).
//  - Puantajdaki personeller için hak ediş tablosu
//    hakEdiş = yevmiye(gün toplamı) × maas
//  - Kesintiler: avans + ekstra(EXTR) + GA/RAPOR/SERT/KİRA/BANKA
//  - Sağlık/Sertifika/Kira kategorili ekstra kesintiler ilgili
//    sütuna OTOMATİK gelir; elle girilen değer otomatikle ön-yüklenir,
//    hücreye tıklayarak değiştirilebilir (legacy mantığıyla birebir).
//  - Manuel alanlar dönem bazlı: umit_erp_<donemId>_ikinciOdeme_v1
//    şema: { sicil: {ga, rapor, sert, kira, banka} }
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, formatTRY, downloadXls } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { satirToplam } from '../core/hesaplamalar.js';
import { gunSayisi } from '../core/hesaplamalar.js';
import { kisiEkstraToplam, kisiKategoriToplam } from './ekstra.js';
import { scheduleSync } from '../core/syncService.js';

const ALANLAR = [
  { key: 'ga',    ad: 'GA',    acik: 'Genel Avans / diğer' },
  { key: 'rapor', ad: 'RAPOR', acik: 'Sağlık (otomatik + elle)' },
  { key: 'sert',  ad: 'SERT.', acik: 'Sertifika (otomatik + elle)' },
  { key: 'kira',  ad: 'KİRA',  acik: 'Kira (otomatik + elle)' },
  { key: 'banka', ad: 'BANKA', acik: 'Banka ödemesi' },
];

/* ─── HESAP YARDIMCILARI ─── */
function kisiYevmiyeToplam(sicil) {
  const per = state.puantaj.personeller.find((p) => String(p.id) === String(sicil));
  if (!per) return 0;
  const { yevmiye } = satirToplam(per, gunSayisi(state.puantaj.yil, state.puantaj.ay));
  return yevmiye;
}

function kisiAvansToplam(sicil) {
  return state.avanslar
    .filter((a) => String(a.sicil) === String(sicil))
    .reduce((t, a) => t + (Number(a.tutar) || 0), 0);
}

/** Bir kişinin 2. ödeme satırını hesaplar (render + Excel ortak kullanır). */
function satirHesapla(p) {
  const per = state.personeller.find((x) => String(x.sicil) === String(p.id));
  const yevmiye = kisiYevmiyeToplam(p.id);
  const ucret = per ? (Number(per.maas) || 0) : 0;
  const hakEdis = yevmiye * ucret;
  const avans = kisiAvansToplam(p.id);
  const ekstra = kisiEkstraToplam(p.id, true); // Sağlık/Sertifika/Kira hariç

  const manuel = state.ikinciOdeme[String(p.id)] || {};
  const raporOto = kisiKategoriToplam(p.id, 'saglik');
  const sertOto = kisiKategoriToplam(p.id, 'sertifika');
  const kiraOto = kisiKategoriToplam(p.id, 'kira');
  const ga = Number(manuel.ga) || 0;
  const rapor = manuel.rapor != null ? (Number(manuel.rapor) || 0) : raporOto;
  const sert = manuel.sert != null ? (Number(manuel.sert) || 0) : sertOto;
  const kira = manuel.kira != null ? (Number(manuel.kira) || 0) : kiraOto;
  const banka = Number(manuel.banka) || 0;

  const kalan = hakEdis - avans - ekstra - ga - rapor - sert - kira - banka;
  return { isim: p.isim, sicil: p.id, yevmiye, ucret, hakEdis, avans, ekstra, ga, rapor, sert, kira, banka, kalan };
}

function commitManuel(sicil, alan, value) {
  const yeni = { ...state.ikinciOdeme };
  const satir = { ...(yeni[String(sicil)] || {}) };
  if (value === '' || value == null) delete satir[alan];
  else satir[alan] = value;
  if (Object.keys(satir).length) yeni[String(sicil)] = satir;
  else delete yeni[String(sicil)];
  setState('ikinciOdeme', yeni);   // persist '@ikinciOdeme' -> <donem>_ikinciOdeme_v1
  scheduleSync();
}

let container = null;

/* ─── RENDER ─── */
function render() {
  if (!container) return;
  const liste = [...state.puantaj.personeller].sort((a, b) =>
    String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));

  let h = `<div class="page-header">
    <div>
      <h1 class="page-title">${icon('banknote')} 2. Ödeme</h1>
      <p class="page-subtitle">Hak edişten avans, ekstra ve manuel kesintiler düşülür; maaş dışı kalan ödeme hesaplanır.</p>
    </div>
    <div class="page-actions">
      <button class="btn ikincil" data-act="excel">${icon('download')} Excel'e Aktar</button>
      <button class="btn ikincil" data-act="print">${icon('printer')} Yazdır</button>
    </div>
  </div>`;

  if (liste.length === 0) {
    h += `<div class="empty-state">${icon('users')}<h3>Puantajda personel yok</h3>
      <p>Önce Puantaj sayfasından personel listesini yükle.</p></div>`;
    container.innerHTML = h;
    bagla();
    return;
  }

  const satirlar = liste.map(satirHesapla);
  const top = satirlar.reduce((t, s) => ({
    yevmiye: t.yevmiye + s.yevmiye, hakEdis: t.hakEdis + s.hakEdis, avans: t.avans + s.avans,
    ekstra: t.ekstra + s.ekstra, ga: t.ga + s.ga, rapor: t.rapor + s.rapor,
    sert: t.sert + s.sert, kira: t.kira + s.kira, banka: t.banka + s.banka, kalan: t.kalan + s.kalan,
  }), { yevmiye: 0, hakEdis: 0, avans: 0, ekstra: 0, ga: 0, rapor: 0, sert: 0, kira: 0, banka: 0, kalan: 0 });

  h += `<div class="summary-strip">
    <div class="summary-item"><span class="summary-lbl">Kişi</span><span class="summary-val">${satirlar.length}</span></div>
    <div class="summary-item"><span class="summary-lbl">Hak Ediş</span><span class="summary-val is-ok">₺${formatTRY(top.hakEdis)}</span></div>
    <div class="summary-item"><span class="summary-lbl">Kesinti Toplam</span><span class="summary-val is-danger">₺${formatTRY(top.hakEdis - top.kalan)}</span></div>
    <div class="summary-item"><span class="summary-lbl">2. Ödeme</span><span class="summary-val is-ok">₺${formatTRY(Math.max(0, top.kalan))}</span></div>
  </div>`;

  const tl = (n) => (n > 0 ? '₺' + formatTRY(n) : '—');
  h += `<div class="tablo-scroll"><table class="data-table io-tablo">
    <thead><tr>
      <th>#</th><th>Sicil</th><th>İsim</th><th>Yevmiye</th><th>Ücret</th><th>Hak Ediş</th>
      <th>Avans</th><th>EXTR</th>
      ${ALANLAR.map((a) => `<th class="io-manuel-th" title="${a.acik}">${a.ad}</th>`).join('')}
      <th>KALAN</th>
    </tr></thead><tbody>`;

  satirlar.forEach((s, i) => {
    h += `<tr>
      <td>${i + 1}</td>
      <td class="mono text-muted">${esc(String(s.sicil))}</td>
      <td class="text-left">${esc(s.isim)}</td>
      <td>${s.yevmiye > 0 ? parseFloat(s.yevmiye.toFixed(2)) : '—'}</td>
      <td>${tl(s.ucret)}</td>
      <td class="is-ok" style="font-weight:800;">${tl(s.hakEdis)}</td>
      <td class="is-danger">${tl(s.avans)}</td>
      <td class="is-danger">${tl(s.ekstra)}</td>
      ${ALANLAR.map((a) => `<td class="io-manuel" data-id="${esc(String(s.sicil))}" data-alan="${a.key}" title="Değiştirmek için tıkla">${tl(s[a.key])}</td>`).join('')}
      <td style="font-weight:900;color:${s.kalan >= 0 ? 'var(--ok)' : 'var(--danger)'};">${s.kalan > 0 ? '₺' + formatTRY(s.kalan) : '₺0,00'}</td>
    </tr>`;
  });

  h += `<tr class="io-toplam">
    <td colspan="3" style="text-align:right;padding-right:12px;">TOPLAM →</td>
    <td>${parseFloat(top.yevmiye.toFixed(2))}</td><td>—</td>
    <td>₺${formatTRY(top.hakEdis)}</td>
    <td>₺${formatTRY(top.avans)}</td>
    <td>₺${formatTRY(top.ekstra)}</td>
    <td>₺${formatTRY(top.ga)}</td>
    <td>₺${formatTRY(top.rapor)}</td>
    <td>₺${formatTRY(top.sert)}</td>
    <td>₺${formatTRY(top.kira)}</td>
    <td>₺${formatTRY(top.banka)}</td>
    <td>₺${formatTRY(top.kalan)}</td>
  </tr></tbody></table></div>`;

  container.innerHTML = h;
  bagla();
}

/* ─── MANUEL HÜCRE DÜZENLEME (legacy manuelAlanTikla karşılığı) ─── */
function hucreDuzenle(td) {
  const sicil = td.dataset.id;
  const alan = td.dataset.alan;
  const mevcut = (state.ikinciOdeme[String(sicil)] || {})[alan];
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.value = mevcut != null ? mevcut : '';
  input.className = 'hucre-input';
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  let bitti = false;
  const bitir = (kaydet) => {
    if (bitti) return;
    bitti = true;
    if (kaydet) {
      const v = input.value.trim();
      if (v === '') {
        commitManuel(sicil, alan, '');
      } else {
        const n = parseFloat(v.replace(',', '.').replace(/[^\d.-]/g, ''));
        if (!isNaN(n) && n >= 0) commitManuel(sicil, alan, n);
        else { toast('Geçersiz değer', 'err'); render(); return; }
      }
    }
    render();
  };
  input.onblur = () => bitir(true);
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); bitir(true); }
    else if (ev.key === 'Escape') bitir(false);
  };
}

/* ─── OLAYLAR ─── */
function bagla() {
  container.onclick = (e) => {
    const td = e.target.closest('.io-manuel');
    if (td && !td.querySelector('input')) { hucreDuzenle(td); return; }
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.act === 'excel') exportExcel();
    else if (btn.dataset.act === 'print') window.print();
  };
}

/* ─── EXCEL ─── */
function exportExcel() {
  const liste = [...state.puantaj.personeller].sort((a, b) =>
    String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));
  if (liste.length === 0) { toast('Aktarılacak veri yok', 'err'); return; }
  const satirlar = liste.map(satirHesapla);

  let h = '<h2>2. Ödeme Tablosu</h2>';
  h += `<p class="info">Toplam ${satirlar.length} personel • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th>#</th><th>Sicil</th><th>İsim</th><th>Yevmiye</th><th>Ücret</th><th>Hak Ediş</th>' +
    '<th>Avans</th><th>EXTR</th><th>GA</th><th>RAPOR</th><th>SERT.</th><th>KİRA</th><th>BANKA</th><th>KALAN</th></tr></thead><tbody>';
  const top = { hakEdis: 0, avans: 0, ekstra: 0, ga: 0, rapor: 0, sert: 0, kira: 0, banka: 0, kalan: 0, yevmiye: 0 };
  satirlar.forEach((s, i) => {
    top.hakEdis += s.hakEdis; top.avans += s.avans; top.ekstra += s.ekstra; top.ga += s.ga;
    top.rapor += s.rapor; top.sert += s.sert; top.kira += s.kira; top.banka += s.banka;
    top.kalan += s.kalan; top.yevmiye += s.yevmiye;
    h += `<tr><td>${i + 1}</td><td>${esc(String(s.sicil))}</td><td>${esc(s.isim)}</td>` +
      `<td class="num">${parseFloat(s.yevmiye.toFixed(2)) || '-'}</td><td class="num">${s.ucret ? formatTRY(s.ucret) : '-'}</td>` +
      `<td class="num">${formatTRY(s.hakEdis)}</td><td class="num">${formatTRY(s.avans)}</td><td class="num">${formatTRY(s.ekstra)}</td>` +
      `<td class="num">${formatTRY(s.ga)}</td><td class="num">${formatTRY(s.rapor)}</td><td class="num">${formatTRY(s.sert)}</td>` +
      `<td class="num">${formatTRY(s.kira)}</td><td class="num">${formatTRY(s.banka)}</td><td class="num">${formatTRY(s.kalan)}</td></tr>`;
  });
  h += `<tr style="background:#dbeafe;font-weight:bold;"><td colspan="3" style="text-align:right;">TOPLAM →</td>` +
    `<td class="num">${parseFloat(top.yevmiye.toFixed(2))}</td><td>-</td>` +
    `<td class="num">${formatTRY(top.hakEdis)}</td><td class="num">${formatTRY(top.avans)}</td><td class="num">${formatTRY(top.ekstra)}</td>` +
    `<td class="num">${formatTRY(top.ga)}</td><td class="num">${formatTRY(top.rapor)}</td><td class="num">${formatTRY(top.sert)}</td>` +
    `<td class="num">${formatTRY(top.kira)}</td><td class="num">${formatTRY(top.banka)}</td><td class="num">${formatTRY(top.kalan)}</td></tr>`;
  h += '</tbody></table>';
  downloadXls(h, `Ikinci-Odeme-${new Date().toISOString().slice(0, 10)}.xls`);
  toast('2. Ödeme Excel indirildi', 'ok');
}

/* ─── SAYFA KAYDI ─── */
registerPage('ikinciOdeme', {
  title: '2. Ödeme',
  icon: 'banknote',
  group: 'Finans',
}, (el) => {
  container = el;
  render();
  const unsubs = [
    subscribe('ikinciOdeme', render),
    subscribe('puantaj', render),
    subscribe('avanslar', render),
    subscribe('ekstraKesintiler', render),
    subscribe('personeller', render),
  ];
  return () => { unsubs.forEach((u) => u()); container = null; };
});
