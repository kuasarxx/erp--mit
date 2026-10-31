// ============================================================
// ERP ÜMİT v2 — İcra Takip Sayfası
// Legacy page-icra modülünün modüler karşılığı (emoji yok, SVG ikon).
//  - Kart ızgarası: dosya no, avatar, tutar dörtlüsü, ilerleme çubuğu
//  - Durum motoru: bos / devam / az_kaldi / tamamlandi
//  - Kalan ay + tahmini bitiş tarihi (aylık kesintiye göre)
//  - Ödeme ekle/sil (ödeme geçmişi modalı ile)
//  - Dönem bazlı kalıcılık: umit_erp_<donemId>_icra_v1
// Şema (legacy ile birebir):
// { id, sicil, isim, toplamTutar, odenenTutar, aylikKesinti,
//   baslangicTarihi, dosyaNo, aciklama, odemeler:[{tarih,tutar,not,olusturma}], olusturma }
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, formatTRY, kisiParse, gecerliTarih, downloadXls } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { openModal, closeModal, confirmDialog } from '../core/modal.js';
import { scheduleSync } from '../core/syncService.js';

/* ─── HESAP MOTORU (legacy ile aynı) ─── */
export function icraKalan(i) {
  return Math.max(0, (Number(i.toplamTutar) || 0) - (Number(i.odenenTutar) || 0));
}

export function icraKalanAy(i) {
  const kalan = icraKalan(i);
  const aylik = Number(i.aylikKesinti) || 0;
  if (aylik <= 0 || kalan <= 0) return 0;
  return Math.ceil(kalan / aylik);
}

export function icraBitisTarihi(i) {
  const ay = icraKalanAy(i);
  if (ay === 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() + ay);
  return d;
}

/** @returns {{tip:string, metin:string, renk:string, ikon:string}} */
export function icraDurum(i) {
  const kalan = icraKalan(i);
  const toplam = Number(i.toplamTutar) || 0;
  if (toplam === 0) return { tip: 'bos', metin: 'BORÇ YOK', renk: 'var(--muted)', ikon: 'info' };
  if (kalan === 0) return { tip: 'tamamlandi', metin: 'TAMAMLANDI', renk: '#16a34a', ikon: 'check' };
  const oran = (1 - kalan / toplam) * 100;
  if (oran >= 75) return { tip: 'az_kaldi', metin: 'AZ KALDI', renk: '#f59e0b', ikon: 'zap' };
  return { tip: 'devam', metin: 'DEVAM EDİYOR', renk: '#dc2626', ikon: 'clock' };
}

function uid() { return Date.now() + Math.floor(Math.random() * 1000); }

function commit(yeniListe) {
  setState('icralar', yeniListe);   // persist '@icra' -> <donem>_icra_v1
  scheduleSync();
}

function basHarfler(isim) {
  return String(isim || '?')
    .trim().split(/\s+/).slice(0, 2)
    .map((k) => k.charAt(0).toLocaleUpperCase('tr-TR'))
    .join('');
}

function paraStr(n) { return '₺' + formatTRY(Number(n) || 0); }

let container = null;
let duzenlenenId = null;   // null = yeni kayıt
let aktifOdemeId = null;   // ödeme modalının icra id'si

