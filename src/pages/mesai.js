// ============================================================
// ERP ÜMİT v2 — Fazla Mesai Takibi Sayfası
// Legacy'deki page-mesai modülünün modüler karşılığı.
//  - Hücre düzenleme: ondalık saat (2.33, 4,58) + ok tuşu navigasyonu
//  - H.İçi / H.Sonu (Pazar) / Resmi Tatil ayrı toplanır
//  - Excel'den Yükle (ID + saat yapıştırma veya .xls/.xlsx dosyası)
//  - Resmi Tatil modalı (sistem + elle eklenen tatiller)
//  - Excel'e Aktar (.xls) ve Yazdırma
// Kalıcılık: umit_erp_<donemId>_mesai_v1 -> { veriler, state }
// Emoji yok; tüm görseller SVG ikon + renk tokenları.
// ============================================================

import { registerPage } from '../core/router.js';
import { state, setState, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { openModal, closeModal, confirmDialog } from '../core/modal.js';
import { ensureDonem, AYLAR, GUNLER } from '../core/donemService.js';
import { gunSayisi, haftaGunu } from '../core/hesaplamalar.js';
import {
  loadResmiTatiller, aylikResmiTatiller, resmiTatilVarMi,
  resmiTatilEkle, resmiTatilKaldir,
} from '../core/resmiTatilService.js';
import { scheduleSync } from '../core/syncService.js';

const pad2 = (n) => String(n).padStart(2, '0');

// ---------- veri yardımcıları (legacy mesaiVerisiAl/Yaz ile birebir) ----------

function msState() { return state.mesai.state; }

function mesaiSaat(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? null : n;
}

function mesaiVerisiAl(sicil, gun) {
  const v = state.mesai.veriler[sicil];
  return v ? v[gun] : null;
}

/** Değişikliği store'a işler + dönem anahtarına yazar + bulut debounce. */
function commitMesai(fn) {
  const veriler = JSON.parse(JSON.stringify(state.mesai.veriler));
  fn(veriler);
  // boş kalan kişileri temizle (legacy davranışı)
  Object.keys(veriler).forEach((k) => { if (Object.keys(veriler[k]).length === 0) delete veriler[k]; });
  setState('mesai', { veriler, state: { ...msState() } });
  scheduleSync();
}

function tr(n) { return parseFloat(n.toFixed(2)); }

// ---------- render ----------

function shellHtml() {
  return `
  <div class="page stack">
    <section class="card toolbar-area">
      <div class="toolbar">
        <div class="field-inline">
          <label class="field__label" for="mesaiAySec">Ay</label>
          <select id="mesaiAySec" class="select select--sm"></select>
          <select id="mesaiYilSec" class="select select--sm"></select>
        </div>
        <div class="field-inline">
          <label class="field__label" for="mesaiTarih">Yükleme tarihi</label>
          <input type="date" id="mesaiTarih" class="input input--sm">
        </div>
        <button class="btn" data-act="yukle">${icon('upload')} Excel'den Yükle</button>
        <button class="btn btn--ghost" data-act="tatiller">${icon('calendar')} Resmi Tatiller</button>
        <button class="btn btn--ghost" data-act="excel">${icon('download')} Excel'e Aktar</button>
        <button class="btn btn--ghost" data-act="print">${icon('printer')} Yazdır</button>
        <span class="spacer"></span>
        <button class="btn btn--danger" data-act="temizle">${icon('trash')} Mesaiyi Boşalt</button>
      </div>
      <p class="hint">
        ${icon('info')} Hücreye tıklayıp mesai saatini yaz (örn. <b>2.33</b>), <b>Enter</b> ile kaydet;
        <span class="kbd">←</span><span class="kbd">→</span><span class="kbd">↑</span><span class="kbd">↓</span> ile gez.
        Pazar günleri <b>H.Sonu</b>, resmi tatiller <b>RESMİ</b> sütununa otomatik topllanır.
      </p>
    </section>

    <section class="card">
      <div class="pay-scroll">
        <table class="pay-table mesai-table">
          <thead id="mesaiHead"></thead>
          <tbody id="mesaiBody"></tbody>
        </table>
      </div>
      <div class="summary-bar" id="mesaiAlt"></div>
    </section>
  </div>`;
}

function fillSelectors(body) {
  const s = msState();
  const aySel = body.querySelector('#mesaiAySec');
  const yilSel = body.querySelector('#mesaiYilSec');
  aySel.innerHTML = AYLAR.map((a, i) => `<option value="${i}"${i === s.ay ? ' selected' : ''}>${a}</option>`).join('');
  const yilNow = new Date().getFullYear();
  const years = [];
  for (let y = yilNow - 2; y <= yilNow + 4; y++) years.push(y);
  if (!years.includes(s.yil)) years.push(s.yil);
  years.sort();
  yilSel.innerHTML = years.map((y) => `<option value="${y}"${y === s.yil ? ' selected' : ''}>${y}</option>`).join('');
}

/** Ay/yıl değişikliği = dönem değişikliği olabilir; veriyi legacy şemasıyla koru. */
function setStateMonth(year, month, body) {
  const prev = msState();
  const yeniState = { ...prev, yil: year, ay: month };
  // legacy gibi: state'i veriden ayrı tut; sadece yerel state güncellenir
  setState('mesai', { veriler: state.mesai.veriler, state: yeniState });
  scheduleSync();
  fillSelectors(body);
  drawTable(body);
}

function drawTable(body) {
  const head = body.querySelector('#mesaiHead');
  const tb = body.querySelector('#mesaiBody');
  const alt = body.querySelector('#mesaiAlt');
  const s = msState();
  const gs = gunSayisi(s.yil, s.ay);
  const tatiller = aylikResmiTatiller(s.yil, s.ay);
  const tatilGun = new Set(tatiller.map((t) => t.gun));
  const persons = [...state.puantaj.personeller].sort((a, b) =>
    String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));

  // ---- başlık ----
  let h = '<tr><th class="pk pk--id sticky-col">Sicil</th><th class="pk pk--name sticky-col">İsim</th>';
  for (let g = 1; g <= gs; g++) {
    const dow = haftaGunu(s.yil, s.ay, g);
    const pazar = dow === 0;
    const tatil = tatilGun.has(g);
    const cls = tatil ? 'pg is-holiday' : (pazar ? 'pg is-sunday' : 'pg');
    const t = tatiller.find((x) => x.gun === g);
    h += `<th class="${cls}" title="${esc(t ? t.ad : '')}"><span class="pg__no">${g}</span><span class="pg__dow">${GUNLER[dow]}</span></th>`;
  }
  h += '<th class="pt pt--hici">H.İÇİ</th><th class="pt pt--hsonu">H.SONU</th>'
     + '<th class="pt pt--resmi">RESMİ</th><th class="pt">TOPLAM</th></tr>';
  head.innerHTML = h;

  // ---- boş durum ----
  if (persons.length === 0) {
    tb.innerHTML = `<tr><td colspan="${gs + 6}"><div class="empty-state">${icon('clock')}
      <h3>Henüz personel yok</h3><p>Önce <b>Puantaj</b> sayfasından liste yükle.</p></div></td></tr>`;
    alt.innerHTML = '';
    return;
  }

  // ---- satırlar ----
  let b = '';
  let gHici = 0, gHsonu = 0, gResmi = 0, gTop = 0;
  const gunTop = {};
  persons.forEach((p) => {
    b += `<tr><td class="pk pk--id sticky-col">${esc(p.id)}</td><td class="pk pk--name sticky-col">${esc(p.isim)}</td>`;
    let hici = 0, hsonu = 0, resmi = 0;
    for (let g = 1; g <= gs; g++) {
      const dow = haftaGunu(s.yil, s.ay, g);
      const pazar = dow === 0;
      const tatil = tatilGun.has(g);
      const n = mesaiSaat(mesaiVerisiAl(p.id, g));
      let cls = 'cell';
      if (tatil) cls += ' is-holiday';
      else if (pazar) cls += ' is-sunday';
      if (n != null && n > 0) cls += ' is-filled';
      b += `<td class="${cls}" data-id="${esc(p.id)}" data-gun="${g}">${n != null ? n : ''}</td>`;
      if (n != null && n > 0) {
        if (tatil) { resmi += n; gunTop[g] = (gunTop[g] || 0) + n; }
        else if (pazar) { hsonu += n; gunTop[g] = (gunTop[g] || 0) + n; }
        else { hici += n; gunTop[g] = (gunTop[g] || 0) + n; }
      }
    }
    const top = hici + hsonu + resmi;
    gHici += hici; gHsonu += hsonu; gResmi += resmi; gTop += top;
    b += `<td class="pt pt--hici${hici === 0 ? ' is-zero' : ''}">${hici === 0 ? '-' : tr(hici)}</td>`;
    b += `<td class="pt pt--hsonu${hsonu === 0 ? ' is-zero' : ''}">${hsonu === 0 ? '-' : tr(hsonu)}</td>`;
    b += `<td class="pt pt--resmi${resmi === 0 ? ' is-zero' : ''}">${resmi === 0 ? '-' : tr(resmi)}</td>`;
    b += `<td class="pt${top === 0 ? ' is-zero' : ''}">${top === 0 ? '0' : tr(top)}</td></tr>`;
  });

  // ---- günlük toplam satırı ----
  b += `<tr class="totals-row"><td colspan="2" class="totals-label">GÜNLÜK TOPLAM</td>`;
  for (let g = 1; g <= gs; g++) {
    const v = gunTop[g] || 0;
    b += `<td>${v === 0 ? '-' : tr(v)}</td>`;
  }
  b += `<td>${gHici === 0 ? '-' : tr(gHici)}</td><td>${gHsonu === 0 ? '-' : tr(gHsonu)}</td>`
     + `<td>${gResmi === 0 ? '-' : tr(gResmi)}</td><td>${gTop === 0 ? '0' : tr(gTop)}</td></tr>`;
  tb.innerHTML = b;

  alt.innerHTML = `
    <span>${icon('users')} <b>${persons.length}</b> personel • ${icon('calendar')} <b>${gs}</b> gün</span>
    <span class="chip chip--info">H.İçi: ${tr(gHici)} sa</span>
    <span class="chip chip--warn">H.Sonu: ${tr(gHsonu)} sa</span>
    <span class="chip chip--accent">Resmi: ${tr(gResmi)} sa</span>
    <span class="spacer"></span>
    <span>${icon('clock')} TOPLAM: <b class="summary-total">${tr(gTop)} sa</b></span>`;
}

