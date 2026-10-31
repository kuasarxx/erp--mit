// ============================================================
// ERP ÜMİT v2 — Dönemler Sayfası
// Legacy page-donemler karşılığı (emoji yok, SVG ikon var).
//   • Dönem kartları (aktif / arşivli vurgusu + istatistikler)
//   • Yeni dönem aç (ay/yıl, özel ad, personel kopyalama)
//   • Karta tıkla → döneme geç (legacy donemGec akışı)
//   • Yeniden adlandır / Arşivle-Arşivden çıkar / Sil (SIL onaylı)
// Veri: umit_erp_donemler_v1 + aktif_donem_id; dönem dilimleri
//       umit_erp_<donemId>_<modul>_v1 anahtarlarında yaşar.
// ============================================================

import { registerPage } from '../core/router.js';
import { state, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { esc } from '../core/utils.js';
import { toast } from '../core/toast.js';
import { openModal, closeModal, confirmDialog } from '../core/modal.js';
import { readKey, periodKey } from '../core/storage.js';
import {
  AYLAR, gecDonem, yeniDonemOlustur, arsivleDonem, adlandirDonem, silDonem,
} from '../core/donemService.js';

let container = null;

/** Basit metin input modalı (prompt yerine). */
function textPrompt({ title, label, value = '', placeholder = '', okText = 'Kaydet' }) {
  return new Promise((resolve) => {
    let sonuc = null;
    openModal({
      title,
      body: `<div class="form-group"><label>${label}</label>
             <input type="text" id="tpInput" maxlength="60" autocomplete="off"
                    value="${esc(value)}" placeholder="${esc(placeholder)}"></div>`,
      footer: `
        <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
        <button class="btn btn--primary" data-ok>${icon('check')} ${okText}</button>`,
      onMount: (root) => {
        const input = root.querySelector('#tpInput');
        input.focus(); input.select();
        root.querySelector('[data-ok]').addEventListener('click', () => {
          sonuc = input.value; closeModal();
        });
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') root.querySelector('[data-ok]').click(); });
      },
      onClose: () => resolve(sonuc),
    });
  });
}

// ---------- yardımcılar ----------

/** Bir dönemin personel/puantaj sayısını okur (aktifse store'dan). */
function donemIstatistik(d) {
  let personelSay = 0, puantajSay = 0;
  if (d.id === state.aktifDonemId) {
    personelSay = (state.puantaj.personeller || []).length;
    puantajSay = personelSay; // puantaj satırları personelden gelir
  } else {
    const per = readKey(periodKey(d.id, 'personel'));
    const pay = readKey(periodKey(d.id, 'puantaj'));
    personelSay = Array.isArray(per) ? per.length : 0;
    puantajSay = Array.isArray(pay?.personeller) ? pay.personeller.length : 0;
  }
  return { personelSay, puantajSay };
}

function tarihStr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('tr-TR');
}

// ---------- çizim ----------

function draw() {
  if (!container) return;
  const sirali = [...state.donemler].sort((a, b) => {
    if (a.yil !== b.yil) return b.yil - a.yil;
    return b.ay - a.ay;
  });

  const kartlar = sirali.length === 0
    ? `<div class="empty-state">
         ${icon('calendar')}
         <h3>Henüz dönem yok</h3>
         <p>Sağ üstteki "Yeni Dönem Aç" butonuyla ilk dönemi oluştur.</p>
       </div>`
    : sirali.map((d) => {
      const aktif = d.id === state.aktifDonemId;
      const { personelSay, puantajSay } = donemIstatistik(d);
      const alt = aktif
        ? 'Şu an bu dönemdesin'
        : d.arsiv
          ? 'Arşivlenmiş — düzenleme kapalı'
          : `Oluşturma: ${tarihStr(d.olusturma)}`;
      return `
        <div class="donem-kart${aktif ? ' aktif' : ''}${d.arsiv ? ' arsivli' : ''}"
             data-act="gec" data-id="${esc(d.id)}" role="button" tabindex="0"
             aria-label="${esc(d.ad)} dönemi">
          <div class="donem-kart-top">
            <span class="donem-kart-icon">${icon(d.arsiv ? 'archive' : 'calendar')}</span>
            ${aktif ? `<span class="badge badge--ok">${icon('check')} Aktif</span>` : ''}
            ${d.arsiv ? `<span class="badge badge--warn">${icon('archive')} Arşiv</span>` : ''}
          </div>
          <div class="donem-kart-ad">${esc(d.ad)}</div>
          <div class="donem-kart-alt">${esc(alt)}</div>
          <div class="donem-kart-stats">
            <div class="donem-kart-stat">${icon('users')} Personel <b>${personelSay}</b></div>
            <div class="donem-kart-stat">${icon('calculator')} Puantaj <b>${puantajSay}</b></div>
          </div>
          <div class="donem-kart-aksiyon">
            <button class="icon-btn" data-act="ad" data-id="${esc(d.id)}"
                    title="Yeniden adlandır" aria-label="Yeniden adlandır">${icon('edit')}</button>
            ${aktif
              ? `<button class="icon-btn" disabled title="Aktif dönem arşivlenemez/silinemez"
                           aria-label="Kilitli">${icon('lock')}</button>`
              : `<button class="icon-btn" data-act="arsiv" data-id="${esc(d.id)}"
                         title="${d.arsiv ? 'Arşivden çıkar' : 'Arşivle'}"
                         aria-label="${d.arsiv ? 'Arşivden çıkar' : 'Arşivle'}">${icon(d.arsiv ? 'unlock' : 'archive')}</button>
                 <button class="icon-btn icon-btn--danger" data-act="sil" data-id="${esc(d.id)}"
                         title="Sil" aria-label="Sil">${icon('trash')}</button>`}
          </div>
        </div>`;
    }).join('');

  container.innerHTML = `
    <div class="page-head">
      <div>
        <h1 class="page-title">${icon('calendar')} Dönemler</h1>
        <p class="page-subtitle">Her ay ayrı bir dönem — veriler kaybolmaz, istediğin döneme geçebilirsin.</p>
      </div>
      <button class="btn btn--primary" data-act="yeni">${icon('plus')} Yeni Dönem Aç</button>
    </div>

    <div class="card info-card">
      <div class="card__body">
        <b>Nasıl kullanılır?</b>
        <ul class="info-list">
          <li>Her dönemin kendi verisi vardır: personel, puantaj, avans, mesai, kesinti, muhasebe, gemi, icra.</li>
          <li>Bir dönem kartına tıkla → o döneme geçersin (mevcut çalışma otomatik kaydedilir).</li>
          <li>Yeni dönem açarken istersen personel listesini kopyalayabilirsin.</li>
          <li>Arşivlenen dönem görüntülenebilir ama düzenlenemez ve silinemez.</li>
          <li>Aktif dönem arşivlenemez veya silinemez.</li>
        </ul>
      </div>
    </div>

    <div class="donem-grid">${kartlar}</div>`;
}