/* ─── RENDER ─── */
function render() {
  if (!container) return;
  const liste = state.icralar;

  // Özet şeridi
  const toplamBorc = liste.reduce((t, i) => t + (Number(i.toplamTutar) || 0), 0);
  const toplamOdenen = liste.reduce((t, i) => t + (Number(i.odenenTutar) || 0), 0);
  const toplamKalan = Math.max(0, toplamBorc - toplamOdenen);
  const tamamlanan = liste.filter((i) => icraKalan(i) === 0 && (Number(i.toplamTutar) || 0) > 0).length;

  let h = `<div class="card">
    <div class="card__header">
      <div class="card__title">${icon('scale')} İcra Takip</div>
      <div class="toolbar">
        <button class="btn btn--secondary" data-act="excel">${icon('download')} Excel'e Aktar</button>
        <button class="btn btn--primary" data-act="yeni">${icon('plus')} Yeni İcra Ekle</button>
      </div>
    </div>
    <div class="summary-bar">
      <span>Borçlu: <b>${liste.length}</b></span>
      <span>Toplam Borç: <b>₺${formatTRY(toplamBorc)}</b></span>
      <span>Ödenen: <b style="color:var(--color-success)">₺${formatTRY(toplamOdenen)}</b></span>
      <span>Kalan: <b style="color:var(--color-danger)">₺${formatTRY(toplamKalan)}</b></span>
      ${tamamlanan > 0 ? `<span>Tamamlanan: <b style="color:var(--color-success)">${tamamlanan}</b></span>` : ''}
    </div>
  </div>`;

  if (liste.length === 0) {
    h += `<div class="card"><div class="empty-state">${icon('scale')}<h3>Henüz icra kaydı yok</h3>
      <p>"Yeni İcra Ekle" butonuyla ilk dosyayı kaydedebilirsin.</p></div></div>`;
    container.innerHTML = h;
    bagla();
    return;
  }

  // Sıralama: tamamlanmayanlar üstte, sonra en yeni
  const sirali = [...liste].sort((a, b) => {
    const aT = icraKalan(a) === 0 ? 1 : 0;
    const bT = icraKalan(b) === 0 ? 1 : 0;
    if (aT !== bT) return aT - bT;
    return String(b.olusturma || '').localeCompare(String(a.olusturma || ''));
  });

  h += '<div class="icra-grid">';
  for (const i of sirali) {
    const durum = icraDurum(i);
    const toplam = Number(i.toplamTutar) || 0;
    const odenen = Number(i.odenenTutar) || 0;
    const kalan = icraKalan(i);
    const kalanAy = icraKalanAy(i);
    const bitis = icraBitisTarihi(i);
    const bitisStr = bitis ? bitis.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' }) : '—';
    const oran = toplam > 0 ? Math.min(100, (odenen / toplam) * 100) : 0;
    const tamamCls = durum.tip === 'tamamlandi' ? ' tamamlandi' : '';

    h += `<div class="icra-kart${tamamCls}">
      <div class="icra-dosya-no">${esc(i.dosyaNo || 'DOSYA YOK')}</div>
      <div class="icra-kart-ust">
        <div class="icra-kart-avatar">${esc(basHarfler(i.isim))}</div>
        <div style="flex:1;min-width:0;">
          <div class="icra-kart-isim">${esc(i.isim)}</div>
          <div class="icra-kart-sicil">Sicil: ${esc(i.sicil)}</div>
        </div>
      </div>
      <div class="icra-tutar-grid">
        <div class="icra-tutar-item"><div class="icra-tutar-lbl">${icon('wallet')} Toplam</div><div class="icra-tutar-deger mavi">${paraStr(toplam)}</div></div>
        <div class="icra-tutar-item"><div class="icra-tutar-lbl">${icon('check')} Ödenen</div><div class="icra-tutar-deger yesil">${paraStr(odenen)}</div></div>
        <div class="icra-tutar-item"><div class="icra-tutar-lbl">${icon('chart')} Kalan</div><div class="icra-tutar-deger ${kalan === 0 ? 'yesil' : 'kirmizi'}">${paraStr(kalan)}</div></div>
        <div class="icra-tutar-item"><div class="icra-tutar-lbl">${icon('refresh')} Aylık</div><div class="icra-tutar-deger turuncu">${Number(i.aylikKesinti) > 0 ? paraStr(i.aylikKesinti) : '—'}</div></div>
      </div>
      <div class="icra-progress"><div class="icra-progress-dolgu" style="width:${oran}%"></div></div>
      <div class="icra-durum${tamamCls}">
        <span style="color:${durum.renk};font-weight:900;">${icon(durum.ikon)} ${durum.metin}</span>
        ${kalan > 0 && kalanAy > 0 ? `<span>${icon('calendar')} <b>${kalanAy}</b> ay • Bitiş: <b>${bitisStr}</b></span>` : ''}
      </div>
      ${i.aciklama ? `<div class="icra-not">${icon('edit')} ${esc(i.aciklama)}</div>` : ''}
      <div class="icra-aksiyonlar">
        ${kalan > 0 ? `<button class="icra-btn odeme" data-odeme="${i.id}">${icon('banknote')} Ödeme Ekle</button>` : ''}
        <button class="icra-btn" data-duzenle="${i.id}">${icon('edit')} Düzenle</button>
        <button class="icra-btn sil" data-sil="${i.id}">${icon('trash')} Sil</button>
      </div>
    </div>`;
  }
  h += '</div>';

  container.innerHTML = h;
  bagla();
}

