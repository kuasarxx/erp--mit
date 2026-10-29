// ============================================================
// ERP ÜMİT v2 — Puantaj Sayfası (Yevmiye Takibi)
// Legacy'deki page-puantaj modülünün modüler karşılığı.
//  - Hücre düzenleme: sayı / X(gelmedi) / İ(izinli) / R(raporlu)
//  - Klavye navigasyonu: ok tuşları + Tab ile sonraki hücre
//  - Liste Yükle (Excel'den ID+İsim+Meslek yapıştırma)
//  - Saatlerden Yükle (ID+Giriş+Çıkış -> vardiya kuralı -> yevmiye)
//  - Günün Özeti, Excel'e Aktar, Tabloyu Boşalt, Boş günleri X yap
// Emoji yok; tüm görseller SVG ikon + renk tokenları.
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe, touch } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, normalizeTR } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { openModal, confirmDialog } from '../core/modal.js';
import { ensureDonem, savePuantaj, AYLAR, GUNLER } from '../core/donemService.js';
import {
  gunSayisi, haftaGunu, satirToplam, gunOzeti, hucreTipi,
  parseListe, parseSaatMetni, vardiyaHesapla, normalSaatHesapla,
} from '../core/hesaplamalar.js';
import { syncNow, scheduleSync } from '../core/syncService.js';
import { writeKey } from '../core/storage.js';

let searchQuery = '';
let ozetGun = null; // 'YYYY-MM-DD' — seçili özet günü (null => dün)

// ---------- küçük yardımcılar ----------

function trRound(n) { return Math.round(n * 100) / 100; }

