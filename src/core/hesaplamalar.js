// ============================================================
// ERP ÜMİT v2 — Hesaplama motoru (saf fonksiyonlar)
// Legacy'deki vardiyaHesapla/normalSaatHesapla/gunSayisi mantığı.
// UI'dan bağımsız olduğu için birim testlerine uygundur.
// ============================================================

/** O ay kaç gün çekiyor? (0-based ay) */
export function gunSayisi(yil, ay) {
  return new Date(yil, ay + 1, 0).getDate();
}

/** 0=Pazar ... 6=Cumartesi */
export function haftaGunu(yil, ay, gun) {
  return new Date(yil, ay, gun).getDay();
}

/** "07:55" -> 475 dakika; geçersizse null */
export function saatToDk(s) {
  if (!s) return null;
  const p = String(s).split(':');
  if (p.length < 2) return null;
  const h = parseInt(p[0], 10);
  const m = parseInt(p[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/**
 * Giriş/çıkış saatini kural aralıklarına göre değerlendirip yevmiye döner.
 * Gece vardiyası (baş>bitiş) desteklenir. Uyan kural yoksa null.
 * @param {string} giris  "HH:MM"
 * @param {string} cikis  "HH:MM"
 * @param {Array}  kurallar [{girisBas,girisBit,cikisBas,cikisBit,yevmiye}]
 */
export function kuralBazliYevmiye(giris, cikis, kurallar) {
  if (!giris || !cikis || !Array.isArray(kurallar)) return null;
  const gDk = saatToDk(giris);
  const cDk = saatToDk(cikis);
  if (gDk === null || cDk === null) return null;

  const aralikta = (deger, bas, bit) => {
    const b = saatToDk(bas), e = saatToDk(bit);
    if (b === null || e === null) return false;
    return b <= e ? (deger >= b && deger <= e) : (deger >= b || deger <= e);
  };

  for (const k of kurallar) {
    if (aralikta(gDk, k.girisBas, k.girisBit) && aralikta(cDk, k.cikisBas, k.cikisBit)) {
      return k.yevmiye;
    }
  }
  return null;
}

/** Vardiya kurallarına göre yevmiye (legacy: vardiyaHesapla) */
export function vardiyaHesapla(giris, cikis, kurallar) {
  return kuralBazliYevmiye(giris, cikis, kurallar);
}

/** Normal tersane saatlerine göre yevmiye (legacy: normalSaatHesapla) */
export function normalSaatHesapla(giris, cikis, saatler) {
  return kuralBazliYevmiye(giris, cikis, saatler);
}

/** Hücre değerinin tipi: 'gelmedi' | 'izinli' | 'raporlu' | 'sayi' | 'bos' */
export function hucreTipi(v) {
  if (v === undefined || v === null || v === '') return 'bos';
  const u = String(v).toUpperCase();
  if (u === 'X') return 'gelmedi';
  if (u === 'İ' || u === 'I') return 'izinli';
  if (u === 'R') return 'raporlu';
  return 'sayi';
}

/** Satır toplamları: {gun, yevmiye} — X/İ/R sayılmaz */
export function satirToplam(p, gs) {
  let gun = 0, yevmiye = 0;
  for (let g = 1; g <= gs; g++) {
    const tip = hucreTipi(p.gunler?.[g]);
    if (tip !== 'sayi') continue;
    const n = Number(p.gunler[g]);
    if (!Number.isNaN(n) && n > 0) { gun += 1; yevmiye += n; }
  }
  return { gun, yevmiye: Math.round(yevmiye * 100) / 100 };
}

/** Gün bazlı özet: geldi/gelmedi/izinli/raporlu/boş + toplam yevmiye */
export function gunOzeti(personeller, gun) {
  let gelen = 0, gelmeyen = 0, izinli = 0, raporlu = 0, bos = 0, toplamYevmiye = 0;
  for (const p of personeller) {
    const v = p.gunler?.[gun];
    const tip = hucreTipi(v);
    if (tip === 'bos') { bos++; continue; }
    if (tip === 'gelmedi') { gelmeyen++; continue; }
    if (tip === 'izinli') { izinli++; continue; }
    if (tip === 'raporlu') { raporlu++; continue; }
    const n = Number(v);
    if (!Number.isNaN(n) && n > 0) { gelen++; toplamYevmiye += n; }
  }
  return {
    toplamKisi: personeller.length,
    gelen, gelmeyen, izinli, raporlu, girilmemis: bos,
    yevmiye: Math.round(toplamYevmiye * 100) / 100,
  };
}

/**
 * Yapıştırılan metni "ID \t İsim \t Meslek" satırlarına çevirir
 * (legacy parseYukleme ile aynı kurallar: tab veya 2+ boşluk, başlık satırı atlanır).
 */
export function parseListe(text) {
  const satirlar = String(text || '').trim().split(/\r?\n/).filter((s) => s.trim());
  const out = [];
  satirlar.forEach((satir, i) => {
    const parcalar = (satir.includes('\t')
      ? satir.split('\t')
      : satir.split(/\s{2,}/)).map((x) => x.trim());
    if (parcalar.length < 2) return;
    const ilk = parcalar[0].toLowerCase();
    if (i === 0 && ['id', 'ıd', 'no', 'sicil'].includes(ilk)) return;
    out.push({ id: parcalar[0], isim: parcalar[1] || '', meslek: parcalar[2] || '' });
  });
  return out;
}

/**
 * "ID \t GİRİŞ \t ÇIKIŞ" satırlarını ayrıştırır. Excel ondalık saat
 * (0.33 gibi gün kesri) "HH:MM"e çevrilir (legacy saatExcelFormat).
 */
export function parseSaatMetni(text) {
  const satirlar = String(text || '').trim().split(/\r?\n/).filter((s) => s.trim());
  const out = [];
  satirlar.forEach((satir, i) => {
    const parca = (satir.includes('\t') ? satir.split('\t') : satir.split(/\s{2,}/)).map((x) => x.trim());
    const id = String(parca[0] || '');
    if (!id) return;
    if (i === 0 && ['id', 'ıd'].includes(id.toLowerCase())) return;
    out.push({ id, giris: excelSaatFormat(parca[1] || ''), cikis: excelSaatFormat(parca[2] || '') });
  });
  return out;
}

export function excelSaatFormat(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const p = s.split(':');
    return `${String(p[0]).padStart(2, '0')}:${String(p[1]).padStart(2, '0')}`;
  }
  const n = parseFloat(s.replace(',', '.'));
  if (!Number.isNaN(n) && n >= 0 && n <= 1) {
    const dk = Math.round(n * 24 * 60);
    return `${String(Math.floor(dk / 60)).padStart(2, '0')}:${String(dk % 60).padStart(2, '0')}`;
  }
  return s;
}
