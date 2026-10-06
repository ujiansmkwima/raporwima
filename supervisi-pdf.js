/* supervisi-pdf.js — Unduh PDF rapi untuk hasil Pra-Supervisi / Supervisi.
   Isi PDF: kop sekolah (logo + nama + alamat), judul, tabel identitas, tabel isian per bagian,
   rekap skor (bila ada butir skala), catatan/tindak lanjut, dan blok tanda tangan
   Kepala Sekolah (kiri, dari Profil Sekolah) + Supervisor (kanan, dari menu Tanda Tangan).

   Butuh (dimuat sebelum file ini):
     jsPDF 2.5.x           -> window.jspdf.jsPDF
     jspdf-autotable 3.8.x -> doc.autoTable(...)
     supabase-client.js    -> supabaseClient (mengambil profil sekolah & tanda tangan supervisor)

   Jadwal   :  SvPdf.unduhJadwalAman(rows, idn, { jenis, tanggalTtd }, tombol) -> PDF landscape daftar jadwal + tanda tangan Kepala Sekolah.

   Pemakaian:  SvPdf.unduhAman(jadwal, form, identitas, { jawaban, catatan }, tombolOpsional)
     - identitas = objek dari idn(j) di halaman (jenis, guru, spv, unit, mapel, kelas, jenjang, tanggal)
     - opsi.jawaban / opsi.catatan opsional: dipakai kalau ingin mencetak isian yang belum disimpan.
     - opsi.paket opsional: [{ form, jawaban, catatan }] untuk form sepaket (SvForm.isianPaket); semuanya masuk satu PDF. */
