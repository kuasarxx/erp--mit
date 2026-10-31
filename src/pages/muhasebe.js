// ============================================================
// ERP ÜMİT v2 — Muhasebe Sayfası (Özet Tablo)
// Legacy page-muhasebe modülünün modüler karşılığı (emoji yok).
//  - Puantajdaki her personelin gün dökümü (1 / X / İ / R) +
//    GÜN, H.İçi, H.Sonu, Resmi, Avans, Hafta Tatili, Resmi Tatil,
//    Normal Gün, İcra ve Not sütunları tek tabloda.
//  - Hücreye tıklayarak düzenleme: İsim (özel isim), İcra, Not.
//    Özel isim / icra / not -> muhasebeEkstra haritasında yaşar.
//  - Kalıcılık legacy ile birebir: umit_erp_<donemId>_muhasebe_v1
//    ambalajı: { ekstra: {sicil:{icra,not,ozelIsim}}, state:{yil,ay} }
//  - Excel'e aktarma renkli .xls olarak legacy formatıyla aynı.
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, formatTRY, downloadXls } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { gunSayisi, haftaGunu } from '../core/hesaplamalar.js';
import { AYLAR, GUNLER } from '../core/donemService.js';
import { aylikResmiTatiller, resmiTatilVarMi } from '../core/resmiTatilService.js';
import { scheduleSync } from '../core/syncService.js';

/* ─── yardımcılar ─── */

function mhState() { return state.muhasebe.state; }

/** Bir kişinin dönem içi mesai toplamını tipe göre böler (legacy kisiMesaiSplit). */
export function kisiMesaiSplit(sicil, yil, ay) {
  const v = state.mesai.veriler[sicil];
  if (!v) return { hIci: 0, hSonu: 0, tatil: 0, top: 0 };
  let hIci = 0; let hSonu = 0; let tatil = 0;
  Object.keys(v).forEach((gStr) => {
    const g = parseInt(gStr, 10);
    const n = Number(v[gStr]);
    if (!Number.isFinite(n) || n <= 0) return;
    const pazar = haftaGunu(yil, ay, g) === 0;
    if (resmiTatilVarMi(yil, ay, g)) tatil += n;
    else if (pazar) hSonu += n;
    else hIci += n;
  });
  const r2 = (x) => parseFloat(x.toFixed(2));
  return { hIci: r2(hIci), hSonu: r2(hSonu), tatil: r2(tatil), top: r2(hIci + hSonu + tatil) };
}

/** Kişi başı avans toplamı (dönem bazlı). */
export function kisiAvansToplam(sicil) {
  return state.avanslar
    .filter((a) => String(a.sicil) === String(sicil))
    .reduce((t, a) => t + (Number(a.tutar) || 0), 0);
}

/** muhasebeEkstra kaydı (legacy muhasebeEkstraAl ile aynı sözdizimi). */
export function muhasebeEkstraAl(sicil) {
  return state.muhasebe.ekstra[sicil] || { icra: 0, not: '' };
}

/** Puantaj hücresi durum sınıfları — legacy ile birebir mantık. */
function gunHucreBilgisi(v) {
  const gelmedi = (v === 'X' || v === 'x');
  const izinli = (v === 'İ' || v === 'i');
  const raporlu = (v === 'R' || v === 'r');
  const geldi = !gelmedi && !izinli && !raporlu && v !== undefined && v !== '';
  let txt = '';
  if (gelmedi) txt = 'X';
  else if (izinli) txt = 'İ';
  else if (raporlu) txt = 'R';
  else if (geldi && String(v) !== '0') txt = '1';
  let cls = '';
  if (gelmedi) cls = 'gelmedi';
  else if (izinli) cls = 'izinli';
  else if (raporlu) cls = 'raporlu';
  else if (geldi) cls = 'geldi';
  return { txt, cls, geldi };
}

/** Çalışılan gün sayısı (sayısal değerli hücreler — legacy kisiGun). */
function kisiCalisilanGun(p) {
  return Object.keys(p.gunler || {}).filter((g) => {
    const v = p.gunler[g];
    return v !== 'X' && v !== 'x' && v !== 'İ' && v !== 'i' && v !== 'R' && v !== 'r'
      && v !== '' && v != null && !Number.isNaN(Number(v));
  }).length;
}