// ---------- modallar ----------

function acYeniDonemModal() {
  const bugun = new Date();
  // Öneri: aktif dönemin bir sonraki ayı
  let onerilenAy = bugun.getMonth(), onerilenYil = bugun.getFullYear();
  const aktifD = state.donemler.find((d) => d.id === state.aktifDonemId);
  if (aktifD) {
    onerilenAy = (aktifD.ay + 1) % 12;
    onerilenYil = aktifD.ay === 11 ? aktifD.yil + 1 : aktifD.yil;
  }
  const yillar = [];
  for (let y = 2024; y <= 2030; y++) yillar.push(y);

  openModal({
    title: `${icon('plus')} Yeni Dönem Aç`,
    body: `
      <div class="form-grid">
        <div class="form-group">
          <label for="ndAy">Ay <span class="req">*</span></label>
          <select id="ndAy">${AYLAR.map((a, i) =>
            `<option value="${i}"${i === onerilenAy ? ' selected' : ''}>${a}</option>`).join('')}</select>
        </div>
        <div class="form-group">
          <label for="ndYil">Yıl <span class="req">*</span></label>
          <select id="ndYil">${yillar.map((y) =>
            `<option value="${y}"${y === onerilenYil ? ' selected' : ''}>${y}</option>`).join('')}</select>
        </div>
        <div class="form-group form-group--full">
          <label for="ndAd">Dönem adı <span class="muted">(opsiyonel)</span></label>
          <input type="text" id="ndAd" maxlength="60" autocomplete="off"
                 placeholder="Boş bırakılırsa otomatik: Ay Yıl">
        </div>
        <label class="checkbox-line form-group--full">
          <input type="checkbox" id="ndKopyala">
          <span>Mevcut personel listesini yeni döneme kopyala</span>
        </label>
      </div>`,
    footer: `
      <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
      <button class="btn btn--primary" data-ok>${icon('check')} Oluştur ve Geç</button>`,
    onMount: (root) => {
      root.querySelector('[data-ok]').addEventListener('click', async () => {
        const btn = root.querySelector('[data-ok]');
        btn.disabled = true;
        try {
          const sonuc = await yeniDonemOlustur({
            yil: Number(root.querySelector('#ndYil').value),
            ay: Number(root.querySelector('#ndAy').value),
            ad: root.querySelector('#ndAd').value,
            personelKopyala: root.querySelector('#ndKopyala').checked,
          });
          closeModal();
          let msg = `"${sonuc.donem.ad}" dönemi açıldı`;
          if (sonuc.kopyalanan > 0) msg += ` • ${sonuc.kopyalanan} personel kopyalandı`;
          toast(msg, 'success');
        } catch (e) {
          btn.disabled = false;
          toast(e.message || 'Dönem açılamadı', 'error');
        }
      });
      setTimeout(() => root.querySelector('#ndAy').focus(), 50);
    },
  });
}

