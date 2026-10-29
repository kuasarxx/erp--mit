// ============================================================
// ERP ÜMİT v2 — Uygulama kabuğu (sidebar, topbar, içerik)
// Görsel dil: SVG ikonlar + metin. Emoji yoktur.
// ============================================================

import { icon } from '../icons/index.js';
import { state, setState, subscribe } from './store.js';
import { getPage, allPages } from './router.js';
import { logout } from './authService.js';
import { toast } from './toast.js';

let contentEl = null;

/** Sayfa listesini bölümlere göre gruplar (nav kaydı). */
export const NAV_SECTIONS = [
  { label: 'Genel', ids: ['anasayfa', 'puantaj'] },
  { label: 'Finans', ids: ['avans', 'mesai', 'ekstra', 'kesinti', 'icra', 'ikinciOdeme', 'muhasebe', 'donemler'] },
  { label: 'Operasyon', ids: ['gemi', 'lumbar', 'egitim'] },
  { label: 'Raporlama', ids: ['raporlar'] },
];

function renderSidebar() {
  const itemsBySection = NAV_SECTIONS.map((sec) => ({
    ...sec,
    pages: sec.ids.map((id) => getPage(id)).filter(Boolean),
  }));

  return `
    <aside class="sidebar ${state.ui.sidebarOpen ? 'is-open' : ''}" id="sidebar">
      <div class="sidebar__brand">
        <div class="sidebar__logo">E</div>
        <div>
          <div class="sidebar__title">ERP ÜMİT</div>
          <div class="sidebar__subtitle">Personel Takip</div>
        </div>
      </div>
      <nav class="sidebar__nav" aria-label="Ana menü">
        ${itemsBySection
          .map(
            (sec) => `
          <div class="sidebar__section-label">${sec.label}</div>
          ${sec.pages
            .map(
              (p) => `
            <button class="nav-item ${state.ui.page === p.id ? 'is-active' : ''}"
                    data-nav="${p.id}">
              ${icon(p.meta.icon)}
              <span>${p.meta.title}</span>
            </button>`,
            )
            .join('')}
        `,
          )
          .join('')}
      </nav>
      <div class="sidebar__footer">v2.0 — modüler mimari</div>
    </aside>`;
}

function renderTopbar() {
  const page = getPage(state.ui.page);
  const isDark = state.ui.theme === 'dark';
  const user = state.auth.user;

  return `
    <header class="topbar">
      <button class="icon-btn menu-toggle" data-action="toggle-sidebar"
              aria-label="Menüyü aç/kapat">${icon('menu')}</button>
      <div class="topbar__page-title">${page ? page.meta.title : 'ERP ÜMİT'}</div>
      <div class="spacer"></div>
      <div class="topbar__actions">
        <button class="icon-btn" data-action="toggle-theme"
                aria-label="Tema değiştir" title="Tema">
          ${icon(isDark ? 'sun' : 'moon')}
        </button>
        ${
          user
            ? `<button class="btn btn--ghost btn--sm" data-action="logout">
                 ${icon('logout')} Çıkış
               </button>`
            : `<button class="btn btn--primary btn--sm" data-action="login">
                 ${icon('users')} Giriş
               </button>`
        }
      </div>
    </header>`;
}

/** Uygulama kabuğunu oluşturur ve store aboneliklerini bağlar. */
export function mountShell(root) {
  root.innerHTML = `
    <div class="app">
      ${renderSidebar()}
      ${renderTopbar()}
      <main class="content" id="content"></main>
    </div>
    <div class="toast-container" id="toasts"></div>`;

  contentEl = root.querySelector('#content');

  // Kabuk olayları (delegasyon)
  root.addEventListener('click', async (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      navigateTo(nav.dataset.nav);
      setState('ui', { ...state.ui, sidebarOpen: false });
      return;
    }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'toggle-sidebar') {
      setState('ui', { ...state.ui, sidebarOpen: !state.ui.sidebarOpen });
    } else if (action === 'toggle-theme') {
      toggleTheme();
    } else if (action === 'logout') {
      await logout();
      toast('Oturum kapatıldı.', 'info');
    } else if (action === 'login') {
      toast('Giriş ekranı sonraki adımda eklenecek.', 'info');
    }
  });

  // Tema değişince kabuğu yeniden çiz
  subscribe('ui', () => refreshChrome());
}

function refreshChrome() {
  const root = document.getElementById('app-shell');
  const app = root.querySelector('.app');
  app.querySelector('.sidebar')?.remove();
  app.querySelector('.topbar')?.remove();
  app.insertAdjacentHTML('afterbegin', renderSidebar());
  app.children[1].insertAdjacentHTML('afterend', renderTopbar());
  contentEl = app.querySelector('#content');
}

/** Sayfa yönlendirmesi: hash tabanlı, geri/ileri destekler. */
export function navigateTo(pageId) {
  const id = getPage(pageId) ? pageId : 'anasayfa';
  location.hash = `#/${id}`;
}

let activeCleanup = null;

async function renderPage() {
  const { mountPage } = await import('./router.js');
  // Önceki sayfanın temizleme fonksiyonu varsa çağır (abonelik vb. sızıntı olmasın)
  if (typeof activeCleanup === 'function') { try { activeCleanup(); } catch { /* yoksay */ } }
  activeCleanup = await mountPage(contentEl, state.ui.page);
}

function currentPageFromHash() {
  const m = location.hash.match(/^#\/([\w-]+)/);
  return m ? m[1] : 'anasayfa';
}

/** Hash değişimini dinle: sayfa state'ine yansıt ve render et. */
export function startRouting() {
  let sonSayfa = null;
  const apply = () => {
    const id = currentPageFromHash();
    const ayniSayfa = id === sonSayfa && contentEl?.children.length;
    if (id !== state.ui.page) {
      setState('ui', { ...state.ui, page: id }, { persist: false });
    }
    refreshChrome();
    if (!ayniSayfa) {
      sonSayfa = id;
      renderPage();
    }
  };
  window.addEventListener('hashchange', apply);
  // Dönem değişince içinde bulunulan sayfayı yeniden kur
  window.addEventListener('donemDegisti', () => { sonSayfa = null; apply(); });
  apply();
}

function toggleTheme() {
  const next = state.ui.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  setState('ui', { ...state.ui, theme: next });
  // tema ayrı anahtarda kalıcı
  import('./storage.js').then(({ writeKey }) => writeKey('umit_erp_theme', next));
}

/** Açılışta kalıcı temayı uygular. */
export function applySavedTheme() {
  import('./storage.js').then(({ readKey }) => {
    const saved = readKey('umit_erp_theme');
    if (saved === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
      setState('ui', { ...state.ui, theme: 'dark' }, { persist: false });
    }
  });
}
