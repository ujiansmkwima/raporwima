/* xlsx-autofit.js
 * -----------------------------------------------------------------
 * Helper bersama untuk semua file Excel (.xlsx) yang dibuat sistem
 * ini (lewat SheetJS/XLSX), supaya lebar kolom otomatis menyesuaikan
 * isi selnya — tidak perlu dilebarkan manual lagi tiap dibuka.
 *
 * Dipakai dengan: panggil autoFitKolom(ws) SETELAH worksheet dibuat
 * (json_to_sheet/aoa_to_sheet) dan SEBELUM worksheet itu ditulis ke
 * file (book_append_sheet / writeFile). Nilai selnya sendiri harus
 * sudah ada di ws saat autoFitKolom dipanggil, karena lebar dihitung
 * dari isi sel yang sesungguhnya (termasuk baris header).
 *
 * Dimuat sebagai <script src="xlsx-autofit.js"></script> SETELAH
 * script xlsx.full.min.js (perlu XLSX.utils.decode_range/encode_cell).
 * -----------------------------------------------------------------
 */
(function (global) {
  'use strict';

  // Lebar kasar 1 karakter di font default Excel (Calibri 11) yang
  // dipakai SheetJS sendiri untuk satuan "wch" (width in characters).
  // Huruf kapital/tebal dianggap sedikit lebih lebar lewat PADDING.
  var DEFAULT_MIN = 8;
  var DEFAULT_MAX = 60;
  var DEFAULT_PADDING = 2;

  function panjangTeksSel(cell) {
    if (!cell) return 0;
    // cell.w = teks TERFORMAT (mis. tanggal/angka dengan format),
    // dipakai kalau ada karena itu yang benar-benar terlihat di Excel.
    var teks = cell.w != null ? String(cell.w) : (cell.v != null ? String(cell.v) : '');
    if (!teks) return 0;
    // Isi multi-baris (mis. catatan panjang dengan \n): lebar kolom
    // cukup mengikuti baris TERPANJANG-nya, bukan total semua baris.
    var baris = teks.split('\n');
    var maxLen = 0;
    for (var i = 0; i < baris.length; i++) {
      if (baris[i].length > maxLen) maxLen = baris[i].length;
    }
    return maxLen;
  }

  /**
   * @param {object} ws      Worksheet SheetJS (hasil json_to_sheet/aoa_to_sheet).
   * @param {object} [opsi]
   * @param {number} [opsi.min=8]       Lebar minimum tiap kolom (karakter).
   * @param {number} [opsi.max=60]      Lebar maksimum tiap kolom (karakter),
   *                                    supaya 1 sel yang isinya sangat
   *                                    panjang (mis. Capaian Kompetensi)
   *                                    tidak membuat kolomnya jadi
   *                                    sepanjang 1 layar penuh.
   * @param {number} [opsi.padding=2]   Tambahan spasi di kanan teks terpanjang.
   * @param {number[]} [opsi.minCols]   Lebar minimum PER KOLOM (indeks 0-based),
   *                                    dipakai bareng "min" global — dipakai
   *                                    yang paling besar. Berguna untuk kolom
   *                                    yang sudah sengaja dibuat lega (mis.
   *                                    template import) walau isinya masih
   *                                    kosong/pendek.
   * @returns {object} ws yang sama (supaya bisa dipakai langsung: 
   *                   var ws = autoFitKolom(XLSX.utils.json_to_sheet(...));)
   */
  function autoFitKolom(ws, opsi) {
    opsi = opsi || {};
    if (!ws || !ws['!ref']) return ws;
    var MIN = opsi.min || DEFAULT_MIN;
    var MAX = opsi.max || DEFAULT_MAX;
    var PADDING = opsi.padding != null ? opsi.padding : DEFAULT_PADDING;
    var minCols = opsi.minCols || [];

    var range = XLSX.utils.decode_range(ws['!ref']);
    var lebar = [];
    for (var C = range.s.c; C <= range.e.c; C++) {
      var maxLen = 0;
      for (var R = range.s.r; R <= range.e.r; R++) {
        var panjang = panjangTeksSel(ws[XLSX.utils.encode_cell({ r: R, c: C })]);
        if (panjang > maxLen) maxLen = panjang;
      }
      var batasBawah = Math.max(MIN, minCols[C - range.s.c] || 0);
      lebar.push({ wch: Math.max(batasBawah, Math.min(MAX, maxLen + PADDING)) });
    }
    ws['!cols'] = lebar;
    return ws;
  }

  global.autoFitKolom = autoFitKolom;
})(window);
