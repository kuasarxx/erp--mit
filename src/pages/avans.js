// ============================================================
// ERP ÜMİT v2 — Avans Sayfası
// Legacy'deki page-avans modülünün modüler karşılığı.
//  - Kişi seçimi: isim veya sicil ile arama (datalist)
//  - Elden / Banka tür ayrımı (SVG rozetler, emoji yok)
//  - Dönem bazlı kalıcılık: umit_erp_<donemId>_avans_v1
//  - Düzenleme modalı, Excel'e aktarma, özet şeridi
// Şema (legacy ile birebir): { id, sicil, isim, tarih, tutar, tur, not, olusturmaTarihi }
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, formatTRY, formatDate, todayISO, normalizeTR } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { openModal, confirmDialog } from '../core/modal.js';
import { ensureDonem, saveDonemSlice } from '../core/donemService.js';
import { scheduleSync } from '../core/syncService.js';

let filtre = ''; // isim / sicil / not üzerinde serbest metin

// ---------- yardımcılar ----------

function uid() { return Date.now() + Math.floor(Math.random() * 1000); }

/** "Ad Soyad - 123" veya tam isim girildiğinde {isim, sicil} çözer. */
function kisiParse(metin) {
  if (!metin) return null;
  const t = String(metin).trim();
  const m = t.match(/^(.+?)\s*-\s*(\S+)$/);
  if (m) return { isim: m[1].trim(), sicil: m[2].trim() };
  const bul = state.personeller.find((p) => normalizeTR(p.ad) === normalizeTR(t));
  if (bul) return { isim: bul.ad, sicil: bul.sicil };
  return null;
}

/** Değişikliği store'a işler, dönem anahtarına yazar, bulutu zamanlar. */
function commitAvans(yeniListe) {
  setState('avanslar', yeniListe);          // persist: '@avans' -> <donem>_avans_v1
  saveDonemSlice('avanslar', yeniListe);    // güvenli çift yazım (aktifDonemId çözümü)
  scheduleSync();
}

function toplam(liste, tur) {
  return liste.filter((a) => (tur ? a.tur === tur : true))
    .reduce((t, a) => t + (Number(a.tutar) || 0), 0);
}

function turRozet(tur) {
  return tur === 'banka'
    ? `<span class="badge badge--info">${icon('building')} Banka</span>`
    : `<span class="badge badge--warn">${icon('banknote')} Elden</span>`;
}

// ---------- render ----------

function shellHtml() {
  return `
  <div class="page stack">
    <div class="card">
      <div class="card__header">
        ${icon('wallet')}
        <div class="card__title">Yeni Avans Ekle</div>
      </div>
      <div class="card__body">
        <form id="avansForm" class="form-grid" autocomplete="off">
          <div class="field" style="grid-column:1/-1">
            <label class="field__label" for="avansKisi">Kişi *</label>
            <input class="input" type="text" id="avansKisi" list="avansKisiListe" placeholder="İsim yaz veya listeden seç...">
            <datalist id="avansKisiListe"></datalist>
          </div>
          <div class="field">
            <label class="field__label" for="avansTarih">Tarih *</label>
            <input class="input" type="date" id="avansTarih" value="${todayISO()}">
          </div>
          <div class="field">
            <label class="field__label" for="avansTutar">Tutar (₺) *</label>
            <input class="input" type="number" id="avansTutar" min="0" step="0.01" placeholder="0.00">
          </div>
          <div class="field">
            <label class="field__label" for="avansTur">Tür *</label>
            <select class="select" id="avansTur">
              <option value="elden">Elden</option>
              <option value="banka">Banka</option>
            </select>
          </div>
          <div class="field">
            <label class="field__label" for="avansNot">Not</label>
            <input class="input" type="text" id="avansNot" placeholder="Örn: araba tamiri, kira...">
          </div>
          <div class="field" style="justify-content:flex-end">
            <div class="toolbar">
              <button class="btn btn--primary" type="submit">${icon('plus')} Avans Ekle</button>
              <button class="btn btn--ghost" type="reset">Temizle</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <div class="card">
      <div class="card__header">
        ${icon('receipt')}
        <div class="card__title">Avans Listesi</div>
        <div class="spacer"></div>
        <input class="input search" id="avansArama" type="search" placeholder="İsim, sicil, not ara..." style="width:240px">
        <button class="btn btn--secondary btn--sm" data-act="excel">${icon('download')} Excel'e Aktar</button>
        <button class="btn btn--ghost btn--sm" data-act="print">${icon('printer')} Yazdır</button>
      </div>
      <div id="avansOzetBar" class="card__body" style="padding-block:var(--space-3)"></div>
      <div class="table-wrap" style="max-height:60vh;overflow:auto">
        <table class="table">
          <thead>
            <tr>
              <th style="width:48px">#</th>
              <th style="width:110px">Tarih</th>
              <th>İsim</th>
              <th style="width:90px">Sicil</th>
              <th style="width:110px">Tür</th>
              <th style="width:130px;text-align:right">Tutar</th>
              <th>Not</th>
              <th style="width:100px">İşlem</th>
            </tr>
          </thead>
          <tbody id="avansBody"></tbody>
        </table>
      </div>
    </div>
  </div>`;
}

