// ============================================================
// ERP ÜMİT v2 — Lumbar Arşivi Sayfası
// Legacy'deki page-lumbar modülünün modüler karşılığı.
//  - Kaynak veri: store.personeller (legacy globalPersoneller,
//    anahtar: umit_erp_global_personeller_v1) — dönemden bağımsızdır
//  - TR-duyarlı arama (ad / sicil / TC / meslek), isme göre sıralama
//  - "Aktif Döneme Ekle": sicil çakışması kontrolü + onay +
//    puantaj satırı oluşturma (legacy lumbardanAktifeAl ile aynı)
//  - Detay modalı: aktif dönemdeki en güncel bilgilerle birleştirir
//  - Silme: yönetici kontrolü (legacy YONETICI_EPOSTALAR listesiyle aynı)
// Emoji yok — tüm göstergeler SVG ikonlu `icon-btn` butonlardır.
// ============================================================

import { registerPage } from '../core/router.js';
import { state, touch, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc, gecerliTarih, normalizeTR } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { openModal, closeModal, confirmDialog } from '../core/modal.js';
import { scheduleSync } from '../core/syncService.js';

/** Legacy'deki yönetici e-posta listesi (birebir). */
const YONETICI_EPOSTALAR = ['kuasarr@proton.me'];

let arama = '';

// ---------- yardımcılar ----------

