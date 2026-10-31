// ============================================================
// ERP ÜMİT v2 — Gemi Takip Sayfası
// Legacy'deki page-gemi modülünün modüler karşılığı.
//  - İki sekme: Gemi Yevmiye (adet) + Götürü (TL)
//  - Her gemi tek kayıt: aynı ad tekrar eklenirse "güncellensin mi?" sorulur
//  - Dönem bazlı kalıcılık: umit_erp_<donemId>_gemi_v1 ({gemiler, goturuler})
// Şemalar (legacy ile birebir):
//   gemiler:  [{ id, ad, yevmiye, tarih, not, olusturma }]
//   goturuler:[{ id, ad, tutar,  tarih, not, olusturma }]
// ============================================================

import { registerPage } from '../core/router.js';
import { state, touch, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, formatTRY, downloadXls } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { confirmDialog } from '../core/modal.js';
import { saveDonemSlice } from '../core/donemService.js';
import { scheduleSync } from '../core/syncService.js';

let aktifSekme = 'yevmiye'; // 'yevmiye' | 'goturu'

function uid() { return Date.now() + Math.floor(Math.random() * 1000); }

function tarihSlug() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Store değişikliğini dönem anahtarına yaz + bulutu zamanla. */
function commitGemi() {
  touch('gemi');                    // persist: '@gemi' -> <donem>_gemi_v1
  saveDonemSlice('gemi', state.gemi);
  scheduleSync();
}

// ---------- yevmiye işlemleri ----------

function yevmiyeEkle(root) {
  const ad = root.querySelector('#gYevAd').value.trim();
  const yevmiye = parseFloat(root.querySelector('#gYevSayi').value);
  const tarih = root.querySelector('#gYevTarih').value;
  const not = root.querySelector('#gYevNot').value.trim();

  if (!ad) { toast('Gemi adı gerekli', 'error'); return; }
  if (isNaN(yevmiye) || yevmiye < 0) { toast('Geçerli bir yevmiye gir', 'error'); return; }

  const ayni = state.gemi.gemiler.find((g) => g.ad.toLowerCase() === ad.toLowerCase());
  if (ayni) {
    confirmDialog(`"${ad}" gemisi zaten kayıtlı. Değeri güncellensin mi?`)
      .then((ok) => {
        if (!ok) return;
        ayni.yevmiye = yevmiye;
        ayni.tarih = tarih;
        ayni.not = not;
        commitGemi();
        toast(`${ad} güncellendi`, 'success');
      });
    return;
  }
  state.gemi.gemiler.push({ id: uid(), ad, yevmiye, tarih, not, olusturma: new Date().toISOString() });
  commitGemi();
  toast(`${ad} eklendi`, 'success');
}

async function yevmiyeSil(id, root) {
  const g = state.gemi.gemiler.find((x) => x.id === id);
  if (!g) return;
  const ok = await confirmDialog(`${g.ad} yevmiye kaydı silinsin mi?`, { danger: true, okText: 'Sil' });
  if (!ok) return;
  state.gemi.gemiler = state.gemi.gemiler.filter((x) => x.id !== id);
  commitGemi();
  toast('Kayıt silindi', 'success');
}

function yevmiyeDuzenle(id, root) {
  const g = state.gemi.gemiler.find((x) => x.id === id);
  if (!g) return;
  root.querySelector('#gYevAd').value = g.ad || '';
  root.querySelector('#gYevSayi').value = g.yevmiye ?? '';
  root.querySelector('#gYevTarih').value = g.tarih || '';
  root.querySelector('#gYevNot').value = g.not || '';
  // düzenleme modu: ekle butonu güncelleme yapsın
  root.querySelector('#gYevEditId').value = String(id);
  root.querySelector('#gYevEkleBtn').innerHTML = `${icon('save')} Güncelle`;
  root.querySelector('#gYevAd').focus();
}

// ---------- götürü işlemleri ----------