/* ─── OLAY BAĞLAMA ─── */
function bagla() {
  container.onclick = (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.act === 'yeni') { acFormModal(null); return; }
    if (btn.dataset.act === 'excel') { exportExcel(); return; }
    if (btn.dataset.odeme) { acOdemeModal(Number(btn.dataset.odeme)); return; }
    if (btn.dataset.duzenle) { acFormModal(Number(btn.dataset.duzenle)); return; }
    if (btn.dataset.sil) { sil(Number(btn.dataset.sil)); return; }
  };
}

/* ─── FORM MODALI (yeni/düzenle) ─── */
function kisiDatalist() {
  const sirali = [...state.personeller].sort((a, b) => String(a.ad || '').localeCompare(String(b.ad || ''), 'tr'));
  return sirali.map((p) => `<option value="${esc(`${p.ad} - ${p.sicil}`)}"></option>`).join('');
}

function onizlemeGuncel(m) {
  const el = m.querySelector('#ic-onizleme');
  const toplam = parseFloat(m.querySelector('#ic-toplam').value) || 0;
  const odenen = parseFloat(m.querySelector('#ic-odenen').value) || 0;
  const aylik = parseFloat(m.querySelector('#ic-aylik').value) || 0;
  const kalan = Math.max(0, toplam - odenen);
  if (toplam <= 0) { el.style.display = 'none'; return; }
  const ay = (aylik > 0 && kalan > 0) ? Math.ceil(kalan / aylik) : 0;
  el.style.display = 'block';
  el.innerHTML = `Kalan: <b style="color:${kalan === 0 ? '#16a34a' : '#dc2626'}">${paraStr(kalan)}</b>` +
    (ay > 0 ? ` • Tahmini süre: <b>${ay} ay</b>` : '') +
    (kalan === 0 ? ' • <b style="color:#16a34a">Dosya kapandı</b>' : '');
}

function acFormModal(id) {
  const i = id ? state.icralar.find((x) => x.id === id) : null;
  duzenlenenId = i ? i.id : null;
  const bugun = new Date().toISOString().slice(0, 10);

  openModal({
    title: `${icon('scale')} ${i ? 'İcra Kaydını Düzenle' : 'Yeni İcra Kaydı'}`,
    body: `
      <div class="stack-sm">
      <div class="field"><label class="field__label">Personel</label>
        <input class="input" id="ic-kisi" list="ic-kisi-liste" autocomplete="off" placeholder="İsim yaz veya seç..."
          value="${i ? esc(`${i.isim} - ${i.sicil}`) : ''}">
        <datalist id="ic-kisi-liste">${kisiDatalist()}</datalist></div>
      <div class="form-grid">
        <div class="field"><label class="field__label">Toplam Borç (₺)</label>
          <input class="input" id="ic-toplam" type="number" min="0" step="0.01" placeholder="0.00" value="${i ? (i.toplamTutar || '') : ''}"></div>
        <div class="field"><label class="field__label">Ödenen (₺)</label>
          <input class="input" id="ic-odenen" type="number" min="0" step="0.01" value="${i ? (i.odenenTutar || 0) : 0}"></div>
        <div class="field"><label class="field__label">Aylık Kesinti (₺)</label>
          <input class="input" id="ic-aylik" type="number" min="0" step="0.01" placeholder="Opsiyonel" value="${i ? (i.aylikKesinti || '') : ''}"></div>
        <div class="field"><label class="field__label">Başlangıç Tarihi</label>
          <input class="input" id="ic-baslangic" type="date" value="${i ? (i.baslangicTarihi || bugun) : bugun}"></div>
      </div>
      <div class="field"><label class="field__label">Dosya No</label>
        <input class="input" id="ic-dosya" autocomplete="off" placeholder="Örn: 2026/123" value="${i ? esc(i.dosyaNo || '') : ''}"></div>
      <div class="field"><label class="field__label">Açıklama</label>
        <input class="input" id="ic-aciklama" autocomplete="off" placeholder="Opsiyonel not..." value="${i ? esc(i.aciklama || '') : ''}"></div>
      <div class="alert alert--info" id="ic-onizleme" style="display:none;"></div>
      </div>`,
    footer: `<button class="btn btn--secondary" data-modal-close>İptal</button>
             <button class="btn btn--primary" id="ic-kaydet">${icon('save')} Kaydet</button>`,
    onMount: (m) => {
      ['ic-toplam', 'ic-odenen', 'ic-aylik'].forEach((idSel) => {
        m.querySelector('#' + idSel).addEventListener('input', () => onizlemeGuncel(m));
      });
      onizlemeGuncel(m);
      m.querySelector('#ic-kaydet').onclick = () => kaydet(m);
      setTimeout(() => m.querySelector('#ic-kisi').focus(), 100);
    },
  });
}