function drawOzet(body) {
  const el = body.querySelector('#avansOzetBar');
  const liste = filtered();
  const elden = toplam(liste, 'elden');
  const banka = toplam(liste, 'banka');
  const kisi = new Set(liste.map((a) => String(a.sicil))).size;
  el.innerHTML = `
    <div class="daybar__content" style="margin-left:0">
      <span class="chip chip--muted">${icon('receipt')} <b>${liste.length}</b>&nbsp;kayıt</span>
      <span class="chip chip--muted">${icon('users')} <b>${kisi}</b>&nbsp;kişi</span>
      <span class="chip chip--warn">${icon('banknote')} Elden: <b>${formatTRY(elden)}</b></span>
      <span class="chip chip--info">${icon('building')} Banka: <b>${formatTRY(banka)}</b></span>
      <span class="chip chip--ok">${icon('wallet')} Toplam: <b>${formatTRY(elden + banka)}</b></span>
    </div>`;
}

function filtered() {
  const liste = [...state.avanslar].sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
  if (!filtre) return liste;
  const q = normalizeTR(filtre);
  return liste.filter((a) =>
    ['isim', 'sicil', 'not'].some((f) => normalizeTR(a[f]).includes(q)));
}

function drawTable(body) {
  const tbody = body.querySelector('#avansBody');
  const liste = filtered();
  if (!liste.length) {
    tbody.innerHTML = `<tr><td colspan="8">
      <div class="empty-state">
        ${icon('wallet')}
        <h3>${state.avanslar.length ? 'Aramaya uyan avans yok' : 'Henüz avans kaydı yok'}</h3>
        <p>${state.avanslar.length ? 'Filtreyi temizlemeyi deneyin.' : 'Yukarıdaki formu kullanarak avans ekleyin.'}</p>
      </div></td></tr>`;
    return;
  }
  tbody.innerHTML = liste.map((a, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td style="white-space:nowrap">${formatDate(a.tarih)}</td>
      <td><b>${esc(a.isim)}</b></td>
      <td>${esc(a.sicil)}</td>
      <td>${turRozet(a.tur)}</td>
      <td class="num" style="text-align:right;font-weight:700">${formatTRY(a.tutar)}</td>
      <td title="${esc(a.not || '')}" style="max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(a.not || '—')}</td>
      <td>
        <div class="toolbar">
          <button class="icon-btn" data-edit="${a.id}" title="Düzenle" aria-label="Düzenle">${icon('edit')}</button>
          <button class="icon-btn" data-del="${a.id}" title="Sil" aria-label="Sil">${icon('trash')}</button>
        </div>
      </td>
    </tr>`).join('');
}

function fillDatalist(body) {
  const dl = body.querySelector('#avansKisiListe');
  const sirali = [...state.personeller].sort((a, b) => String(a.ad).localeCompare(String(b.ad), 'tr'));
  dl.innerHTML = sirali
    .map((p) => `<option value="${esc(`${p.ad} - ${p.sicil}`)}"></option>`)
    .join('');
}

function drawAll(body) {
  drawOzet(body);
  drawTable(body);
}

// ---------- ekleme / düzenleme / silme ----------

function ekle(body) {
  const kisiMetin = body.querySelector('#avansKisi').value;
  const kisi = kisiParse(kisiMetin);
  if (!kisi) { toast('Kişi bulunamadı, listeden seçin', 'error'); return false; }
  const tarih = body.querySelector('#avansTarih').value;
  if (!tarih) { toast('Tarih gerekli', 'error'); return false; }
  const tutar = parseFloat(body.querySelector('#avansTutar').value) || 0;
  if (tutar <= 0) { toast('Tutar giriniz', 'error'); return false; }
  const tur = body.querySelector('#avansTur').value;
  const not = body.querySelector('#avansNot').value.trim();

  commitAvans([...state.avanslar, {
    id: uid(), sicil: kisi.sicil, isim: kisi.isim,
    tarih, tutar, tur, not, olusturmaTarihi: new Date().toISOString(),
  }]);

  body.querySelector('#avansKisi').value = '';
  body.querySelector('#avansTutar').value = '';
  body.querySelector('#avansNot').value = '';
  setTimeout(() => body.querySelector('#avansKisi')?.focus(), 50);
  toast(`${kisi.isim} için ${formatTRY(tutar)} avans eklendi`, 'success');
  return false; // form submit'ini engelle
}

function duzenle(id, body) {
  const a = state.avanslar.find((x) => x.id === id);
  if (!a) return;
  const m = openModal({
    title: 'Avansı Düzenle',
    body: `
      <div class="stack-sm">
        <div class="hint"><b>${esc(a.isim)}</b> • Sicil: <b>${esc(a.sicil)}</b></div>
        <div class="form-grid">
          <div class="field"><label class="field__label">Tarih</label>
            <input class="input" type="date" id="mdTarih" value="${esc(a.tarih)}"></div>
          <div class="field"><label class="field__label">Tutar (₺)</label>
            <input class="input" type="number" id="mdTutar" min="0" step="0.01" value="${Number(a.tutar) || 0}"></div>
          <div class="field"><label class="field__label">Tür</label>
            <select class="select" id="mdTur">
              <option value="elden"${a.tur !== 'banka' ? ' selected' : ''}>Elden</option>
              <option value="banka"${a.tur === 'banka' ? ' selected' : ''}>Banka</option>
            </select></div>
          <div class="field"><label class="field__label">Not</label>
            <input class="input" type="text" id="mdNot" value="${esc(a.not || '')}"></div>
        </div>
      </div>`,
    footer: `
      <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
      <button class="btn btn--primary" data-kaydet>${icon('save')} Kaydet</button>`,
  });
  m.el.querySelector('[data-kaydet]').addEventListener('click', () => {
    const tarih = m.el.querySelector('#mdTarih').value;
    const tutar = parseFloat(m.el.querySelector('#mdTutar').value) || 0;
    if (!tarih) { toast('Tarih gerekli', 'error'); return; }
    if (tutar <= 0) { toast('Tutar giriniz', 'error'); return; }
    commitAvans(state.avanslar.map((x) => x.id === id
      ? { ...x, tarih, tutar, tur: m.el.querySelector('#mdTur').value, not: m.el.querySelector('#mdNot').value.trim() }
      : x));
    m.close();
    drawAll(body);
    toast('Avans güncellendi', 'success');
  });
}

async function sil(id, body) {
  const a = state.avanslar.find((x) => x.id === id);
  if (!a) return;
  const ok = await confirmDialog(`${a.isim} — ${formatTRY(a.tutar)} tutarlı avans silinsin mi?`, { danger: true, okText: 'Sil' });
  if (!ok) return;
  commitAvans(state.avanslar.filter((x) => x.id !== id));
  drawAll(body);
  toast('Avans silindi', 'success');
}

// ---------- excel ----------

function exportExcel() {
  const liste = [...state.avanslar].sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
  if (!liste.length) { toast('Aktarılacak veri yok', 'error'); return; }
  let h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>'
    + 'table{border-collapse:collapse;font-family:Arial;font-size:12px;width:100%}'
    + 'th{background:#0c4a6e;color:#fff;padding:10px 8px;border:1px solid #333;text-align:left}'
    + 'td{padding:8px;border:1px solid #ccc}td.num{text-align:right;font-weight:bold}'
    + '</style></head><body>';
  h += `<h2>Avans Listesi — ${esc(state.aktifDonemId || '')}</h2>`;
  h += `<p>${liste.length} kayıt • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th>#</th><th>Tarih</th><th>İsim</th><th>Sicil</th><th>Tür</th><th>Tutar (TL)</th><th>Not</th></tr></thead><tbody>';
  for (const [i, a] of liste.entries()) {
    h += `<tr><td>${i + 1}</td><td>${esc(a.tarih || '-')}</td><td>${esc(a.isim)}</td><td>${esc(a.sicil)}</td>`
      + `<td>${a.tur === 'banka' ? 'Banka' : 'Elden'}</td><td class="num">${(Number(a.tutar) || 0).toFixed(2)}</td>`
      + `<td>${esc(a.not || '-')}</td></tr>`;
  }
  h += `<tr style="background:#e0f2fe;font-weight:bold"><td colspan="5" style="text-align:right">Elden: ${(toplam(liste, 'elden')).toFixed(2)} • Banka: ${(toplam(liste, 'banka')).toFixed(2)} • TOPLAM →</td>`
    + `<td class="num">${(toplam(liste)).toFixed(2)}</td><td></td></tr>`;
  h += '</tbody></table></body></html>';
  const blob = new Blob(['\ufeff' + h], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `avans-${state.aktifDonemId || todayISO()}.xls`;
  link.click();
  URL.revokeObjectURL(url);
  toast('Excel indirildi', 'success');
}

// ---------- sayfa kaydı ----------

function render(container) {
  ensureDonem(); // aktif dönemin avans dilimini store'a yükler
  container.innerHTML = shellHtml();
  const body = container;

  fillDatalist(body);

  body.querySelector('#avansForm').addEventListener('submit', (e) => {
    e.preventDefault();
    ekle(body);
  });

  body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'excel') exportExcel();
    else if (act === 'print') window.print();

    const editId = e.target.closest('[data-edit]')?.dataset.edit;
    if (editId) duzenle(Number(editId), body);

    const delId = e.target.closest('[data-del]')?.dataset.del;
    if (delId) sil(Number(delId), body);
  });

  body.querySelector('#avansArama').addEventListener('input', (e) => {
    filtre = e.target.value;
    drawTable(body);
  });

  // Personel listesi değişince datalist yenilenir; avans değişince tablo
  const unsub1 = subscribe('avanslar', () => drawAll(body));
  const unsub2 = subscribe('personeller', () => fillDatalist(body));

  drawAll(body);
  return () => { unsub1(); unsub2(); };
}

registerPage('avans', { title: 'Avans', icon: 'wallet', section: 'Finans' }, render);
