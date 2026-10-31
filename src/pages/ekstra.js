// ============================================================
// ERP ÜMİT v2 — Ekstra Kesinti Sayfası
// Legacy'deki page-ekstra modülünün modüler karşılığı.
//  - Kategori rozetleri SVG + renk tokenları (emoji yok)
//  - Dönem bazlı kalıcılık: umit_erp_<donemId>_ekstra_v1
//  - Ay/kategori/arama filtreleri, özet şeridi, Excel aktarımı
// Şema (legacy ile birebir): { id, sicil, isim, tarih, tutar, kategori, not, olusturmaTarihi }
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, formatTRY, formatDate, todayISO, normalizeTR, kisiParse, gecerliTarih, downloadXls } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { confirmDialog } from '../core/modal.js';
import { ensureDonem, saveDonemSlice, AYLAR } from '../core/donemService.js';
import { scheduleSync } from '../core/syncService.js';

/** Legacy EKSTRA_KATEGORILER — emoji kaldırıldı, ikon + renk verildi. */
export const EKSTRA_KATEGORILER = {
  ayakkabi:  { ad: 'Ayakkabı',  ikon: 'zap',      renk: '#0ea5e9' },
  kiyafet:   { ad: 'Kıyafet',   ikon: 'edit',     renk: '#8b5cf6' },
  saglik:    { ad: 'Sağlık',    ikon: 'info',     renk: '#dc2626' },
  sertifika: { ad: 'Sertifika', ikon: 'book',     renk: '#d97706' },
  ceza:      { ad: 'Ceza',      ikon: 'alert-triangle', renk: '#b91c1c' },
  ekipman:   { ad: 'Ekipman',   ikon: 'wrench',   renk: '#0891b2' },
  icra:      { ad: 'İcra',      ikon: 'scale',    renk: '#7c3aed' },
  kira:      { ad: 'Kira',      ikon: 'building', renk: '#059669' },
  diger:     { ad: 'Diğer',     ikon: 'receipt',  renk: '#64748b' },
};

/** Sağlık/Sertifika/Kira ikinci ödeme sütunlarına gider; EXTR bunların dışındakiler. */
export const IKINCI_ODEME_KATEGORILERI = ['saglik', 'sertifika', 'kira'];

export function kisiEkstraToplam(sicil, hariçIkinciOdeme = false) {
  return state.ekstraKesintiler
    .filter((e) => String(e.sicil) === String(sicil)
      && (!hariçIkinciOdeme || !IKINCI_ODEME_KATEGORILERI.includes(e.kategori)))
    .reduce((t, e) => t + (Number(e.tutar) || 0), 0);
}

export function kisiKategoriToplam(sicil, kategori) {
  return state.ekstraKesintiler
    .filter((e) => String(e.sicil) === String(sicil) && e.kategori === kategori)
    .reduce((t, e) => t + (Number(e.tutar) || 0), 0);
}

let secim = { ay: new Date().getMonth(), yil: new Date().getFullYear(), kategori: 'hepsi', arama: '' };

function uid() { return Date.now() + Math.floor(Math.random() * 1000); }

function commit(yeniListe) {
  setState('ekstraKesintiler', yeniListe);            // persist '@ekstra' -> <donem>_ekstra_v1
  saveDonemSlice('ekstraKesintiler', yeniListe);      // güvenli çift yazım
  scheduleSync();
}

function kategoriRozet(kat) {
  const k = EKSTRA_KATEGORILER[kat] || EKSTRA_KATEGORILER.diger;
  return `<span class="badge" style="background:${k.renk}1f;color:${k.renk}">${icon(k.ikon)} ${k.ad}</span>`;
}

// ---------- render ----------