// ---------- hücre düzenleme + klavye ----------

function editCell(td, body) {
  if (td.querySelector('input')) return;
  const gun = parseInt(td.dataset.gun, 10);
  const id = td.dataset.id;
  const mevcut = mesaiVerisiAl(id, gun);

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'decimal';
  input.className = 'cell-input';
  input.value = mevcut != null ? String(mevcut) : '';
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  let done = false;
  function finish(save) {
    if (done) return; done = true;
    if (save) {
      const v = input.value.trim();
      if (v === '') commitMesai((ver) => { if (ver[id]) delete ver[id][gun]; });
      else {
        const n = mesaiSaat(v);
        if (n != null && n >= 0) commitMesai((ver) => { (ver[id] = ver[id] || {})[gun] = n; });
        else toast('Geçersiz değer', 'err');
      }
    }
    drawTable(body);
  }
  function goNext(nextId, nextGun) {
    setTimeout(() => {
      const hedef = body.querySelector(`#mesaiBody td.cell[data-id="${nextId}"][data-gun="${nextGun}"]`);
      if (hedef) editCell(hedef, body);
    }, 30);
  }
  input.onblur = () => finish(true);
  input.onkeydown = (ev) => {
    const s = msState();
    const gs = gunSayisi(s.yil, s.ay);
    const persons = [...state.puantaj.personeller].sort((a, b) =>
      String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));
    const idx = persons.findIndex((x) => String(x.id) === String(id));
    if (ev.key === 'Enter') { ev.preventDefault(); finish(true); }
    else if (ev.key === 'Escape') finish(false);
    else if (ev.key === 'ArrowRight') { ev.preventDefault(); finish(true); goNext(id, Math.min(gs, gun + 1)); }
    else if (ev.key === 'ArrowLeft') { ev.preventDefault(); finish(true); goNext(id, Math.max(1, gun - 1)); }
    else if (ev.key === 'ArrowDown') { ev.preventDefault(); finish(true); if (idx + 1 < persons.length) goNext(persons[idx + 1].id, gun); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); finish(true); if (idx - 1 >= 0) goNext(persons[idx - 1].id, gun); }
  };
}

