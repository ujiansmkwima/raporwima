/* supervisi-excel.js — template Excel (rapi, bertabel) & import Excel untuk modul Supervisi.
   Template dibuat dengan ExcelJS (garis tabel, warna header, dropdown, judul, cetak siap A4);
   file yang diisi dibaca kembali dengan SheetJS (XLSX). Keduanya harus dimuat lebih dulu:
     https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js
     https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
   Template boleh punya judul/keterangan di atas tabel: baris header dicari otomatis lewat kata penanda
   (lihat pilihFile), jadi file lama yang header-nya di baris 1 tetap bisa diimpor. */
var SvXlsx = (function () {
  // ---------- Gaya ----------
  var GARIS_T = { style: 'thin', color: { argb: 'FF7F8FA6' } };
  var BORDER = { top: GARIS_T, left: GARIS_T, bottom: GARIS_T, right: GARIS_T };
  function isi(argb) { return { type: 'pattern', pattern: 'solid', fgColor: { argb: argb } }; }
  var F_HEADER = isi('FF1F4E79'), F_BACA = isi('FFF2F2F2'), F_ISI = isi('FFFFFBE6'), F_NA = isi('FFE7E7E7'), F_BAGIAN = isi('FFDCE6F1'), F_INFO = isi('FFF2F2F2'), F_TIP = isi('FFFFF4CE');

  function jumlah(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
  function tinggiTeks(teks, lebarKolom) {
    var w = Math.max(4, lebarKolom * 1.05), n = 0;
    String(teks).split('\n').forEach(function (p) { n += Math.max(1, Math.ceil(p.length / w)); });
    return n;
  }
  function tinggiBaris(sel, lebar) {
    var maks = 1;
    sel.forEach(function (v, c) { if (v === null || v === undefined || v === '') return; var n = tinggiTeks(v, lebar[c] || 10); if (n > maks) maks = n; });
    return Math.max(18, maks * 13 + 5);
  }
  function ada(x) { return (x === null || x === undefined || x === '' || x === '—') ? '-' : x; }

  // ---------- Pembuat sheet ----------
  // cfg: judul[], info[[label,nilai]], infoLabelSpan, petunjuk[], header[], lebar[], rows[], kosong, kosongNomor,
  //      tengah[], baca[], isi[], valKolom{idx:dv}, fmt{idx:numFmt}, landscape
  // rows[i]: Array = baris biasa | {bagian, ket} = judul bagian (gabung kolom 2..n) | {sel, na[], val{idx:dv}, fillRow}
  function isiSheet(ws, cfg) {
    var n = cfg.header.length, lebar = cfg.lebar, total = jumlah(lebar), r = 1, c;
    lebar.forEach(function (w, i) { ws.getColumn(i + 1).width = w; });

    (cfg.judul || []).forEach(function (t, i) {
      ws.mergeCells(r, 1, r, n);
      var cell = ws.getCell(r, 1); cell.value = t;
      cell.font = { name: 'Calibri', size: i === 0 ? 14 : (i === 1 ? 12 : 10), bold: i <= 1, italic: i > 1 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      ws.getRow(r).height = i === 0 ? 22 : 18;
      r++;
    });
    r++;

    if (cfg.info && cfg.info.length) {
      var ls = cfg.infoLabelSpan || 1;
      cfg.info.forEach(function (p) {
        for (c = 1; c <= n; c++) { var x = ws.getCell(r, c); x.border = BORDER; }
        if (ls > 1) ws.mergeCells(r, 1, r, ls);
        if (n > ls + 1) ws.mergeCells(r, ls + 1, r, n);
        var a = ws.getCell(r, 1); a.value = p[0]; a.font = { size: 10, bold: true }; a.fill = F_INFO; a.alignment = { vertical: 'middle' };
        var b = ws.getCell(r, ls + 1); b.value = ada(p[1]); b.font = { size: 10 }; b.alignment = { vertical: 'middle', wrapText: true };
        ws.getRow(r).height = 18; r++;
      });
      r++;
    }

    (cfg.petunjuk || []).forEach(function (t) {
      ws.mergeCells(r, 1, r, n);
      var cell = ws.getCell(r, 1); cell.value = t; cell.font = { size: 9, italic: true, color: { argb: 'FF5A4A00' } }; cell.fill = F_TIP;
      cell.alignment = { vertical: 'middle', wrapText: true };
      ws.getRow(r).height = Math.max(18, tinggiTeks(t, total) * 12.5 + 5); r++;
    });
    if (cfg.petunjuk && cfg.petunjuk.length) r++;

    var headerRow = r;
    cfg.header.forEach(function (t, i) {
      var cell = ws.getCell(r, i + 1); cell.value = t;
      cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } }; cell.fill = F_HEADER; cell.border = BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    });
    ws.getRow(r).height = Math.max(30, tinggiBaris(cfg.header, lebar));
    r++;

    var firstData = r, tengah = cfg.tengah || [], baca = cfg.baca || [], isian = cfg.isi || [], valK = cfg.valKolom || {}, fmt = cfg.fmt || {};
    function tulis(sel, na, val, fillRow) {
      na = na || []; val = val || {};
      for (c = 0; c < n; c++) {
        var v = sel[c], cell = ws.getCell(r, c + 1);
        cell.value = (v === '' || v === null || v === undefined) ? null : v;
        cell.border = BORDER; cell.font = { size: 10, bold: !!fillRow };
        cell.alignment = { vertical: 'top', horizontal: tengah.indexOf(c) >= 0 ? 'center' : 'left', wrapText: true };
        if (fmt[c]) cell.numFmt = fmt[c];
        var warna = fillRow ? F_BAGIAN : (na.indexOf(c) >= 0 ? F_NA : (baca.indexOf(c) >= 0 ? F_BACA : (isian.indexOf(c) >= 0 ? F_ISI : null)));
        if (warna) cell.fill = warna;
        var dv = val[c] || valK[c]; if (dv && na.indexOf(c) < 0) cell.dataValidation = Object.assign({}, dv);
      }
      ws.getRow(r).height = tinggiBaris(sel, lebar);
      r++;
    }
    (cfg.rows || []).forEach(function (row) {
      if (Array.isArray(row)) return tulis(row);
      if (row.bagian !== undefined) {
        [row.bagian].concat(row.ket ? [row.ket] : []).forEach(function (t, k) {
          for (c = 1; c <= n; c++) { var x = ws.getCell(r, c); x.border = BORDER; if (k === 0) x.fill = F_BAGIAN; }
          if (n > 2) ws.mergeCells(r, 2, r, n);
          var cell = ws.getCell(r, 2); cell.value = t; cell.alignment = { vertical: 'middle', wrapText: true };
          cell.font = k === 0 ? { size: 10, bold: true, color: { argb: 'FF1F4E79' } } : { size: 9, italic: true, color: { argb: 'FF555555' } };
          ws.getRow(r).height = Math.max(18, tinggiTeks(t, total - lebar[0]) * 12.5 + 6); r++;
        });
        return;
      }
      tulis(row.sel, row.na, row.val, row.fillRow);
    });
    var adaData = r > firstData;
    for (var k = 0; k < (cfg.kosong || 0); k++) {
      var sel = new Array(n).fill('');
      if (cfg.kosongNomor) sel[0] = (cfg.rows ? cfg.rows.length : 0) + k + 1;
      tulis(sel);
    }
    if (!adaData && !cfg.kosong) { ws.mergeCells(r, 1, r, n); var kc = ws.getCell(r, 1); kc.value = 'Belum ada data.'; kc.font = { italic: true, size: 10, color: { argb: 'FF888888' } }; kc.alignment = { horizontal: 'center' }; kc.border = BORDER; r++; }

    ws.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
    ws.pageSetup = { paperSize: 9, orientation: cfg.landscape ? 'landscape' : 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: headerRow + ':' + headerRow,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 } };
    ws.headerFooter = { oddFooter: '&C&8Halaman &P dari &N' };
    return { headerRow: headerRow, firstData: firstData, lastData: r - 1 };
  }

  async function simpan(wb, namaFile) {
    var buf = await wb.xlsx.writeBuffer();
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = namaFile; document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  }
  function buatWb() {
    if (!window.ExcelJS) throw new Error('Pustaka ExcelJS belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
    var wb = new ExcelJS.Workbook(); wb.creator = 'E-Rapor Supervisi'; wb.created = new Date(); return wb;
  }
  function daftar(kolom, sheet) { // rujukan rentang sheet lain untuk dropdown
    return "'" + sheet + "'!$" + kolom[0] + '$' + kolom[1] + ':$' + kolom[0] + '$' + kolom[2];
  }
  function dvList(formula, judul, pesan, gaya) {
    return { type: 'list', allowBlank: true, formulae: [formula], showErrorMessage: true, errorStyle: gaya || 'stop', errorTitle: judul, error: pesan };
  }

  // ---------- Template: Jadwal ----------
  // opsi: { guru:[{nama}], mapel:[{nama}], form:[{judul}], sekolah }
  async function templateJadwal(opsi) {
    var wb = buatWb(), wsJ = wb.addWorksheet('Jadwal'), wsD = wb.addWorksheet('Daftar Nama');
    var g = opsi.guru || [], m = opsi.mapel || [], f = opsi.form || [], nn = Math.max(g.length, m.length, f.length), ref = [];
    for (var i = 0; i < nn; i++) ref.push([(g[i] || {}).nama || '', (m[i] || {}).nama || '', (f[i] || {}).judul || '']);
    var pos = isiSheet(wsD, { judul: ['DAFTAR NAMA (acuan dropdown pada sheet Jadwal — jangan diubah)'], header: ['Nama Guru', 'Mapel', 'Judul Form'], lebar: [36, 36, 64], rows: ref });
    var awal = pos.firstData;
    var vd = {};
    vd[1] = dvList('"pra,supervisi"', 'Jenis tidak valid', 'Pilih pra atau supervisi.');
    if (g.length) { vd[3] = dvList(daftar(['A', awal, awal + g.length - 1], 'Daftar Nama'), 'Nama tidak ada', 'Pilih nama dari daftar (sheet Daftar Nama).'); vd[4] = vd[3]; }
    if (m.length) vd[5] = dvList(daftar(['B', awal, awal + m.length - 1], 'Daftar Nama'), 'Mapel tidak ada', 'Pilih mapel dari daftar atau kosongkan.');
    if (f.length) vd[6] = dvList(daftar(['C', awal, awal + f.length - 1], 'Daftar Nama'), 'Form tidak ada', 'Pilih judul form dari daftar atau kosongkan.');
    isiSheet(wsJ, {
      judul: [(opsi.sekolah || '').toUpperCase(), 'TEMPLATE JADWAL SUPERVISI'].filter(function (x) { return x; }),
      petunjuk: ['Isi satu baris untuk satu jadwal. Jenis, Nama Guru, Nama Supervisor, Mapel, dan Judul Form dipilih dari dropdown (daftar ada di sheet "Daftar Nama").',
        'Tanggal ditulis YYYY-MM-DD (mis. 2026-10-05) atau dipilih sebagai tanggal Excel. Mapel, Judul Form, dan Kelas boleh dikosongkan — Kelas terisi otomatis dari Penugasan Guru.'],
      header: ['No', 'Jenis (pra / supervisi)', 'Tanggal (YYYY-MM-DD)', 'Nama Guru', 'Nama Supervisor', 'Mapel (opsional)', 'Judul Form (opsional)', 'Kelas (opsional, otomatis bila kosong)'],
      lebar: [6, 18, 20, 34, 34, 32, 46, 26], rows: [], kosong: 40, kosongNomor: true, tengah: [0, 1, 2], valKolom: vd, fmt: { 2: 'yyyy-mm-dd' }, landscape: true
    });
    await simpan(wb, 'template_jadwal_supervisi.xlsx');
  }

  // ---------- Template: Form ----------
  // opsi: { forms:[{judul,jenis,pertanyaan}], sekolah }
  async function templateForm(opsi) {
    var wb = buatWb(), ws = wb.addWorksheet('Form'), wp = wb.addWorksheet('Petunjuk Tipe');
    var rows = [];
    (opsi.forms || []).forEach(function (f) {
      f.pertanyaan.forEach(function (q) { rows.push({ sel: [f.judul, f.jenis, q.tipe, q.teks, q.keterangan || '', q.komentar ? 'Ya' : '', (q.opsi || []).join('|')], fillRow: q.tipe === 'bagian' }); });
    });
    if (!rows.length) {
      rows.push({ sel: ['Contoh Form', 'pra', 'bagian', 'Keselarasan', '', '', ''], fillRow: true },
        { sel: ['Contoh Form', 'pra', 'skala', 'Contoh indikator', '', 'Ya', '1 — Kurang|2 — Cukup|3 — Baik|4 — Sangat baik'] },
        { sel: ['Contoh Form', 'pra', 'teks', 'Contoh pertanyaan isian teks', '', '', ''] });
    }
    var vd = {
      1: dvList('"pra,supervisi"', 'Jenis tidak valid', 'Pilih pra atau supervisi.'),
      2: dvList('"skala,pilihan,ya_tidak,teks,bukti_catatan,info,bagian"', 'Tipe tidak valid', 'Pilih salah satu tipe dari daftar (lihat sheet Petunjuk Tipe).'),
      5: dvList('"Ya"', 'Isian tidak valid', 'Isi Ya atau kosongkan.')
    };
    isiSheet(ws, {
      judul: [(opsi.sekolah || '').toUpperCase(), 'TEMPLATE FORM PRA-SUPERVISI & SUPERVISI'].filter(function (x) { return x; }),
      petunjuk: ['Satu baris = satu pertanyaan atau judul bagian. Baris dengan Judul Form yang sama digabung menjadi satu form; urutan baris = urutan pertanyaan.',
        'Catatan: form yang judulnya sudah ada akan DIPERBARUI, judul baru dibuat sebagai form baru. Kolom Tipe dipilih dari dropdown — penjelasan tiap tipe ada di sheet "Petunjuk Tipe".'],
      header: ['Judul Form', 'Jenis (pra / supervisi)', 'Tipe', 'Teks', 'Keterangan (khusus bagian)', 'Kolom Komentar (Ya / kosong, khusus skala)', 'Opsi Skala (pisahkan dengan |)'],
      lebar: [36, 18, 16, 70, 36, 24, 48], rows: rows, kosong: 60, tengah: [1, 2, 5], valKolom: vd, landscape: true
    });
    isiSheet(wp, {
      judul: ['PETUNJUK TIPE PERTANYAAN'], header: ['Tipe', 'Fungsi', 'Kolom yang dipakai'], lebar: [18, 72, 44], landscape: true,
      rows: [
        ['skala', 'Penilaian skala 1–4; bisa diberi kolom komentar kritis.', 'Teks, Kolom Komentar (Ya), Opsi Skala'],
        ['pilihan', 'Pilih satu dari daftar opsi bebas (mis. Ada / Sesuai / Perlu perbaikan), tanpa skor; bisa diberi kolom catatan.', 'Teks, Kolom Komentar (Ya), Opsi (pisahkan dengan |)'],
        ['ya_tidak', 'Pilihan Ya / Tidak.', 'Teks'],
        ['teks', 'Isian teks panjang (kesimpulan, refleksi, dsb.).', 'Teks'],
        ['bukti_catatan', 'Dua kolom isian: Bukti Pembelajaran dan Catatan.', 'Teks'],
        ['info', 'Isian singkat tanpa nomor. Jenjang / Mata Pelajaran / Kelas terisi otomatis dari data admin.', 'Teks'],
        ['bagian', 'Judul pengelompok bagian form (tanpa isian).', 'Teks, Keterangan']
      ]
    });
    await simpan(wb, 'template_form_supervisi.xlsx');
  }

  // ---------- Template: Isian (dipakai supervisor) ----------
  function turunanInfo(label, id) {
    label = String(label || '').toLowerCase();
    var v = /jenjang/.test(label) ? id.jenjang : /mata pelajaran/.test(label) ? id.mapel : /kelas/.test(label) ? id.kelas : '';
    return (v && v !== '—') ? v : '';
  }
  // f = form, jw = jawaban sementara, id = identitas (idn(j)), opsi = { sekolah, namaFile }
  async function templateIsian(f, jw, catatan, id, opsi) {
    jw = jw || {}; id = id || {}; opsi = opsi || {};
    if (window.SvForm) f = SvForm.aktif(f, jw);
    var wb = buatWb(), ws = wb.addWorksheet('Isian'), rows = [], skalaPertama = null;
    var g = function (k) { return jw[k] === undefined ? '' : jw[k]; };
    var dvSkala = dvList('"1,2,3,4"', 'Isian tidak valid', 'Isi angka 1, 2, 3, atau 4.');
    var dvYT = dvList('"Ya,Tidak"', 'Isian tidak valid', 'Pilih Ya atau Tidak.');
    f.pertanyaan.forEach(function (q) {
      var t = q.tipe;
      if (t === 'bagian') { rows.push({ bagian: q.teks, ket: q.keterangan || '' }); return; }
      if (t === 'pilihan') {
        var vp = parseInt(g(q.id), 10), np = (q.opsi || []).length;
        rows.push({ sel: [q.id, q.teks + '  [isi angka: ' + (q.opsi || []).map(function (o, i) { return (i + 1) + ' = ' + o; }).join(', ') + ']', (vp >= 1 && vp <= np) ? vp : '', q.komentar ? g(q.id + '_k') : '', ''], na: q.komentar ? [4] : [3, 4], val: { 2: dvList('"' + (q.opsi || []).map(function (o, i) { return i + 1; }).join(',') + '"', 'Isian tidak valid', 'Isi angka sesuai nomor opsi.') } });
      } else if (t === 'skala') {
        if (!skalaPertama) skalaPertama = q;
        var v = parseInt(g(q.id), 10);
        rows.push({ sel: [q.id, q.teks, (v >= 1 && v <= 4) ? v : '', q.komentar ? g(q.id + '_k') : '', ''], na: q.komentar ? [4] : [3, 4], val: { 2: dvSkala } });
      } else if (t === 'ya_tidak') rows.push({ sel: [q.id, q.teks, g(q.id), '', ''], na: [3, 4], val: { 2: dvYT } });
      else if (t === 'bukti_catatan') rows.push({ sel: [q.id, q.teks, '', g(q.id + '_b'), g(q.id + '_c')], na: [2] });
      else rows.push({ sel: [q.id, q.teks, t === 'info' ? (g(q.id) || turunanInfo(q.teks, id)) : g(q.id), '', ''], na: [3, 4] });
    });
    rows.push({ sel: ['catatan', 'Catatan / Tindak Lanjut', catatan || '', '', ''], na: [3, 4] });

    var petunjuk = ['Isi hanya sel berlatar kuning. Sel abu-abu tidak perlu diisi. Kolom Kode dan Pertanyaan jangan diubah karena dipakai saat import.'];
    if (skalaPertama) petunjuk.push('Butir skala diisi angka 1–4' + (skalaPertama.opsi ? ' — ' + skalaPertama.opsi.join('  |  ') : '') + '.');
    petunjuk.push('Butir Ya/Tidak dipilih dari dropdown; butir lain diisi teks. Butir "Bukti + Catatan" diisi pada dua kolom paling kanan.');
    isiSheet(ws, {
      judul: [(opsi.sekolah || '').toUpperCase(), 'TEMPLATE ISIAN ' + String(id.jenis || 'SUPERVISI').toUpperCase(), f.judul].filter(function (x) { return x; }),
      info: [['Nama Guru', id.guru], ['Supervisor', id.spv], ['Mata Pelajaran', id.mapel], ['Kelas', id.kelas], ['Tanggal Pelaksanaan', id.tanggal]], infoLabelSpan: 2,
      petunjuk: petunjuk,
      header: ['Kode', 'Pertanyaan', 'Isian (skala 1-4 / Ya-Tidak / teks)', 'Komentar Kritis / Bukti Pembelajaran', 'Catatan'],
      lebar: [9, 56, 32, 40, 34], rows: rows, tengah: [0], baca: [0, 1], isi: [2, 3, 4], landscape: true
    });
    await simpan(wb, (opsi.namaFile || 'isian_supervisi') + '.xlsx');
  }

  // ---------- Import ----------
  // marker (opsional): awal teks sel header pertama, mis. 'kode'. Baris header dicari otomatis di antara judul/keterangan.
  // Hasil: array objek {namaKolom: nilai, __baris: nomor baris di Excel}.
  function pilihFile(cb, marker) {
    var i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv';
    i.onchange = function () {
      if (!i.files[0]) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var wb = XLSX.read(r.result, { type: 'array', cellDates: true });
          var aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true }), h = 0, x;
          if (marker) {
            marker = String(marker).toLowerCase();
            // header = baris pertama yang punya sel berawalan penanda DAN minimal 3 sel terisi (judul/petunjuk hanya 1 sel)
            for (x = 0; x < aoa.length; x++) {
              var terisi = aoa[x].filter(function (c) { return String(c).trim() !== ''; }).length;
              if (terisi >= 3 && aoa[x].some(function (c) { return typeof c === 'string' && c.trim().toLowerCase().indexOf(marker) === 0; })) { h = x; break; }
            }
          }
          var kunci = (aoa[h] || []).map(function (k) { return String(k).trim(); });
          cb(aoa.slice(h + 1).map(function (row, n) {
            var o = {}; kunci.forEach(function (k, c) { if (k !== '') o[k] = row[c] === undefined ? '' : row[c]; });
            o.__baris = h + 2 + n; return o;
          }));
        } catch (e) { alert('File tidak bisa dibaca: ' + e.message); }
      };
      r.readAsArrayBuffer(i.files[0]);
    };
    i.click();
  }
  // Ambil nilai kolom berdasarkan awal nama header (tidak peduli huruf besar/kecil)
  function ambil(row, nama) {
    nama = nama.toLowerCase();
    for (var k in row) if (String(k).trim().toLowerCase().indexOf(nama) === 0) { var v = row[k]; return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : v); }
    return '';
  }
  function tgl(v) {
    var d, m;
    if (v instanceof Date) { d = new Date(v.getTime() + 12 * 3600 * 1000); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
    v = String(v || '').trim();
    if ((m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    if ((m = v.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    return null;
  }

  // Isian dari file template Isian -> { jawaban, catatan, err, n }
  function isianDari(f, rows) {
    var jw = {}, err = [], n = 0, catatan = null;
    rows.forEach(function (r, i) {
      var kode = String(ambil(r, 'Kode')), isi = ambil(r, 'Isian'), k4 = ambil(r, 'Komentar'), k5 = ambil(r, 'Catatan'), baris = r.__baris || (i + 2);
      if (!kode) return;
      if (kode === 'catatan') { catatan = String(isi); n++; return; }
      var q = f.pertanyaan.filter(function (x) { return x.id === kode && x.tipe !== 'bagian'; })[0];
      if (!q) { err.push('Baris ' + baris + ': kode "' + kode + '" tidak ada di form ini'); return; }
      if (q.tipe === 'pilihan') {
        var vp = parseInt(isi, 10), np = (q.opsi || []).length;
        if (isi !== '' && !(vp >= 1 && vp <= np)) { err.push('Baris ' + baris + ': isi angka 1–' + np); return; }
        jw[q.id] = isi === '' ? '' : String(vp);
        if (q.komentar) jw[q.id + '_k'] = String(k4);
      } else if (q.tipe === 'skala') {
        var v = parseInt(isi, 10);
        if (isi !== '' && !(v >= 1 && v <= 4)) { err.push('Baris ' + baris + ': skala harus 1–4'); return; }
        jw[q.id] = isi === '' ? '' : String(v);
        if (q.komentar) jw[q.id + '_k'] = String(k4);
      } else if (q.tipe === 'ya_tidak') {
        var t = String(isi).toLowerCase();
        if (t !== '' && t !== 'ya' && t !== 'tidak') { err.push('Baris ' + baris + ': isi Ya atau Tidak'); return; }
        jw[q.id] = t === 'ya' ? 'Ya' : (t === 'tidak' ? 'Tidak' : '');
      } else if (q.tipe === 'bukti_catatan') { jw[q.id + '_b'] = String(k4); jw[q.id + '_c'] = String(k5); }
      else jw[q.id] = String(isi);
      n++;
    });
    return { jawaban: jw, catatan: catatan, err: err, n: n };
  }

  return { pilihFile: pilihFile, ambil: ambil, tgl: tgl, isianDari: isianDari, templateIsian: templateIsian, templateJadwal: templateJadwal, templateForm: templateForm };
})();
