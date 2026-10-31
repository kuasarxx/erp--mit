// ============================================================
// ERP ÜMİT v2 — Ana giriş noktası
// Sıra: store'ü doldur -> tema uygula -> kabuğu kur ->
// oturum dinleyicisini bağla -> yönlendirmeyi başlat.
// ============================================================

import { hydrate } from './core/store.js';
import { mountShell, startRouting, applySavedTheme } from './core/shell.js';
import { watchAuth } from './core/authService.js';
import { ensureDonem, migrateLegacy } from './core/donemService.js';
import { loadResmiTatiller } from './core/resmiTatilService.js';

// Sayfa modülleri (import edildiklerinde registerPage çağırır)
import './pages/anasayfa.js';
import './pages/puantaj.js';
import './pages/avans.js';
import './pages/mesai.js';
import './pages/ekstra.js';
import './pages/kesinti.js';
import './pages/icra.js';
import './pages/ikinciOdeme.js';

// Diğer sayfalar tek tek eklenecek (adım adım plan):
import './pages/muhasebe.js';
// import './pages/donemler.js';
import './pages/gemi.js';
// import './pages/lumbar.js';
// import './pages/egitim.js';
// import './pages/raporlar.js';

function boot() {
  hydrate();               // localStorage -> store
  ensureDonem();           // aktif dönemi çöz + dönem dilimlerini yükle
  migrateLegacy();         // eski global verileri (bir kerelik) döneme taşı
  loadResmiTatiller();     // resmi tatil state'ini yükle
  applySavedTheme();       // kayıtlı temayı uygula
  const root = document.getElementById('app-shell');
  mountShell(root);        // sidebar + topbar + içerik alanı
  watchAuth();             // Firebase oturum -> store.auth
  startRouting();          // hash -> sayfa render
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
