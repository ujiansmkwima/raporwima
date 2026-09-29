/* supervisi-form.js — dipakai bersama oleh supervisi.html (isi form) dan supervisi-admin.html (lihat hasil).
   Tipe pertanyaan: bagian (judul), info (isian singkat, tanpa nomor), skala (1-4, opsional kolom komentar),
   ya_tidak, teks, bukti_catatan (dua kolom: Bukti Pembelajaran + Catatan). */
var SvForm = (function () {
  function esc(s) { return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ta(id, label, v) { return '<label class="sv-lbl">' + esc(label) + '</label><textarea data-a="' + id + '" rows="2" style="width:100%;">' + esc(v) + '</textarea>'; }
  function opsiSkala(q) { return q.opsi || ['1', '2', '3', '4']; }

  // Blok identitas (diambil dari data admin: jadwal, penugasan guru, profil sekolah)
  function identitas(d) {
    var r = [['Jenis', d.jenis], ['Nama Guru', d.guru], ['Pemberi Umpan Balik (Supervisor)', d.spv], ['Unit Kerja', d.unit], ['Mata Pelajaran', d.mapel], ['Kelas', d.kelas], ['Jenjang', d.jenjang], ['Tanggal Pelaksanaan', d.tanggal]];
    return '<div class="sv-ident">' + r.map(function (x) { return '<div class="sv-ident__k">' + esc(x[0]) + '</div><div class="sv-ident__v">' + esc(x[1] && x[1] !== '—' ? x[1] : '—') + '</div>'; }).join('') + '</div>';
  }
  // Isian data perencanaan (Jenjang / Mata Pelajaran / Kelas) otomatis dari data admin
  function turunan(label, d) {
    if (!d) return '';
    label = label.toLowerCase();
    var v = /jenjang/.test(label) ? d.jenjang : /mata pelajaran/.test(label) ? d.mapel : /kelas/.test(label) ? d.kelas : '';
    return (v && v !== '—') ? v : '';
  }
  function render(f, jw, d) {
    jw = jw || {}; var n = 0;
    function v(k) { return jw[k] === undefined ? '' : String(jw[k]); }
    return f.pertanyaan.map(function (q) {
      if (q.tipe === 'bagian') return '<div class="sv-bagian"><div class="sv-bagian__t">' + esc(q.teks) + '</div>' + (q.keterangan ? '<div class="sv-bagian__k">' + esc(q.keterangan) + '</div>' : '') + '</div>';
      var judul = q.tipe === 'info' ? q.teks : (++n) + '. ' + q.teks, b;
      if (q.tipe === 'skala') {
        b = '<select data-a="' + q.id + '"><option value="">— pilih skala —</option>' + opsiSkala(q).map(function (l, i) { return '<option value="' + (i + 1) + '"' + (v(q.id) === String(i + 1) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select>';
        if (q.komentar) b += ta(q.id + '_k', q.komentar, v(q.id + '_k'));
      } else if (q.tipe === 'ya_tidak') {
        b = '<select data-a="' + q.id + '"><option value="">—</option>' + ['Ya', 'Tidak'].map(function (x) { return '<option' + (v(q.id) === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select>';
      } else if (q.tipe === 'bukti_catatan') {
        b = ta(q.id + '_b', 'Bukti Pembelajaran', v(q.id + '_b')) + ta(q.id + '_c', 'Catatan', v(q.id + '_c'));
      } else if (q.tipe === 'info') {
        var tu = turunan(q.teks, d);
        b = '<input data-a="' + q.id + '" style="width:100%;" value="' + esc(tu || v(q.id)) + '"' + (tu ? ' readonly' : '') + '>';
      } else b = '<textarea data-a="' + q.id + '" rows="3" style="width:100%;">' + esc(v(q.id)) + '</textarea>';
      return '<div class="sv-q"><div class="sv-q__t">' + esc(judul) + '</div>' + b + '</div>';
    }).join('');
  }

  function baca(root) {
    var j = {};
    root.querySelectorAll('[data-a]').forEach(function (el) { j[el.dataset.a] = el.value; });
    return j;
  }

  function hasil(f, jw) {
    jw = jw || {}; var n = 0;
    function t(k) { return (jw[k] === undefined || jw[k] === '') ? '—' : esc(jw[k]); }
    return f.pertanyaan.map(function (q) {
      if (q.tipe === 'bagian') return '<div class="sv-bagian"><div class="sv-bagian__t">' + esc(q.teks) + '</div></div>';
      var judul = q.tipe === 'info' ? q.teks : (++n) + '. ' + q.teks, b;
      if (q.tipe === 'skala') { var i = parseInt(jw[q.id], 10); b = i ? esc(opsiSkala(q)[i - 1]) : '—'; if (q.komentar) b += '<div class="sv-lbl">' + esc(q.komentar) + '</div>' + t(q.id + '_k'); }
      else if (q.tipe === 'bukti_catatan') b = '<div class="sv-lbl">Bukti Pembelajaran</div>' + t(q.id + '_b') + '<div class="sv-lbl">Catatan</div>' + t(q.id + '_c');
      else b = t(q.id);
      return '<div class="sv-q"><div class="sv-q__t">' + esc(judul) + '</div><div style="white-space:pre-wrap;">' + b + '</div></div>';
    }).join('');
  }
  return { render: render, baca: baca, hasil: hasil, identitas: identitas };
})();