// ---------- Excel'den yükleme modalı ----------

function parseYukleMetni(text) {
  const satirlar = text.trim().split(/\r?\n/).filter((s) => s.trim());
  const sonuc = [];
  for (let i = 0; i < satirlar.length; i++) {
    const line = satirlar[i];
    const p = line.includes('\t') ? line.split('\t').map((x) => x.trim())
      : line.split(/\s{2,}/).map((x) => x.trim());
    if (p.length < 2) continue;
    const ilk = String(p[0]).toLowerCase();
    if (i === 0 && ['id', 'ıd', 'no', 'sicil'].includes(ilk)) continue;
    const id = String(p[0]).trim();
    if (!id) continue;
    sonuc.push({ id, saat: mesaiSaat(p[1]) ?? 0 });
  }
  return sonuc;
}

function openYukleModal(body) {
  const tarihInput = body.querySelector('#mesaiTarih');
  if (!tarihInput.value) { toast('Önce yükleme tarihini seç', 'err'); tarihInput.focus(); return; }
  const d = new Date(`${tarihInput.value}T12:00:00`);
  if (isNaN(d.getTime())) { toast('Geçersiz tarih', 'err'); return; }
  const gun = d.getDate(), ay = d.getMonth(), yil = d.getFullYear();
  const tatil = resmiTatilVarMi(yil, ay, gun);
  const tip = tatil ? `Resmi Tatil — ${tatil.ad}` : (d.getDay() === 0 ? 'Pazar (hafta sonu)' : 'Normal gün');

  openModal({
    title: `Excel'den Mesai Yükle — ${gun} ${AYLAR[ay]} ${yil}`,
    body: `
      <div class="stack-sm">
        <div class="alert alert--info">${icon('calendar')}
          <span><b>Yüklenecek gün:</b> ${gun} ${AYLAR[ay]} ${yil} (${GUNLER[d.getDay()]}) — <b>${esc(tip)}</b>.
          Bu güne ait mesai verisi yazılacak.</span></div>
        <div class="field-inline">
          <input type="file" id="mesaiDosya" accept=".xlsx,.xls" style="font-size:12px">
        </div>
        <textarea id="mesaiYapistir" class="textarea mono" rows="8"
          placeholder="ID&#9;FazlaMesai&#10;101&#9;2.33&#10;102&#9;4.5"></textarea>
        <p class="hint">Her satır: <b>Sicil [TAB veya iki boşluk] saat</b>. Başlık satırı otomatik atlanır.</p>
      </div>`,
    footer: `<button class="btn btn--ghost" data-close>Vazgeç</button>
             <button class="btn btn--success" id="mesaiYukleBtn">${icon('upload')} Tabloya İşle</button>`,
    onMount(root) {
      root.querySelector('[data-close]').onclick = closeModal;
      const ta = root.querySelector('#mesaiYapistir');

      // Dosya seçildiğinde basit .xls/.xlsx ayrıştırma (TSV benzeri export desteği)
      root.querySelector('#mesaiDosya').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const rows = text.split(/\r?\n/).map((r) => r.split(/[\t;]/).map((c) => c.replace(/^"|"$/g, '').trim()));
          let idCol = 0, msCol = -1;
          rows.slice(0, 10).forEach((r) => {
            if (msCol >= 0) return;
            r.forEach((c, i) => {
              const v = c.toLowerCase();
              if ((v === 'id' || v === 'sicil' || v === 'no') && idCol === 0 && i === 0) idCol = i;
              if (v.includes('fazla') || v.includes('mesai')) msCol = i;
            });
          });
          if (msCol < 0) msCol = 2;
          const metin = rows.slice(msCol >= 0 ? 1 : 0)
            .filter((r) => /^\d+$/.test(String(r[idCol] || '').trim()))
            .map((r) => `${String(r[idCol]).trim()}\t${String(r[msCol] || '0').replace(',', '.')}`)
            .join('\n');
          ta.value = metin;
          toast(`${metin.split('\n').filter(Boolean).length} satır okundu: ${f.name}`, 'ok');
        } catch (err) {
          toast('Dosya okunamadı — metin kutusuna yapıştır', 'err');
        }
        e.target.value = '';
      });

      root.querySelector('#mesaiYukleBtn').onclick = () => {
        const liste = parseYukleMetni(ta.value);
        if (liste.length === 0) { toast('Geçerli satır yok', 'err'); return; }
        const ornek = liste.slice(0, 5).map((l) => `ID: ${l.id} → ${l.saat} sa`).join('\n');
        confirmDialog(
          `${liste.length} satır okundu.\n\n${ornek}${liste.length > 5 ? `\n... ve ${liste.length - 5} satır daha.` : ''}\n\n${gun} ${AYLAR[ay]} ${yil} gününe işlensin mi?`,
          { okText: 'İşle' },
        ).then((ok) => {
          if (!ok) { toast('İptal edildi', 'err'); return; }
          let yazilan = 0, eslesmeyen = 0;
          commitMesai((ver) => {
            liste.forEach((y) => {
              const varMi = state.puantaj.personeller.some((p) => String(p.id) === String(y.id));
              if (varMi) { (ver[y.id] = ver[y.id] || {})[gun] = y.saat; yazilan++; }
              else eslesmeyen++;
            });
          });
          // yükleme günü farklı aya aitse seçimi o aya taşı
          if (ay !== msState().ay || yil !== msState().yil) {
            setState('mesai', { veriler: state.mesai.veriler, state: { yil, ay } });
            fillSelectors(body);
          }
          drawTable(body);
          closeModal();
          toast(`${yazilan} kişiye mesai yazıldı${eslesmeyen ? ` • ${eslesmeyen} kişi eşleşmedi` : ''}`, 'ok');
        });
      };
    },
  });
}