/** Tek kişi için hafta tatili / resmi tatil / normal gün sayaçları. */
function gunTipleri(p, yil, ay, gs, tatilGunleri) {
  let haftaTatili = 0; let resmiTatil = 0; let normalGun = 0;
  for (let g = 1; g <= gs; g++) {
    const bilgi = gunHucreBilgisi(p.gunler ? p.gunler[g] : undefined);
    if (!bilgi.geldi) continue;
    if (haftaGunu(yil, ay, g) === 0) haftaTatili++;
    else if (tatilGunleri.has(g)) resmiTatil++;
    else normalGun++;
  }
  return { haftaTatili, resmiTatil, normalGun };
}

/** Muhasebe dilimini legacy ambalajıyla kalıcı yapar. */
function commitMuhasebe(fn) {
  const ekstra = { ...state.muhasebe.ekstra };
  fn(ekstra);
  setState('muhasebe', { ekstra, state: { ...mhState() } });
  scheduleSync();
}

/* ─── kabuk ─── */

function shellHtml() {
  return `
  <div class="page stack">
    <section class="card toolbar-area">
      <div class="toolbar">
        <div class="field-inline">
          <label class="field__label" for="muhasebeAySec">Ay</label>
          <select id="muhasebeAySec" class="select select--sm"></select>
          <select id="muhasebeYilSec" class="select select--sm"></select>
        </div>
        <span class="spacer"></span>
        <button class="btn btn--ghost" data-act="excel">${icon('download')} Excel'e Aktar</button>
        <button class="btn btn--ghost" data-act="print">${icon('printer')} Yazdır</button>
      </div>
      <p class="hint">
        ${icon('info')} İsim, İcra ve Not hücrelerine tıklayarak düzenle (<b>Enter</b> kaydeder,
        <b>Esc</b> vazgeçer). Veriler puantaj, mesai ve avans modüllerinden otomatik beslenir.
      </p>
    </section>

    <section class="card">
      <div class="pay-scroll">
        <table class="pay-table muhasebe-table">
          <thead id="muhasebeHead"></thead>
          <tbody id="muhasebeBody"></tbody>
        </table>
      </div>
      <div class="summary-bar" id="muhasebeAlt"></div>
    </section>
  </div>`;
}

function fillSelectors(body) {
  const s = mhState();
  const aySel = body.querySelector('#muhasebeAySec');
  const yilSel = body.querySelector('#muhasebeYilSec');
  aySel.innerHTML = AYLAR.map((a, i) => `<option value="${i}"${i === s.ay ? ' selected' : ''}>${a}</option>`).join('');
  const yilNow = new Date().getFullYear();
  const years = [];
  for (let y = yilNow - 2; y <= yilNow + 4; y++) years.push(y);
  if (!years.includes(s.yil)) years.push(s.yil);
  years.sort();
  yilSel.innerHTML = years.map((y) => `<option value="${y}"${y === s.yil ? ' selected' : ''}>${y}</option>`).join('');
}

function setStateMonth(year, month, body) {
  commitMuhasebe(() => {}); // sadece state değişiyor
  setState('muhasebe', { ekstra: state.muhasebe.ekstra, state: { yil: year, ay: month } });
  scheduleSync();
  fillSelectors(body);
  drawTable(body);
}

/* ─── tablo çizimi ─── */