function isoOfDay(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const g = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${g}`;
}

function defaultOzetDate() {
  const p = state.puantaj;
  const bugun = new Date();
  let hedef;
  if (bugun.getFullYear() === p.yil && bugun.getMonth() === p.ay) {
    hedef = new Date(p.yil, p.ay, Math.max(1, bugun.getDate() - 1));
  } else {
    hedef = new Date(p.yil, p.ay, gunSayisi(p.yil, p.ay));
  }
  return hedef;
}

/** Düzenlemeleri store'a işler + dönem anahtarına yazar + bulut debounce. */
function commitPuantaj() {
  savePuantaj();
  touch('puantaj');
  scheduleSync();
}

// ---------- Günün Özeti ----------

function renderOzetBar() {
  const el = document.getElementById('puantaj-ozet');
  if (!el) return;
  const p = state.puantaj;
  const secili = ozetGun ? new Date(`${ozetGun}T12:00:00`) : defaultOzetDate();
  const gun = secili.getDate(), ay = secili.getMonth(), yil = secili.getFullYear();

  el.innerHTML = `
    <div class="daybar">
      <div class="daybar__label">${icon('chart')}<span>Günün Özeti</span></div>
      <button class="icon-btn" data-ozet="-1" aria-label="Önceki gün" title="Önceki gün">${icon('chevron-left')}</button>
      <input type="date" class="input daybar__date" id="ozetTarih" value="${isoOfDay(secili)}">
      <button class="icon-btn" data-ozet="1" aria-label="Sonraki gün" title="Sonraki gün">${icon('chevron-right')}</button>
      <div class="daybar__content" id="ozetIcerik"></div>
    </div>`;

  const ic = el.querySelector('#ozetIcerik');
  if (yil !== p.yil || ay !== p.ay) {
    ic.innerHTML = `<span class="text-muted">Bu tarih aktif dönemde değil (${gun}.${ay + 1}.${yil}).</span>`;
    return;
  }
  const o = gunOzeti(p.personeller, gun);
  const chips = [
    ['ok', `${o.gelen} geldi`],
    ...(o.gelmeyen ? [['danger', `${o.gelmeyen} gelmedi`]] : []),
    ...(o.izinli ? [['info', `${o.izinli} izinli`]] : []),
    ...(o.raporlu ? [['warn', `${o.raporlu} raporlu`]] : []),
    ['accent', `${trRound(o.yevmiye)} yevmiye`],
    ...(o.girilmemis ? [['muted', `${o.girilmemis} girilmedi`]] : []),
  ];
  ic.innerHTML = `<span class="daybar__date-txt">${gun} ${AYLAR[ay]} ${yil} (${GUNLER[secili.getDay()]})</span>`
    + chips.map(([cls, txt]) => `<span class="chip chip--${cls}">${esc(txt)}</span>`).join('');
}

// ---------- Tablo ----------

function sortedPersoneller() {
  const p = state.puantaj;
  const sirali = [...p.personeller].sort((a, b) =>
    String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));
  if (!searchQuery) return sirali;
  const q = normalizeTR(searchQuery);
  return sirali.filter((x) => normalizeTR(x.isim).includes(q) || normalizeTR(x.id).includes(q));
}

function renderTable() {
  const p = state.puantaj;
  const gs = gunSayisi(p.yil, p.ay);
  const head = document.getElementById('payHead');
  const body = document.getElementById('payBody');
  const alt = document.getElementById('payFooter');
  if (!head || !body) return;

  // --- thead ---
  let h = '<tr>'
    + '<th class="pk pk--id sticky-col">ID</th>'
    + '<th class="pk pk--name sticky-col">İsim</th>';
  if (!p.meslekGizli) h += '<th class="pk">Meslek</th>';
  for (let g = 1; g <= gs; g++) {
    const pazar = haftaGunu(p.yil, p.ay, g) === 0;
    h += `<th class="pg${pazar && p.pazarRenk ? ' is-sunday' : ''}" title="${g} ${AYLAR[p.ay]}">
            <span class="pg__no">${g}</span><span class="pg__dow">${GUNLER[haftaGunu(p.yil, p.ay, g)]}</span>
          </th>`;
  }
  h += '<th class="pt pt--gun">GÜN</th><th class="pt">YEVMİYE</th></tr>';
  head.innerHTML = h;

  // --- boş durum ---
  if (p.personeller.length === 0) {
    body.innerHTML = `<tr><td colspan="${gs + 5}">
      <div class="empty-state">
        ${icon('file-text')}
        <h3>Henüz personel yok</h3>
        <p>“Liste Yükle” butonuyla tersane Excel’inden başla.</p>
      </div></td></tr>`;
    if (alt) alt.innerHTML = '';
    return;
  }

  // --- tbody ---
  const liste = sortedPersoneller();
  let genelGun = 0, genelYev = 0;
  const gunToplam = {}, gunKisi = {};
  let b = '';
  for (const per of liste) {
    const { gun, yevmiye } = satirToplam(per, gs);
    genelGun += gun; genelYev += yevmiye;
    b += `<tr data-id="${esc(per.id)}">
      <td class="pk pk--id sticky-col">${esc(per.id)}</td>
      <td class="pk pk--name sticky-col">${esc(per.isim)}${per.notlar && Object.keys(per.notlar).length ? `<span class="note-dot" title="Not var"></span>` : ''}</td>`;
    if (!p.meslekGizli) b += `<td class="pk pk--job text-muted">${esc(per.meslek || '—')}</td>`;
    for (let g = 1; g <= gs; g++) {
      const v = per.gunler?.[g];
      const tip = hucreTipi(v);
      const pazar = haftaGunu(p.yil, p.ay, g) === 0;
      const cls = ['cell',
        pazar && p.pazarRenk ? 'is-sunday' : '',
        tip !== 'bos' && tip !== 'sayi' ? `is-${tip}` : '',
        tip === 'sayi' ? 'is-filled' : '',
        per.notlar?.[g] ? 'has-note' : '',
      ].filter(Boolean).join(' ');
      const txt = tip === 'gelmedi' ? 'X' : tip === 'izinli' ? 'İ' : tip === 'raporlu' ? 'R' : (v ?? '');
      const title = per.notlar?.[g] ? `Not: ${per.notlar[g]}` : '';
      if (tip === 'sayi') { gunToplam[g] = (gunToplam[g] || 0) + Number(v); gunKisi[g] = (gunKisi[g] || 0) + 1; }
      b += `<td class="${cls}" data-gun="${g}" data-id="${esc(per.id)}" title="${esc(title)}">${txt === undefined || txt === null ? '' : txt}</td>`;
    }
    b += `<td class="pt pt--gun${gun === 0 ? ' is-zero' : ''}">${gun}</td>
          <td class="pt${yevmiye === 0 ? ' is-zero' : ''}">${trRound(yevmiye)}</td></tr>`;
  }
  // günlük toplam satırı
  b += `<tr class="totals-row"><td colspan="${p.meslekGizli ? 2 : 3}" class="totals-label">Günlük Toplam</td>`;
  for (let g = 1; g <= gs; g++) {
    const t = gunToplam[g] || 0, k = gunKisi[g] || 0;
    b += `<td>${k === 0 && t === 0 ? '—' : `${k}k/${trRound(t)}`}</td>`;
  }
  b += `<td class="pt pt--gun">${genelGun}</td><td class="pt">${trRound(genelYev)}</td></tr>`;
  body.innerHTML = b;

  if (alt) {
    alt.innerHTML = `
      <div class="summary-bar">
        <span>${icon('users')} <b>${p.personeller.length}</b> personel</span>
        <span>${icon('calendar')} <b>${gs}</b> gün</span>
        <span>${icon('check')} Toplam gelinen: <b>${genelGun}</b> adam-gün</span>
        <span class="spacer"></span>
        <span>${icon('wallet')} Genel Yevmiye: <b class="summary-total">${trRound(genelYev)}</b></span>
      </div>`;
  }
}

// ---------- Hücre düzenleme + klavye ----------

function startEdit(td) {
  if (td.querySelector('input')) return;
  const id = td.dataset.id, gun = parseInt(td.dataset.gun, 10);
  const p = state.puantaj;
  const per = p.personeller.find((x) => String(x.id) === String(id));
  if (!per) return;
  const mevcut = per.gunler?.[gun] ?? '';
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = 'cell-input';
  input.value = String(mevcut).toUpperCase() === 'X' ? 'X' : mevcut;
  td.replaceChildren(input);
  input.focus(); input.select();

  let done = false;
  const finish = (save, dir) => {
    if (done) return; done = true;
    if (save) {
      const raw = input.value.trim();
      if (!per.gunler) per.gunler = {};
      const u = raw.toUpperCase();
      if (raw === '') delete per.gunler[gun];
      else if (u === 'X') per.gunler[gun] = 'X';
      else if (u === 'İ' || u === 'I') per.gunler[gun] = 'İ';
      else if (u === 'R') per.gunler[gun] = 'R';
      else {
        const n = parseFloat(raw.replace(',', '.'));
        if (!Number.isNaN(n) && n >= 0) per.gunler[gun] = n;
        else { toast('Geçersiz değer', 'error'); }
      }
      commitPuantaj();
    }
    drawAll();
    if (dir) focusNext(id, gun, dir);
  };

  input.addEventListener('blur', () => finish(true, null));
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true, 'down'); }
    else if (ev.key === 'Tab') { ev.preventDefault(); finish(true, ev.shiftKey ? 'left' : 'right'); }
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); finish(true, 'right'); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); finish(true, 'left'); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); finish(true, 'down'); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); finish(true, 'up'); }
    else if (ev.key === 'Escape') finish(false, null);
  });
}

function focusNext(id, gun, dir) {
  const p = state.puantaj;
  const gs = gunSayisi(p.yil, p.ay);
  const liste = sortedPersoneller();
  const idx = liste.findIndex((x) => String(x.id) === String(id));
  let yeniId = id, yeniGun = gun;
  if (dir === 'right') yeniGun = Math.min(gs, gun + 1);
  else if (dir === 'left') yeniGun = Math.max(1, gun - 1);
  else if (dir === 'down' && idx + 1 < liste.length) yeniId = liste[idx + 1].id;
  else if (dir === 'up' && idx - 1 >= 0) yeniId = liste[idx - 1].id;
  setTimeout(() => {
    const td = document.querySelector(`td.cell[data-id="${CSS.escape(String(yeniId))}"][data-gun="${yeniGun}"]`);
    if (td) startEdit(td);
  }, 20);
}

// ---------- Not modalı ----------

function openNote(id, gun) {
  const p = state.puantaj;
  const per = p.personeller.find((x) => String(x.id) === String(id));
  if (!per) return;
  const mevcut = per.notlar?.[gun] || '';
  openModal({
    title: `Not — ${esc(per.isim)}`,
    body: `
      <div class="stack-sm">
        <div class="text-muted" style="font-size:13px">
          ${gun} ${AYLAR[p.ay]} ${p.yil} (${GUNLER[haftaGunu(p.yil, p.ay, gun)]})
        </div>
        <textarea class="textarea" id="notAlan" rows="3" placeholder="Örn: izinli, raporlu...">${esc(mevcut)}</textarea>
      </div>`,
    footer: `
      <button class="btn btn--danger" data-not-sil>${icon('trash')} Notu Sil</button>
      <div class="spacer"></div>
      <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
      <button class="btn btn--primary" data-not-kaydet>${icon('save')} Kaydet</button>`,
    onMount: (root) => {
      const ta = root.querySelector('#notAlan');
      ta.focus();
      const apply = (val) => {
        if (!per.notlar) per.notlar = {};
        if (val === '') delete per.notlar[gun]; else per.notlar[gun] = val;
        commitPuantaj();
        drawAll();
      };
      root.querySelector('[data-not-kaydet]').addEventListener('click', () => {
        const v = ta.value.trim();
        apply(v); toast(v ? 'Not kaydedildi' : 'Not silindi', 'success');
        closeModalSafe();
      });
      root.querySelector('[data-not-sil]').addEventListener('click', () => {
        apply(''); toast('Not silindi', 'success'); closeModalSafe();
      });
    },
  });
}

function closeModalSafe() { import('../core/modal.js').then((m) => m.closeModal()); }

// ---------- Liste Yükle ----------

function openImportList() {
  openModal({
    title: `${icon('upload')} Liste Yükle`,
    body: `
      <div class="stack-sm">
        <p class="hint">Tersane Excel'inden sütunları kopyala-yapıştır.
          Beklenen biçim: <b>ID → Sekme → İsim → Sekme → Meslek</b> (meslek opsiyonel).</p>
        <textarea class="textarea mono" id="listeAlan" rows="10"
          placeholder="1042&#9;Ahmet Yılmaz&#9;Kaynakçı&#10;1043&#9;Mehmet Demir"></textarea>
        <div class="hint text-muted">İlk satır başlık ise otomatik atlanır.</div>
      </div>`,
    footer: `
      <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
      <button class="btn btn--primary" data-liste-yukle>${icon('check')} Yükle</button>`,
    onMount: (root) => {
      const ta = root.querySelector('#listeAlan');
      ta.focus();
      root.querySelector('[data-liste-yukle]').addEventListener('click', () => {
        const yeni = parseListe(ta.value);
        if (!yeni.length) { toast('Geçerli satır bulunamadı', 'error'); return; }
        const p = state.puantaj;
        let eklenen = 0, guncellenen = 0, anaEklenen = 0;
        for (const y of yeni) {
          const mevcut = p.personeller.find((x) => String(x.id) === String(y.id));
          if (mevcut) { mevcut.isim = y.isim || mevcut.isim; mevcut.meslek = y.meslek || mevcut.meslek; guncellenen++; }
          else { p.personeller.push({ id: y.id, isim: y.isim, meslek: y.meslek, gunler: {}, notlar: {} }); eklenen++; }
          // Global personel listesine de yansıt (legacy davranışı)
          const ana = state.personeller.find((x) => String(x.sicil).trim() === String(y.id).trim());
          if (ana) { if (y.isim) ana.ad = y.isim; if (y.meslek) ana.meslek = y.meslek; }
          else {
            state.personeller.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              ad: y.isim, sicil: y.id, meslek: y.meslek, maas: 0, gunluk: 7.5,
              tur: 'maasli', telefon: '', tc: '', iban: '', girisTarihi: '', departman: '',
              not: '', olusturmaTarihi: new Date().toISOString(), kaynak: 'puantaj',
            });
            anaEklenen++;
          }
        }
        touch('personeller');
        commitPuantaj();
        drawAll();
        let msg = `${eklenen} puantaja eklendi`;
        if (guncellenen) msg += ` • ${guncellenen} güncellendi`;
        if (anaEklenen) msg += ` • ${anaEklenen} personel listesine eklendi`;
        toast(msg, 'success');
        closeModalSafe();
      });
    },
  });
}

// ---------- Saatlerden Yükle ----------

function lastPuantajDate() {
  return state.sonPuantajTarihi || null;
}

function smartDefaultDate() {
  const son = lastPuantajDate();
  let hedef;
  if (son) {
    const d = new Date(`${son}T12:00:00`);
    d.setDate(d.getDate() + 1);
    hedef = d;
  } else {
    hedef = new Date();
    hedef.setDate(hedef.getDate() - 1);
  }
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  if (hedef > bugun) hedef = bugun;
  return hedef;
}

function saatBilgiMesaji() {
  const son = lastPuantajDate();
  if (!son) return 'İlk kullanım: varsayılan tarih dün.';
  const sonD = new Date(`${son}T12:00:00`);
  const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
  const fark = Math.round((bugun - sonD) / 86_400_000);
  const s = `${sonD.getDate()}.${sonD.getMonth() + 1}.${sonD.getFullYear()}`;
  if (fark <= 1) return `Son giriş: ${s}. Varsayılan tarih akıllı seçildi.`;
  if (fark <= 7) return `Son giriş ${fark} gün önce (${s}). Tarihi mutlaka kontrol et.`;
  return `Son giriş ${fark} gün önce (${s}). Ara verildi mi? Kaç gün gireceksin?`;
}

function openImportHours() {
  const defDate = smartDefaultDate();
  openModal({
    title: `${icon('clock')} Saatlerden Yükle`,
    body: `
      <div class="stack-sm">
        <div class="alert alert--info">${icon('info')} <span id="saatBilgi">${saatBilgiMesaji()}</span></div>
        <div class="field">
          <label class="field__label" for="saatTarih">Tarih</label>
          <input type="date" class="input" id="saatTarih" value="${isoOfDay(defDate)}">
        </div>
        <p class="hint">Biçim: <b>ID → Sekme → Giriş → Sekme → Çıkış</b> (HH:MM).
          Girişi/çıkışı boş satırlar “gelmedi (X)” olarak işaretlenir.</p>
        <textarea class="textarea mono" id="saatAlan" rows="8"
          placeholder="1042&#9;07:15&#9;17:30&#10;1043&#9;06:50&#9;18:05"></textarea>
        <div id="saatOnizleme"></div>
      </div>`,
    footer: `
      <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
      <button class="btn btn--primary" data-onizle>${icon('search')} Önizle</button>
      <button class="btn btn--success" data-onayla style="display:none">${icon('save')} Onayla ve Kaydet</button>`,
    onMount: (root) => {
      let sonuclar = [], hedefGun = null;

      root.querySelector('[data-onizle]').addEventListener('click', () => {
        const metin = root.querySelector('#saatAlan').value.trim();
        const tarihV = root.querySelector('#saatTarih').value;
        if (!metin) { toast('Yapıştırma alanı boş', 'error'); return; }
        if (!tarihV) { toast('Lütfen tarih seç', 'error'); return; }

        const t = new Date(`${tarihV}T12:00:00`);
        const p = state.puantaj;
        if (t.getFullYear() !== p.yil || t.getMonth() !== p.ay) {
          toast('Seçili tarih aktif dönemde değil', 'error'); return;
        }
        hedefGun = t.getDate();

        const satirlar = parseSaatMetni(metin);
        sonuclar = satirlar.map((s) => {
          const per = p.personeller.find((x) => String(x.id) === String(s.id));
          const isim = per ? per.isim : '?';
          if (!s.giris || !s.cikis) return { ...s, isim, yevmiye: 'X', tip: 'gelmedi' };
          const y = vardiyaHesapla(s.giris, s.cikis, state.vardiyaKurallari);
          if (y === null) return { ...s, isim, yevmiye: '?', tip: 'kural-yok' };
          const normal = normalSaatHesapla(s.giris, s.cikis, state.normalSaatler);
          return { ...s, isim, yevmiye: y, tip: 'ok', normalYevmiye: normal, farkVar: normal !== null && normal !== y };
        });

        if (!sonuclar.length) { toast('Hiç geçerli satır yok', 'error'); return; }

        const okSay = sonuclar.filter((x) => x.tip === 'ok').length;
        const oz = root.querySelector('#saatOnizleme');
        oz.innerHTML = `
          <div class="preview-head">
            ${icon('calendar')} <b>${hedefGun} ${AYLAR[t.getMonth()]} ${t.getFullYear()}</b> —
            ${okSay} hesaplandı,
            ${sonuclar.filter((x) => x.tip === 'gelmedi').length} gelmedi,
            ${sonuclar.filter((x) => x.tip === 'kural-yok').length} kural yok
          </div>
          ${sonuclar.filter((x) => x.tip !== 'gelmedi' || x.giris || x.cikis).map((s, i) => `
            <div class="preview-row">
              <span class="badge badge--${s.tip === 'ok' ? 'ok' : s.tip === 'gelmedi' ? 'danger' : 'warn'}">${s.tip === 'ok' ? 'uydu' : s.tip === 'gelmedi' ? 'gelmedi' : 'kural yok'}</span>
              <b>${esc(s.isim)}</b> <span class="text-muted">(${esc(s.id)})</span>
              <span class="text-muted">${esc(s.giris || '—')} → ${esc(s.cikis || '—')}</span>
              ${s.farkVar ? `<span class="badge badge--warn" title="Normal saat profili: ${s.normalYevmiye}">normdan farklı: ${s.normalYevmiye}</span>` : ''}
              <div class="spacer"></div>
              <select class="select select--sm" data-i="${i}">
                ${['?', 'X', '0.5', '1', '1.5', '2', '2.5', '3'].map((o) =>
                  `<option value="${o}"${String(s.yevmiye) === o ? ' selected' : ''}>${o}</option>`).join('')}
              </select>
            </div>`).join('')}`;

        // seçimlerle yevmiye değiştirme
        oz.querySelectorAll('select[data-i]').forEach((sel) => {
          sel.addEventListener('change', () => {
            const s = sonuclar[Number(sel.dataset.i)];
            if (sel.value === 'X') { s.yevmiye = 'X'; s.tip = 'gelmedi'; }
            else if (sel.value === '?') { s.yevmiye = '?'; s.tip = 'kural-yok'; }
            else { s.yevmiye = parseFloat(sel.value); s.tip = 'ok'; }
          });
        });

        const btnOnay = root.querySelector('[data-onayla]');
        btnOnay.style.display = '';
        btnOnay.textContent = `Onayla ve Kaydet (${sonuclar.length})`;
      });

      root.querySelector('[data-onayla]').addEventListener('click', async () => {
        if (!sonuclar.length || !hedefGun) return;
        const onay = await confirmDialog(
          `${sonuclar.length} kişinin puantajı ${hedefGun}. güne kaydedilecek.\n\nOnaylıyor musun?`);
        if (!onay) return;
        const p = state.puantaj;
        let guncellenen = 0;
        for (const s of sonuclar) {
          const per = p.personeller.find((x) => String(x.id) === String(s.id));
          if (!per) continue;
          if (!per.gunler) per.gunler = {};
          per.gunler[hedefGun] = s.tip === 'gelmedi' ? 'X' : (s.tip === 'kural-yok' ? '' : s.yevmiye);
          if (s.tip === 'kural-yok') delete per.gunler[hedefGun];
          guncellenen++;
        }
        // son puantaj tarihini akıllı ilerlet (legacy mantığı)
        const tarihV = root.querySelector('#saatTarih').value;
        if (tarihV) { setState('sonPuantajTarihi', tarihV); writeKey('umit_erp_son_puantaj_tarihi', tarihV); }
        commitPuantaj();
        drawAll();
        toast(`${guncellenen} kişi kaydedildi`, 'success');
        closeModalSafe();
      });
    },
  });
}

// ---------- Excel'e Aktar ----------

function exportExcel() {
  const p = state.puantaj;
  if (!p.personeller.length) { toast('Aktarılacak personel yok', 'error'); return; }
  const gs = gunSayisi(p.yil, p.ay);
  const AYLAR_ASCII = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
  let h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="UTF-8"><style>'
    + 'table{border-collapse:collapse;font-family:Arial;font-size:11px}'
    + 'th{background:#0c4a6e;color:#fff;padding:6px 4px;border:1px solid #333;text-align:center;font-size:10px}'
    + 'th.pazar{background:#d97706}th.toplam{background:#16a34a}'
    + 'td{padding:5px 4px;border:1px solid #ccc;text-align:center;font-size:11px}'
    + 'td.isim{text-align:left;font-weight:bold;white-space:nowrap}td.meslek{text-align:left;font-size:10px;color:#0284c7}'
    + 'td.pazar{background:#fef3c7}td.gelmedi{background:#fee2e2;color:#dc2626;font-weight:bold}'
    + 'td.toplam{background:#dcfce7;font-weight:bold;color:#16a34a}td.gtoplam{background:#f1f5f9;font-weight:bold;color:#0c4a6e}'
    + '</style></head><body>';
  h += `<h2>ERP ÜMİT — ${AYLAR[p.ay]} ${p.yil} Puantaj</h2>`;
  h += '<table><thead><tr><th>ID</th><th>İsim</th><th>Meslek</th>';
  for (let g = 1; g <= gs; g++) {
    const hg = haftaGunu(p.yil, p.ay, g);
    h += `<th${hg === 0 ? ' class="pazar"' : ''}>${g}<br><span style="font-size:8px">${GUNLER[hg]}</span></th>`;
  }
  h += '<th class="toplam">TOPLAM</th></tr></thead><tbody>';
  let genel = 0;
  for (const per of [...p.personeller].sort((a, b) => String(a.isim).localeCompare(String(b.isim), 'tr'))) {
    h += `<tr><td>${esc(per.id)}</td><td class="isim">${esc(per.isim)}</td><td class="meslek">${esc(per.meslek || '-')}</td>`;
    let satirTop = 0;
    for (let g = 1; g <= gs; g++) {
      const v = per.gunler?.[g];
      const tip = hucreTipi(v);
      const pazar = haftaGunu(p.yil, p.ay, g) === 0;
      let cls = pazar ? 'pazar' : '';
      if (tip === 'gelmedi') { cls += ' gelmedi'; h += `<td class="${cls}">X</td>`; continue; }
      if (tip === 'sayi') { satirTop += Number(v) || 0; h += `<td class="${cls}">${v}</td>`; }
      else h += `<td class="${cls}">${tip === 'izinli' ? 'İ' : tip === 'raporlu' ? 'R' : ''}</td>`;
    }
    genel += satirTop;
    h += `<td class="toplam">${trRound(satirTop)}</td></tr>`;
  }
  h += '</tbody></table></body></html>';
  const blob = new Blob(['\ufeff' + h], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ERP-UMIT-Puantaj-${AYLAR_ASCII[p.ay]}-${p.yil}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Excel indirildi: ${p.personeller.length} kişi`, 'success');
}