// ---------- resmi tatil modalı ----------

function openTatilModal(body) {
  const s = msState();
  const listRow = () => {
    const liste = aylikResmiTatiller(s.yil, s.ay);
    if (!liste.length) return '<div class="hint" style="text-align:center;padding:16px;">Bu ay kayıtlı resmi tatil yok.</div>';
    return liste.map((t) => `
      <div class="rt-item">
        <span class="rt-date">${pad2(t.gun)}.${pad2(s.ay + 1)}.${s.yil}</span>
        <span class="rt-name">${esc(t.ad)}</span>
        <span class="chip ${t.kaynak === 'elle' ? 'chip--warn' : 'chip--info'}">${t.kaynak === 'elle' ? 'Elle' : 'Sistem'}</span>
        <button class="icon-btn" data-del="${t.tarih}" data-src="${t.kaynak}" title="Kaldır">${icon('x')}</button>
      </div>`).join('');
  };

  openModal({
    title: `Resmi Tatiller — ${AYLAR[s.ay]} ${s.yil}`,
    body: `<div class="stack-sm">
        <div id="rtListe" class="rt-liste">${listRow()}</div>
        <div class="field-inline">
          <input type="date" id="rtTarih" class="input input--sm">
          <input type="text" id="rtAd" class="input" placeholder="Tatil adı (örn. İdari İzin)">
          <button class="btn" id="rtEkleBtn">${icon('plus')} Ekle</button>
        </div>
        <p class="hint">Sadece görüntülenen aya gün eklenebilir. Sistem tatillerini kaldırmak güvenli geri alınabilir.</p>
      </div>`,
    footer: '<button class="btn btn--ghost" data-close>Kapat</button>',
    onMount(root) {
      root.querySelector('[data-close]').onclick = closeModal;
      const refresh = () => { root.querySelector('#rtListe').innerHTML = listRow(); };
      root.addEventListener('click', (e) => {
        const del = e.target.closest('[data-del]');
        if (del) {
          resmiTatilKaldir(del.dataset.del, del.dataset.src);
          refresh(); drawTable(body);
          return;
        }
        if (e.target.closest('#rtEkleBtn')) {
          const tarih = root.querySelector('#rtTarih').value;
          const ad = root.querySelector('#rtAd').value.trim() || 'Özel Tatil';
          if (!tarih) { toast('Tarih gerekli', 'err'); return; }
          const d = new Date(`${tarih}T12:00:00`);
          if (isNaN(d.getTime())) { toast('Geçersiz tarih', 'err'); return; }
          if (d.getMonth() !== s.ay || d.getFullYear() !== s.yil) {
            toast(`Sadece ${AYLAR[s.ay]} ${s.yil} için eklenebilir`, 'err'); return;
          }
          resmiTatilEkle(tarih, ad);
          root.querySelector('#rtTarih').value = '';
          root.querySelector('#rtAd').value = '';
          refresh(); drawTable(body);
          toast('Tatil eklendi', 'ok');
        }
      });
    },
  });
}