function basHarfler(ad) {
  if (ad == null) return '?';
  const t = String(ad).trim();
  if (!t) return '?';
  const p = t.split(/\s+/);
  if (p.length === 1) return p[0].substring(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

/** Oturum sahibi yönetici mi? (auth yüklenmediyse legacy gibi izin verilir) */
function yoneticiMi() {
  const email = state.auth?.user?.email;
  if (!email) return true; // legacy davranışı: oturum yoksa engel değil
  return YONETICI_EPOSTALAR.includes(String(email).toLowerCase());
}

function arsivListesi() {
  let liste = [...state.personeller];
  if (arama) {
    const q = normalizeTR(arama);
    liste = liste.filter((p) =>
      [p.ad, p.sicil, p.tc, p.meslek].some((f) => normalizeTR(f || '').includes(q)));
  }
  return liste.sort((a, b) => (a.ad || '').localeCompare(b.ad || '', 'tr'));
}

function commitArsiv() {
  touch('personeller');   // persist -> umit_erp_global_personeller_v1
  scheduleSync();
}

// ---------- işlemler ----------

/** Aktif döneme personel kazandırma — ortak mantık (buton + modal). */
function donemeKazandir(p, afterAdd) {
  const sicil = String(p.sicil).trim();
  if (state.puantaj.personeller.some((x) => String(x.id).trim() === sicil)) {
    toast('Bu personel zaten aktif dönemde', 'error');
    return false;
  }
  confirmDialog(`${p.ad} aktif döneme eklensin mi?`, { okText: 'Ekle' }).then((ok) => {
    if (!ok) return;
    const yeniP = JSON.parse(JSON.stringify(p));
    delete yeniP.arsivTarihi;
    // Global arşiv kaydı da güncellenmiş haliyle kalsın
    const mevcut = state.personeller.find((x) => String(x.sicil).trim() === sicil);
    if (mevcut) Object.assign(mevcut, yeniP);
    else state.personeller.push(yeniP);
    // Puantaj satırı (legacy payState.personeller deseniyle birebir)
    if (!state.puantaj.personeller.some((x) => String(x.id).trim() === sicil)) {
      state.puantaj.personeller.push({ id: yeniP.sicil, isim: yeniP.ad, meslek: yeniP.meslek, gunler: {}, notlar: {} });
    }
    touch('personeller');
    touch('puantaj');
    scheduleSync();
    toast(`${yeniP.ad} aktif döneme eklendi`, 'success');
    if (afterAdd) afterAdd();
  });
  return true;
}

function lumbardanAktifeAl(id) {
  const p = state.personeller.find((x) => String(x.id) === String(id));
  if (!p) { toast('Arşiv kaydı bulunamadı', 'error'); return; }
  donemeKazandir(p);
}

function lumbarSil(id) {
  if (!yoneticiMi()) { toast('Sadece yönetici silebilir', 'error'); return; }
  const p = state.personeller.find((x) => String(x.id) === String(id));
  if (!p) return;
  confirmDialog(`${p.ad} arşivden tamamen silinsin mi?`, { danger: true, okText: 'Sil' })
    .then((ok) => {
      if (!ok) return;
      setState(personellerFilter(id));
      toast('Kayıt silindi', 'success');
    });
}

function setStateHelper(liste) { /* yer tutucu — aşağıda inline kullanılıyor */ }
function personellerFilter(id) { return state.personeller.filter((x) => String(x.id) !== String(id)); }

// ---------- detay modalı ----------

function detaySatiri(iconName, etiket, deger, extraClass = '') {
  if (!deger) return '';
  return `<div class="lumbar-row">
    <span class="lumbar-row-label">${icon(iconName)}${etiket}</span>
    <b class="${extraClass}">${esc(deger)}</b>
  </div>`;
}

function acLumbarDetay(id) {
  const arsivP = state.personeller.find((x) => String(x.id) === String(id));
  if (!arsivP) { toast('Arşiv kaydı bulunamadı', 'error'); return; }
  // Her zaman aktif dönemdeki en güncel bilgileri çek (yoksa arşivdekini kullan)
  const aktifP = state.puantaj.personeller.find((x) => String(x.id).trim() === String(arsivP.sicil).trim());
  const p = aktifP ? { ...arsivP, ...aktifP, id: arsivP.id, ad: aktifP.isim || arsivP.ad } : arsivP;

  let html = `<div class="lumbar-detay-baslik">
    <div class="lumbar-avatar">${esc(basHarfler(p.ad))}</div>
    <div class="lumbar-detay-isim">${esc(p.ad)}</div>
    <div class="lumbar-detay-alt">Sicil: <b>${esc(p.sicil)}</b> • ${esc(p.meslek || '—')}</div>
  </div>
  <div class="lumbar-detay-kutu">`;
  html += detaySatiri('phone', 'Telefon', p.telefon);
  html += detaySatiri('id', 'TC No', p.tc);
  html += detaySatiri('building', 'IBAN', p.iban);
  html += detaySatiri('droplet', 'Kan Grubu', p.kanGrubu, 'lumbar-kan');
  html += detaySatiri('pin', 'Departman', p.departman);
  html += detaySatiri('home', 'Yerleşim Yeri', p.yerlesim);
  const giris = p.girisTarihi ? gecerliTarih(p.girisTarihi) : null;
  html += detaySatiri('calendar', 'İşe Giriş', giris ? giris.toLocaleDateString('tr-TR') : '');
  html += '</div>';
  if (p.not) html += `<div class="lumbar-not"><b>Not:</b> ${esc(p.not)}</div>`;

  const aktifMi = state.puantaj.personeller.some((x) => String(x.id).trim() === String(p.sicil).trim());
  openModal({
    title: `${icon('archive')} Lumbar Detayı`,
    body: html,
    footer: `<button class="btn btn--ghost" data-m-kapat>Kapat</button>
             ${aktifMi ? '' : `<button class="btn btn--primary" data-m-ekle>${icon('plus')} Aktif Döneme Ekle</button>`}`,
    onMount(root) {
      root.querySelector('[data-m-kapat]').onclick = closeModal;
      const ekleBtn = root.querySelector('[data-m-ekle]');
      if (ekleBtn) ekleBtn.onclick = () => {
        if (donemeKazandir(arsivP, closeModal)) closeModal();
      };
    },
  });
}

// ---------- Excel'den arşive aktarım ----------

async function dosyaOku(file) {
  const text = await file.text();
  // HTML-table export (.xls) veya TSV/CSV ayrıştırma
  const tmp = document.createElement('div');
  tmp.innerHTML = text;
  const table = tmp.querySelector('table');
  const rows = [];
  if (table) {
    table.querySelectorAll('tr').forEach((tr) => {
      const cells = [...tr.querySelectorAll('td,th')].map((c) => c.textContent.trim());
      if (cells.some((c) => c)) rows.push(cells);
    });
  } else {
    text.split(/\r?\n/).forEach((r) => {
      const cells = r.split(/[\t;]/).map((c) => c.replace(/^"|"$/g, '').trim());
      if (cells.some((c) => c)) rows.push(cells);
    });
  }
  return rows;
}

function kolonBul(rows, candidates) {
  for (const r of rows.slice(0, 3)) {
    for (let i = 0; i < r.length; i++) {
      const v = normalizeTR(r[i]);
      if (candidates.some((c) => v === c || v.startsWith(c))) return i;
    }
  }
  return -1;
}

function acAktarimModal() {
  openModal({
    title: `${icon('refresh-cw')} Excel'den Arşive Aktar`,
    body: `<div class="stack-sm">
      <div class="alert alert--info">${icon('info')}
        <span>Sicil ve Ad Soyad kolonları zorunludur; Meslek, Telefon, TC, IBAN, Kan Grubu, Departman, Yerleşim ve İşe Giriş kolonları varsa otomatik eşleştirilir. Aynı sicil varsa <b>güncellenir</b>, yoksa eklenir.</span></div>
      <input type="file" id="lumbarDosya" accept=".xlsx,.xls,.csv,.txt" style="font-size:12px">
      <textarea id="lumbarYapistir" class="textarea mono" rows="8"
        placeholder="Sicil&#9;Ad Soyad&#9;Meslek&#10;101&#9;Ahmet Yılmaz&#9;Usta"></textarea>
      <p class="hint">Alternatif: hücreleri TAB ile ayırarak yapıştırın. Başlık satırı otomatik atlanır.</p>
    </div>`,
    footer: `<button class="btn btn--ghost" data-close>Vazgeç</button>
             <button class="btn btn--success" id="lumbarAktarBtn">${icon('upload')} Aktar</button>`,
    onMount(root) {
      root.querySelector('[data-close]').onclick = closeModal;
      const ta = root.querySelector('#lumbarYapistir');
      root.querySelector('#lumbarDosya').addEventListener('change', async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        try {
          const rows = await dosyaOku(f);
          ta.value = rows.map((r) => r.join('\t')).join('\n');
          toast(`${rows.length} satır okundu: ${f.name}`, 'success');
        } catch { toast('Dosya okunamadı — metin kutusuna yapıştırın', 'error'); }
        e.target.value = '';
      });

      root.querySelector('#lumbarAktarBtn').onclick = () => {
        const satirlar = ta.value.split(/\r?\n/).map((r) => r.split(/[\t;]/).map((c) => c.trim())).filter((r) => r.some((c) => c));
        if (!satirlar.length) { toast('Geçerli satır yok', 'error'); return; }
        const sicCol = Math.max(0, kolonBul(satirlar, ['sicil', 'id', 'no']));
        const adCol = Math.max(1, kolonBul(satirlar, ['ad soyad', 'isim', 'ad']));
        const colMap = {
          meslek: kolonBul(satirlar, ['meslek', 'gorev']),
          telefon: kolonBul(satirlar, ['telefon', 'tel']),
          tc: kolonBul(satirlar, ['tc']),
          iban: kolonBul(satirlar, ['iban']),
          kanGrubu: kolonBul(satirlar, ['kan']),
          departman: kolonBul(satirlar, ['departman', 'bolum']),
          yerlesim: kolonBul(satirlar, ['yerlesim', 'adres']),
          girisTarihi: kolonBul(satirlar, ['giris', 'ise giris']),
        };
        // başlık satırını atla (sicil kolonunda sayısal olmayan ilk satır)
        const veri = satirlar.filter((r) => /^\d+$/.test(String(r[sicCol] || '').replace(/\D/g, '')) && r[sicCol]);
        if (!veri.length) { toast('Sicil kolonu/satırı bulunamadı', 'error'); return; }

        let eklenen = 0, guncellenen = 0;
        veri.forEach((r) => {
          const sicil = String(r[sicCol]).trim();
          const rec = { sicil, ad: String(r[adCol] || '').trim() };
          Object.entries(colMap).forEach(([alan, idx]) => {
            if (idx >= 0 && r[idx]) rec[alan] = r[idx];
          });
          const mevcut = state.personeller.find((x) => String(x.sicil).trim() === sicil);
          if (mevcut) { Object.assign(mevcut, rec); guncellenen++; }
          else {
            state.personeller.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              maas: 0, gunluk: 7.5, tur: 'maasli', not: '',
              ...rec, olusturmaTarihi: new Date().toISOString(), kaynak: 'lumbar-excel',
            });
            eklenen++;
          }
        });
        commitArsiv();
        closeModal();
        toast(`Arşiv güncellendi: ${guncellenen} güncellendi, ${eklenen} eklendi`, 'success');
      };
    },
  });
}