var SvPdf = (function () {
  // Predikat dari persentase skor. Ubah angkanya di sini bila sekolah memakai patokan lain.
  var AMBANG = [[86, 'Sangat Baik'], [71, 'Baik'], [56, 'Cukup']];
  var PREDIKAT_TERENDAH = 'Perlu Pembinaan';

  var M = { kiri: 15, kanan: 15, atas: 15, bawah: 20 };
  var LEBAR = 210 - M.kiri - M.kanan; // 180 mm
  var BIRU = [31, 78, 121], BIRU_MUDA = [221, 230, 241], ABU = [242, 242, 242], GARIS = [120, 130, 150];

  // jsPDF (font bawaan) hanya mengenal karakter Latin-1: ganti tanda baca khusus, buang sisanya.
  function bersih(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/[\u2014\u2013\u2212]/g, '-').replace(/[\u2018\u2019\u201A]/g, "'").replace(/[\u201C\u201D\u201E]/g, '"')
      .replace(/\u2026/g, '...').replace(/\u2248/g, '~').replace(/[\u00A0\u2007\u202F]/g, ' ').replace(/\r/g, '')
      .replace(/[^\x09\x0A\x20-\xFF]/g, '');
  }
  function nilai(x) { x = bersih(x).trim(); return x === '' ? '-' : x; }
  function namaFileAman(s) { return String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60); }
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function tglId(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? (parseInt(m[3], 10) + ' ' + BULAN[parseInt(m[2], 10) - 1] + ' ' + m[1]) : '';
  }
  function predikat(persen) {
    for (var i = 0; i < AMBANG.length; i++) if (persen >= AMBANG[i][0]) return AMBANG[i][1];
    return PREDIKAT_TERENDAH;
  }

  function muatLogo() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var s = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve({ d: c.toDataURL('image/png'), w: c.width, h: c.height });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = 'assets/logo.png';
    });
  }

  // Profil sekolah (nama, alamat, kepala sekolah, ttd) + NIP/ttd supervisor. Gagal ambil = PDF tetap jadi, dengan peringatan.
  async function ambilData(j, profilLuar) {
    var out = { profil: profilLuar || null, spv: null, peringatan: [] };
    try {
      if (!out.profil) {
        var p = await supabaseClient.from('profil_sekolah').select('nama_sekolah, alamat_sekolah, kepala_sekolah, nip_kepala_sekolah, kota_ttd, ttd_kepala_sekolah').maybeSingle();
        if (p.error) throw p.error; out.profil = p.data || {};
      }
    } catch (e) { out.profil = out.profil || {}; out.peringatan.push('Profil sekolah tidak bisa dibaca (' + (e.message || e) + ').'); }
    try {
      var t = await supabaseClient.from('supervisi_ttd').select('nip, ttd').eq('guru_id', j.supervisor_id).maybeSingle();
      if (t.error) throw t.error; out.spv = t.data || null;
    } catch (e) { out.peringatan.push('Tanda tangan supervisor tidak bisa dibaca — jalankan migrasi_supervisi_ttd.sql (' + (e.message || e) + ').'); }
    if (!out.peringatan.length) {
      if (!out.profil.ttd_kepala_sekolah) out.peringatan.push('Tanda tangan Kepala Sekolah belum diunggah (menu Profil Sekolah di panel admin) — ruang tanda tangan dikosongkan.');
      if (!out.spv || !out.spv.ttd) out.peringatan.push('Tanda tangan supervisor belum diunggah (menu Tanda Tangan Saya) — ruang tanda tangan dikosongkan.');
    }
    return out;
  }

  function letakGambar(doc, url, cx, y, bw, bh) {
    if (!url) return;
    try {
      var fmt = /^data:image\/jpe?g/i.test(url) ? 'JPEG' : 'PNG', p = doc.getImageProperties(url), r = Math.min(bw / p.width, bh / p.height);
      var w = p.width * r, h = p.height * r;
      doc.addImage(url, fmt, cx - w / 2, y + (bh - h) / 2, w, h);
    } catch (e) { /* gambar rusak: lewati, ruang tetap kosong */ }
  }

  function kop(doc, profil, logo, W) {
    W = W || 210;
    var tengah = W / 2, y = 17;
    if (logo) {
      var r = Math.min(22 / logo.w, 22 / logo.h);
      try { doc.addImage(logo.d, 'PNG', M.kiri, 11, logo.w * r, logo.h * r); } catch (e) { /* tanpa logo */ }
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20, 20, 20);
    doc.text(bersih(profil.nama_sekolah || '').toUpperCase(), tengah, y, { align: 'center' });
    var alamat = bersih(profil.alamat_sekolah || '');
    if (alamat) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(doc.splitTextToSize(alamat, W - 70).slice(0, 2), tengah, y + 6, { align: 'center' });
    }
    doc.setDrawColor(20, 20, 20); doc.setLineWidth(0.8); doc.line(M.kiri, 35, W - M.kanan, 35);
    doc.setLineWidth(0.2); doc.line(M.kiri, 36.2, W - M.kanan, 36.2);
    return 36.2;
  }

  function judul(doc, y, jenisLabel, judulForm) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(20, 20, 20);
    doc.text('LAPORAN HASIL ' + bersih(jenisLabel).toUpperCase(), 105, y + 8, { align: 'center' });
    doc.setFontSize(9.5); doc.setTextColor(60, 60, 60);
    var baris = doc.splitTextToSize(bersih(judulForm), 165);
    doc.text(baris, 105, y + 14, { align: 'center' });
    return y + 14 + baris.length * 4.2;
  }

  function tabelIdentitas(doc, y, id) {
    var lab = function (t) { return { content: t, styles: { fontStyle: 'bold', fillColor: ABU } }; };
    doc.autoTable({
      startY: y, margin: { left: M.kiri, right: M.kanan }, theme: 'grid',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.6, lineColor: GARIS, lineWidth: 0.2, textColor: [30, 30, 30], valign: 'middle' },
      columnStyles: { 0: { cellWidth: 32 }, 1: { cellWidth: 58 }, 2: { cellWidth: 32 }, 3: { cellWidth: 58 } },
      body: [
        [lab('Nama Guru'), nilai(id.guru), lab('Mata Pelajaran'), nilai(id.mapel)],
        [lab('Supervisor'), nilai(id.spv), lab('Kelas'), nilai(id.kelas)],
        [lab('Unit Kerja'), nilai(id.unit), lab('Jenjang'), nilai(id.jenjang)],
        [lab('Tanggal'), nilai(id.tanggal), lab('Jenis'), nilai(id.jenis)]
      ]
    });
    return doc.lastAutoTable.finalY;
  }

  function turunan(label, id) {
    label = String(label || '').toLowerCase();
    var v = /jenjang/.test(label) ? id.jenjang : /mata pelajaran/.test(label) ? id.mapel : /kelas/.test(label) ? id.kelas : '';
    return (v && v !== '—') ? v : '';
  }
  function labelSkala(q, v) {
    var i = parseInt(v, 10), opsi = q.opsi || ['1', '2', '3', '4'], maks = q.tipe === 'pilihan' ? opsi.length : 4;
    return (i >= 1 && i <= maks) ? bersih(opsi[i - 1] || String(i)) : '-';
  }

  // Menyusun baris tabel isian dari daftar pertanyaan form + jawaban.
  function susunBaris(f, jw, id) {
    if (window.SvForm) f = SvForm.aktif(f, jw);
    var body = [], n = 0, skala = 0, bukti = 0, pil = 0;
    f.pertanyaan.forEach(function (q) { if (q.tipe === 'skala') skala++; if (q.tipe === 'bukti_catatan') bukti++; if (q.tipe === 'pilihan') pil++; });
    var H3 = skala && bukti ? 'Penilaian / Bukti Pembelajaran' : (bukti ? 'Bukti Pembelajaran' : 'Penilaian / Isian');
    var H4 = skala && bukti ? 'Komentar Kritis / Catatan' : (bukti || (pil && !skala) ? 'Catatan' : 'Komentar Kritis');
    var W = bukti && !skala ? [10, 64, 53, 53] : (bukti ? [10, 70, 45, 55] : [10, 80, 34, 56]);
    function g(k) { return (jw[k] === undefined || jw[k] === null) ? '' : jw[k]; }

    f.pertanyaan.forEach(function (q) {
      var t = q.tipe, tanya = bersih(q.teks);
      if (t === 'bagian') {
        body.push([{ content: tanya, colSpan: 4, styles: { halign: 'left', fillColor: BIRU_MUDA, fontStyle: 'bold', textColor: BIRU, fontSize: 9 } }]);
        if (q.keterangan) body.push([{ content: bersih(q.keterangan), colSpan: 4, styles: { halign: 'left', fontStyle: 'italic', fontSize: 8, textColor: [80, 80, 80] } }]);
        return;
      }
      if (t === 'info') {
        var v = turunan(q.teks, id) || g(q.id);
        body.push([{ content: tanya, colSpan: 2, styles: { halign: 'left', fontStyle: 'bold', fillColor: ABU } }, { content: nilai(v), colSpan: 2, styles: { halign: 'left' } }]);
        return;
      }
      var no = String(++n);
      if (t === 'skala' || t === 'pilihan') {
        body.push([no, tanya, { content: labelSkala(q, g(q.id)), styles: { halign: 'center', fontStyle: 'bold' } }, q.komentar ? nilai(g(q.id + '_k')) : '']);
      } else if (t === 'ya_tidak') {
        body.push([no, tanya, { content: nilai(g(q.id)), styles: { halign: 'center', fontStyle: 'bold' } }, '']);
      } else if (t === 'bukti_catatan') {
        body.push([no, tanya, nilai(g(q.id + '_b')), nilai(g(q.id + '_c'))]);
      } else { // teks: pertanyaan di satu baris, jawaban di baris di bawahnya
        body.push([{ content: no, styles: { halign: 'center', fontStyle: 'bold', fillColor: ABU } }, { content: tanya, colSpan: 3, styles: { fontStyle: 'bold', fillColor: ABU } }]);
        body.push([{ content: nilai(g(q.id)), colSpan: 4, styles: { halign: 'left' } }]);
      }
    });
    return { body: body, head: ['No', 'Pertanyaan / Indikator', H3, H4], lebar: W };
  }

  function rekapSkor(f, jw) {
    if (window.SvForm) f = SvForm.aktif(f, jw);
    var skala = f.pertanyaan.filter(function (q) { return q.tipe === 'skala'; }), tot = 0, isi = 0;
    skala.forEach(function (q) { var v = parseInt(jw[q.id], 10); if (v >= 1 && v <= 4) { tot += v; isi++; } });
    if (!skala.length || !isi) return null;
    var persen = Math.round(tot / (isi * 4) * 100);
    return { tot: tot, maks: isi * 4, rata: (tot / isi).toFixed(2).replace('.', ','), persen: persen, pred: predikat(persen), kosong: skala.length - isi };
  }

  function blokTtd(doc, y, o) {
    var perlu = 50;
    if (y + perlu > 297 - M.bawah) { doc.addPage(); y = M.atas; }
    var kiriC = M.kiri + LEBAR * 0.25, kananC = M.kiri + LEBAR * 0.75;
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text('Mengetahui,', kiriC, y, { align: 'center' });
    doc.text('Kepala Sekolah', kiriC, y + 5, { align: 'center' });
    doc.text(bersih(o.kota) + ', ' + bersih(o.tanggal), kananC, y, { align: 'center' });
    doc.text('Supervisor', kananC, y + 5, { align: 'center' });
    letakGambar(doc, o.ttdKepsek, kiriC, y + 8, 46, 22);
    letakGambar(doc, o.ttdSpv, kananC, y + 8, 46, 22);
    function nama(teks, cx, nip) {
      var t = bersih(teks) || '(................................)', ukuran = 10;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(ukuran);
      while (doc.getTextWidth(t) > LEBAR / 2 - 4 && ukuran > 7) { ukuran -= 0.5; doc.setFontSize(ukuran); }
      doc.text(t, cx, y + 34, { align: 'center' });
      var w = doc.getTextWidth(t); doc.setLineWidth(0.25); doc.setDrawColor(20, 20, 20); doc.line(cx - w / 2, y + 35, cx + w / 2, y + 35);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text('NIP. ' + (bersih(nip) || '-'), cx, y + 40, { align: 'center' });
    }
    nama(o.namaKepsek, kiriC, o.nipKepsek);
    nama(o.namaSpv, kananC, o.nipSpv);
    return y + perlu;
  }

  function footer(doc, teks) {
    var n = doc.getNumberOfPages(), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    for (var i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 120, 120);
      doc.setDrawColor(190, 190, 190); doc.setLineWidth(0.2); doc.line(M.kiri, H - 12, W - M.kanan, H - 12);
      doc.text(bersih(teks), M.kiri, H - 8);
      doc.text('Halaman ' + i + ' dari ' + n, W - M.kanan, H - 8, { align: 'right' });
    }
  }

  // Tanggal dokumen Pra-Supervisi (bila dipaketkan di bawah jadwal Supervisi) = 1 hari sebelum hari supervisi;
  // jika jatuh pada hari Minggu, dimajukan ke hari Sabtu (2 hari sebelum). Keluaran 'YYYY-MM-DD'.
  function tanggalPra(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return iso;
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    d.setDate(d.getDate() - 1);
    if (d.getDay() === 0) d.setDate(d.getDate() - 1);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  async function unduh(j, f, id, opsi) {
    opsi = opsi || {};
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Pustaka PDF (jsPDF) belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
    var jw = opsi.jawaban !== undefined ? (opsi.jawaban || {}) : (j.jawaban || {});
    var catatan = opsi.catatan !== undefined ? opsi.catatan : (j.catatan || '');
    var data = await ambilData(j, opsi.profil), profil = data.profil, spv = data.spv || {};
    var logo = await muatLogo();
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    if (typeof doc.autoTable !== 'function') throw new Error('Pustaka tabel PDF (jspdf-autotable) belum termuat.');
    var jenisLabel = id.jenis || (j.jenis === 'pra' ? 'Pra-Supervisi Akademik' : 'Supervisi');

    doc.setProperties({ title: bersih(jenisLabel) + ' - ' + bersih(id.guru), author: bersih(id.spv), subject: bersih(f.judul) });
    // Paket form: tiap form dicetak di halaman baru (kop, identitas, isian, rekap, catatan, tanda tangan), semuanya dalam satu file PDF.
    var daftar = opsi.paket && opsi.paket.length ? opsi.paket : [{ form: f, jawaban: jw, catatan: catatan }];
    daftar.forEach(function (it, k) {
      var f = it.form, jw = it.jawaban || {}, catatan = it.catatan;
      // Form Pra-Supervisi di dalam paket jadwal Supervisi: tanggal dokumennya H-1 (Minggu -> Sabtu)
      var praPaket = f.jenis === 'pra' && j.jenis === 'supervisi';
      var tglDok = praPaket ? tanggalPra(j.tanggal) : j.tanggal;
      var idf = praPaket ? Object.assign({}, id, { tanggal: tglId(tglDok), jenis: 'Pra-Supervisi Akademik' }) : id;
      if (k > 0) doc.addPage();
      var y = kop(doc, profil, logo);
      y = judul(doc, y, praPaket ? 'Pra-Supervisi Akademik' : jenisLabel, f.judul);
      y = tabelIdentitas(doc, y + 3, idf) + 5;

      var t = susunBaris(f, jw, idf);
      doc.autoTable({
        startY: y, margin: { left: M.kiri, right: M.kanan, top: M.atas, bottom: M.bawah }, theme: 'grid',
        head: [t.head], body: t.body, rowPageBreak: 'avoid', showHead: 'everyPage',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 }, lineColor: GARIS, lineWidth: 0.2, textColor: [30, 30, 30], valign: 'top', overflow: 'linebreak' },
        headStyles: { fillColor: BIRU, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        columnStyles: { 0: { cellWidth: t.lebar[0], halign: 'center' }, 1: { cellWidth: t.lebar[1] }, 2: { cellWidth: t.lebar[2] }, 3: { cellWidth: t.lebar[3] } }
      });
      y = doc.lastAutoTable.finalY + 5;

      var sk = rekapSkor(f, jw);
      if (sk) {
        var sel = function (x) { return { content: x, styles: { halign: 'center', fontStyle: 'bold', fillColor: [238, 243, 250] } }; };
        doc.autoTable({
          startY: y, margin: { left: M.kiri, right: M.kanan, bottom: M.bawah }, theme: 'grid', rowPageBreak: 'avoid',
          styles: { font: 'helvetica', fontSize: 9, cellPadding: 2, lineColor: GARIS, lineWidth: 0.2, textColor: [30, 30, 30] },
          columnStyles: { 0: { cellWidth: 45 }, 1: { cellWidth: 45 }, 2: { cellWidth: 45 }, 3: { cellWidth: 45 } },
          body: [[sel('Jumlah Skor: ' + sk.tot + ' / ' + sk.maks), sel('Rata-rata: ' + sk.rata), sel('Persentase: ' + sk.persen + '%'), sel('Predikat: ' + sk.pred)]]
        });
        y = doc.lastAutoTable.finalY;
        if (sk.kosong) {
          doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(100, 100, 100);
          doc.text('Catatan: ' + sk.kosong + ' butir skala belum diisi dan tidak dihitung.', M.kiri, y + 4);
          y += 4;
        }
        y += 5;
      }

      doc.autoTable({
        startY: y, margin: { left: M.kiri, right: M.kanan, top: M.atas, bottom: M.bawah }, theme: 'grid', rowPageBreak: 'avoid',
        head: [['Catatan / Tindak Lanjut']], body: [[nilai(catatan)]],
        styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2, lineColor: GARIS, lineWidth: 0.2, textColor: [30, 30, 30], valign: 'top', overflow: 'linebreak' },
        headStyles: { fillColor: BIRU, textColor: 255, fontStyle: 'bold', halign: 'left' },
        columnStyles: { 0: { cellWidth: LEBAR } }
      });
      y = doc.lastAutoTable.finalY + 10;

      blokTtd(doc, y, {
        kota: profil.kota_ttd || 'Tambak', tanggal: tglId(tglDok) || idf.tanggal || '',
        namaKepsek: profil.kepala_sekolah, nipKepsek: profil.nip_kepala_sekolah, ttdKepsek: profil.ttd_kepala_sekolah,
        namaSpv: id.spv && id.spv !== '—' ? id.spv : '', nipSpv: spv.nip, ttdSpv: spv.ttd
      });
    });
    footer(doc, bersih(jenisLabel) + ' - ' + bersih(id.guru));

    doc.save('Hasil_' + namaFileAman(jenisLabel) + '_' + namaFileAman(id.guru) + '_' + namaFileAman(j.tanggal) + '.pdf');
    return data.peringatan;
  }

  // Pembungkus untuk tombol: nonaktifkan tombol saat proses, tampilkan pesan bila gagal / ada peringatan.
  async function unduhAman(j, f, id, opsi, tombol) {
    if (!f) { alert('Form untuk jadwal ini tidak tersedia, PDF tidak bisa dibuat.'); return; }
    var teks = tombol ? tombol.textContent : '';
    if (tombol) { tombol.disabled = true; tombol.textContent = 'Membuat PDF...'; }
    try {
      var peringatan = await unduh(j, f, id, opsi);
      if (peringatan && peringatan.length) alert('PDF berhasil dibuat.\n\nCatatan:\n- ' + peringatan.join('\n- '));
    } catch (e) { alert('Gagal membuat PDF: ' + (e.message || e)); }
    finally { if (tombol) { tombol.disabled = false; tombol.textContent = teks; } }
  }


  // ================= PDF JADWAL SUPERVISI =================
  var HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  function hariId(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    return m ? HARI[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : '';
  }
  function hariIni() { var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }

  // Satu tanda tangan: Kepala Sekolah di sisi kanan (landscape).
  function blokTtdKepsek(doc, y, o) {
    var W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), perlu = 48;
    if (y + perlu > H - M.bawah) { doc.addPage(); y = M.atas + 4; }
    var cx = W - M.kanan - 48;
    doc.setTextColor(20, 20, 20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
    doc.text(bersih(o.kota) + ', ' + bersih(o.tanggal), cx, y, { align: 'center' });
    doc.text('Kepala Sekolah', cx, y + 5, { align: 'center' });
    letakGambar(doc, o.ttd, cx, y + 8, 46, 22);
    var t = bersih(o.nama) || '(................................)', ukuran = 10;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(ukuran);
    while (doc.getTextWidth(t) > 86 && ukuran > 7) { ukuran -= 0.5; doc.setFontSize(ukuran); }
    doc.text(t, cx, y + 34, { align: 'center' });
    var w = doc.getTextWidth(t); doc.setLineWidth(0.25); doc.setDrawColor(20, 20, 20); doc.line(cx - w / 2, y + 35, cx + w / 2, y + 35);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text('NIP. ' + (bersih(o.nip) || '-'), cx, y + 40, { align: 'center' });
  }

  // rows: baris supervisi_jadwal (sudah difilter) | idnFn(j): identitas dari halaman (guru, spv, mapel, kelas, jenis)
  // opsi: { jenis: 'pra'|'supervisi'|'' , tanggalTtd: 'YYYY-MM-DD', profil }
  async function unduhJadwal(rows, idnFn, opsi) {
    opsi = opsi || {};
    if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('Pustaka PDF (jsPDF) belum termuat. Periksa koneksi internet lalu muat ulang halaman.');
    if (!rows || !rows.length) throw new Error('Tidak ada jadwal pada pilihan tersebut.');
    var peringatan = [], profil = opsi.profil || null;
    if (!profil) {
      try {
        var p = await supabaseClient.from('profil_sekolah').select('nama_sekolah, alamat_sekolah, kepala_sekolah, nip_kepala_sekolah, kota_ttd, ttd_kepala_sekolah').maybeSingle();
        if (p.error) throw p.error; profil = p.data || {};
      } catch (e) { profil = {}; peringatan.push('Profil sekolah tidak bisa dibaca (' + (e.message || e) + ').'); }
    }
    if (!peringatan.length && !profil.ttd_kepala_sekolah) peringatan.push('Tanda tangan Kepala Sekolah belum diunggah (Admin > Profil Sekolah) - ruang tanda tangan dikosongkan.');

    var urut = rows.slice().sort(function (a, b) { return String(a.tanggal).localeCompare(String(b.tanggal)); });
    var logo = await muatLogo();
    var doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape', compress: true });
    if (typeof doc.autoTable !== 'function') throw new Error('Pustaka tabel PDF (jspdf-autotable) belum termuat.');
    var W = 297, LEBAR_L = W - M.kiri - M.kanan; // 267 mm

    var jenisLabel = opsi.jenis === 'pra' ? 'PRA-SUPERVISI AKADEMIK' : (opsi.jenis === 'supervisi' ? 'SUPERVISI' : 'PRA-SUPERVISI AKADEMIK DAN SUPERVISI');
    var tMin = urut[0].tanggal, tMax = urut[urut.length - 1].tanggal;
    var periode = tMin === tMax ? tglId(tMin) : (tglId(tMin) + ' s.d. ' + tglId(tMax));

    doc.setProperties({ title: 'Jadwal ' + jenisLabel, author: bersih(profil.nama_sekolah || ''), subject: 'Jadwal ' + jenisLabel });
    var y = kop(doc, profil, logo, W);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 20, 20);
    doc.text('JADWAL ' + jenisLabel, W / 2, y + 9, { align: 'center' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60);
    doc.text('Periode: ' + periode, W / 2, y + 15, { align: 'center' });
    y = y + 20;

    var body = urut.map(function (j, i) {
      var id = idnFn(j);
      return [String(i + 1), hariId(j.tanggal), tglId(j.tanggal), nilai(id.guru), nilai(id.mapel), nilai(id.kelas), nilai(id.jenis), nilai(id.spv)];
    });
    doc.autoTable({
      startY: y, margin: { left: M.kiri, right: M.kanan, top: M.atas, bottom: M.bawah }, theme: 'grid',
      head: [['No', 'Hari', 'Tanggal', 'Nama Guru yang Disupervisi', 'Mata Pelajaran', 'Kelas', 'Jenis', 'Supervisor']],
      body: body, rowPageBreak: 'avoid', showHead: 'everyPage',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 }, lineColor: GARIS, lineWidth: 0.2, textColor: [30, 30, 30], valign: 'middle', overflow: 'linebreak' },
      headStyles: { fillColor: BIRU, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
      alternateRowStyles: { fillColor: [246, 248, 252] },
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 22, halign: 'center' }, 2: { cellWidth: 34, halign: 'center' }, 3: { cellWidth: 62 }, 4: { cellWidth: 45 }, 5: { cellWidth: 26, halign: 'center' }, 6: { cellWidth: 34 }, 7: { cellWidth: 34 } }
    });
    y = doc.lastAutoTable.finalY + 10;

    blokTtdKepsek(doc, y, {
      kota: profil.kota_ttd || 'Tambak', tanggal: tglId(opsi.tanggalTtd || hariIni()),
      nama: profil.kepala_sekolah, nip: profil.nip_kepala_sekolah, ttd: profil.ttd_kepala_sekolah
    });
    footer(doc, 'Jadwal ' + jenisLabel.charAt(0) + jenisLabel.slice(1).toLowerCase() + ' - ' + bersih(profil.nama_sekolah || ''));
    doc.save('Jadwal_' + namaFileAman(jenisLabel) + '_' + namaFileAman(tMin) + (tMin === tMax ? '' : '_sd_' + namaFileAman(tMax)) + '.pdf');
    return peringatan;
  }

  async function unduhJadwalAman(rows, idnFn, opsi, tombol) {
    var teks = tombol ? tombol.textContent : '';
    if (tombol) { tombol.disabled = true; tombol.textContent = 'Membuat PDF...'; }
    try {
      var peringatan = await unduhJadwal(rows, idnFn, opsi);
      if (peringatan && peringatan.length) alert('PDF berhasil dibuat.\n\nCatatan:\n- ' + peringatan.join('\n- '));
    } catch (e) { alert('Gagal membuat PDF: ' + (e.message || e)); }
    finally { if (tombol) { tombol.disabled = false; tombol.textContent = teks; } }
  }

  return { unduh: unduh, unduhAman: unduhAman, unduhJadwal: unduhJadwal, unduhJadwalAman: unduhJadwalAman };
})();