// ---------- Excel'e aktar + yazdır ----------

function exportExcel() {
  const s = msState();
  const persons = state.puantaj.personeller;
  if (!persons.length) { toast('Aktarılacak personel yok', 'err'); return; }
  const gs = gunSayisi(s.yil, s.ay);
  const tatiller = aylikResmiTatiller(s.yil, s.ay);
  const tatilGun = new Set(tatiller.map((t) => t.gun));

  let h = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">'
    + '<head><meta charset="UTF-8"><style>'
    + 'table{border-collapse:collapse;font-family:Arial;font-size:11px}'
    + 'th{background:#0c4a6e;color:#fff;padding:6px 4px;border:1px solid #333;text-align:center;font-size:10px}'
    + 'th.pazar{background:#d97706}th.tatil{background:#7c3aed}'
    + 'th.hici{background:#0369a1}th.hsonu{background:#92400e}th.resmi{background:#5b21b6}th.toplam{background:#16a34a}'
    + 'td{padding:5px 4px;border:1px solid #ccc;text-align:center}'
    + 'td.isim{text-align:left;font-weight:bold}'
    + 'td.hici{background:#e0f2fe;color:#0369a1;font-weight:bold}td.hsonu{background:#fed7aa;color:#92400e;font-weight:bold}'
    + 'td.resmi{background:#ddd6fe;color:#6d28d9;font-weight:bold}td.toplam{background:#dcfce7;color:#16a34a;font-weight:bold}'
    + '</style></head><body>';
  h += `<h2>ERP UMIT — ${AYLAR[s.ay]} ${s.yil} Fazla Mesai (Saat)</h2>`;
  h += `<p style="font-size:10px;color:#666">${persons.length} personel • ${new Date().toLocaleString('tr-TR')}</p>`;
  h += '<table><thead><tr><th>ID</th><th>İsim</th>';
  for (let g = 1; g <= gs; g++) {
    const dow = haftaGunu(s.yil, s.ay, g);
    const cls = tatilGun.has(g) ? ' class="tatil"' : (dow === 0 ? ' class="pazar"' : '');
    h += `<th${cls}>${g}<br><span style="font-size:8px">${GUNLER[dow]}</span></th>`;
  }
  h += '<th class="hici">H.ICi</th><th class="hsonu">H.SONU</th><th class="resmi">RESMI</th><th class="toplam">TOPLAM</th></tr></thead><tbody>';

  const sirali = [...persons].sort((a, b) => String(a.isim || '').localeCompare(String(b.isim || ''), 'tr'));
  let gHici = 0, gHsonu = 0, gResmi = 0, gTop = 0;
  sirali.forEach((p) => {
    h += `<tr><td>${esc(p.id)}</td><td class="isim">${esc(p.isim)}</td>`;
    let hici = 0, hsonu = 0, resmi = 0;
    for (let g = 1; g <= gs; g++) {
      const n = mesaiSaat(mesaiVerisiAl(p.id, g));
      const txt = (n != null && n > 0) ? tr(n) : '';
      h += `<td>${txt}</td>`;
      if (n != null && n > 0) {
        if (tatilGun.has(g)) resmi += n;
        else if (haftaGunu(s.yil, s.ay, g) === 0) hsonu += n;
        else hici += n;
      }
    }
    const top = hici + hsonu + resmi;
    gHici += hici; gHsonu += hsonu; gResmi += resmi; gTop += top;
    h += `<td class="hici">${hici ? tr(hici) : '-'}</td><td class="hsonu">${hsonu ? tr(hsonu) : '-'}</td>`;
    h += `<td class="resmi">${resmi ? tr(resmi) : '-'}</td><td class="toplam">${top ? tr(top) : 0}</td></tr>`;
  });
  h += `<tr><td colspan="2" style="text-align:right;font-weight:bold">TOPLAM</td><td colspan="${gs}"></td>`;
  h += `<td class="hici">${gHici ? tr(gHici) : '-'}</td><td class="hsonu">${gHsonu ? tr(gHsonu) : '-'}</td>`;
  h += `<td class="resmi">${gResmi ? tr(gResmi) : '-'}</td><td class="toplam">${gTop ? tr(gTop) : 0}</td></tr>`;
  h += '</tbody></table></body></html>';

  const ascii = ['Ocak', 'Subat', 'Mart', 'Nisan', 'Mayis', 'Haziran', 'Temmuz', 'Agustos', 'Eylul', 'Ekim', 'Kasim', 'Aralik'];
  const blob = new Blob(['\ufeff' + h], { type: 'application/vnd.ms-excel;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ERP-UMIT-Mesai-${ascii[s.ay]}-${s.yil}.xls`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`Mesai Excel indirildi (${sirali.length} kişi)`, 'ok');
}

// ---------- ana mount ----------

function render(body) {
  ensureDonem();
  loadResmiTatiller();
  body.innerHTML = shellHtml();
  fillSelectors(body);

  body.addEventListener('change', (e) => {
    if (e.target.id === 'mesaiAySec') setStateMonth(msState().yil, parseInt(e.target.value, 10), body);
    if (e.target.id === 'mesaiYilSec') setStateMonth(parseInt(e.target.value, 10), msState().ay, body);
  });

  body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'yukle') openYukleModal(body);
    else if (act === 'tatiller') openTatilModal(body);
    else if (act === 'excel') exportExcel();
    else if (act === 'print') window.print();
    else if (act === 'temizle') {
      if (!Object.keys(state.mesai.veriler).length) { toast('Zaten boş'); return; }
      confirmDialog('TÜM mesai verisi silinecek (bu dönem, tüm aylar)!\n\nEmin misin?', { danger: true, okText: 'Sil' })
        .then((ok) => {
          if (!ok) return;
          commitMesai((ver) => Object.keys(ver).forEach((k) => delete ver[k]));
          drawTable(body);
          toast('Mesai verisi temizlendi', 'ok');
        });
    }

    const cell = e.target.closest('td.cell');
    if (cell) editCell(cell, body);
  });

  const unsub1 = subscribe('mesai', () => drawTable(body));
  const unsub2 = subscribe('puantaj', () => drawTable(body));

  drawTable(body);
  return () => { unsub1(); unsub2(); };
}

registerPage('mesai', { title: 'Fazla Mesai', icon: 'clock', section: 'Finans' }, render);