function goturuEkle(root) {
  const ad = root.querySelector('#gGotAd').value.trim();
  const tutar = parseFloat(root.querySelector('#gGotTutar').value);
  const tarih = root.querySelector('#gGotTarih').value;
  const not = root.querySelector('#gGotNot').value.trim();

  if (!ad) { toast('Gemi adı gerekli', 'error'); return; }
  if (isNaN(tutar) || tutar <= 0) { toast('Geçerli bir tutar gir', 'error'); return; }

  const ayni = state.gemi.goturuler.find((g) => g.ad.toLowerCase() === ad.toLowerCase());
  if (ayni) {
    confirmDialog(`"${ad}" götürü kaydı zaten var. Tutar güncellensin mi?`)
      .then((ok) => {
        if (!ok) return;
        ayni.tutar = tutar;
        ayni.tarih = tarih;
        ayni.not = not;
        commitGemi();
        toast(`${ad} güncellendi`, 'success');
      });
    return;
  }
  state.gemi.goturuler.push({ id: uid(), ad, tutar, tarih, not, olusturma: new Date().toISOString() });
  commitGemi();
  toast(`${ad} eklendi`, 'success');
}

async function goturuSil(id, root) {
  const g = state.gemi.goturuler.find((x) => x.id === id);
  if (!g) return;
  const ok = await confirmDialog(`${g.ad} götürü kaydı silinsin mi?`, { danger: true, okText: 'Sil' });
  if (!ok) return;
  state.gemi.goturuler = state.gemi.goturuler.filter((x) => x.id !== id);
  commitGemi();
  toast('Kayıt silindi', 'success');
}

function goturuDuzenle(id, root) {
  const g = state.gemi.goturuler.find((x) => x.id === id);
  if (!g) return;
  root.querySelector('#gGotAd').value = g.ad || '';
  root.querySelector('#gGotTutar').value = g.tutar ?? '';
  root.querySelector('#gGotTarih').value = g.tarih || '';
  root.querySelector('#gGotNot').value = g.not || '';
  root.querySelector('#gGotEditId').value = String(id);
  root.querySelector('#gGotEkleBtn').innerHTML = `${icon('save')} Güncelle`;
  root.querySelector('#gGotAd').focus();
}

// ---------- excel ----------

