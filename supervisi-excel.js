/* supervisi-excel.js — unduh template & import Excel untuk modul Supervisi (butuh SheetJS/XLSX). */
var SvXlsx = (function () {
  function unduh(nama, sheets) {
    var wb = XLSX.utils.book_new();
    sheets.forEach(function (s) {
      var ws = XLSX.utils.aoa_to_sheet(s.rows);
      ws['!cols'] = (s.rows[0] || []).map(function (_, i) {
        var m = 10; s.rows.forEach(function (r) { var l = String(r[i] == null ? '' : r[i]).length; if (l > m) m = l; });
        return { wch: Math.min(m + 2, 60) };
      });
      XLSX.utils.book_append_sheet(wb, ws, s.nama);
    });
    XLSX.writeFile(wb, nama + '.xlsx');
  }
  function pilihFile(cb) {
    var i = document.createElement('input'); i.type = 'file'; i.accept = '.xlsx,.xls,.csv';
    i.onchange = function () {
      if (!i.files[0]) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var wb = XLSX.read(r.result, { type: 'array', cellDates: true });
          cb(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true }));
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

  // ----- Isian form (dipakai supervisor) -----
  var H_ISIAN = ['Kode', 'Pertanyaan', 'Isian (skala 1-4 / Ya-Tidak / teks)', 'Komentar Kritis / Bukti Pembelajaran', 'Catatan'];
  function isianRows(f, jw, catatan) {
    jw = jw || {};
    var rows = [H_ISIAN];
    f.pertanyaan.forEach(function (q) {
      if (q.tipe === 'bagian') return;
      var g = function (k) { return jw[k] === undefined ? '' : jw[k]; };
      if (q.tipe === 'bukti_catatan') rows.push([q.id, q.teks, '', g(q.id + '_b'), g(q.id + '_c')]);
      else rows.push([q.id, q.teks, g(q.id), q.komentar ? g(q.id + '_k') : '', '']);
    });
    rows.push(['catatan', 'Catatan / Tindak Lanjut', catatan || '', '', '']);
    return rows;
  }
  function isianDari(f, rows) {
    var jw = {}, err = [], n = 0, catatan = null;
    rows.forEach(function (r, i) {
      var kode = String(ambil(r, 'Kode')), isi = ambil(r, 'Isian'), k4 = ambil(r, 'Komentar'), k5 = ambil(r, 'Catatan');
      if (!kode) return;
      if (kode === 'catatan') { catatan = String(isi); n++; return; }
      var q = f.pertanyaan.filter(function (x) { return x.id === kode && x.tipe !== 'bagian'; })[0];
      if (!q) { err.push('Baris ' + (i + 2) + ': kode "' + kode + '" tidak ada di form ini'); return; }
      if (q.tipe === 'skala') {
        var v = parseInt(isi, 10);
        if (isi !== '' && !(v >= 1 && v <= 4)) { err.push('Baris ' + (i + 2) + ': skala harus 1–4'); return; }
        jw[q.id] = isi === '' ? '' : String(v);
        if (q.komentar) jw[q.id + '_k'] = String(k4);
      } else if (q.tipe === 'ya_tidak') {
        var t = String(isi).toLowerCase();
        if (t !== '' && t !== 'ya' && t !== 'tidak') { err.push('Baris ' + (i + 2) + ': isi Ya atau Tidak'); return; }
        jw[q.id] = t === 'ya' ? 'Ya' : (t === 'tidak' ? 'Tidak' : '');
      } else if (q.tipe === 'bukti_catatan') { jw[q.id + '_b'] = String(k4); jw[q.id + '_c'] = String(k5); }
      else jw[q.id] = String(isi);
      n++;
    });
    return { jawaban: jw, catatan: catatan, err: err, n: n };
  }
  return { unduh: unduh, pilihFile: pilihFile, ambil: ambil, tgl: tgl, isianRows: isianRows, isianDari: isianDari };
})();