// ---------- render ----------

function draw(body) {
  const tumArsiv = state.personeller;
  const liste = arsivListesi();

  body.querySelector('#lumbarSayisi').textContent = tumArsiv.length;

  const thead = `<thead><tr>
    <th>#</th><th>Sicil</th><th>Ad Soyad</th><th>Meslek</th>
    <th>Tür</th><th>Durum</th><th style="text-align:center;">İşlem</th>
  </tr></thead>`;

  let rowsHtml;
  if (liste.length === 0) {
    rowsHtml = `<tr><td colspan="7" class="empty-state">
      ${icon('search')} Henüz arşivde personel yok${arama ? ' veya arama sonucu bulunamadı' : ''}.
    </td></tr>`;
  } else {
    rowsHtml = liste.map((p, i) => {
      const sicil = String(p.sicil || '').trim();
      const zatenAktif = state.puantaj.personeller.some((x) => String(x.id).trim() === sicil);
      const yevmiyeli = p.tur === 'yevmiyeli';
      const btnEkle = zatenAktif
        ? '<span class="chip chip--ok">Aktif</span>'
        : `<button class="icon-btn" data-ekle="${p.id}" title="Aktif döneme ekle">${icon('plus')}</button>`;
      const btnSil = yoneticiMi()
        ? `<button class="icon-btn icon-btn--danger" data-sil="${p.id}" title="Arşivden sil">${icon('trash')}</button>`
        : '';
      return `<tr>
        <td class="center muted">${i + 1}</td>
        <td class="center strong">${esc(p.sicil)}</td>
        <td class="strong">${esc(p.ad)}</td>
        <td>${esc(p.meslek || '—')}</td>
        <td><span class="chip ${yevmiyeli ? 'chip--accent' : 'chip--info'}">${yevmiyeli ? 'Yevmiyeli' : 'Maaşlı'}</span></td>
        <td class="center">${zatenAktif
          ? '<span class="lumbar-status lumbar-status--aktif">Aktif</span>'
          : '<span class="lumbar-status">Arşivde</span>'}</td>
        <td class="center nowrap">
          ${btnEkle}
          <button class="icon-btn" data-detay="${p.id}" title="Detay">${icon('eye')}</button>
          ${btnSil}
        </td>
      </tr>`;
    }).join('');
  }

  body.querySelector('#lumbarTablo').innerHTML = `${thead}<tbody>${rowsHtml}</tbody>`;

  // olay bağlama
  body.querySelectorAll('[data-ekle]').forEach((b) => { b.onclick = () => lumbardanAktifeAl(b.dataset.ekle); });
  body.querySelectorAll('[data-detay]').forEach((b) => { b.onclick = () => acLumbarDetay(b.dataset.detay); });
  body.querySelectorAll('[data-sil]').forEach((b) => { b.onclick = () => lumbarSil(b.dataset.sil); });
}

