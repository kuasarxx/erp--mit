# ERP ÜMİT v2 — Personel Takip Sistemi

Tek dosyalı (868 KB) legacy yapıdan **çok dosyalı, modüler mimariye** geçiş projesi.
Eski proje referans için `legacy/index.html` içinde korunmaktadır.

## Proje Kuralları

1. **Emoji yok.** Tüm görsel göstergeler `src/icons/index.js` içindeki SVG ikon kataloğundan gelir.
2. **Çok dosyalı yapı.** Her sayfa kendi modülüdür; tek dev HTML dosyasına geri dönüş yok.
3. **Tek doğruluk kaynağı.** Tüm veri `src/core/store.js` üzerinden akar; bileşenler doğrudan localStorage okumaz.
4. **Adım adım gidiyoruz.** Önce çekirdek + ana sayfa kuruldu; sayfalar tek tek taşınacak.

## Dizin Yapısı

```
index.html               → ince kabuk (sadece #app-shell + main.js)
vite.config.js           → geliştirme/build yapılandırması
src/
  main.js                → açılış: hydrate → tema → kabuk → auth → router
  styles/
    base.css             → tasarım tokenları (renk, tipografi, boşluk), dark tema
    layout.css           → sidebar + topbar + içerik yerleşimi, responsive
    components.css       → kart, tablo, buton, form, rozet, toast, modal
  icons/index.js         → SVG ikon kataloğu (emoji yerine)
  core/
    store.js             → merkezi durum + abonelik sistemi
    storage.js           → localStorage adaptörü (legacy anahtarlarla uyumlu)
    firebase.js          → Firebase başlatma (erp-umit-web)
    authService.js       → login / register / logout / oturum dinleyicisi
    router.js            → sayfa kaydı + hash yönlendirme
    shell.js             → uygulama kabuğu (menü, üst bar, tema)
    toast.js             → bildirim servisi
    utils.js             → para/tarih biçimleme, esc, TR arama
  pages/
    anasayfa.js          → KPI kartları + son notlar (TAŞINDI ✅)
legacy/index.html        → eski tek dosya (referans)
```

## Veri Mantığı (Özet)

- Kalıcı veriler legacy ile **aynı localStorage anahtarlarını** kullanır
  (`umit_erp_global_personeller_v1`, `umit_erp_normal_saatler_v1`, ...):
  eşleme tablosu `src/core/storage.js → PERSIST_MAP`.
- Okuma yalnızca açılışta `hydrate()` ile yapılır; yazma `setState()` içinde otomatik kalıcılaşır.
- Firebase Auth aynı projeyle devam eder; Firestore dokümanı: `kullanicilar/{uid}`.

## Çalıştırma

```bash
npm install
npm run dev      # geliştirme
npm run build    # dist/ üretir
```

## Sayfa Taşıma Sırası (plan)

| # | Sayfa | Durum |
|---|-------|-------|
| 1 | Ana Sayfa (anasayfa) | ✅ tamam |
| 2 | Puantaj (puantaj) | ⏳ sıradaki |
| 3 | Avans / Mesai / Ekstra / Kesinti | ⏳ |
| 4 | İcra / 2. Ödeme / Muhasebe / Dönemler | ⏳ |
| 5 | Gemi / Lumbar / Eğitim | ⏳ |
| 6 | Raporlar (Chart.js) | ⏳ |
| 7 | Giriş ekranı (Firebase Auth UI) | ⏳ |

Her sayfa için: legacy'deki veri şeması çıkarılır → `store` dilimi tanımlanır →
`src/pages/<sayfa>.js` yazılır → `main.js`'teki yorum satırı açılır.