// ---------- Diğer eylemler ----------

async function clearTable() {
  const p = state.puantaj;
  if (!p.personeller.length) { toast('Zaten boş', 'info'); return; }
  const ok = await confirmDialog(
    `Tüm puantaj verisi silinecek!\n\n${p.personeller.length} kişi kaldırılacak.\nEmin misiniz?`,
    { danger: true, okText: 'Sil' });
  if (!ok) return;
  p.personeller = [];
  commitPuantaj();
  drawAll();
  toast('Tablo temizlendi', 'success');
}

async function markEmptyAsX() {
  const p = state.puantaj;
  if (!p.personeller.length) { toast('Tabloda personel yok', 'error'); return; }
  const ok = await confirmDialog(
    'Boş olan tüm hücreler "X" (gelmedi) olarak işaretlenecek.\nGelecek günlere dokunulmaz.\n\nEmin misiniz?',
    { danger: true, okText: 'İşaretle' });
  if (!ok) return;
  const gs = gunSayisi(p.yil, p.ay);
  const bugun = new Date();
  let maxGun = gs;
  if (p.yil === bugun.getFullYear() && p.ay === bugun.getMonth()) maxGun = bugun.getDate() - 1;
  else if (p.yil > bugun.getFullYear() || (p.yil === bugun.getFullYear() && p.ay > bugun.getMonth())) {
    toast('Bu dönem henüz başlamamış', 'error'); return;
  }
  let sayac = 0;
  for (const per of p.personeller) {
    if (!per.gunler) per.gunler = {};
    for (let g = 1; g <= maxGun; g++) {
      if (per.gunler[g] === undefined || per.gunler[g] === null || per.gunler[g] === '') {
        per.gunler[g] = 'X'; sayac++;
      }
    }
  }
  commitPuantaj();
  drawAll();
  toast(`${sayac} boş hücre "X" olarak işaretlendi`, 'success');
}