function shellHtml() {
  const katOpsiyonlari = Object.entries(EKSTRA_KATEGORILER)
    .map(([k, v]) => `<option value="${k}">${v.ad}</option>`).join('');
  const yillar = [];
  for (let y = 2024; y <= 2031; y++) yillar.push(`<option value="${y}">${y}</option>`);

  return `
  <div class="page stack">
    <div class="card">
      <div class="card__header">
        <div class="card__title">${icon('receipt')} Yeni Ekstra Kesinti</div>
        <div class="toolbar">
          <button class="btn btn--secondary btn--sm" data-act="excel">${icon('download')} Excel'e Aktar</button>
          <button class="btn btn--secondary btn--sm" data-act="print">${icon('printer')} Yazdır</button>
        </div>
      </div>
      <div class="card__body">
        <form id="ekstraForm" class="form-grid">
          <div class="field" style="grid-column:1/-1">
            <label class="field__label">Personel *</label>
            <input class="input" id="ekstraKisi" list="ekstraKisiListe" placeholder="İsim yaz veya listeden seç..." autocomplete="off">
            <datalist id="ekstraKisiListe"></datalist>
          </div>
          <div class="field">
            <label class="field__label">Tarih *</label>
            <input class="input" type="date" id="ekstraTarih" value="${todayISO()}">
          </div>
          <div class="field">
            <label class="field__label">Tutar (TL) *</label>
            <input class="input" type="number" id="ekstraTutar" min="0" step="0.01" placeholder="0.00">
          </div>
          <div class="field">
            <label class="field__label">Kategori *</label>
            <select class="select" id="ekstraKategori">${katOpsiyonlari}</select>
          </div>
          <div class="field">
            <label class="field__label">Açıklama</label>
            <input class="input" id="ekstraNot" placeholder="Opsiyonel not..." autocomplete="off">
          </div>
          <div class="field" style="justify-content:flex-end">
            <button class="btn btn--primary" type="submit">${icon('plus')} Ekle</button>
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card__header">
        <div class="card__title">${icon('list')} Ekstra Kesinti Listesi</div>
        <div class="card__title" id="ekstraOzet" style="font-weight:600;color:var(--text-muted)"></div>
      </div>
      <div class="card__body" style="padding-bottom:0">
        <div class="toolbar" style="flex-wrap:wrap">
          <select class="select input--sm" id="ekstraAySec">
            ${AYLAR.map((a, i) => `<option value="${i}">${a}</option>`).join('')}
          </select>
          <select class="select input--sm" id="ekstraYilSec">${yillar}</select>
          <select class="select input--sm" id="ekstraKatFiltre">
            <option value="hepsi">Tüm Kategoriler</option>
            ${katOpsiyonlari}
          </select>
          <div class="search" style="flex:1;min-width:160px">
            ${icon('search')}
            <input class="input" id="ekstraArama" placeholder="Kişi veya sicil ara...">
          </div>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th style="width:44px">#</th>
            <th style="width:110px">Tarih</th>
            <th>İsim</th>
            <th style="width:80px">Sicil</th>
            <th style="width:130px">Kategori</th>
            <th style="width:120px;text-align:right">Tutar</th>
            <th>Not</th>
            <th style="width:60px">İşlem</th>
          </tr></thead>
          <tbody id="ekstraTabloBody"></tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function fillDatalist(root) {
  const dl = root.querySelector('#ekstraKisiListe');
  if (!dl) return;
  const sirali = [...state.personeller].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
  dl.innerHTML = sirali.map((p) => `<option value="${esc(`${p.ad} - ${p.sicil}`)}"></option>`).join('');
}

function filteredList() {
  const arama = normalizeTR(secim.arama);
  let liste = state.ekstraKesintiler.filter((e) => {
    const d = gecerliTarih(e.tarih);
    if (!d) return false;
    if (d.getMonth() !== secim.ay || d.getFullYear() !== secim.yil) return false;
    if (secim.kategori !== 'hepsi' && e.kategori !== secim.kategori) return false;
    if (arama) {
      const isim = normalizeTR(e.isim || '');
      const sicil = normalizeTR(String(e.sicil || ''));
      if (!isim.includes(arama) && !sicil.includes(arama)) return false;
    }
    return true;
  });
  liste.sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
  return liste;
}

function drawTable(root) {
  const body = root.querySelector('#ekstraTabloBody');
  const ozet = root.querySelector('#ekstraOzet');
  const liste = filteredList();

  const aylikTum = state.ekstraKesintiler.filter((e) => {
    const d = gecerliTarih(e.tarih);
    return d && d.getMonth() === secim.ay && d.getFullYear() === secim.yil;
  });
  const aylikToplam = aylikTum.reduce((t, e) => t + (Number(e.tutar) || 0), 0);
  const aylikKisi = new Set(aylikTum.map((e) => e.sicil)).size;

  if (ozet) {
    ozet.textContent = aylikTum.length
      ? `${AYLAR[secim.ay]} ${secim.yil} — ${aylikKisi} kişi • ${aylikTum.length} kayıt • ₺${formatTRY(aylikToplam)}`
      : '';
  }

  if (!liste.length) {
    const msg = state.ekstraKesintiler.length === 0 ? 'Henüz ekstra kesinti kaydı yok' : 'Bu filtreye uyan kayıt yok';
    body.innerHTML = `<tr><td colspan="8"><div class="table-empty">${icon('receipt')}<div>${msg}</div></div></td></tr>`;
    return;
  }

  body.innerHTML = liste.map((e, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${formatDate(e.tarih)}</td>
      <td><b>${esc(e.isim)}</b></td>
      <td>${esc(e.sicil)}</td>
      <td>${kategoriRozet(e.kategori)}</td>
      <td class="num" style="color:var(--color-danger);font-weight:800">-₺${formatTRY(e.tutar)}</td>
      <td title="${esc(e.not || '')}">${esc(e.not || '—')}</td>
      <td><button class="icon-btn" data-del="${e.id}" title="Sil">${icon('trash')}</button></td>
    </tr>`).join('');
}