async function acAdModal(id) {
  const d = state.donemler.find((x) => x.id === id);
  if (!d) return;
  const yeni = await textPrompt({
    title: `${icon('edit')} Dönemi Yeniden Adlandır`,
    label: 'Dönem adı',
    value: d.ad,
    placeholder: 'Örn: Ekim 2026 - Yoğun Sezon',
  });
  if (yeni === null) return; // vazgeçildi
  try {
    adlandirDonem(id, yeni);
    toast('Dönem adı güncellendi', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function arsivle(id) {
  const d = state.donemler.find((x) => x.id === id);
  if (!d) return;
  const mesaj = d.arsiv
    ? `"${d.ad}" dönemi arşivden çıkarılsın mı?\n\nTekrar düzenlenebilir olacak.`
    : `"${d.ad}" dönemi arşivlensin mi?\n\nArşivlenen dönem:\n• Düzenlenemez\n• Silinemez\n• Görüntülenebilir\n• İstediğin zaman arşivden çıkarılabilir`;
  const ok = await confirmDialog(mesaj.replace(/\n/g, '<br>'), {
    danger: !d.arsiv, okText: d.arsiv ? 'Arşivden çıkar' : 'Arşivle',
  });
  if (!ok) return;
  try {
    const guncel = arsivleDonem(id);
    toast(guncel.arsiv ? `"${guncel.ad}" arşivlendi` : `"${guncel.ad}" arşivden çıkarıldı`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function sil(id) {
  const d = state.donemler.find((x) => x.id === id);
  if (!d) return;
  const ok = await confirmDialog(
    `"${d.ad}" dönemi SİLİNECEK!<br><br>Bu döneme ait TÜM veriler silinecek:<br>`
    + '• Personel &nbsp;• Puantaj &nbsp;• Avans &nbsp;• Mesai<br>'
    + '• Kesinti &nbsp;• Muhasebe &nbsp;• Gemi &nbsp;• İcra<br><br>'
    + '<b>Bu işlem GERİ ALINAMAZ.</b>',
    { danger: true, okText: 'Evet, sil' },
  );
  if (!ok) return;

  // İkinci onay: tam "SIL" yazımı (legacy davranışı)
  let silindi = false;
  openModal({
    title: `${icon('alert-triangle')} Son Onay`,
    body: `
      <div class="form-group">
        <label for="silOnay">Devam etmek için büyük harfle <b>SIL</b> yaz:</label>
        <input type="text" id="silOnay" autocomplete="off" placeholder="SIL">
      </div>`,
    footer: `
      <button class="btn btn--secondary" data-modal-close>Vazgeç</button>
      <button class="btn btn--danger" data-ok>${icon('trash')} Kalıcı olarak sil</button>`,
    onMount: (root) => {
      const input = root.querySelector('#silOnay');
      input.focus();
      root.querySelector('[data-ok]').addEventListener('click', async () => {
        if (input.value !== 'SIL') { toast('Onay metni eşleşmedi — iptal edildi', 'error'); return; }
        try {
          await silDonem(id);
          silindi = true;
          closeModal();
          toast(`"${d.ad}" dönemi ve tüm verileri silindi`, 'success');
        } catch (e) { toast(e.message, 'error'); }
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') root.querySelector('[data-ok]').click(); });
    },
  });
}

async function donemGecTikla(id) {
  if (id === state.aktifDonemId) { toast('Zaten bu dönemdesin', 'info'); return; }
  const d = state.donemler.find((x) => x.id === id);
  if (!d) return;
  if (d.arsiv) {
    const ok = await confirmDialog(
      `"${d.ad}" arşivlenmiş bir dönem.<br><br>Arşivden çıkarıp bu döneme geçmek istiyor musun?`,
      { okText: 'Çık ve geç' },
    );
    if (!ok) return;
    try { arsivleDonem(id); } catch (e) { toast(e.message, 'error'); return; }
  }
  toast(`"${d.ad}" yükleniyor...`, 'info');
  try {
    await gecDonem(id);
    toast(`${d.ad} dönemine geçildi`, 'success');
  } catch (e) {
    toast(e.message || 'Dönem geçişinde hata', 'error');
  }
}

// ---------- mount ----------

registerPage('donemler', { title: 'Dönemler', icon: 'calendar', section: 'Finans' }, (el) => {
  container = el;
  draw();

  const onClick = async (e) => {
    const yeniBtn = e.target.closest('[data-act="yeni"]');
    if (yeniBtn) { acYeniDonemModal(); return; }

    const actEl = e.target.closest('[data-act]');
    if (!actEl) return;
    const id = actEl.dataset.id;
    switch (actEl.dataset.act) {
      case 'ad': e.stopPropagation(); acAdModal(id); break;
      case 'arsiv': e.stopPropagation(); arsivle(id); break;
      case 'sil': e.stopPropagation(); sil(id); break;
      case 'gec': donemGecTikla(id); break;
    }
  };
  const onKey = (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('donem-kart')) {
      e.preventDefault();
      donemGecTikla(e.target.dataset.id);
    }
  };
  el.addEventListener('click', onClick);
  el.addEventListener('keydown', onKey);

  const unsubs = [subscribe('donemler', draw), subscribe('aktifDonemId', draw)];
  return () => {
    unsubs.forEach((u) => u());
    el.removeEventListener('click', onClick);
    el.removeEventListener('keydown', onKey);
    container = null;
  };
});
