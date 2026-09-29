/* supervisi-otomatis.js — isi jawaban otomatis (draft) berdasarkan TARGET NILAI: 'BAIK' atau 'SANGAT BAIK'.
   Skala 1–4: BAIK = ±25% butir bernilai 4, sisanya 3 (rata-rata ≈ 3,27 / 82%);
              SANGAT BAIK = ±80% butir bernilai 4, sisanya 3 (rata-rata ≈ 3,80 / 95%).
   Ubah nilai P4 di bawah kalau ingin komposisi lain. */
var SvOto = (function () {
  var P4 = { 'BAIK': 0.25, 'SANGAT BAIK': 0.8 };
  var T = {
    'BAIK': {
      bukti: ['Guru melaksanakan kegiatan sesuai perencanaan dan sebagian besar murid terlibat aktif.', 'Kegiatan berjalan runtut sesuai rencana; murid mengikuti dengan baik.'],
      catatan: ['Sudah baik; dapat ditingkatkan pada variasi kegiatan dan pelibatan seluruh murid.', 'Dipertahankan; perlu penguatan pada umpan balik kepada murid.'],
      komentar: ['Sudah tergambar dengan baik dalam perencanaan.', 'Cukup jelas dan selaras; detailnya dapat diperkaya.'],
      kelebihan: 'Perencanaan runtut; tujuan pembelajaran jelas dan selaras dengan langkah serta asesmen pembelajaran.',
      tingkat: 'Variasi pengalaman belajar dan asesmen awal dapat diperkaya.',
      rekom: 'Revisi ringan pada langkah pembelajaran agar prinsip pembelajaran mendalam tergambar pada setiap pengalaman belajar.',
      pelajaran: 'Perencanaan yang matang membantu pembelajaran berjalan lancar. Faktor pendukung: kesiapan media dan antusiasme murid.',
      belum: 'Pelibatan seluruh murid dan pengelolaan waktu masih perlu ditingkatkan. Faktor penghambat: keterbatasan waktu dan sarana.',
      rtl: 'Memperbaiki perencanaan, memperkaya variasi kegiatan, dan menerapkan asesmen awal secara konsisten.'
    },
    'SANGAT BAIK': {
      bukti: ['Guru melaksanakan kegiatan sangat selaras dengan perencanaan; seluruh murid terlibat aktif dan antusias.', 'Kegiatan berjalan runtut, bermakna, dan menggembirakan; murid aktif berpartisipasi.'],
      catatan: ['Sangat baik dan dapat menjadi contoh praktik baik bagi rekan guru.', 'Pertahankan dan bagikan praktik ini kepada guru lain.'],
      komentar: ['Tergambar sangat jelas, lengkap, dan selaras dalam perencanaan.', 'Memadai dan konsisten pada seluruh langkah pembelajaran.'],
      kelebihan: 'Perencanaan sangat runtut, lengkap, dan selaras; tujuan, langkah, dan asesmen pembelajaran saling menguatkan serta sesuai karakteristik murid.',
      tingkat: 'Pertahankan kualitas perencanaan; dapat dikembangkan lagi melalui pemanfaatan teknologi digital yang lebih variatif.',
      rekom: 'Perencanaan sudah sangat baik; lanjutkan dengan penyempurnaan kecil dan bagikan sebagai praktik baik.',
      pelajaran: 'Perencanaan matang dan kolaborasi yang baik membuat murid terlibat mendalam. Faktor pendukung: kesiapan media, lingkungan belajar kondusif, dan antusiasme murid.',
      belum: 'Hampir seluruh target tercapai; pengelolaan waktu masih dapat dioptimalkan. Faktor penghambat: keterbatasan waktu.',
      rtl: 'Mempertahankan praktik yang sudah baik, mendokumentasikannya, dan membagikannya kepada rekan guru.'
    }
  };
  function pilih(a) { return a[Math.floor(Math.random() * a.length)]; }
  function acak(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function isi(f, target, ctx) {
    if (!T[target]) throw new Error('Target nilai harus dipilih: BAIK atau SANGAT BAIK.');
    ctx = ctx || {};
    var p = T[target], jw = {}, skala = f.pertanyaan.filter(function (q) { return q.tipe === 'skala'; });
    var n4 = Math.round(skala.length * P4[target]);
    var nilai = acak(skala.map(function (_, i) { return i < n4 ? 4 : 3; })), total = 0;
    var ks = 0;
    f.pertanyaan.forEach(function (q) {
      var t = q.teks.toLowerCase();
      if (q.tipe === 'skala') {
        var v = nilai[ks++]; total += v; jw[q.id] = String(v);
        if (q.komentar) jw[q.id + '_k'] = pilih(p.komentar);
      } else if (q.tipe === 'ya_tidak') jw[q.id] = 'Ya';
      else if (q.tipe === 'bukti_catatan') { jw[q.id + '_b'] = pilih(p.bukti); jw[q.id + '_c'] = pilih(p.catatan); }
      else if (q.tipe === 'info') jw[q.id] = (/mata pelajaran/.test(t) && ctx.mapel && ctx.mapel !== '—') ? ctx.mapel : '';
      else if (q.tipe === 'teks') {
        jw[q.id] = /kelebihan/.test(t) ? p.kelebihan : /ditingkatkan/.test(t) ? p.tingkat : /rekomendasi/.test(t) ? p.rekom :
          /pelajaran apa/.test(t) ? p.pelajaran : /belum memuaskan/.test(t) ? p.belum : /tindak lanjut/.test(t) ? p.rtl : pilih(p.catatan);
      }
    });
    var skor = skala.length ? { rata: (total / skala.length).toFixed(2).replace('.', ','), persen: Math.round(total / (skala.length * 4) * 100) } : null;
    return { jawaban: jw, catatan: pilih(p.catatan), skor: skor };
  }
  return { isi: isi };
})();