function kaydet(m) {
  const kisi = kisiParse(m.querySelector('#ic-kisi').value.trim(), state.personeller);
  if (!kisi) { toast('Personel bulunamadı, listeden seç', 'err'); return; }
  const toplam = parseFloat(m.querySelector('#ic-toplam').value) || 0;
  if (toplam <= 0) { toast('Toplam borç giriniz!', 'err'); return; }
  const odenen = parseFloat(m.querySelector('#ic-odenen').value) || 0;
  if (odenen < 0) { toast('Ödenen negatif olamaz!', 'err'); return; }
  if (odenen > toplam) { toast('Ödenen toplamdan fazla olamaz!', 'err'); return; }

  const alanlar = {
    sicil: kisi.sicil,
    isim: kisi.isim,
    toplamTutar: toplam,
    odenenTutar: odenen,
    aylikKesinti: parseFloat(m.querySelector('#ic-aylik').value) || 0,
    baslangicTarihi: m.querySelector('#ic-baslangic').value,
    dosyaNo: m.querySelector('#ic-dosya').value.trim(),
    aciklama: m.querySelector('#ic-aciklama').value.trim(),
  };

  if (duzenlenenId != null) {
    commit(state.icralar.map((x) => (x.id === duzenlenenId ? { ...x, ...alanlar } : x)));
    toast('İcra kaydı güncellendi', 'ok');
  } else {
    commit([...state.icralar, { id: uid(), ...alanlar, odemeler: [], olusturma: new Date().toISOString() }]);
    toast(`${kisi.isim} için icra kaydı eklendi`, 'ok');
  }
  duzenlenenId = null;
  closeModal();
}

/* ─── SİL ─── */
async function sil(id) {
  const i = state.icralar.find((x) => x.id === id);
  if (!i) return;
  const ok = await confirmDialog(
    `${i.isim} icra kaydı silinsin mi?\n\nTüm ödeme geçmişi de silinecek!`,
    { danger: true, okText: 'Sil' },
  );
  if (!ok) return;
  commit(state.icralar.filter((x) => x.id !== id));
  toast('İcra kaydı silindi', 'ok');
}

/* ─── ÖDEME MODALI ─── */
function odemeGecmisHtml(i) {
  const odemeler = i.odemeler || [];
  if (odemeler.length === 0) {
    return '<div class="rt-empty">Henüz ödeme yapılmadı</div>';
  }
  return odemeler.map((o, idx) => {
    const d = gecerliTarih(o.tarih);
    const tarihStr = d ? d.toLocaleDateString('tr-TR') : esc(o.tarih);
    return `<div class="rt-item">
      <span class="rt-tarih">${tarihStr}</span>
      <span class="rt-deger is-ok">${paraStr(o.tutar)}</span>
      <span class="rt-not" title="${esc(o.not || '')}">${esc(o.not || '')}</span>
      <button class="btn-ikon" data-odeme-sil="${idx}" title="Ödemeyi sil">${icon('close')}</button>
    </div>`;
  }).join('');
}