async function saveAll() {
  commitPuantaj();
  try {
    await syncNow();
    toast('Puantaj kaydedildi (yerel + bulut)', 'success');
  } catch (e) {
    toast(`Yerel kaydedildi, bulut: ${e?.message || 'hata'}`, 'error');
  }
}

// ---------- Görünüm iskeleti ----------

function shellHtml() {
  const p = state.puantaj;
  const yillar = [];
  const simdi = new Date().getFullYear();
  for (let y = simdi - 3; y <= simdi + 2; y++) yillar.push(y);
  return `
    <div class="page stack">
      <div id="puantaj-ozet"></div>

      <div class="card">
        <div class="card__body toolbar-area">
          <div class="toolbar">
            <div class="field-inline">
              <label class="field__label" for="payAy">Ay</label>
              <select class="select" id="payAy">
                ${AYLAR.map((a, i) => `<option value="${i}"${i === p.ay ? ' selected' : ''}>${a}</option>`).join('')}
              </select>
            </div>
            <div class="field-inline">
              <label class="field__label" for="payYil">Yıl</label>
              <select class="select" id="payYil">
                ${yillar.map((y) => `<option value="${y}"${y === p.yil ? ' selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>
            <div class="spacer"></div>
            <button class="btn btn--secondary btn--sm" data-act="import-liste">${icon('upload')} Liste Yükle</button>
            <button class="btn btn--secondary btn--sm" data-act="import-saat">${icon('clock')} Saatlerden Yükle</button>
            <button class="btn btn--secondary btn--sm" data-act="excel">${icon('download')} Excel'e Aktar</button>
            <button class="btn btn--ghost btn--sm" data-act="print">${icon('printer')} Yazdır</button>
            <button class="btn btn--ghost btn--sm" data-act="toggle-meslek">
              ${icon(p.meslekGizli ? 'eye-off' : 'eye')} ${p.meslekGizli ? 'Mesleği Göster' : 'Mesleği Gizle'}
            </button>
            <button class="btn btn--ghost btn--sm${p.pazarRenk ? ' is-active-toggle' : ''}" data-act="toggle-pazar">
              Pazar Rengi: ${p.pazarRenk ? 'Açık' : 'Kapalı'}
            </button>
            <div class="spacer"></div>
            <button class="btn btn--danger btn--sm" data-act="mark-x">${icon('x')} Boş Günleri X Yap</button>
            <button class="btn btn--danger btn--sm" data-act="clear">${icon('trash')} Tabloyu Boşalt</button>
            <button class="btn btn--success" data-act="save">${icon('save')} KAYDET</button>
          </div>
          <div class="search" style="margin-top:10px">
            ${icon('search')}
            <input class="input" id="payArama" type="text" placeholder="İsim veya sicil ara..." value="${esc(searchQuery)}">
          </div>
        </div>
      </div>

      <div class="card">
        <div class="tablo-scroll pay-scroll">
          <table class="pay-table" id="payTable">
            <thead id="payHead"></thead>
            <tbody id="payBody"></tbody>
          </table>
        </div>
        <div id="payFooter"></div>
      </div>
    </div>`;
}

function drawAll() {
  renderOzetBar();
  renderTable();
}

// ---------- Sayfa kaydı ----------

function render(container) {
  ensureDonem(); // aktif dönemi yükle (yoksa bugünden oluştur)
  container.innerHTML = shellHtml();

  const p = () => state.puantaj;

  // Delegasyon: butonlar
  container.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'import-liste') openImportList();
    else if (act === 'import-saat') openImportHours();
    else if (act === 'excel') exportExcel();
    else if (act === 'print') window.print();
    else if (act === 'toggle-meslek') { p().meslekGizli = !p().meslekGizli; commitPuantaj(); container.innerHTML = shellHtml(); bindOnce(); drawAll(); }
    else if (act === 'toggle-pazar') { p().pazarRenk = !p().pazarRenk; commitPuantaj(); drawAll(); }
    else if (act === 'clear') clearTable();
    else if (act === 'mark-x') markEmptyAsX();
    else if (act === 'save') saveAll();

    const ozet = e.target.closest('[data-ozet]')?.dataset.ozet;
    if (ozet) {
      const cur = ozetGun ? new Date(`${ozetGun}T12:00:00`) : defaultOzetDate();
      cur.setDate(cur.getDate() + Number(ozet));
      ozetGun = isoOfDay(cur);
      renderOzetBar();
    }

    const td = e.target.closest('td.cell');
    if (td && !td.querySelector('input')) startEdit(td);
  });

  // Sağ tık -> not
  container.addEventListener('contextmenu', (e) => {
    const td = e.target.closest('td.cell');
    if (!td) return;
    e.preventDefault();
    openNote(td.dataset.id, parseInt(td.dataset.gun, 10));
  });

  // Arama
  container.querySelector('#payArama')?.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderTable();
  });

  // Ay/yıl değişimi -> dönem geçişi
  const changePeriod = () => {
    const ay = Number(container.querySelector('#payAy').value);
    const yil = Number(container.querySelector('#payYil').value);
    savePuantaj();           // eski dönemi kaydet
    ensureDonem({ yil, ay }); // yeni dönemi yükle
    drawAll();
  };
  container.querySelector('#payAy')?.addEventListener('change', changePeriod);
  container.querySelector('#payYil')?.addEventListener('change', changePeriod);

  // Özet tarih seçici
  container.addEventListener('change', (e) => {
    if (e.target.id === 'ozetTarih' && e.target.value) {
      ozetGun = e.target.value;
      renderOzetBar();
    }
  });

  bindOnce();
  drawAll();

  // Store değişince tabloyu tazele (başka sayfadan yazma senaryosuna karşı)
  const unsub = subscribe('puantaj', () => { /* commitPuantaj zaten drawAll çağırıyor; döngüyü önle */ });
  return () => unsub();
}

// tek seferlik global bağlama koruması
let onceBound = false;
function bindOnce() {
  if (onceBound) return;
  onceBound = true;
}

registerPage('puantaj', { title: 'Puantaj', icon: 'calculator', section: 'Genel' }, render);