function yevmiyeExcel() {
  const gemiler = state.gemi.gemiler;
  if (!gemiler.length) { toast('Aktarılacak veri yok', 'error'); return; }
  let h = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>';
  h += 'table{border-collapse:collapse;font-family:Arial;font-size:12px;width:100%}';
  h += 'th{background:#0c4a6e;color:#fff;font-weight:bold;padding:10px 8px;border:1px solid #333;text-align:left}';
  h += 'td{padding:8px;border:1px solid #ccc;text-align:left}';
  h += 'td.num{text-align:right;font-weight:bold;color:#0284c7}';
  h += 'td.tarih{text-align:center;color:#666}';
  h += '</style></head><body>';
  h += `<h2 style="color:#0c4a6e">Gemi Yevmiye Listesi</h2>`;
  h += `<p style="font-size:11px;color:#666">Toplam ${gemiler.length} gemi • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th style="width:50px;">#</th><th>Gemi Adı</th><th style="width:130px;">Yevmiye</th><th style="width:130px;">Tarih</th><th>Not</th></tr></thead><tbody>';
  const sirali = [...gemiler].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
  let toplam = 0;
  sirali.forEach((g, i) => {
    toplam += Number(g.yevmiye) || 0;
    h += `<tr><td>${i + 1}</td><td>${esc(g.ad)}</td><td class="num">${parseFloat(Number(g.yevmiye).toFixed(2))}</td>`;
    h += `<td class="tarih">${esc(g.tarih || '-')}</td><td>${esc(g.not || '-')}</td></tr>`;
  });
  h += `<tr style="background:#f1f5f9;font-weight:bold;"><td colspan="2" style="text-align:right;">TOPLAM →</td>`;
  h += `<td class="num" style="font-size:14px;background:#dcfce7;color:#16a34a;">${parseFloat(toplam.toFixed(2))}</td><td colspan="2"></td></tr>`;
  h += '</tbody></table></body></html>';
  downloadXls(h, `Gemi-Yevmiye-${tarihSlug()}.xls`);
  toast('Gemi yevmiye Excel indirildi', 'success');
}

function goturuExcel() {
  const goturuler = state.gemi.goturuler;
  if (!goturuler.length) { toast('Aktarılacak veri yok', 'error'); return; }
  let h = '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"><style>';
  h += 'table{border-collapse:collapse;font-family:Arial;font-size:12px;width:100%}';
  h += 'th{background:#16a34a;color:#fff;font-weight:bold;padding:10px 8px;border:1px solid #333;text-align:left}';
  h += 'td{padding:8px;border:1px solid #ccc;text-align:left}';
  h += 'td.tutar{text-align:right;font-weight:bold;color:#16a34a}';
  h += 'td.tarih{text-align:center;color:#666}';
  h += '</style></head><body>';
  h += '<h2 style="color:#16a34a">Götürü Listesi</h2>';
  h += `<p style="font-size:11px;color:#666">Toplam ${goturuler.length} gemi • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th style="width:50px;">#</th><th>Gemi Adı</th><th style="width:150px;">Tutar (TL)</th><th style="width:130px;">Tarih</th><th>Not</th></tr></thead><tbody>';
  const sirali = [...goturuler].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
  let toplam = 0;
  sirali.forEach((g, i) => {
    toplam += Number(g.tutar) || 0;
    h += `<tr><td>${i + 1}</td><td>${esc(g.ad)}</td><td class="tutar">${parseFloat(Number(g.tutar).toFixed(2))}</td>`;
    h += `<td class="tarih">${esc(g.tarih || '-')}</td><td>${esc(g.not || '-')}</td></tr>`;
  });
  h += `<tr style="background:#f1f5f9;font-weight:bold;"><td colspan="2" style="text-align:right;">TOPLAM →</td>`;
  h += `<td class="tutar" style="font-size:14px;background:#dcfce7;">${parseFloat(toplam.toFixed(2))}</td><td colspan="2"></td></tr>`;
  h += '</tbody></table></body></html>';
  downloadXls(h, `Goturu-${tarihSlug()}.xls`);
  toast('Götürü Excel indirildi', 'success');
}

// ---------- render ----------

function islemBtnlar(actPrefix, id) {
  return `
    <button class="btn btn--secondary btn--sm" data-act="${actPrefix}-duzenle" data-id="${id}">${icon('edit')} Düzenle</button>
    <button class="btn btn--danger btn--sm" data-act="${actPrefix}-sil" data-id="${id}" title="Sil">${icon('trash')}</button>`;
}

function yevmiyeTabloHtml() {
  const liste = [...state.gemi.gemiler].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
  const toplam = liste.reduce((t, g) => t + (Number(g.yevmiye) || 0), 0);
  if (!liste.length) {
    return '<tr><td colspan="6" class="empty-state">Henüz yevmiye kaydı yok.</td></tr>';
  }
  return liste.map((g, i) => `
    <tr>
      <td class="muted center">${i + 1}</td>
      <td class="left strong">${esc(g.ad)}</td>
      <td class="num k-mavi">${parseFloat(Number(g.yevmiye || 0).toFixed(2))}</td>
      <td class="center muted">${esc(g.tarih || '-')}</td>
      <td class="left">${esc(g.not || '')}</td>
      <td class="center nowrap">${islemBtnlar('yev', g.id)}</td>
    </tr>`).join('')
    + `<tr class="total-row"><td colspan="2" class="right strong">TOPLAM →</td><td class="num k-yesil strong">${parseFloat(toplam.toFixed(2))}</td><td colspan="3"></td></tr>`;
}