registerPage({
  id: 'lumbar',
  title: 'Lumbar Arşivi',
  subtitle: 'Tüm personelin kalıcı arşivi — dönemden bağımsız',
  icon: 'archive',
  mount(root) {
    root.innerHTML = `
      <div class="card">
        <div class="card__header">
          <div class="toolbar toolbar--wrap">
            <div class="input-icon">
              ${icon('search')}
              <input class="input" id="lumbarAra" placeholder="İsim, sicil, TC veya meslek ara..." value="${esc(arama)}">
            </div>
            <span class="chip chip--muted" id="lumbarSayisi">0</span>
            <span class="spacer"></span>
            <button class="btn btn--secondary btn--sm" id="lumbarAktarBtn">${icon('refresh-cw')} Excel'den Aktar</button>
            <button class="btn btn--secondary btn--sm" id="lumbarYazdirBtn">${icon('printer')} Yazdır</button>
          </div>
        </div>
        <div class="card__body">
          <div class="alert alert--info">${icon('info')}
            <span><b>Lumbar Arşivi Nedir?</b> Personeller dönem değiştikçe silinir; burada ise
            TC, IBAN, kan grubu gibi tüm künye bilgileri kalıcı olarak saklanır. Yeni dönemde
            "Aktif Döneme Ekle" ile tek tıkla puantaja taşıyabilirsiniz.</span></div>
          <div class="table-wrap tall">
            <table class="table" id="lumbarTablo"></table>
          </div>
        </div>
      </div>`;

    const body = root;
    const araInput = root.querySelector('#lumbarAra');
    const yenizle = () => draw(body);
    araInput.addEventListener('input', () => { arama = araInput.value.trim(); yenizle(); });
    root.querySelector('#lumbarAktarBtn').onclick = acAktarimModal;
    root.querySelector('#lumbarYazdirBtn').onclick = () => window.print();

    const unsub1 = subscribe('personeller', yenizle);
    const unsub2 = subscribe('puantaj', yenizle);
    const unsub3 = subscribe('auth', yenizle);

    draw(body);
    return () => { unsub1(); unsub2(); unsub3(); };
  },
});
