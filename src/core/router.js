// ============================================================
// ERP ÜMİT v2 — Sayfa kayıt sistemi (router)
// Her sayfa modülü kendini registerPage ile kaydeder;
// router yalnızca aktif sayfayı render eder. Böylece tek
// dosyalı eski yapıdaki "tüm sayfalar DOM'da hazır bekler"
// yaklaşımı yerine tembel (lazy) yükleme gelir.
// ============================================================

const pages = new Map();

/**
 * @param {string} id      - sayfa anahtarı (ör. 'puantaj')
 * @param {object} meta    - { title, icon, section }
 * @param {Function} render - (container) => void | cleanup()
 */
export function registerPage(id, meta, render) {
  pages.set(id, { id, meta, render });
}

export function getPage(id) {
  return pages.get(id);
}

export function allPages() {
  return [...pages.values()];
}

/** İçinde bulunulan container'ı temizler ve sayfanın render'ını çağırır. */
export async function mountPage(container, id) {
  const page = pages.get(id);
  if (!page) {
    container.innerHTML = `<div class="card"><div class="card__body">Sayfa bulunamadı: <b>${id}</b></div></div>`;
    return;
  }
  container.replaceChildren();
  await page.render(container);
}