function goturuTabloHtml() {
  const liste = [...state.gemi.goturuler].sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
  const toplam = liste.reduce((t, g) => t + (Number(g.tutar) || 0), 0);
  if (!liste.length) {
    return '<tr><td colspan="6" class="empty-state">Henüz götürü kaydı yok.</td></tr>';
  }
  return liste.map((g, i) => `
    <tr>
      <td class="muted center">${i + 1}</td>
      <td class="left strong">${esc(g.ad)}</td>
      <td class="num k-yesil">${formatTRY(g.tutar)}</td>
      <td class="center muted">${esc(g.tarih || '-')}</td>
      <td class="left">${esc(g.not || '')}</td>
      <td class="center nowrap">${islemBtnlar('got', g.id)}</td>
    </tr>`).join('')
    + `<tr class="total-row"><td colspan="2" class="right strong">TOPLAM →</td><td class="num k-yesil strong">${formatTRY(toplam)}</td><td colspan="3"></td></tr>`;
}

function draw(root) {
  // Sekme durumu
  root.querySelectorAll('.sekme-btn').forEach((b) => {
    b.classList.toggle('aktif', b.dataset.sekme === aktifSekme);
  });
  root.querySelectorAll('.sekme-icerik').forEach((el) => {
    el.classList.toggle('aktif', el.dataset.sekme === aktifSekme);
  });
  // Tablolar + özetler
  root.querySelector('#gYevBody').innerHTML = yevmiyeTabloHtml();
  root.querySelector('#gGotBody').innerHTML = goturuTabloHtml();
  const yevTop = state.gemi.gemiler.reduce((t, g) => t + (Number(g.yevmiye) || 0), 0);
  const gotTop = state.gemi.goturuler.reduce((t, g) => t + (Number(g.tutar) || 0), 0);
  root.querySelector('#gYevOzet').textContent =
    `${state.gemi.gemiler.length} gemi • Toplam ${parseFloat(yevTop.toFixed(2))} yevmiye`;
  root.querySelector('#gGotOzet').textContent =
    `${state.gemi.goturuler.length} gemi • Toplam ${formatTRY(gotTop)}`;
}

function formTemizle(root, onlar) {
  onlar.forEach((sel) => { const el = root.querySelector(sel); if (el) el.value = ''; });
}