function acOdemeModal(id) {
  const i = state.icralar.find((x) => x.id === id);
  if (!i) return;
  aktifOdemeId = id;

  openModal({
    title: `${icon('banknote')} Ödeme Ekle`,
    body: `
      <div class="stack-sm">
      <div class="alert alert--info"><span><b>${esc(i.isim)}</b> • Sicil: <b>${esc(i.sicil)}</b> —
        Kalan: <b style="color:var(--color-danger)">${paraStr(icraKalan(i))}</b></span></div>
      <div class="form-grid">
        <div class="field"><label class="field__label">Tarih</label>
          <input class="input" id="io-tarih" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label class="field__label">Tutar (₺)</label>
          <input class="input" id="io-tutar" type="number" min="0" step="0.01" placeholder="0.00"></div>
      </div>
      <div class="field"><label class="field__label">Not</label>
        <input class="input" id="io-not" autocomplete="off" placeholder="Opsiyonel..."></div>
      <div class="alert alert--ok" id="io-onizleme" style="display:none;"></div>
      <div><div class="field__label" style="margin-bottom:6px;">Ödeme Geçmişi</div>
      <div class="rt-liste" id="io-gecmis">${odemeGecmisHtml(i)}</div></div>
      </div>`,
    footer: `<button class="btn btn--secondary" data-modal-close>Kapat</button>
             <button class="btn btn--primary" id="io-kaydet">${icon('save')} Ödeme Ekle</button>`,
    onMount: (m) => {
      const tutarEl = m.querySelector('#io-tutar');
      tutarEl.addEventListener('input', () => {
        const on = m.querySelector('#io-onizleme');
        const t = parseFloat(tutarEl.value) || 0;
        const kalan = icraKalan(i);
        if (t <= 0) { on.style.display = 'none'; return; }
        on.style.display = 'block';
        const yeni = Math.max(0, kalan - t);
        on.innerHTML = `Ödeme sonrası kalan: <b style="color:${yeni === 0 ? '#16a34a' : '#dc2626'}">${paraStr(yeni)}</b>` +
          (yeni === 0 ? ' • Dosya kapanıyor' : '');
      });
      m.querySelector('#io-kaydet').onclick = () => odemeKaydet(m);
      m.querySelector('#io-gecmis').onclick = (e) => {
        const b = e.target.closest('[data-odeme-sil]');
        if (b) odemeSil(Number(b.dataset.odemeSil));
      };
      setTimeout(() => tutarEl.focus(), 100);
    },
  });
}

function yenileOdemeModal() {
  const i = state.icralar.find((x) => x.id === aktifOdemeId);
  if (!i) return;
  const gecmis = document.querySelector('#io-gecmis');
  if (gecmis) gecmis.innerHTML = odemeGecmisHtml(i);
  const bilgi = document.querySelector('.info-card');
  if (bilgi) bilgi.innerHTML = `<b>${esc(i.isim)}</b> • Sicil: <b>${esc(i.sicil)}</b><br>
    Kalan: <b style="color:#dc2626">${paraStr(icraKalan(i))}</b>`;
}

function odemeKaydet(m) {
  const i = state.icralar.find((x) => x.id === aktifOdemeId);
  if (!i) return;
  const tarih = m.querySelector('#io-tarih').value;
  if (!tarih) { toast('Tarih gerekli!', 'err'); return; }
  const tutar = parseFloat(m.querySelector('#io-tutar').value) || 0;
  if (tutar <= 0) { toast('Tutar giriniz!', 'err'); return; }
  const kalan = icraKalan(i);
  if (tutar > kalan) { toast(`Tutar kalandan fazla olamaz! Kalan: ${paraStr(kalan)}`, 'err'); return; }

  const guncel = state.icralar.map((x) => {
    if (x.id !== i.id) return x;
    return {
      ...x,
      odemeler: [...(x.odemeler || []), { tarih, tutar, not: m.querySelector('#io-not').value.trim(), olusturma: new Date().toISOString() }],
      odenenTutar: (Number(x.odenenTutar) || 0) + tutar,
    };
  });
  commit(guncel);
  toast(`Ödeme eklendi: ${paraStr(tutar)}`, 'ok');
  m.querySelector('#io-tutar').value = '';
  m.querySelector('#io-not').value = '';
  const on = m.querySelector('#io-onizleme');
  if (on) on.style.display = 'none';
  yenileOdemeModal();
}

