// ============================================================
// ERP ÜMİT v2 — Ana Sayfa (Yönetici Özeti)
// İlk sayfa: KPI kartları + son notlar. Emoji yok, SVG ikon var.
// ============================================================

import { registerPage } from '../core/router.js';
import { state, subscribe } from '../core/store.js';
import { icon } from '../icons/index.js';
import { formatTRY, formatDate, esc } from '../core/utils.js';

function kpiCard(iconName, label, value, hint = '') {
  return `
    <div class="card kpi">
      <div class="kpi__label">${esc(label)}</div>
      <div class="kpi__value">${value}</div>
      ${hint ? `<div class="kpi__delta text-muted">${esc(hint)}</div>` : ''}
      <div class="visually-hidden">${iconName}</div>
    </div>`;
}

function notesList(notlar) {
  if (!notlar.length) {
    return `<div class="table-empty">Henüz not eklenmemiş.</div>`;
  }
  return `
    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>Tarih</th><th>Not</th></tr>
        </thead>
        <tbody>
          ${notlar
            .slice(-8)
            .reverse()
            .map(
              (n) => `
            <tr>
              <td style="white-space:nowrap">${formatDate(n.tarih || n.date)}</td>
              <td>${esc(n.metin || n.text || n)}</td>
            </tr>`,
            )
            .join('')}
        </tbody>
      </table>
    </div>`;
}

function render(container) {
  const draw = () => {
    const personelSayisi = Array.isArray(state.personeller) ? state.personeller.length : 0;
    const notlar = Array.isArray(state.notlar) ? state.notlar : [];
    const puantajTarihi = state.sonPuantajTarihi;

    container.innerHTML = `
      <div class="page stack">
        <div class="kpi-grid">
          ${kpiCard('users', 'Kayıtlı Personel', String(personelSayisi), 'Global personel listesi')}
          ${kpiCard('clock', 'Son Puantaj Tarihi', puantajTarihi ? formatDate(puantajTarihi) : '—', 'Puantaj ekranından gelir')}
          ${kpiCard('calendar', 'Vardiya Kuralı', String(Object.keys(state.vardiyaKurallari || {}).length), 'Tanımlı kural sayısı')}
          ${kpiCard('wallet', 'Normal Saat Profili', String(Object.keys(state.normalSaatler || {}).length), 'Çalışma saati tanımları')}
        </div>

        <div class="card">
          <div class="card__header">
            ${icon('receipt')}
            <div class="card__title">Son Notlar</div>
            <div class="spacer"></div>
            <span class="badge badge--neutral">${notlar.length} kayıt</span>
          </div>
          ${notesList(notlar)}
        </div>
      </div>`;
  };

  draw();
  subscribe('personeller', draw);
  subscribe('notlar', draw);
}

registerPage('anasayfa', { title: 'Ana Sayfa', icon: 'dashboard', section: 'Genel' }, render);