function ekle(root) {
  const kisiMetin = root.querySelector('#ekstraKisi').value.trim();
  const kisi = kisiParse(kisiMetin, state.personeller);
  if (!kisi) { toast('Kişi bulunamadı, listeden seçin', 'error'); return; }
  const tarih = root.querySelector('#ekstraTarih').value;
  if (!tarih) { toast('Tarih gerekli', 'error'); return; }
  const tutar = parseFloat(root.querySelector('#ekstraTutar').value) || 0;
  if (tutar <= 0) { toast('Tutar giriniz', 'error'); return; }
  const kategori = root.querySelector('#ekstraKategori').value;
  const not = root.querySelector('#ekstraNot').value.trim();

  commit([{
    id: uid(),
    sicil: kisi.sicil,
    isim: kisi.isim,
    tarih,
    tutar,
    kategori,
    not,
    olusturmaTarihi: new Date().toISOString(),
  }, ...state.ekstraKesintiler]);

  root.querySelector('#ekstraKisi').value = '';
  root.querySelector('#ekstraTutar').value = '';
  root.querySelector('#ekstraNot').value = '';
  toast(`${kisi.isim} için ₺${formatTRY(tutar)} ekstra kesinti eklendi`, 'success');
}

async function sil(id, root) {
  const e = state.ekstraKesintiler.find((x) => x.id === id);
  if (!e) return;
  const ok = await confirmDialog(`${e.isim} — ₺${formatTRY(e.tutar)} ekstra kesinti silinsin mi?`, { danger: true, okText: 'Sil' });
  if (!ok) return;
  commit(state.ekstraKesintiler.filter((x) => x.id !== id));
  toast('Ekstra kesinti silindi', 'success');
}

function exportExcel() {
  const liste = filteredList();
  if (!liste.length) { toast('Aktarılacak veri yok', 'error'); return; }
  const toplamTutar = liste.reduce((t, e) => t + (Number(e.tutar) || 0), 0);
  let h = `<h2>Ekstra Kesintiler — ${AYLAR[secim.ay]} ${secim.yil}</h2>`;
  h += `<p>${liste.length} kayıt • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th>#</th><th>Tarih</th><th>İsim</th><th>Sicil</th><th>Kategori</th><th>Tutar (TL)</th><th>Not</th></tr></thead><tbody>';
  for (const [i, e] of liste.entries()) {
    const kat = (EKSTRA_KATEGORILER[e.kategori] || EKSTRA_KATEGORILER.diger).ad;
    h += `<tr><td>${i + 1}</td><td>${esc(e.tarih || '-')}</td><td>${esc(e.isim)}</td><td>${esc(e.sicil)}</td>`
      + `<td>${kat}</td><td class="num">${(Number(e.tutar) || 0).toFixed(2)}</td><td>${esc(e.not || '-')}</td></tr>`;
  }
  h += `<tr style="background:#fee2e2;font-weight:bold"><td colspan="5" style="text-align:right">TOPLAM →</td><td class="num">${toplamTutar.toFixed(2)}</td><td></td></tr>`;
  h += '</tbody></table>';
  downloadXls(h, `ERP-UMIT-Ekstra-${AYLAR[secim.ay].toLowerCase()}-${secim.yil}`);
  toast('Excel indirildi', 'success');
}

// ---------- sayfa kaydı ----------

function render(container) {
  ensureDonem();
  container.innerHTML = shellHtml();
  const root = container;

  secim = { ...secim, ay: state.puantaj.ay ?? secim.ay, yil: state.puantaj.yil ?? secim.yil };
  root.querySelector('#ekstraAySec').value = String(secim.ay);
  root.querySelector('#ekstraYilSec').value = String(secim.yil);

  fillDatalist(root);

  root.querySelector('#ekstraForm').addEventListener('submit', (ev) => { ev.preventDefault(); ekle(root); });

  root.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'excel') exportExcel();
    else if (act === 'print') window.print();
    const delId = ev.target.closest('[data-del]')?.dataset.del;
    if (delId) sil(Number(delId), root);
  });

  root.querySelector('#ekstraAySec').addEventListener('change', (ev) => { secim.ay = Number(ev.target.value); drawTable(root); });
  root.querySelector('#ekstraYilSec').addEventListener('change', (ev) => { secim.yil = Number(ev.target.value); drawTable(root); });
  root.querySelector('#ekstraKatFiltre').addEventListener('change', (ev) => { secim.kategori = ev.target.value; drawTable(root); });
  root.querySelector('#ekstraArama').addEventListener('input', (ev) => { secim.arama = ev.target.value; drawTable(root); });

  const unsub1 = subscribe('ekstraKesintiler', () => drawTable(root));
  const unsub2 = subscribe('personeller', () => fillDatalist(root));

  drawTable(root);
  return () => { unsub1(); unsub2(); };
}

registerPage('ekstra', { title: 'Ekstra Kesinti', icon: 'receipt', section: 'Finans' }, render);