function shellHtml() {
  return `
  <div class="page stack">
    <div class="card info-card">
      <b>Kullanım:</b> Hangi gemiye kaç yevmiye harcandı ve ne kadar götürü (TL) var — tek yerden takip.
      Aynı gemi adını tekrar eklersen sistem güncellemeyi sorar. Her dönemin kendi gemi listesi vardır.
    </div>

    <div class="sekme-bar">
      <button class="sekme-btn aktif" data-sekme="yevmiye">${icon('ship')} Gemi Yevmiye</button>
      <button class="sekme-btn" data-sekme="goturu">${icon('banknote')} Götürü</button>
      <span class="spacer"></span>
      <button class="btn btn--secondary btn--sm" data-act="yev-excel">${icon('download')} Yevmiye Excel</button>
      <button class="btn btn--secondary btn--sm print-btn" data-act="print">${icon('printer')} Yazdır</button>
      <button class="btn btn--secondary btn--sm" data-act="got-excel">${icon('download')} Götürü Excel</button>
    </div>

    <!-- SEKME 1: YEVMİYE -->
    <div class="sekme-icerik aktif" data-sekme="yevmiye">
      <div class="card">
        <div class="card__header"><span class="card__title">${icon('plus')} Yeni Gemi Yevmiye Kaydı</span></div>
        <div class="card__body">
          <input type="hidden" id="gYevEditId" value="">
          <div class="form-grid">
            <div class="field">
              <label class="field__label" for="gYevAd">Gemi Adı *</label>
              <input type="text" class="input" id="gYevAd" placeholder="Örn: M/V ANKARA" autocomplete="off">
            </div>
            <div class="field">
              <label class="field__label" for="gYevSayi">Yevmiye *</label>
              <input type="number" class="input" id="gYevSayi" min="0" step="0.5" placeholder="0">
            </div>
            <div class="field">
              <label class="field__label" for="gYevTarih">Tarih</label>
              <input type="date" class="input" id="gYevTarih">
            </div>
            <div class="field">
              <label class="field__label" for="gYevNot">Not</label>
              <input type="text" class="input" id="gYevNot" placeholder="Opsiyonel" autocomplete="off">
            </div>
          </div>
          <div class="row mt-2">
            <button class="btn btn--primary" id="gYevEkleBtn">${icon('plus')} Ekle</button>
            <button class="btn btn--secondary" data-act="yev-temizle">Temizle</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <span class="card__title">${icon('list')} Gemi Yevmiye Listesi</span>
          <span class="chip chip--info" id="gYevOzet"></span>
        </div>
        <div class="card__body table-wrap tall">
          <table class="table">
            <thead><tr>
              <th style="width:50px;">#</th><th>Gemi Adı</th>
              <th style="width:130px;">Yevmiye</th><th style="width:120px;">Tarih</th>
              <th>Not</th><th style="width:170px;">İşlem</th>
            </tr></thead>
            <tbody id="gYevBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- SEKME 2: GÖTÜRÜ -->
    <div class="sekme-icerik" data-sekme="goturu">
      <div class="card">
        <div class="card__header"><span class="card__title">${icon('plus')} Yeni Götürü Kaydı</span></div>
        <div class="card__body">
          <input type="hidden" id="gGotEditId" value="">
          <div class="form-grid">
            <div class="field">
              <label class="field__label" for="gGotAd">Gemi Adı *</label>
              <input type="text" class="input" id="gGotAd" placeholder="Örn: M/V ANKARA" autocomplete="off">
            </div>
            <div class="field">
              <label class="field__label" for="gGotTutar">Tutar (TL) *</label>
              <input type="number" class="input" id="gGotTutar" min="0" step="0.01" placeholder="0.00">
            </div>
            <div class="field">
              <label class="field__label" for="gGotTarih">Tarih</label>
              <input type="date" class="input" id="gGotTarih">
            </div>
            <div class="field">
              <label class="field__label" for="gGotNot">Not</label>
              <input type="text" class="input" id="gGotNot" placeholder="Opsiyonel" autocomplete="off">
            </div>
          </div>
          <div class="row mt-2">
            <button class="btn btn--primary" id="gGotEkleBtn">${icon('plus')} Ekle</button>
            <button class="btn btn--secondary" data-act="got-temizle">Temizle</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <span class="card__title">${icon('list')} Götürü Listesi</span>
          <span class="chip chip--ok" id="gGotOzet"></span>
        </div>
        <div class="card__body table-wrap tall">
          <table class="table">
            <thead><tr>
              <th style="width:50px;">#</th><th>Gemi Adı</th>
              <th style="width:150px;">Tutar (TL)</th><th style="width:120px;">Tarih</th>
              <th>Not</th><th style="width:170px;">İşlem</th>
            </tr></thead>
            <tbody id="gGotBody"></tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;
}

// ---------- mount ----------

registerPage({
  id: 'gemi',
  title: 'Gemi Takip',
  subtitle: 'Gemi yevmiye ve götürü takibi (dönem bazlı)',
  icon: 'ship',
  mount(root) {
    root.innerHTML = shellHtml();

    const submitYev = () => {
      const editId = root.querySelector('#gYevEditId').value;
      if (editId) {
        // güncelleme modu
        const g = state.gemi.gemiler.find((x) => String(x.id) === editId);
        const ad = root.querySelector('#gYevAd').value.trim();
        const yevmiye = parseFloat(root.querySelector('#gYevSayi').value);
        if (!g) { formTemizle(root, ['#gYevEditId']); return; }
        if (!ad) { toast('Gemi adı gerekli', 'error'); return; }
        if (isNaN(yevmiye) || yevmiye < 0) { toast('Geçerli bir yevmiye gir', 'error'); return; }
        g.ad = ad;
        g.yevmiye = yevmiye;
        g.tarih = root.querySelector('#gYevTarih').value;
        g.not = root.querySelector('#gYevNot').value.trim();
        commitGemi();
        formTemizle(root, ['#gYevEditId']);
        root.querySelector('#gYevEkleBtn').innerHTML = `${icon('plus')} Ekle`;
        toast(`${ad} güncellendi`, 'success');
      } else {
        yevmiyeEkle(root);
      }
      formTemizle(root, ['#gYevAd', '#gYevSayi', '#gYevTarih', '#gYevNot']);
    };

    const submitGot = () => {
      const editId = root.querySelector('#gGotEditId').value;
      if (editId) {
        const g = state.gemi.goturuler.find((x) => String(x.id) === editId);
        const ad = root.querySelector('#gGotAd').value.trim();
        const tutar = parseFloat(root.querySelector('#gGotTutar').value);
        if (!g) { formTemizle(root, ['#gGotEditId']); return; }
        if (!ad) { toast('Gemi adı gerekli', 'error'); return; }
        if (isNaN(tutar) || tutar <= 0) { toast('Geçerli bir tutar gir', 'error'); return; }
        g.ad = ad;
        g.tutar = tutar;
        g.tarih = root.querySelector('#gGotTarih').value;
        g.not = root.querySelector('#gGotNot').value.trim();
        commitGemi();
        formTemizle(root, ['#gGotEditId']);
        root.querySelector('#gGotEkleBtn').innerHTML = `${icon('plus')} Ekle`;
        toast(`${ad} güncellendi`, 'success');
      } else {
        goturuEkle(root);
      }
      formTemizle(root, ['#gGotAd', '#gGotTutar', '#gGotTarih', '#gGotNot']);
    };

    root.addEventListener('click', (e) => {
      const sekmeBtn = e.target.closest('.sekme-btn');
      if (sekmeBtn) { aktifSekme = sekmeBtn.dataset.sekme; draw(root); return; }

      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      const idRaw = e.target.closest('[data-id]')?.dataset.id;
      const id = idRaw ? (/^\d+$/.test(idRaw) ? Number(idRaw) : idRaw) : null;

      switch (act) {
        case 'yev-excel': yevmiyeExcel(); break;
        case 'got-excel': goturuExcel(); break;
        case 'print': window.print(); break;
        case 'yev-temizle':
          formTemizle(root, ['#gYevAd', '#gYevSayi', '#gYevTarih', '#gYevNot', '#gYevEditId']);
          root.querySelector('#gYevEkleBtn').innerHTML = `${icon('plus')} Ekle`;
          break;
        case 'got-temizle':
          formTemizle(root, ['#gGotAd', '#gGotTutar', '#gGotTarih', '#gGotNot', '#gGotEditId']);
          root.querySelector('#gGotEkleBtn').innerHTML = `${icon('plus')} Ekle`;
          break;
        case 'yev-duzenle': yevmiyeDuzenle(id, root); break;
        case 'got-duzenle': goturuDuzenle(id, root); break;
        case 'yev-sil': yevmiyeSil(id, root); break;
        case 'got-sil': goturuSil(id, root); break;
      }
    });

    root.querySelector('#gYevEkleBtn').addEventListener('click', submitYev);
    root.querySelector('#gGotEkleBtn').addEventListener('click', submitGot);

    // Enter ile hızlı kayıt
    const enterHizli = (ids, fn) => ids.forEach((sel) => {
      root.querySelector(sel).addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); fn(); }
      });
    });
    enterHizli(['#gYevAd', '#gYevSayi', '#gYevNot'], submitYev);
    enterHizli(['#gGotAd', '#gGotTutar', '#gGotNot'], submitGot);

    const unsub = subscribe('gemi', () => draw(root));

    draw(root);
    return () => { unsub(); };
  },
});