function drawTable(body) {
  const head = body.querySelector('#muhasebeHead');
  const tb = body.querySelector('#muhasebeBody');
  const alt = body.querySelector('#muhasebeAlt');
  const { yil, ay } = mhState();
  const gs = gunSayisi(yil, ay);
  const tatiller = aylikResmiTatiller(yil, ay);
  const tatilGunleri = new Set(tatiller.map((t) => t.gun));

  /* Başlık */
  let h = '<tr><th class="sicil">Sicil</th><th class="isim sticky-1">İsim</th>';
  for (let g = 1; g <= gs; g++) {
    const hg = haftaGunu(yil, ay, g);
    const pazar = hg === 0;
    const tatil = tatilGunleri.has(g);
    let cls = 'gun';
    if (tatil) cls += ' tatil';
    else if (pazar) cls += ' pazar';
    const tAd = (tatiller.find((t) => t.gun === g) || {}).ad || '';
    h += `<th class="${cls}" title="${esc(tAd)}"><span class="gun-no">${g}</span><span class="gun-ad">${GUNLER[hg]}</span></th>`;
  }
  h += '<th class="gun-top">GÜN</th><th class="hici">H.İçi</th><th class="hsonu">H.Sonu</th><th class="tatil-top">Resmi</th>'
     + '<th class="avans">Avans</th><th class="hafta-tatili">Hafta Tat.</th><th class="resmi-tatil-col">Resmi Tatil</th>'
     + '<th class="normal-gun">Normal Gün</th><th class="icra">İcra</th><th class="not">Not</th></tr>';
  head.innerHTML = h;

  const liste = [...state.puantaj.personeller].sort((a, b) => String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));
  if (!liste.length) {
    tb.innerHTML = `<tr><td colspan="${gs + 12}"><div class="puantaj-bos">${icon('upload')}<h3>Henüz personel yok</h3><p>Önce <b>Puantaj</b> sayfasından liste yükle.</p></div></td></tr>`;
    alt.innerHTML = '';
    return;
  }

  let b = '';
  let totHici = 0; let totHsonu = 0; let totTatil = 0; let totAvans = 0; let totIcra = 0;

  liste.forEach((p) => {
    const ek = muhasebeEkstraAl(p.id);
    const ozelIsim = ek.ozelIsim || p.isim;
    b += '<tr>';
    b += `<td class="sicil">${esc(p.id || '-')}</td>`;
    b += `<td class="isim sticky-1 editable" data-edit="isim" data-id="${esc(p.id)}" title="Düzenlemek için tıkla">${esc(ozelIsim)}</td>`;

    for (let g = 1; g <= gs; g++) {
      const bilgi = gunHucreBilgisi(p.gunler ? p.gunler[g] : undefined);
      let cls = 'gun';
      if (tatilGunleri.has(g)) cls += ' tatil';
      else if (haftaGunu(yil, ay, g) === 0) cls += ' pazar';
      if (bilgi.cls) cls += ` ${bilgi.cls}`;
      b += `<td class="${cls}">${bilgi.txt}</td>`;
    }

    const calisilan = kisiCalisilanGun(p);
    const ms = kisiMesaiSplit(p.id, yil, ay);
    const gt = gunTipleri(p, yil, ay, gs, tatilGunleri);
    const av = kisiAvansToplam(p.id);
    const icra = Number(ek.icra) || 0;
    totHici += ms.hIci; totHsonu += ms.hSonu; totTatil += ms.tatil; totAvans += av; totIcra += icra;

    b += `<td class="gun-top${calisilan === 0 ? ' sifir' : ''}">${calisilan === 0 ? '-' : calisilan}</td>`;
    b += `<td class="hici${ms.hIci === 0 ? ' sifir' : ''}">${ms.hIci === 0 ? '-' : ms.hIci}</td>`;
    b += `<td class="hsonu${ms.hSonu === 0 ? ' sifir' : ''}">${ms.hSonu === 0 ? '-' : ms.hSonu}</td>`;
    b += `<td class="tatil-top${ms.tatil === 0 ? ' sifir' : ''}">${ms.tatil === 0 ? '-' : ms.tatil}</td>`;
    b += `<td class="avans${av === 0 ? ' sifir' : ''}">${av === 0 ? '-' : `₺${formatTRY(av)}`}</td>`;
    b += `<td class="hafta-tatili${gt.haftaTatili === 0 ? ' sifir' : ''}">${gt.haftaTatili === 0 ? '-' : gt.haftaTatili}</td>`;
    b += `<td class="resmi-tatil-col${gt.resmiTatil === 0 ? ' sifir' : ''}">${gt.resmiTatil === 0 ? '-' : gt.resmiTatil}</td>`;
    b += `<td class="normal-gun${gt.normalGun === 0 ? ' sifir' : ''}">${gt.normalGun === 0 ? '-' : gt.normalGun}</td>`;
    b += `<td class="icra editable${icra === 0 ? ' sifir' : ''}" data-edit="icra" data-id="${esc(p.id)}" title="Düzenlemek için tıkla">${icra === 0 ? '—' : `₺${formatTRY(icra)}`}</td>`;
    b += `<td class="not editable" data-edit="not" data-id="${esc(p.id)}" title="${esc(ek.not || '')}">${esc(ek.not || '—')}</td>`;
    b += '</tr>';
  });
  tb.innerHTML = b;

  const r2 = (x) => parseFloat(x.toFixed(2));
  alt.innerHTML = `
    <div class="bilgi">${icon('users')} <b>${liste.length}</b> personel • ${icon('calendar')} <b>${gs}</b> gün</div>
    <div class="bilgi">${icon('clock')} H.İçi: <b>${r2(totHici)}</b> sa • H.Sonu: <b>${r2(totHsonu)}</b> sa • Resmi: <b>${r2(totTatil)}</b> sa</div>
    <div class="bilgi">${icon('wallet')} Avans: <b>₺${formatTRY(totAvans)}</b> • ${icon('scale')} İcra: <b>₺${formatTRY(totIcra)}</b></div>`;
}

