/* excel-rekap.js
 * -----------------------------------------------------------------
 * Helper bersama (Admin & Guru/Wali Kelas) untuk membuat file Excel
 * (.xlsx) yang RAPI untuk:
 *   1) Rekap Nilai Semester per kelas (RekapExcel.unduhRekapNilaiSemester)
 *   2) Leger Nilai 6 Semester per siswa (RekapExcel.unduhLegerSiswa)
 *
 * Berbeda dari xlsx-autofit.js (yang menemani library SheetJS/XLSX
 * dipakai di seluruh sistem untuk import/export data mentah), file
 * ini memakai library ExcelJS supaya bisa menulis GARIS TABEL, JUDUL,
 * KOP IDENTITAS, dan BLOK TANDA TANGAN Wali Kelas + Kepala Sekolah —
 * sesuatu yang tidak bisa dilakukan versi gratis SheetJS. Kedua
 * library (XLSX dan ExcelJS) aman dipakai berdampingan karena
 * namespace globalnya berbeda (window.XLSX vs window.ExcelJS).
 *
 * Dimuat sebagai:
 *   <script src="https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js"></script>
 *   <script src="excel-rekap.js"></script>
 * (setelah exceljs, di admin.html maupun guru.html)
 * -----------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var GARIS_TIPIS = { style: 'thin', color: { argb: 'FF666666' } };
  var GARIS_SEL = { top: GARIS_TIPIS, left: GARIS_TIPIS, bottom: GARIS_TIPIS, right: GARIS_TIPIS };
  var ISI_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };

  var NAMA_BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  function formatTanggalId(tanggalIso) {
    if (!tanggalIso) return '';
    var bagian = String(tanggalIso).split('-');
    if (bagian.length !== 3) return '';
    var tahun = parseInt(bagian[0], 10), bulan = parseInt(bagian[1], 10), tanggal = parseInt(bagian[2], 10);
    if (!tahun || !bulan || !tanggal || bulan < 1 || bulan > 12) return '';
    return tanggal + ' ' + NAMA_BULAN_ID[bulan - 1] + ' ' + tahun;
  }

  function namaFileAman(s) {
    return String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 80);
  }

  // ---------- Bagian umum: judul, identitas, tabel, tanda tangan ----------

  // Menulis 1 baris "judul" per elemen array `barisJudul`, di-merge
  // sepanjang totalKolom, rata tengah. Baris pertama dianggap judul
  // utama (lebih besar & tebal). Mengembalikan nomor baris kosong
  // berikutnya.
  function tulisJudul(ws, totalKolom, barisJudul) {
    var r = 1;
    barisJudul.forEach(function (teks, i) {
      ws.mergeCells(r, 1, r, totalKolom);
      var cell = ws.getCell(r, 1);
      cell.value = teks;
      cell.font = { name: 'Calibri', size: i === 0 ? 14 : (i === 1 ? 12 : 10), bold: i <= 1, italic: i > 1 };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      r++;
    });
    return r + 1; // 1 baris kosong pemisah
  }

  // Menulis blok identitas 2 kolom ("Label : Nilai   Label : Nilai").
  // `pasangan` = array baris, tiap baris array [labelKiri, nilaiKiri,
  // labelKanan?, nilaiKanan?]. Mengembalikan nomor baris kosong berikutnya.
  function tulisIdentitas(ws, startRow, totalKolom, pasangan) {
    var r = startRow;
    var tengah = Math.max(4, Math.floor(totalKolom / 2));
    pasangan.forEach(function (p) {
      ws.getCell(r, 1).value = p[0];
      ws.getCell(r, 1).font = { size: 10 };
      ws.getCell(r, 2).value = ':';
      ws.getCell(r, 2).font = { size: 10 };
      ws.mergeCells(r, 3, r, tengah);
      ws.getCell(r, 3).value = (p[1] === null || p[1] === undefined || p[1] === '') ? '-' : p[1];
      ws.getCell(r, 3).font = { size: 10, bold: true };
      if (p.length > 2 && p[2] && tengah + 3 <= totalKolom) {
        var kolLabelKanan = tengah + 2;
        ws.getCell(r, kolLabelKanan).value = p[2];
        ws.getCell(r, kolLabelKanan).font = { size: 10 };
        ws.getCell(r, kolLabelKanan + 1).value = ':';
        ws.getCell(r, kolLabelKanan + 1).font = { size: 10 };
        ws.mergeCells(r, kolLabelKanan + 2, r, totalKolom);
        ws.getCell(r, kolLabelKanan + 2).value = (p[3] === null || p[3] === undefined || p[3] === '') ? '-' : p[3];
        ws.getCell(r, kolLabelKanan + 2).font = { size: 10, bold: true };
      }
      r++;
    });
    return r + 1; // 1 baris kosong pemisah
  }

  // Menulis tabel dengan header (bold, latar abu muda) dan seluruh sel
  // bergaris (border tipis di 4 sisi). `sel` opsional: { tengahKolom:
  // [indeks 0-based kolom yang rata tengah], abuKolom: [indeks 0-based
  // kolom yang teksnya abu-abu, dipakai utk sel "tidak berlaku"] }.
  // dataRows[i][c] boleh berupa string biasa, ATAU { v: nilai, abu:
  // true } untuk menandai sel itu abu-abu.
  // Mengembalikan nomor baris terakhir tabel (baris data terakhir).
  function tulisTabel(ws, startRow, headerRow, dataRows, sel) {
    sel = sel || {};
    var tengahKolom = sel.tengahKolom || [];
    var r = startRow;

    headerRow.forEach(function (teks, c) {
      var cell = ws.getCell(r, c + 1);
      cell.value = teks;
      cell.font = { bold: true, size: 10 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.fill = ISI_HEADER;
      cell.border = GARIS_SEL;
    });
    ws.getRow(r).height = 30;
    r++;

    if (!dataRows.length) {
      ws.mergeCells(r, 1, r, headerRow.length);
      var kosong = ws.getCell(r, 1);
      kosong.value = 'Belum ada data.';
      kosong.alignment = { horizontal: 'center' };
      kosong.border = GARIS_SEL;
      kosong.font = { italic: true, size: 10, color: { argb: 'FF888888' } };
      return r;
    }

    dataRows.forEach(function (row) {
      row.forEach(function (raw, c) {
        var abu = raw && typeof raw === 'object' && raw.hasOwnProperty('v');
        var val = abu ? raw.v : raw;
        var cell = ws.getCell(r, c + 1);
        cell.value = (val === null || val === undefined) ? '' : val;
        cell.border = GARIS_SEL;
        cell.font = { size: 10, color: (abu && raw.abu) ? { argb: 'FF999999' } : undefined };
        cell.alignment = { vertical: 'middle', horizontal: tengahKolom.indexOf(c) !== -1 ? 'center' : 'left', wrapText: true };
      });
      r++;
    });
    return r - 1;
  }

  // Menulis blok tanda tangan Wali Kelas (kiri, tanpa tanggal — sesuai
  // konvensi yang sudah dipakai di Cetak Rapor & Cetak PKL) dan Kepala
  // Sekolah (kanan, dengan baris "Kota, tanggal" di atasnya).
  function tulisTandaTangan(ws, startRow, totalKolom, opsi) {
    opsi = opsi || {};
    var tengah = Math.max(4, Math.floor(totalKolom / 2));
    var r = startRow + 2;

    ws.mergeCells(r, tengah + 1, r, totalKolom);
    ws.getCell(r, tengah + 1).value = opsi.kotaTanggal || '';
    ws.getCell(r, tengah + 1).alignment = { horizontal: 'center' };
    ws.getCell(r, tengah + 1).font = { size: 10 };
    r++;

    ws.mergeCells(r, 1, r, tengah);
    ws.getCell(r, 1).value = 'Wali Kelas';
    ws.getCell(r, 1).alignment = { horizontal: 'center' };
    ws.getCell(r, 1).font = { size: 10 };
    ws.mergeCells(r, tengah + 1, r, totalKolom);
    ws.getCell(r, tengah + 1).value = 'Kepala Sekolah';
    ws.getCell(r, tengah + 1).alignment = { horizontal: 'center' };
    ws.getCell(r, tengah + 1).font = { size: 10 };
    r += 4; // ruang kosong untuk tanda tangan basah

    ws.mergeCells(r, 1, r, tengah);
    var cellWali = ws.getCell(r, 1);
    cellWali.value = opsi.waliKelas || '-';
    cellWali.font = { bold: true, underline: true, size: 10 };
    cellWali.alignment = { horizontal: 'center' };
    ws.mergeCells(r, tengah + 1, r, totalKolom);
    var cellKS = ws.getCell(r, tengah + 1);
    cellKS.value = opsi.kepalaSekolah || '-';
    cellKS.font = { bold: true, underline: true, size: 10 };
    cellKS.alignment = { horizontal: 'center' };
    r++;

    ws.mergeCells(r, 1, r, tengah);
    ws.getCell(r, 1).value = 'NIP. ' + (opsi.nipWaliKelas || '..........................');
    ws.getCell(r, 1).alignment = { horizontal: 'center' };
    ws.getCell(r, 1).font = { size: 10 };
    ws.mergeCells(r, tengah + 1, r, totalKolom);
    ws.getCell(r, tengah + 1).value = 'NIP. ' + (opsi.nipKepalaSekolah || '..........................');
    ws.getCell(r, tengah + 1).alignment = { horizontal: 'center' };
    ws.getCell(r, tengah + 1).font = { size: 10 };
  }

  function kotaTanggalDariProfil(profilSekolah) {
    profilSekolah = profilSekolah || {};
    var kota = profilSekolah.kota_ttd || 'Tambak';
    var tgl = formatTanggalId(profilSekolah.tanggal_rapor);
    return kota + ', ' + (tgl || '..........................');
  }

  async function unduhWorkbook(wb, namaFile) {
    var buffer = await wb.xlsx.writeBuffer();
    var blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = namaFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function buatWorksheet(wb, namaSheet) {
    return wb.addWorksheet(namaSheet.slice(0, 31), {
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
      views: [{ showGridLines: false }]
    });
  }

  // =========================================================
  // 1) REKAP NILAI SEMESTER (1 kelas, 1 semester, semua mapel & siswa)
  // =========================================================
  //
  // opts = {
  //   namaFile, namaSheet,
  //   profilSekolah: { nama_sekolah, alamat_sekolah, kepala_sekolah, nip_kepala_sekolah, kota_ttd, tanggal_rapor },
  //   tahunAjaran: { nama, semester },
  //   kelas: { nama, program_keahlian, konsentrasi_keahlian },
  //   waliKelasNama, waliKelasNip,
  //   mapelList: [{ id, nama, kode?, agama_spesifik? }],
  //   siswaList: [{ id, nama, nis, nisn, agama }],
  //   nilaiMap: { [siswaId]: { [mapelId]: { nilai } } }
  // }
  async function unduhRekapNilaiSemester(opts) {
    var mapelList = opts.mapelList || [];
    var siswaList = opts.siswaList || [];
    var nilaiMap = opts.nilaiMap || {};
    var totalKolom = 3 + mapelList.length; // No, NIS, Nama + tiap mapel

    var wb = new ExcelJS.Workbook();
    var ws = buatWorksheet(wb, opts.namaSheet || 'Rekap Nilai');

    var profil = opts.profilSekolah || {};
    var barisJudul = ['REKAP NILAI SEMESTER', (profil.nama_sekolah || 'SMK Widya Mandala Tambak').toUpperCase()];
    if (profil.alamat_sekolah) barisJudul.push(profil.alamat_sekolah);
    var next = tulisJudul(ws, totalKolom, barisJudul);

    next = tulisIdentitas(ws, next, totalKolom, [
      ['Kelas', opts.kelas.nama, 'Tahun Ajaran', opts.tahunAjaran.nama],
      ['Program Keahlian', opts.kelas.program_keahlian, 'Semester', opts.tahunAjaran.semester],
      ['Wali Kelas', opts.waliKelasNama, 'Jumlah Peserta Didik', String(siswaList.length)]
    ]);

    var headerRow = ['No', 'NIS', 'Nama Peserta Didik'].concat(mapelList.map(function (m) {
      return (m.kode ? (m.kode + ' - ') : '') + m.nama;
    }));

    var dataRows = siswaList.map(function (s, i) {
      var row = [i + 1, s.nis || '-', s.nama];
      mapelList.forEach(function (m) {
        if (m.agama_spesifik && s.agama !== m.agama_spesifik) {
          row.push({ v: '-', abu: true });
          return;
        }
        var n = (nilaiMap[s.id] && nilaiMap[s.id][m.id]) || {};
        row.push((n.nilai === undefined || n.nilai === null) ? '' : Math.round(Number(n.nilai)));
      });
      return row;
    });

    var tengahKolom = [0, 1];
    for (var c = 3; c < totalKolom; c++) tengahKolom.push(c);
    var akhirTabel = tulisTabel(ws, next, headerRow, dataRows, { tengahKolom: tengahKolom });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 13;
    ws.getColumn(3).width = 27;
    for (var c2 = 4; c2 <= totalKolom; c2++) ws.getColumn(c2).width = 11;

    tulisTandaTangan(ws, akhirTabel, totalKolom, {
      kotaTanggal: kotaTanggalDariProfil(profil),
      kepalaSekolah: profil.kepala_sekolah,
      nipKepalaSekolah: profil.nip_kepala_sekolah,
      waliKelas: opts.waliKelasNama,
      nipWaliKelas: opts.waliKelasNip
    });

    await unduhWorkbook(wb, opts.namaFile || ('rekap_nilai_' + namaFileAman(opts.kelas.nama) + '.xlsx'));
  }

  // =========================================================
  // 2) LEGER NILAI 6 SEMESTER (1 siswa, semua mapel x 6 semester)
  // =========================================================
  //
  // opts = {
  //   namaFile, namaSheet,
  //   profilSekolah: { ... sama seperti di atas ... },
  //   siswa: { nama, nis, nisn, agama },
  //   kelas: { nama, program_keahlian, konsentrasi_keahlian },
  //   waliKelasNama, waliKelasNip,
  //   mapelList: [{ id, nama, kode? }],
  //   nilaiMap: { 1: { [mapelId]: { nilai } }, ..., 6: { ... } },
  //   tidakBerlakuFn: function(mapel, semesterKe) -> boolean (opsional;
  //     dipakai supaya sel semester yang mapelnya tidak berlaku
  //     ditampilkan abu-abu, sama seperti tampilan layarnya)
  // }
  async function unduhLegerSiswa(opts) {
    var mapelList = opts.mapelList || [];
    var nilaiMap = opts.nilaiMap || {};
    var totalKolom = 2 + 6; // No, Mata Pelajaran + 6 semester

    var wb = new ExcelJS.Workbook();
    var ws = buatWorksheet(wb, opts.namaSheet || 'Leger Nilai');

    var profil = opts.profilSekolah || {};
    var barisJudul = ['LEGER NILAI — 6 SEMESTER', (profil.nama_sekolah || 'SMK Widya Mandala Tambak').toUpperCase()];
    if (profil.alamat_sekolah) barisJudul.push(profil.alamat_sekolah);
    var next = tulisJudul(ws, totalKolom, barisJudul);

    next = tulisIdentitas(ws, next, totalKolom, [
      ['Nama Peserta Didik', opts.siswa.nama, 'NIS', opts.siswa.nis],
      ['Kelas', opts.kelas.nama, 'NISN', opts.siswa.nisn],
      ['Program Keahlian', opts.kelas.program_keahlian, 'Wali Kelas', opts.waliKelasNama]
    ]);

    var headerRow = ['No', 'Mata Pelajaran', 'Semester 1', 'Semester 2', 'Semester 3', 'Semester 4', 'Semester 5', 'Semester 6'];
    var dataRows = mapelList.map(function (m, i) {
      var row = [i + 1, (m.kode ? (m.kode + ' - ') : '') + m.nama];
      for (var ke = 1; ke <= 6; ke++) {
        var n = (nilaiMap[ke] && nilaiMap[ke][m.id]) || {};
        var nilaiTampil = (n.nilai === undefined || n.nilai === null) ? '' : Math.round(Number(n.nilai));
        var tidakBerlaku = opts.tidakBerlakuFn ? opts.tidakBerlakuFn(m, ke) : false;
        row.push(tidakBerlaku ? { v: nilaiTampil, abu: true } : nilaiTampil);
      }
      return row;
    });

    var akhirTabel = tulisTabel(ws, next, headerRow, dataRows, { tengahKolom: [0, 2, 3, 4, 5, 6, 7] });

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 36;
    for (var c = 3; c <= 8; c++) ws.getColumn(c).width = 12;

    tulisTandaTangan(ws, akhirTabel, totalKolom, {
      kotaTanggal: kotaTanggalDariProfil(profil),
      kepalaSekolah: profil.kepala_sekolah,
      nipKepalaSekolah: profil.nip_kepala_sekolah,
      waliKelas: opts.waliKelasNama,
      nipWaliKelas: opts.waliKelasNip
    });

    await unduhWorkbook(wb, opts.namaFile || ('leger_' + namaFileAman(opts.siswa.nama) + '.xlsx'));
  }

  global.RekapExcel = {
    unduhRekapNilaiSemester: unduhRekapNilaiSemester,
    unduhLegerSiswa: unduhLegerSiswa,
    namaFileAman: namaFileAman,
    formatTanggalId: formatTanggalId
  };
})(window);
