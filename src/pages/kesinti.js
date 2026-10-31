// ============================================================
// ERP ÜMİT v2 — Geç Giriş / Erken Çıkış Kesintisi Sayfası
// Legacy'deki page-kesinti modülünün modüler karşılığı.
//  - Hesap: kayıp dk = (geç + erken) - toleranslar
//  - Tutar = kayıpSaat × (yevmiye / 7.5)
//  - Kalıcılık: umit_erp_<donemId>_kesinti_v1 ({liste, ayar} ambalajı)
// Şema (legacy ile birebir):
//  { id, sicil, isim, tarih, giris, cikis, gecDk, erkenDk, toplamDk,
//    kayipSaat, yevmiye, kesintiTutar, not, olusturmaTarihi }
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, formatTRY, formatDate, todayISO, normalizeTR, kisiParse, gecerliTarih, dkToSure, downloadXls } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { confirmDialog, openModal, closeModal } from '../core/modal.js';
import { ensureDonem, saveDonemSlice, AYLAR } from '../core/donemService.js';
import { resmiTatilVarMi } from '../core/resmiTatilService.js';
import { scheduleSync } from '../core/syncService.js';

// ---------- yardımcılar ----------

const uid = () => Date.now() + Math.floor(Math.random() * 1000);

/** "HH:MM" -> dakika */
function saatToDk(s) {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

/** dakikayı "1s 30dk" kısa biçimi (legacy dkToSaatStr) */
function dkKisa(dk) {
  const s = Math.floor((Number(dk) || 0) / 60);
  const d = (Number(dk) || 0) % 60;
  return s > 0 ? `${s}s ${d}dk` : `${d}dk`;
}

/** Legacy kesintiHesapla — birebir aynı mantık. */
export function kesintiHesapla(giris, cikis, ayar = state.kesintiAyar) {
  const g = saatToDk(giris);
  const c = saatToDk(cikis);
  const iBas = saatToDk(ayar.baslangic);
  const iBit = saatToDk(ayar.bitis);
  const tolG = Number(ayar.tolGec) || 0;
  const tolE = Number(ayar.tolErken) || 0;
  let gec = 0, erken = 0;
  if (g != null && iBas != null && g > iBas) {
    gec = g - iBas;
    if (gec <= tolG) gec = 0; else gec -= tolG;
  }
  if (c != null && iBit != null && c < iBit) {
    erken = iBit - c;
    if (erken <= tolE) erken = 0; else erken -= tolE;
  }
  return { gecDk: gec, erkenDk: erken, toplamDk: gec + erken };
}

/** Kişi bazlı toplamlar (personel kartı / muhasebe için dışa açık). */
export function kisiKesintiToplam(sicil) {
  return state.kesintiler
    .filter((k) => String(k.sicil) === String(sicil))
    .reduce((t, k) => t + (Number(k.kesintiTutar) || 0), 0);
}

export function kisiKesintiListesi(sicil) {
  return state.kesintiler
    .filter((k) => String(k.sicil) === String(sicil))
    .sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
}

// ---------- kalıcılık ----------

function commitListe(yeniListe) {
  setState('kesintiler', yeniListe);              // persist '@kesinti' ambalajına
  saveDonemSlice('kesintiler', yeniListe);        // dönem anahtarına güvenli yazım
  scheduleSync();
}

function commitAyar(yeniAyar) {
  setState('kesintiAyar', yeniAyar);
  saveDonemSlice('kesintiAyar', yeniAyar);
  scheduleSync();
}

// ---------- filtre durumu ----------

let secim = {
  ay: new Date().getMonth(),
  yil: new Date().getFullYear(),
  tip: 'hepsi',
  arama: '',
};

function filteredList() {
  const arama = normalizeTR(secim.arama);
  const liste = state.kesintiler.filter((k) => {
    const d = gecerliTarih(k.tarih);
    if (!d) return false;
    if (d.getMonth() !== secim.ay || d.getFullYear() !== secim.yil) return false;
    if (secim.tip === 'gec' && !(k.gecDk > 0)) return false;
    if (secim.tip === 'erken' && !(k.erkenDk > 0)) return false;
    if (secim.tip === 'ikisi' && !(k.gecDk > 0 && k.erkenDk > 0)) return false;
    if (arama) {
      const isim = normalizeTR(k.isim || '');
      const sicil = normalizeTR(String(k.sicil || ''));
      if (!isim.includes(arama) && !sicil.includes(arama)) return false;
    }
    return true;
  });
  liste.sort((a, b) => String(b.tarih || '').localeCompare(String(a.tarih || '')));
  return liste;
}

// ---------- HTML ----------

function shellHtml() {
  const a = state.kesintiAyar;
  const yillar = [];
  for (let y = 2024; y <= 2031; y++) yillar.push(`<option value="${y}">${y}</option>`);

  return `
  <div class="page stack">
    <div class="kesinti-grid">
      <!-- SOL: ayarlar + form -->
      <div class="stack">
        <div class="card">
          <div class="card__header">
            <div class="card__title">${icon('settings')} Firma Çalışma Ayarları</div>
          </div>
          <div class="card__body">
            <div class="form-grid">
              <div class="field"><label class="field__label">İş Başlangıç</label>
                <input class="input" type="time" id="kBaslangic" value="${esc(a.baslangic)}"></div>
              <div class="field"><label class="field__label">İş Bitiş</label>
                <input class="input" type="time" id="kBitis" value="${esc(a.bitis)}"></div>
              <div class="field"><label class="field__label">Mola Başlangıç</label>
                <input class="input" type="time" id="kMolaBas" value="${esc(a.molaBaslangic)}"></div>
              <div class="field"><label class="field__label">Mola Bitiş</label>
                <input class="input" type="time" id="kMolaBit" value="${esc(a.molaBitis)}"></div>
              <div class="field"><label class="field__label">Geç Giriş Toleransı (dk)</label>
                <input class="input" type="number" id="kTolGec" min="0" max="120" step="1" value="${Number(a.tolGec) || 0}"></div>
              <div class="field"><label class="field__label">Erken Çıkış Toleransı (dk)</label>
                <input class="input" type="number" id="kTolErken" min="0" max="120" step="1" value="${Number(a.tolErken) || 0}"></div>
            </div>
            <div class="toolbar" style="margin-top:12px">
              <button class="btn btn--primary btn--sm" data-act="ayar-kaydet">${icon('save')} Ayarları Kaydet</button>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card__header">
            <div class="card__title">${icon('plus')} Yeni Kesinti Kaydı</div>
          </div>
          <div class="card__body">
            <form id="kesintiForm" class="form-grid">
              <div class="field" style="grid-column:1/-1">
                <label class="field__label">Personel *</label>
                <input class="input" id="kKisi" list="kKisiListe" placeholder="İsim yaz veya seç..." autocomplete="off">
                <datalist id="kKisiListe"></datalist>
              </div>
              <div class="field"><label class="field__label">Tarih *</label>
                <input class="input" type="date" id="kTarih" value="${todayISO()}"></div>
              <div class="field"><label class="field__label">Giriş Saati</label>
                <input class="input" type="time" id="kGiris" value="${esc(a.baslangic)}"></div>
              <div class="field"><label class="field__label">Çıkış Saati</label>
                <input class="input" type="time" id="kCikis" value="${esc(a.bitis)}"></div>
              <div class="field"><label class="field__label">Açıklama</label>
                <input class="input" id="kNot" placeholder="Örn: Trafik, mazeret..." autocomplete="off"></div>
            </form>
            <div id="kOnizleme" class="kesinti-onizleme" hidden></div>
            <div class="toolbar" style="margin-top:12px">
              <button class="btn btn--primary btn--sm" data-act="ekle">${icon('plus')} Kaydet</button>
              <button class="btn btn--secondary btn--sm" data-act="temizle">Temizle</button>
            </div>
          </div>
        </div>

        <div class="info-card">
          <b>${icon('info')} Nasıl çalışır?</b>
          <ul>
            <li>Kayıp süre = geç giriş + erken çıkış (toleranslar düşülür).</li>
            <li>Kesinti tutarı = kayıp saat × (yevmiye ÷ 7.5).</li>
            <li>Tutar otomatik olarak personel kartına ve muhasebeye yansır.</li>
            <li>Pazar / resmi tatil ve gelecek tarihlerde onay sorulur.</li>
          </ul>
        </div>
      </div>

      <!-- SAĞ: liste -->
      <div class="card">
        <div class="card__header">
          <div class="card__title">${icon('list')} Kesinti Kayıtları</div>
          <div class="toolbar">
            <button class="btn btn--secondary btn--sm" data-act="excel">${icon('download')} Excel'e Aktar</button>
            <button class="btn btn--secondary btn--sm" data-act="print">${icon('printer')} Yazdır</button>
          </div>
        </div>
        <div class="card__body" style="padding-bottom:0">
          <div class="toolbar" style="flex-wrap:wrap">
            <select class="select input--sm" id="kesintiAySec">
              ${AYLAR.map((m, i) => `<option value="${i}">${m}</option>`).join('')}
            </select>
            <select class="select input--sm" id="kesintiYilSec">${yillar}</select>
            <select class="select input--sm" id="kesintiTipSec">
              <option value="hepsi">Hepsi</option>
              <option value="gec">Sadece Geç Giriş</option>
              <option value="erken">Sadece Erken Çıkış</option>
              <option value="ikisi">İkisi de Var</option>
            </select>
            <div class="search" style="flex:1;min-width:150px">
              ${icon('search')}
              <input class="input" id="kesintiArama" placeholder="Kişi ara...">
            </div>
          </div>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr>
              <th style="width:44px">#</th>
              <th style="width:105px">Tarih</th>
              <th>İsim</th>
              <th style="width:66px">Giriş</th>
              <th style="width:66px">Çıkış</th>
              <th style="width:95px">Kayıp</th>
              <th style="width:105px;text-align:right">Kesinti</th>
              <th>Not</th>
              <th style="width:84px">İşlem</th>
            </tr></thead>
            <tbody id="kesintiTabloBody"></tbody>
          </table>
        </div>
        <div class="card__footer" id="kesintiOzet" style="font-size:12px;color:var(--text-muted)"></div>
      </div>
    </div>
  </div>`;
}

// ---------- çizim ----------

function fillDatalist(root) {
  const dl = root.querySelector('#kKisiListe');
  if (!dl) return;
  const sirali = [...state.personeller].sort((x, y) => (x.ad || '').localeCompare(y.ad || '', 'tr'));
  dl.innerHTML = sirali.map((p) => `<option value="${esc(`${p.ad} - ${p.sicil}`)}"></option>`).join('');
}

function tipRozet(k) {
  if (k.gecDk > 0 && k.erkenDk > 0) return '<span class="tip-rozet tip-rozet--2x">2X</span>';
  if (k.gecDk > 0) return '<span class="tip-rozet tip-rozet--gec">GEÇ</span>';
  if (k.erkenDk > 0) return '<span class="tip-rozet tip-rozet--erken">ERKEN</span>';
  return '';
}

function drawTable(root) {
  const body = root.querySelector('#kesintiTabloBody');
  const ozet = root.querySelector('#kesintiOzet');
  const liste = filteredList();

  const aylikTum = state.kesintiler.filter((k) => {
    const d = gecerliTarih(k.tarih);
    return d && d.getMonth() === secim.ay && d.getFullYear() === secim.yil;
  });
  const aylikTopTutar = aylikTum.reduce((t, k) => t + (Number(k.kesintiTutar) || 0), 0);
  const aylikTopDk = aylikTum.reduce((t, k) => t + (Number(k.toplamDk) || 0), 0);
  const aylikKisiSay = new Set(aylikTum.map((k) => k.sicil)).size;

  if (ozet) {
    ozet.textContent = aylikTum.length
      ? `${AYLAR[secim.ay]} ${secim.yil} → ${aylikKisiSay} kişi • ${aylikTum.length} kayıt • ${dkToSure(aylikTopDk)} • -₺${formatTRY(aylikTopTutar)}`
        + (liste.length !== aylikTum.length ? ` (filtre: ${liste.length} kayıt)` : '')
      : '';
  }

  if (!liste.length) {
    const msg = state.kesintiler.length === 0 ? 'Henüz kesinti kaydı yok' : 'Bu filtreye uyan kayıt yok';
    body.innerHTML = `<tr><td colspan="9"><div class="table-empty">${icon('clock')}<div>${msg}</div></div></td></tr>`;
    return;
  }

  body.innerHTML = liste.map((k, i) => {
    return `<tr>
      <td class="num">${i + 1}</td>
      <td>${formatDate(k.tarih)}</td>
      <td><b>${esc(k.isim)}</b> ${tipRozet(k)}</td>
      <td class="k-mavi">${esc(k.giris)}</td>
      <td class="k-mavi">${esc(k.cikis)}</td>
      <td class="k-turuncu">${dkToSure(k.toplamDk)}</td>
      <td class="num k-kirmizi">${Number(k.kesintiTutar) > 0 ? '-₺' + formatTRY(k.kesintiTutar) : '—'}</td>
      <td title="${esc(k.not || '')}">${esc(k.not || '—')}</td>
      <td>
        <button class="icon-btn" data-edit="${k.id}" title="Düzenle">${icon('edit')}</button>
        <button class="icon-btn icon-btn--danger" data-del="${k.id}" title="Sil">${icon('trash')}</button>
      </td>
    </tr>`;
  }).join('');
}

// ---------- önizleme ----------

function onizlemeHtml({ gecDk, erkenDk, toplamDk }, yevmiye, ayar) {
  if (toplamDk === 0) {
    return `<b class="k-yesil">${icon('check')} Kesinti yok</b> — Personel zamanında gelmiş ve çıkmış.`;
  }
  const kayipSaat = toplamDk / 60;
  const tutar = yevmiye > 0 ? kayipSaat * (yevmiye / 7.5) : 0;
  let html = `<b>Hesaplama</b> <small>(tolerans: ${Number(ayar.tolGec) || 0} dk giriş, ${Number(ayar.tolErken) || 0} dk çıkış)</small><br>`;
  if (gecDk > 0) html += `Geç giriş: <b>${dkKisa(gecDk)}</b><br>`;
  if (erkenDk > 0) html += `Erken çıkış: <b>${dkKisa(erkenDk)}</b><br>`;
  html += `Toplam kayıp: <b>${dkToSure(toplamDk)}</b><br>`;
  if (yevmiye > 0) {
    html += `Kesinti tutarı: <b class="k-kirmizi">₺${formatTRY(tutar)}</b>`
      + ` <small>(${kayipSaat.toFixed(2)} × ₺${formatTRY(yevmiye)} ÷ 7.5)</small>`;
  } else {
    html += `<span class="k-turuncu">${icon('alert-triangle')} Yevmiye girilmediği için tutar hesaplanamadı.</span>`;
  }
  return html;
}

function updateOnizleme(root) {
  const el = root.querySelector('#kOnizleme');
  const kisiMetin = root.querySelector('#kKisi').value.trim();
  const giris = root.querySelector('#kGiris').value;
  const cikis = root.querySelector('#kCikis').value;
  if (!kisiMetin || !giris || !cikis) { el.hidden = true; return; }
  const kisi = kisiParse(kisiMetin, state.personeller);
  if (!kisi) { el.hidden = true; return; }
  const p = state.personeller.find((x) => String(x.sicil) === String(kisi.sicil));
  const r = kesintiHesapla(giris, cikis);
  el.innerHTML = onizlemeHtml(r, p ? (Number(p.maas) || 0) : 0, state.kesintiAyar);
  el.hidden = false;
}

// ---------- eylemler ----------

function formTemizle(root) {
  root.querySelector('#kKisi').value = '';
  root.querySelector('#kTarih').value = todayISO();
  root.querySelector('#kGiris').value = state.kesintiAyar.baslangic || '08:00';
  root.querySelector('#kCikis').value = state.kesintiAyar.bitis || '17:00';
  root.querySelector('#kNot').value = '';
  root.querySelector('#kOnizleme').hidden = true;
  setTimeout(() => root.querySelector('#kKisi').focus(), 50);
}

async function ekle(root) {
  const kisiMetin = root.querySelector('#kKisi').value.trim();
  const kisi = kisiParse(kisiMetin, state.personeller);
  if (!kisi) { toast('Personel bulunamadı, listeden seçin', 'error'); return; }

  const tarih = root.querySelector('#kTarih').value;
  if (!tarih) { toast('Tarih gerekli', 'error'); return; }

  const giris = root.querySelector('#kGiris').value;
  const cikis = root.querySelector('#kCikis').value;
  if (!giris || !cikis) { toast('Giriş ve çıkış saati gerekli', 'error'); return; }

  const gDk = saatToDk(giris), cDk = saatToDk(cikis);
  if (cDk <= gDk) { toast('Çıkış saati girişten sonra olmalı', 'error'); return; }
  if (cDk - gDk > 16 * 60) { toast('Çalışma süresi 16 saatten fazla olamaz', 'error'); return; }

  // Gelecek tarih onayı
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  const secilen = new Date(tarih + 'T00:00:00');
  if (secilen > bugun) {
    const ok = await confirmDialog(`Gelecek tarih: ${formatDate(tarih)} için kesinti giriyorsun. Emin misin?`, { okText: 'Evet, ekle' });
    if (!ok) return;
  }

  // Pazar / resmi tatil onayı
  const dObj = gecerliTarih(tarih);
  if (dObj) {
    const tatil = resmiTatilVarMi(dObj.getFullYear(), dObj.getMonth(), dObj.getDate());
    if (dObj.getDay() === 0 || tatil) {
      const tTip = dObj.getDay() === 0 ? 'Pazar günü' : (tatil ? tatil.ad : 'Tatil günü');
      const ok = await confirmDialog(`${formatDate(tarih)} — ${tTip}. Normalde çalışma günü değil. Yine de kesinti girilsin mi?`, { okText: 'Yine de ekle' });
      if (!ok) return;
    }
  }

  // Mükerrer kayıt onayı
  const ayni = state.kesintiler.find((k) => String(k.sicil) === String(kisi.sicil) && k.tarih === tarih);
  if (ayni) {
    const ok = await confirmDialog(
      `${kisi.isim} için ${formatDate(tarih)} tarihinde zaten kesinti var (Giriş: ${ayni.giris} • Çıkış: ${ayni.cikis} • ₺${formatTRY(ayni.kesintiTutar)}). Yeni kayıt yine de eklensin mi?`,
      { okText: 'Ekle' });
    if (!ok) return;
  }

  const r = kesintiHesapla(giris, cikis);
  if (r.toplamDk === 0) { toast('Kesinti yok — tolerans içinde veya zamanında', 'info'); return; }

  const p = state.personeller.find((x) => String(x.sicil) === String(kisi.sicil));
  const yevmiye = p ? (Number(p.maas) || 0) : 0;
  const kayipSaat = r.toplamDk / 60;
  const tutar = yevmiye > 0 ? kayipSaat * (yevmiye / 7.5) : 0;

  commitListe([{
    id: uid(),
    sicil: kisi.sicil,
    isim: kisi.isim,
    tarih,
    giris,
    cikis,
    gecDk: r.gecDk,
    erkenDk: r.erkenDk,
    toplamDk: r.toplamDk,
    kayipSaat: parseFloat(kayipSaat.toFixed(2)),
    yevmiye,
    kesintiTutar: parseFloat(tutar.toFixed(2)),
    not: root.querySelector('#kNot').value.trim(),
    olusturmaTarihi: new Date().toISOString(),
  }, ...state.kesintiler]);

  formTemizle(root);
  toast(`${kisi.isim} için kesinti eklendi`, 'success');
}

function duzenleModal(id) {
  const k = state.kesintiler.find((x) => x.id === id);
  if (!k) return;
  const onElId = 'kDuzOnizleme';
  openModal({
    title: `${icon('edit')} Kesinti Düzenle`,
    body: `
      <div class="stack" style="gap:12px">
        <div><b>${esc(k.isim)}</b> • Sicil: <b>${esc(k.sicil)}</b></div>
        <div class="form-grid">
          <div class="field"><label class="field__label">Tarih</label>
            <input class="input" type="date" id="kDuzTarih" value="${esc(k.tarih || '')}"></div>
          <div class="field"><label class="field__label">Giriş</label>
            <input class="input" type="time" id="kDuzGiris" value="${esc(k.giris || '')}"></div>
          <div class="field"><label class="field__label">Çıkış</label>
            <input class="input" type="time" id="kDuzCikis" value="${esc(k.cikis || '')}"></div>
          <div class="field"><label class="field__label">Not</label>
            <input class="input" id="kDuzNot" value="${esc(k.not || '')}"></div>
        </div>
        <div id="${onElId}" class="kesinti-onizleme" hidden></div>
      </div>`,
    footer: `
      <button class="btn btn--secondary" data-act="iptal">Vazgeç</button>
      <button class="btn btn--primary" data-act="kaydet">${icon('save')} Kaydet</button>`,
    onMount(modalRoot) {
      const yenile = () => {
        const el = modalRoot.querySelector('#' + onElId);
        const gi = modalRoot.querySelector('#kDuzGiris').value;
        const ci = modalRoot.querySelector('#kDuzCikis').value;
        if (!gi || !ci) { el.hidden = true; return; }
        const r = kesintiHesapla(gi, ci);
        el.innerHTML = onizlemeHtml(r, Number(k.yevmiye) || 0, state.kesintiAyar);
        el.hidden = false;
      };
      modalRoot.querySelector('#kDuzGiris').addEventListener('input', yenile);
      modalRoot.querySelector('#kDuzCikis').addEventListener('input', yenile);
      yenile();

      modalRoot.querySelector('[data-act="iptal"]').addEventListener('click', closeModal);
      modalRoot.querySelector('[data-act="kaydet"]').addEventListener('click', async () => {
        const tarih = modalRoot.querySelector('#kDuzTarih').value;
        const giris = modalRoot.querySelector('#kDuzGiris').value;
        const cikis = modalRoot.querySelector('#kDuzCikis').value;
        const not = modalRoot.querySelector('#kDuzNot').value.trim();
        if (!tarih) { toast('Tarih gerekli', 'error'); return; }
        if (!giris || !cikis) { toast('Giriş ve çıkış gerekli', 'error'); return; }
        if (saatToDk(cikis) <= saatToDk(giris)) { toast('Çıkış saati girişten sonra olmalı', 'error'); return; }
        const cakisan = state.kesintiler.find((x) => x.id !== id && String(x.sicil) === String(k.sicil) && x.tarih === tarih);
        if (cakisan) {
          const ok = await confirmDialog('Bu kişi için bu tarihte başka kesinti var. Yine de kaydedilsin mi?', { okText: 'Kaydet' });
          if (!ok) return;
        }
        const r = kesintiHesapla(giris, cikis);
        const kayipSaat = r.toplamDk / 60;
        const yevmiye = Number(k.yevmiye) || 0;
        const tutar = yevmiye > 0 ? kayipSaat * (yevmiye / 7.5) : 0;
        const yeni = state.kesintiler.map((x) => x.id === id ? {
          ...x, tarih, giris, cikis, not,
          gecDk: r.gecDk, erkenDk: r.erkenDk, toplamDk: r.toplamDk,
          kayipSaat: parseFloat(kayipSaat.toFixed(2)),
          kesintiTutar: parseFloat(tutar.toFixed(2)),
        } : x);
        commitListe(yeni);
        closeModal();
        toast('Kesinti güncellendi', 'success');
      });
    },
  });
}

async function sil(id) {
  const k = state.kesintiler.find((x) => x.id === id);
  if (!k) return;
  const ok = await confirmDialog(`${k.isim} — ₺${formatTRY(k.kesintiTutar)} kesinti silinsin mi?`, { danger: true, okText: 'Sil' });
  if (!ok) return;
  commitListe(state.kesintiler.filter((x) => x.id !== id));
  toast('Kesinti silindi', 'success');
}

function ayarlariKaydet(root) {
  const g = (sel) => root.querySelector(sel).value;
  const yeniAyar = {
    baslangic: g('#kBaslangic') || '08:00',
    bitis: g('#kBitis') || '17:00',
    molaBaslangic: g('#kMolaBas') || '12:00',
    molaBitis: g('#kMolaBit') || '13:00',
    tolGec: parseInt(g('#kTolGec'), 10) || 0,
    tolErken: parseInt(g('#kTolErken'), 10) || 0,
  };
  if (saatToDk(yeniAyar.bitis) <= saatToDk(yeniAyar.baslangic)) {
    toast('Bitiş saati başlangıçtan sonra olmalı', 'error');
    return;
  }
  commitAyar(yeniAyar);
  // Form saatlerini de yeni ayara çek
  root.querySelector('#kGiris').value = yeniAyar.baslangic;
  root.querySelector('#kCikis').value = yeniAyar.bitis;
  toast('Firma çalışma ayarları kaydedildi', 'success');
}

// ---------- Excel ----------

function exportExcel() {
  const liste = filteredList();
  if (!liste.length) { toast('Aktarılacak kayıt yok', 'error'); return; }

  const kisiOzet = {};
  liste.forEach((k) => {
    if (!kisiOzet[k.sicil]) kisiOzet[k.sicil] = { isim: k.isim, kayitSay: 0, topDk: 0, topTutar: 0 };
    kisiOzet[k.sicil].kayitSay++;
    kisiOzet[k.sicil].topDk += Number(k.toplamDk) || 0;
    kisiOzet[k.sicil].topTutar += Number(k.kesintiTutar) || 0;
  });

  const a = state.kesintiAyar;
  let h = `<h2>ERP ÜMİT — ${AYLAR[secim.ay]} ${secim.yil} Kesinti Raporu</h2>`;
  h += `<p>Toplam ${liste.length} kayıt • Oluşturma: ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<h3>Detaylı Kayıtlar</h3><table><thead><tr>'
    + '<th>#</th><th>Tarih</th><th>İsim</th><th>Sicil</th><th>Giriş</th><th>Çıkış</th>'
    + '<th>Geç (dk)</th><th>Erken (dk)</th><th>Kayıp (sa)</th><th>Yevmiye</th><th>Kesinti</th><th>Not</th>'
    + '</tr></thead><tbody>';
  let topDk = 0, topTutar = 0;
  for (const [i, k] of liste.entries()) {
    topDk += Number(k.toplamDk) || 0;
    topTutar += Number(k.kesintiTutar) || 0;
    h += `<tr><td>${i + 1}</td><td>${esc(formatDate(k.tarih))}</td><td>${esc(k.isim)}</td><td>${esc(k.sicil)}</td>`
      + `<td>${esc(k.giris)}</td><td>${esc(k.cikis)}</td>`
      + `<td>${k.gecDk > 0 ? k.gecDk : '-'}</td><td>${k.erkenDk > 0 ? k.erkenDk : '-'}</td>`
      + `<td>${(Number(k.kayipSaat) || 0).toFixed(2)}</td>`
      + `<td>${k.yevmiye > 0 ? Number(k.yevmiye).toFixed(2) : '-'}</td>`
      + `<td>${k.kesintiTutar > 0 ? '-' + Number(k.kesintiTutar).toFixed(2) : '-'}</td>`
      + `<td>${esc(k.not || '')}</td></tr>`;
  }
  h += `<tr style="background:#f1f5f9;font-weight:bold"><td colspan="8" style="text-align:right">TOPLAM →</td>`
    + `<td>${(topDk / 60).toFixed(2)} sa</td><td>—</td><td>-${topTutar.toFixed(2)}</td><td></td></tr>`;
  h += '</tbody></table>';

  h += '<h3>Kişi Bazlı Özet</h3><table><thead><tr><th>İsim</th><th>Sicil</th><th>Kayıt</th><th>Toplam Kayıp (sa)</th><th>Toplam Kesinti</th></tr></thead><tbody>';
  Object.entries(kisiOzet)
    .map(([sicil, o]) => ({ sicil, ...o }))
    .sort((x, y) => y.topTutar - x.topTutar)
    .forEach((o) => {
      h += `<tr><td>${esc(o.isim)}</td><td>${esc(o.sicil)}</td><td>${o.kayitSay}</td>`
        + `<td>${(o.topDk / 60).toFixed(2)}</td><td>-${o.topTutar.toFixed(2)}</td></tr>`;
    });
  h += '</tbody></table>';
  h += `<p>Tolerans: ${a.tolGec} dk giriş, ${a.tolErken} dk çıkış • İş saatleri: ${esc(a.baslangic)} - ${esc(a.bitis)} • Mola: ${esc(a.molaBaslangic)} - ${esc(a.molaBitis)}</p>`;

  const aylarAscii = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
  downloadXls(h, `ERP-UMIT-Kesinti-${aylarAscii[secim.ay]}-${secim.yil}`);
  toast(`Excel indirildi: ${liste.length} kayıt`, 'success');
}

// ---------- sayfa kaydı ----------

function render(container) {
  ensureDonem();
  container.innerHTML = shellHtml();
  const root = container;

  root.querySelector('#kesintiAySec').value = String(secim.ay);
  root.querySelector('#kesintiYilSec').value = String(secim.yil);
  root.querySelector('#kesintiTipSec').value = secim.tip;
  root.querySelector('#kesintiArama').value = secim.arama;

  fillDatalist(root);

  root.addEventListener('click', (ev) => {
    const act = ev.target.closest('[data-act]')?.dataset.act;
    if (act === 'ekle') ekle(root);
    else if (act === 'temizle') formTemizle(root);
    else if (act === 'ayar-kaydet') ayarlariKaydet(root);
    else if (act === 'excel') exportExcel();
    else if (act === 'print') window.print();
    const editId = ev.target.closest('[data-edit]')?.dataset.edit;
    if (editId) duzenleModal(Number(editId));
    const delId = ev.target.closest('[data-del]')?.dataset.del;
    if (delId) sil(Number(delId));
  });

  ['#kKisi', '#kGiris', '#kCikis'].forEach((sel) => {
    root.querySelector(sel).addEventListener('input', () => updateOnizleme(root));
  });

  root.querySelector('#kesintiAySec').addEventListener('change', (ev) => { secim.ay = Number(ev.target.value); drawTable(root); });
  root.querySelector('#kesintiYilSec').addEventListener('change', (ev) => { secim.yil = Number(ev.target.value); drawTable(root); });
  root.querySelector('#kesintiTipSec').addEventListener('change', (ev) => { secim.tip = ev.target.value; drawTable(root); });
  root.querySelector('#kesintiArama').addEventListener('input', (ev) => { secim.arama = ev.target.value; drawTable(root); });

  const unsub1 = subscribe('kesintiler', () => drawTable(root));
  const unsub2 = subscribe('personeller', () => fillDatalist(root));

  drawTable(root);
  return () => { unsub1(); unsub2(); };
}

registerPage('kesinti', { title: 'Geç/Erken Kesinti', icon: 'clock', section: 'Finans' }, render);