/* ─── hücre düzenleme (satır içi input — legacy davranışı) ─── */

function hucreDuzenle(td, body) {
  if (td.querySelector('input')) return;
  const id = td.dataset.id;
  const tur = td.dataset.edit;
  const ek = muhasebeEkstraAl(id);
  const mevcut = tur === 'isim' ? (ek.ozelIsim || '')
    : tur === 'icra' ? ((Number(ek.icra) || 0) === 0 ? '' : ek.icra)
    : (ek.not || '');

  const input = document.createElement('input');
  input.type = 'text';
  if (tur === 'icra') input.inputMode = 'decimal';
  input.value = mevcut;
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  input.select();

  let bitti = false;
  function bitir(kaydet) {
    if (bitti) return;
    bitti = true;
    if (kaydet) {
      const v = input.value.trim();
      commitMuhasebe((ekstra) => {
        const kayit = { ...(ekstra[id] || { icra: 0, not: '' }) };
        if (tur === 'isim') {
          if (v === '') delete kayit.ozelIsim; else kayit.ozelIsim = v;
        } else if (tur === 'icra') {
          if (v === '') kayit.icra = 0;
          else {
            const n = parseFloat(v.replace(',', '.'));
            if (Number.isFinite(n) && n >= 0) kayit.icra = n;
            else { toast('Geçersiz değer', 'error'); return; }
          }
        } else {
          kayit.not = v;
        }
        ekstra[id] = kayit;
      });
      toast('Kaydedildi', 'success');
    }
    drawTable(body);
  }
  input.onblur = () => bitir(true);
  input.onkeydown = (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); bitir(true); }
    else if (ev.key === 'Escape') { bitir(false); }
  };
}

/* ─── excel ─── */

const AYLAR_ASCII = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];

