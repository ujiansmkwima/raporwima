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

  async function workbookKeBlob(wb) {
    var buffer = await wb.xlsx.writeBuffer();
    return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  function unduhBlob(blob, namaFile) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = namaFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  async function unduhWorkbook(wb, namaFile) {
    unduhBlob(await workbookKeBlob(wb), namaFile);
  }

  function buatWorksheet(wb, namaSheet) {
    // Excel melarang karakter * ? : \ / [ ] pada nama sheet.
    return wb.addWorksheet(String(namaSheet).replace(/[*?:\\\/\[\]]/g, '-').slice(0, 31), {
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
  async function buatBlobRekapNilaiSemester(opts) {
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

    return await workbookKeBlob(wb);
  }

  async function unduhRekapNilaiSemester(opts) {
    var blob = await buatBlobRekapNilaiSemester(opts);
    unduhBlob(blob, opts.namaFile || ('rekap_nilai_' + namaFileAman(opts.kelas.nama) + '.xlsx'));
  }

  // Unduh BANYAK kelas sekaligus -> 1 file ZIP berisi 1 file Excel per kelas.
  // daftarOpts = array opts (format sama dengan unduhRekapNilaiSemester).
  // onProgress(selesai, total, namaKelas) dipanggil tiap kelas selesai dibuat.
  // Butuh library JSZip (window.JSZip).
  async function unduhRekapNilaiSemesterZip(daftarOpts, namaZip, onProgress) {
    if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum termuat. Muat ulang halaman lalu coba lagi.');
    var zip = new JSZip();
    var dipakai = {};
    for (var i = 0; i < daftarOpts.length; i++) {
      var o = daftarOpts[i];
      var blob = await buatBlobRekapNilaiSemester(o);
      var nama = o.namaFile || ('rekap_nilai_' + namaFileAman(o.kelas.nama) + '.xlsx');
      if (dipakai[nama]) { // jaga-jaga nama kelas kembar
        var n = ++dipakai[nama];
        nama = nama.replace(/\.xlsx$/i, '') + '_' + n + '.xlsx';
      } else {
        dipakai[nama] = 1;
      }
      zip.file(nama, blob);
      if (onProgress) onProgress(i + 1, daftarOpts.length, o.kelas.nama);
    }
    var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    unduhBlob(zipBlob, namaZip || 'rekap_nilai_semua_kelas.zip');
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


  // =========================================================
  // 3) UNDUH DATA TERINPUT (tabel umum, 1 sheet rapi)
  // =========================================================
  //
  // Dipakai halaman input (Nilai Tengah Semester, Ekstrakurikuler,
  // Kokurikuler, Catatan Wali Kelas, dan rekap kelas) untuk mengunduh
  // data yang SUDAH terisi dalam format siap cetak: kop judul + nama
  // sekolah, blok identitas, tabel bergaris (header berwarna, baris
  // header dibekukan, filter otomatis), dan blok tanda tangan.
  //
  // opts = {
  //   namaFile, namaSheet,
  //   judul: 'NILAI EKSTRAKURIKULER',
  //   profilSekolah: { nama_sekolah, alamat_sekolah, kepala_sekolah, nip_kepala_sekolah, kota_ttd, tanggal_rapor },
  //   identitas: [[labelKiri, nilaiKiri, labelKanan?, nilaiKanan?], ...],
  //   headers: ['No', 'NIS', ...],
  //   rows: [[1, '123', ...], ...]  (sel boleh { v, abu:true }),
  //   lebar: [5, 14, 30, ...]       (lebar tiap kolom, karakter),
  //   tengahKolom: [0, 1],          (indeks kolom rata tengah),
  //   ttd: { labelKiri: 'Pembina', namaKiri, nipKiri }  (opsional; tanpa ini tidak ada blok tanda tangan)
  // }
  function tulisIdentitasRingkas(ws, startRow, totalKolom, pasangan) {
    // Tata letak aman untuk tabel sempit (4-8 kolom): label di kolom 1-2
    // (digabung), nilai di kolom 3 sampai akhir, format ": nilai".
    var r = startRow;
    var kolNilai = totalKolom >= 3 ? 3 : 2;
    pasangan.forEach(function (p) {
      var teks = (p[1] === null || p[1] === undefined || p[1] === '') ? '-' : p[1];
      if (kolNilai > 2) ws.mergeCells(r, 1, r, kolNilai - 1);
      ws.getCell(r, 1).value = p[0];
      ws.getCell(r, 1).font = { size: 10 };
      ws.getCell(r, 1).alignment = { horizontal: 'left', vertical: 'middle' };
      if (totalKolom > kolNilai) ws.mergeCells(r, kolNilai, r, totalKolom);
      ws.getCell(r, kolNilai).value = ': ' + teks;
      ws.getCell(r, kolNilai).font = { size: 10, bold: true };
      ws.getCell(r, kolNilai).alignment = { horizontal: 'left', vertical: 'middle' };
      r++;
    });
    return r + 1;
  }

  function tulisTtdRingkas(ws, startRow, totalKolom, opsi) {
    // Kiri = kolom 1..kiriAkhir (No, NIS, Nama), kanan = sisanya.
    var kiriAkhir = Math.min(3, totalKolom - 1);
    var kananAwal = kiriAkhir + 1;
    var r = startRow + 2;
    function sel(baris, kolAwal, kolAkhir, teks, font) {
      if (kolAkhir > kolAwal) ws.mergeCells(baris, kolAwal, baris, kolAkhir);
      var c = ws.getCell(baris, kolAwal);
      c.value = teks;
      c.font = font || { size: 10 };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    }
    sel(r, kananAwal, totalKolom, opsi.kotaTanggal || '');
    r++;
    sel(r, 1, kiriAkhir, opsi.labelKiri || 'Guru');
    sel(r, kananAwal, totalKolom, 'Kepala Sekolah');
    r += 4; // ruang tanda tangan basah
    sel(r, 1, kiriAkhir, opsi.namaKiri || '-', { bold: true, underline: true, size: 10 });
    sel(r, kananAwal, totalKolom, opsi.kepalaSekolah || '-', { bold: true, underline: true, size: 10 });
    r++;
    sel(r, 1, kiriAkhir, 'NIP. ' + (opsi.nipKiri || '..........................'));
    sel(r, kananAwal, totalKolom, 'NIP. ' + (opsi.nipKepalaSekolah || '..........................'));
  }

  async function unduhTabel(opts) {
    var headers = opts.headers || [];
    var rows = opts.rows || [];
    var totalKolom = headers.length;
    if (!totalKolom) throw new Error('Tidak ada kolom untuk diunduh.');

    var wb = new ExcelJS.Workbook();
    var ws = buatWorksheet(wb, opts.namaSheet || 'Data');

    var profil = opts.profilSekolah || {};
    var barisJudul = [opts.judul || 'DATA', (profil.nama_sekolah || 'SMK Widya Mandala Tambak').toUpperCase()];
    if (profil.alamat_sekolah) barisJudul.push(profil.alamat_sekolah);
    var next = tulisJudul(ws, totalKolom, barisJudul);

    if (opts.identitas && opts.identitas.length) {
      next = tulisIdentitasRingkas(ws, next, totalKolom, opts.identitas);
    }

    var barisHeader = next;
    var akhirTabel = tulisTabel(ws, next, headers, rows, { tengahKolom: opts.tengahKolom || [0] });

    for (var c = 0; c < totalKolom; c++) {
      ws.getColumn(c + 1).width = (opts.lebar && opts.lebar[c]) || 16;
    }

    // Header tabel dibekukan + filter otomatis (hanya bila ada data).
    ws.views = [{ state: 'frozen', ySplit: barisHeader, showGridLines: false }];
    if (rows.length) {
      ws.autoFilter = { from: { row: barisHeader, column: 1 }, to: { row: barisHeader, column: totalKolom } };
    }
    ws.pageSetup.printTitlesRow = barisHeader + ':' + barisHeader;

    if (opts.ttd) {
      tulisTtdRingkas(ws, akhirTabel, totalKolom, {
        kotaTanggal: kotaTanggalDariProfil(profil),
        kepalaSekolah: profil.kepala_sekolah,
        nipKepalaSekolah: profil.nip_kepala_sekolah,
        labelKiri: opts.ttd.labelKiri,
        namaKiri: opts.ttd.namaKiri,
        nipKiri: opts.ttd.nipKiri
      });
    }

    await unduhWorkbook(wb, opts.namaFile || 'data.xlsx');
  }


  // =========================================================
  // 4) DATA RAPOR LENGKAP 1 KELAS (dipakai Admin -> Unduh Data Rapor)
  // =========================================================
  //
  // Menghasilkan 1 file Excel (Blob) untuk 1 kelas, berformat sama dengan
  // Rekap Nilai/Leger (judul, identitas, tabel bergaris, tanda tangan):
  //   - Sheet "Rekap Nilai"  : nilai akhir semua mapel, 1 baris per siswa
  //   - Sheet "Rekap Rapor"  : ketidakhadiran, ekskul, kokurikuler, catatan wali
  //   - Sheet per siswa      : isi kartu rapor lengkap (nilai + capaian
  //                            kompetensi, kokurikuler, ekskul, ketidakhadiran,
  //                            catatan wali kelas, tanda tangan)
  //
  // opts = {
  //   profilSekolah, tahunAjaran: { nama, semester }, kelas: { nama, tingkat, program_keahlian },
  //   waliKelasNama, fase, semesterKe,
  //   siswaList: [{ id, nis, nisn, nama, agama }],
  //   mapelUmum: [{ id, nama, agama_spesifik? }], mapelKejuruan: [...],   (sudah urut)
  //   namaMapelFn: function (nama, agama) -> nama tampil,
  //   nilaiMap: { [siswaId]: { [mapelId]: { nilai, capaian_pembelajaran } } },
  //   ekskulMap: { [siswaId]: [{ nama, predikat, deskripsi }] },
  //   kokuMap: { [siswaId]: [{ nama_kegiatan, deskripsi }] },
  //   presMap: { [siswaId]: { jumlah_sakit, jumlah_izin, jumlah_alpha, catatan_wali_kelas } }
  // }
  async function buatBlobDataRaporKelas(opts) {
    var profil = opts.profilSekolah || {};
    var namaSekolah = (profil.nama_sekolah || 'SMK Widya Mandala Tambak').toUpperCase();
    var siswaList = opts.siswaList || [];
    var wb = new ExcelJS.Workbook();
    wb.creator = 'Portal Data dan Penilaian SMK Widya Mandala Tambak';
    wb.created = new Date();

    function relevan(list, siswa) {
      var l = list.filter(function (m) { return !m.agama_spesifik || m.agama_spesifik === siswa.agama; });
      return l.filter(function (m) { return m.agama_spesifik && m.agama_spesifik === siswa.agama; })
        .concat(l.filter(function (m) { return !(m.agama_spesifik && m.agama_spesifik === siswa.agama); }));
    }
    function nilaiBulat(n) { return (n && n.nilai !== undefined && n.nilai !== null) ? Math.round(Number(n.nilai)) : ''; }

    var mapelSemua = (opts.mapelUmum || []).concat(opts.mapelKejuruan || []);
    var judulBase = [namaSekolah];
    if (profil.alamat_sekolah) judulBase.push(profil.alamat_sekolah);
    var identKelas = [
      ['Kelas', opts.kelas.nama, 'Tahun Ajaran', opts.tahunAjaran.nama],
      ['Program Keahlian', opts.kelas.program_keahlian, 'Semester', (opts.semesterKe ? opts.semesterKe + ' (' : '') + opts.tahunAjaran.semester + (opts.semesterKe ? ')' : '')],
      ['Wali Kelas', opts.waliKelasNama, 'Jumlah Peserta Didik', String(siswaList.length)]
    ];
    var ttdKelas = {
      kotaTanggal: kotaTanggalDariProfil(profil),
      kepalaSekolah: profil.kepala_sekolah,
      nipKepalaSekolah: profil.nip_kepala_sekolah,
      waliKelas: opts.waliKelasNama
    };

    // ---------- Sheet 1: Rekap Nilai ----------
    var ws1 = buatWorksheet(wb, 'Rekap Nilai');
    var tk1 = Math.max(9, 3 + mapelSemua.length);
    var nx = tulisJudul(ws1, tk1, ['REKAP NILAI RAPOR'].concat(judulBase));
    nx = tulisIdentitas(ws1, nx, tk1, identKelas);
    var head1 = ['No', 'NIS', 'Nama Peserta Didik'].concat(mapelSemua.map(function (m) { return m.nama; }));
    var rows1 = siswaList.map(function (s, i) {
      var row = [i + 1, s.nis || '-', s.nama];
      mapelSemua.forEach(function (m) {
        if (m.agama_spesifik && s.agama !== m.agama_spesifik) { row.push({ v: '-', abu: true }); return; }
        row.push(nilaiBulat((opts.nilaiMap[s.id] || {})[m.id]));
      });
      return row;
    });
    var tengah1 = [0, 1]; for (var c = 3; c < tk1; c++) tengah1.push(c);
    var akhir1 = tulisTabel(ws1, nx, head1, rows1, { tengahKolom: tengah1 });
    ws1.getColumn(1).width = 5; ws1.getColumn(2).width = 13; ws1.getColumn(3).width = 27;
    for (var c2 = 4; c2 <= tk1; c2++) ws1.getColumn(c2).width = 12;
    ws1.views = [{ state: 'frozen', xSplit: 3, ySplit: nx, showGridLines: false }];
    tulisTandaTangan(ws1, akhir1, tk1, ttdKelas);

    // ---------- Sheet 2: Rekap Rapor (non-nilai) ----------
    var ws2 = buatWorksheet(wb, 'Rekap Rapor');
    var tk2 = 9;
    var nx2 = tulisJudul(ws2, tk2, ['REKAP RAPOR — KETIDAKHADIRAN, EKSTRAKURIKULER, KOKURIKULER, CATATAN'].concat(judulBase));
    nx2 = tulisIdentitas(ws2, nx2, tk2, identKelas);
    var head2 = ['No', 'NIS', 'Nama Peserta Didik', 'Sakit', 'Izin', 'Tanpa Ket.', 'Ekstrakurikuler', 'Kokurikuler', 'Catatan Wali Kelas'];
    var rows2 = siswaList.map(function (s, i) {
      var p = opts.presMap[s.id] || {};
      var ek = (opts.ekskulMap[s.id] || []).map(function (e) { return e.nama + (e.predikat ? ' (' + e.predikat + ')' : '') + (e.deskripsi ? ' — ' + e.deskripsi : ''); }).join('\n');
      var kk = (opts.kokuMap[s.id] || []).map(function (k) { return (k.nama_kegiatan || 'Tanpa nama kegiatan') + (k.deskripsi ? ' — ' + k.deskripsi : ''); }).join('\n');
      return [i + 1, s.nis || '-', s.nama, p.jumlah_sakit || 0, p.jumlah_izin || 0, p.jumlah_alpha || 0, ek, kk, p.catatan_wali_kelas || ''];
    });
    var akhir2 = tulisTabel(ws2, nx2, head2, rows2, { tengahKolom: [0, 1, 3, 4, 5] });
    [5, 13, 27, 8, 8, 10, 38, 55, 45].forEach(function (w, i) { ws2.getColumn(i + 1).width = w; });
    ws2.views = [{ state: 'frozen', xSplit: 3, ySplit: nx2, showGridLines: false }];
    tulisTandaTangan(ws2, akhir2, tk2, ttdKelas);

    // ---------- Sheet per siswa: isi kartu rapor ----------
    var dipakai = {};
    siswaList.forEach(function (s, idx) {
      var nama = (idx + 1) + ' ' + s.nama;
      nama = nama.replace(/[*?:\\\/\[\]]/g, '-').slice(0, 31);
      if (dipakai[nama]) nama = nama.slice(0, 28) + '~' + (++dipakai[nama]); else dipakai[nama] = 1;
      var ws = wb.addWorksheet(nama, {
        pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
        views: [{ showGridLines: false }]
      });
      var TK = 4;
      var r = tulisJudul(ws, TK, ['RAPOR PESERTA DIDIK'].concat(judulBase));
      r = tulisIdentitasRingkas(ws, r, TK, [
        ['Nama Peserta Didik', s.nama], ['NIS / NISN', (s.nis || '-') + ' / ' + (s.nisn || '-')],
        ['Kelas', opts.kelas.nama], ['Fase', opts.fase || '-'],
        ['Semester', (opts.semesterKe ? opts.semesterKe + ' (' : '') + opts.tahunAjaran.semester + (opts.semesterKe ? ')' : '')],
        ['Tahun Ajaran', opts.tahunAjaran.nama]
      ]);

      // Tabel nilai + capaian, dengan baris kelompok A/B
      var hr = r;
      ['No', 'Mata Pelajaran', 'Nilai Akhir', 'Capaian Kompetensi'].forEach(function (t, k) {
        var cell = ws.getCell(hr, k + 1);
        cell.value = t; cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cell.fill = ISI_HEADER; cell.border = GARIS_SEL;
      });
      r = hr + 1;
      var no = 0;
      [['A. Mata Pelajaran Umum', opts.mapelUmum || []], ['B. Mata Pelajaran Kejuruan', opts.mapelKejuruan || []]].forEach(function (g) {
        ws.mergeCells(r, 1, r, TK);
        var gc = ws.getCell(r, 1);
        gc.value = g[0]; gc.font = { bold: true, size: 10 };
        gc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
        for (var cc = 1; cc <= TK; cc++) ws.getCell(r, cc).border = GARIS_SEL;
        r++;
        relevan(g[1], s).forEach(function (m) {
          var n = (opts.nilaiMap[s.id] || {})[m.id] || {};
          no++;
          var vals = [no, opts.namaMapelFn ? opts.namaMapelFn(m.nama, s.agama) : m.nama, nilaiBulat(n), n.capaian_pembelajaran || ''];
          vals.forEach(function (v, k) {
            var cell = ws.getCell(r, k + 1);
            cell.value = v; cell.border = GARIS_SEL; cell.font = { size: 10 };
            cell.alignment = { vertical: 'top', horizontal: (k === 0 || k === 2) ? 'center' : 'left', wrapText: true };
          });
          r++;
        });
      });
      r++;

      function bar(teks) {
        ws.mergeCells(r, 1, r, TK);
        var c = ws.getCell(r, 1);
        c.value = teks; c.font = { bold: true, size: 10 }; c.fill = ISI_HEADER;
        for (var cc = 1; cc <= TK; cc++) ws.getCell(r, cc).border = GARIS_SEL;
        r++;
      }
      function kotak(teks) {
        ws.mergeCells(r, 1, r, TK);
        var c = ws.getCell(r, 1);
        c.value = teks || '-'; c.font = { size: 10 };
        c.alignment = { vertical: 'top', wrapText: true };
        for (var cc = 1; cc <= TK; cc++) ws.getCell(r, cc).border = GARIS_SEL;
        ws.getRow(r).height = Math.max(20, 15 * Math.ceil(String(teks || '-').length / 95));
        r++;
      }

      bar('Kokurikuler');
      kotak((opts.kokuMap[s.id] || []).map(function (k) { return (k.nama_kegiatan || 'Tanpa nama kegiatan') + (k.deskripsi ? ' — ' + k.deskripsi : ''); }).join('\n'));
      r++;

      ['No', 'Ekstrakurikuler', 'Keterangan'].forEach(function (t, k) {
        if (k === 2) ws.mergeCells(r, 3, r, TK);
        var cell = ws.getCell(r, k + 1);
        cell.value = t; cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center' }; cell.fill = ISI_HEADER;
      });
      for (var cc = 1; cc <= TK; cc++) ws.getCell(r, cc).border = GARIS_SEL;
      r++;
      var eks = opts.ekskulMap[s.id] || [];
      if (!eks.length) eks = [{ nama: '-', predikat: '', deskripsi: '' }];
      eks.forEach(function (e, i) {
        ws.mergeCells(r, 3, r, TK);
        ws.getCell(r, 1).value = e.nama === '-' ? '-' : i + 1;
        ws.getCell(r, 1).alignment = { horizontal: 'center', vertical: 'top' };
        ws.getCell(r, 2).value = e.nama;
        ws.getCell(r, 3).value = [e.predikat, e.deskripsi].filter(Boolean).join(' — ') || '-';
        ws.getCell(r, 3).alignment = { vertical: 'top', wrapText: true };
        for (var c3 = 1; c3 <= TK; c3++) { ws.getCell(r, c3).border = GARIS_SEL; ws.getCell(r, c3).font = { size: 10 }; }
        r++;
      });
      r++;

      var p = opts.presMap[s.id] || {};
      bar('Ketidakhadiran');
      [['Sakit', p.jumlah_sakit || 0], ['Izin', p.jumlah_izin || 0], ['Tanpa Keterangan', p.jumlah_alpha || 0]].forEach(function (x) {
        ws.mergeCells(r, 1, r, 2);
        ws.getCell(r, 1).value = x[0];
        ws.getCell(r, 3).value = x[1];
        ws.getCell(r, 3).alignment = { horizontal: 'center' };
        ws.getCell(r, 4).value = 'Hari';
        for (var c4 = 1; c4 <= TK; c4++) { ws.getCell(r, c4).border = GARIS_SEL; ws.getCell(r, c4).font = { size: 10 }; }
        r++;
      });
      r++;
      bar('Catatan Wali Kelas');
      kotak(p.catatan_wali_kelas || '');

      tulisTtdRingkas(ws, r, TK, {
        kotaTanggal: kotaTanggalDariProfil(profil), labelKiri: 'Wali Kelas', namaKiri: opts.waliKelasNama,
        kepalaSekolah: profil.kepala_sekolah, nipKepalaSekolah: profil.nip_kepala_sekolah
      });

      ws.getColumn(1).width = 6; ws.getColumn(2).width = 40; ws.getColumn(3).width = 12; ws.getColumn(4).width = 70;
    });

    return await workbookKeBlob(wb);
  }

  // Zip generik: files = [{ nama, blob }]
  async function unduhZipBerkas(files, namaZip) {
    if (typeof JSZip === 'undefined') throw new Error('Library JSZip belum termuat. Muat ulang halaman lalu coba lagi.');
    var zip = new JSZip();
    files.forEach(function (f) { zip.file(f.nama, f.blob); });
    var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    unduhBlob(zipBlob, namaZip);
  }

  global.RekapExcel = {
    unduhRekapNilaiSemester: unduhRekapNilaiSemester,
    unduhRekapNilaiSemesterZip: unduhRekapNilaiSemesterZip,
    unduhLegerSiswa: unduhLegerSiswa,
    unduhTabel: unduhTabel,
    buatBlobDataRaporKelas: buatBlobDataRaporKelas,
    unduhZipBerkas: unduhZipBerkas,
    namaFileAman: namaFileAman,
    formatTanggalId: formatTanggalId
  };
})(window);