async function odemeSil(idx) {
  const i = state.icralar.find((x) => x.id === aktifOdemeId);
  if (!i || !i.odemeler || !i.odemeler[idx]) return;
  const o = i.odemeler[idx];
  const ok = await confirmDialog(`Bu ödeme silinsin mi?\n\n${paraStr(o.tutar)} geri alınacak.`, { danger: true, okText: 'Sil' });
  if (!ok) return;
  const guncel = state.icralar.map((x) => {
    if (x.id !== i.id) return x;
    const odemeler = [...x.odemeler];
    odemeler.splice(idx, 1);
    return { ...x, odemeler, odenenTutar: Math.max(0, (Number(x.odenenTutar) || 0) - (Number(o.tutar) || 0)) };
  });
  commit(guncel);
  toast('Ödeme silindi', 'ok');
  yenileOdemeModal();
}

/* ─── EXCEL ─── */
function exportExcel() {
  const liste = state.icralar;
  if (liste.length === 0) { toast('Aktarılacak veri yok', 'err'); return; }
  let h = '<h2>İcra Takip Listesi</h2>';
  h += `<p class="info">Toplam ${liste.length} kayıt • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th>#</th><th>İsim</th><th>Sicil</th><th>Dosya No</th>' +
    '<th>Toplam (TL)</th><th>Ödenen (TL)</th><th>Kalan (TL)</th>' +
    '<th>Aylık (TL)</th><th>Kalan Ay</th><th>Başlangıç</th><th>Açıklama</th></tr></thead><tbody>';
  let topT = 0, topO = 0, topK = 0;
  const sirali = [...liste].sort((a, b) => String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));
  sirali.forEach((i, idx) => {
    const toplam = Number(i.toplamTutar) || 0;
    const odenen = Number(i.odenenTutar) || 0;
    const kalan = toplam - odenen;
    topT += toplam; topO += odenen; topK += kalan;
    const kalanAy = icraKalanAy(i);
    h += `<tr><td>${idx + 1}</td><td>${esc(i.isim)}</td><td>${esc(i.sicil)}</td><td>${esc(i.dosyaNo || '-')}</td>` +
      `<td class="num">${formatTRY(toplam)}</td><td class="num">${formatTRY(odenen)}</td><td class="num">${formatTRY(kalan)}</td>` +
      `<td class="num">${Number(i.aylikKesinti) > 0 ? formatTRY(i.aylikKesinti) : '-'}</td>` +
      `<td class="num">${kalanAy > 0 ? kalanAy : '-'}</td><td>${esc(i.baslangicTarihi || '-')}</td><td>${esc(i.aciklama || '-')}</td></tr>`;
  });
  h += `<tr style="background:#fee2e2;font-weight:bold;"><td colspan="4" style="text-align:right;">TOPLAM →</td>` +
    `<td class="num">${formatTRY(topT)}</td><td class="num">${formatTRY(topO)}</td><td class="num">${formatTRY(topK)}</td><td colspan="4"></td></tr>`;
  h += '</tbody></table>';
  downloadXls(h, `Icra-Takip-${new Date().toISOString().slice(0, 10)}.xls`);
  toast(`İcra Excel indirildi: ${liste.length} kayıt`, 'ok');
}

/* ─── SAYFA KAYDI ─── */
registerPage('icra', {
  title: 'İcra Takip',
  icon: 'scale',
  group: 'Finans',
}, (el) => {
  container = el;
  render();
  const unsub1 = subscribe('icralar', render);
  const unsub2 = subscribe('personeller', render);
  return () => { unsub1(); unsub2(); container = null; };
});
