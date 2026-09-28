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

/* -----------------------------------------------------------------
 * unduhXlsxRapi(wb, namaFile)
 * -----------------------------------------------------------------
 * Pengganti XLSX.writeFile(wb, namaFile) supaya file Excel yang
 * diunduh langsung RAPI seperti tabel: header tebal + latar biru muda
 * + rata tengah, seluruh sel bergaris, baris header dibekukan (tetap
 * terlihat saat digulir), filter otomatis di header, teks panjang
 * terbungkus (wrap), angka rata tengah, dan halaman cetak landscape.
 *
 * Workbook SheetJS yang sudah ada (json_to_sheet + autoFitKolom)
 * dikonversi ke ExcelJS (library ini butuh ExcelJS: window.ExcelJS)
 * karena SheetJS versi gratis tidak bisa menulis garis/warna sel.
 * Header tetap di baris 1 dan isi sel tidak diubah, jadi file hasil
 * unduhan/template tetap bisa di-import kembali tanpa masalah.
 * Kalau ExcelJS gagal dimuat, otomatis kembali ke XLSX.writeFile.
 * ----------------------------------------------------------------- */
(function (global) {
  'use strict';

  var GARIS = { style: 'thin', color: { argb: 'FF7F7F7F' } };
  var BORDER = { top: GARIS, left: GARIS, bottom: GARIS, right: GARIS };
  var ISI_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };

  function nilaiSel(cell) {
    if (cell.t === 'd' && cell.v instanceof Date) return cell.v;
    if (cell.t === 'n') return cell.v;
    if (cell.t === 'b') return cell.v;
    if (cell.v === undefined || cell.v === null) return '';
    return cell.v;
  }

  function barisKosong(ws, R, range) {
    for (var C = range.s.c; C <= range.e.c; C++) {
      var cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell && cell.v !== undefined && cell.v !== null && cell.v !== '') return false;
    }
    return true;
  }

  function salinSheet(wbEx, nama, ws) {
    var sheet = wbEx.addWorksheet(String(nama).slice(0, 31), {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }
    });
    if (!ws || !ws['!ref']) return;
    var range = XLSX.utils.decode_range(ws['!ref']);
    var jumlahKolom = range.e.c - range.s.c + 1;
    var sheetTeksSaja = jumlahKolom === 1; // mis. sheet "Petunjuk": bukan tabel

    // Lebar kolom (dari autoFitKolom / manual)
    var cols = ws['!cols'] || [];
    for (var C = range.s.c; C <= range.e.c; C++) {
      var info = cols[C];
      var lebar = info && (info.wch || (info.wpx && info.wpx / 7)) ? (info.wch || info.wpx / 7) : 14;
      sheet.getColumn(C - range.s.c + 1).width = lebar;
    }

    for (var R = range.s.r; R <= range.e.r; R++) {
      var rowEx = sheet.getRow(R - range.s.r + 1);
      var adaIsi = !barisKosong(ws, R, range);
      var adaTeksPanjang = false;
      for (var K = range.s.c; K <= range.e.c; K++) {
        var cell = ws[XLSX.utils.encode_cell({ r: R, c: K })];
        var cellEx = rowEx.getCell(K - range.s.c + 1);
        if (cell) {
          cellEx.value = nilaiSel(cell);
          if (cell.t === 'd') cellEx.numFmt = 'dd/mm/yyyy';
        }
        if (sheetTeksSaja) {
          cellEx.font = { name: 'Calibri', size: 11, bold: R === range.s.r };
          cellEx.alignment = { vertical: 'top', wrapText: true };
          continue;
        }
        if (!adaIsi) continue; // baris kosong pemisah: tanpa garis
        cellEx.border = BORDER;
        if (R === range.s.r) {
          cellEx.font = { name: 'Calibri', size: 10, bold: true };
          cellEx.fill = ISI_HEADER;
          cellEx.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        } else {
          var angka = cell && cell.t === 'n';
          var tanggal = cell && cell.t === 'd';
          cellEx.font = { name: 'Calibri', size: 10 };
          cellEx.alignment = {
            horizontal: (angka || tanggal) ? 'center' : 'left',
            vertical: 'top',
            wrapText: true
          };
        }
      }
      if (R === range.s.r && !sheetTeksSaja) rowEx.height = 30;
    }

    if (!sheetTeksSaja) {
      sheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: false }];
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: jumlahKolom }
      };
      sheet.pageSetup.printTitlesRow = '1:1';
    }
  }

  async function unduhXlsxRapi(wb, namaFile) {
    try {
      if (typeof ExcelJS === 'undefined') throw new Error('ExcelJS belum dimuat');
      var wbEx = new ExcelJS.Workbook();
      wb.SheetNames.forEach(function (nama) { salinSheet(wbEx, nama, wb.Sheets[nama]); });
      var buffer = await wbEx.xlsx.writeBuffer();
      var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = namaFile;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    } catch (err) {
      console.error('Unduh Excel rapi gagal, memakai cara biasa:', err);
      XLSX.writeFile(wb, namaFile);
    }
  }

  global.unduhXlsxRapi = unduhXlsxRapi;
})(window);