function exportExcel() {
  const liste = state.puantaj.personeller;
  if (!liste.length) { toast('Aktarılacak personel yok', 'error'); return; }
  const { yil, ay } = mhState();
  const gs = gunSayisi(yil, ay);
  const tatiller = aylikResmiTatiller(yil, ay);
  const tatilGunleri = new Set(tatiller.map((t) => t.gun));

  let h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>'
    + 'table{border-collapse:collapse;font-family:Arial;font-size:11px}'
    + 'th{background:#0c4a6e;color:#fff;font-weight:bold;padding:6px 4px;border:1px solid #333;text-align:center;font-size:10px}'
    + 'th.pazar{background:#d97706}th.tatil{background:#7c3aed}'
    + 'th.hici{background:#0369a1}th.hsonu{background:#92400e}th.tatil-top{background:#5b21b6}th.gun-top{background:#7c3aed}'
    + 'th.avans{background:#dc2626}th.icra{background:#334155}th.not{background:#1e293b}'
    + 'th.hafta-tatili{background:#8e44ad}th.resmi-tatil-col{background:#2980b9}th.normal-gun{background:#27ae60}'
    + 'td{padding:4px 3px;border:1px solid #ccc;text-align:center;font-size:10px}'
    + 'td.sicil{background:#ecf0f1;font-weight:bold}'
    + 'td.isim{text-align:left;font-weight:bold;white-space:nowrap;font-size:11px}'
    + 'td.pazar{background:#fef3c7;color:#92400e}td.tatil{background:#ede9fe;color:#6d28d9}'
    + 'td.geldi{color:#0284c7;font-weight:bold}td.gelmedi{color:#dc2626;font-weight:bold}'
    + 'td.izinli{background:#dbeafe;color:#1d4ed8;font-weight:bold}td.raporlu{background:#fce7f3;color:#be185d;font-weight:bold}'
    + 'td.hici{background:#e0f2fe;color:#0369a1;font-weight:bold}td.hsonu{background:#fed7aa;color:#92400e;font-weight:bold}'
    + 'td.tatil-top{background:#ddd6fe;color:#6d28d9;font-weight:bold}td.avans{background:#fee2e2;color:#dc2626;font-weight:bold}'
    + 'td.icra{background:#f1f5f9;color:#334155;font-weight:bold}td.not{text-align:left;font-style:italic;color:#64748b}'
    + 'h2{font-family:Arial;color:#0c4a6e;margin:8px 0 4px}p.info{font-size:10px;color:#666;margin:0 0 10px;font-family:Arial}'
    + '</style></head><body>';
  h += `<h2>${AYLAR_ASCII[ay]} ${yil} — Personel Puantaj (Muhasebe)</h2>`;
  h += `<p class="info">Toplam ${liste.length} personel • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th>Sicil</th><th>İsim</th>';
  for (let g = 1; g <= gs; g++) {
    let cls = '';
    if (tatilGunleri.has(g)) cls = ' class="tatil"';
    else if (haftaGunu(yil, ay, g) === 0) cls = ' class="pazar"';
    h += `<th${cls}>${g}</th>`;
  }
  h += '<th class="hici">H.İçi</th><th class="hsonu">H.Sonu</th><th class="tatil-top">Resmi</th><th class="gun-top">GÜN</th>'
     + '<th class="avans">Avans</th><th class="hafta-tatili">Hafta Tatili</th><th class="resmi-tatil-col">Resmi Tatil</th>'
     + '<th class="normal-gun">Normal Gün</th><th class="icra">İcra</th><th class="not">Not</th></tr></thead><tbody>';

  const sirali = [...liste].sort((a, b) => String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));
  sirali.forEach((p) => {
    const ek = muhasebeEkstraAl(p.id);
    h += `<tr><td class="sicil">${esc(p.id || '-')}</td><td class="isim">${esc(ek.ozelIsim || p.isim)}</td>`;
    for (let g = 1; g <= gs; g++) {
      const bilgi = gunHucreBilgisi(p.gunler ? p.gunler[g] : undefined);
      let cls = [];
      if (tatilGunleri.has(g)) cls.push('tatil');
      else if (haftaGunu(yil, ay, g) === 0) cls.push('pazar');
      if (bilgi.cls) cls.push(bilgi.cls);
      h += `<td${cls.length ? ` class="${cls.join(' ')}"` : ''}>${bilgi.txt}</td>`;
    }
    const ms = kisiMesaiSplit(p.id, yil, ay);
    const gt = gunTipleri(p, yil, ay, gs, tatilGunleri);
    const av = kisiAvansToplam(p.id);
    const calisilan = kisiCalisilanGun(p);
    const icra = Number(ek.icra) || 0;
    h += `<td class="hici">${ms.hIci === 0 ? '' : ms.hIci}</td>`;
    h += `<td class="hsonu">${ms.hSonu === 0 ? '' : ms.hSonu}</td>`;
    h += `<td class="tatil-top">${ms.tatil === 0 ? '' : ms.tatil}</td>`;
    h += `<td class="gun-top">${calisilan === 0 ? '' : calisilan}</td>`;
    h += `<td class="avans">${av === 0 ? '' : parseFloat(av.toFixed(2))}</td>`;
    h += `<td class="hafta-tatili">${gt.haftaTatili === 0 ? '' : gt.haftaTatili}</td>`;
    h += `<td class="resmi-tatil-col">${gt.resmiTatil === 0 ? '' : gt.resmiTatil}</td>`;
    h += `<td class="normal-gun">${gt.normalGun === 0 ? '' : gt.normalGun}</td>`;
    h += `<td class="icra">${icra === 0 ? '' : parseFloat(icra.toFixed(2))}</td>`;
    h += `<td class="not">${esc(ek.not || '')}</td></tr>`;
  });
  h += '</tbody></table></body></html>';
  downloadXls(h, `muhasebe-${AYLAR_ASCII[ay]}-${yil}.xls`);
  toast('Excel indirildi', 'success');
}

/* ─── mount ─── */

registerPage({
  id: 'muhasebe',
  title: 'Muhasebe',
  subtitle: 'Puantaj, mesai, avans ve icra özet tablosu',
  icon: 'calculator',
  mount(root) {
    root.innerHTML = shellHtml();
    fillSelectors(root);

    root.addEventListener('change', (e) => {
      if (e.target.id === 'muhasebeAySec') setStateMonth(mhState().yil, parseInt(e.target.value, 10), root);
      if (e.target.id === 'muhasebeYilSec') setStateMonth(parseInt(e.target.value, 10), mhState().ay, root);
    });

    root.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'excel') { exportExcel(); return; }
      if (act === 'print') { window.print(); return; }
      const td = e.target.closest('td.editable');
      if (td) hucreDuzenle(td, root);
    });

    const unsub1 = subscribe('muhasebe', () => drawTable(root));
    const unsub2 = subscribe('puantaj', () => drawTable(root));
    const unsub3 = subscribe('mesai', () => drawTable(root));
    const unsub4 = subscribe('avanslar', () => drawTable(root));

    drawTable(root);
    return () => { unsub1(); unsub2(); unsub3(); unsub4(); };
  },
});
