/* ============================================================
   pdf-cetak.js — Unduh PDF untuk Cetak Rapor / Identitas / PKL
   ============================================================
   Membuat file PDF A4 langsung di browser (html2canvas + jsPDF),
   dengan pengaturan yang meniru hasil cetak (@media print):

   - Kertas A4 portrait, margin Narrow 12.7mm di ke-4 sisi
     (harus sama dengan @page di style.css).
   - Identitas Siswa (thead) diulang di atas tiap halaman rapor.
   - .rapor-cetak__page2 (Kokurikuler s.d. tanda tangan) mulai di
     halaman baru bila bagian Nilai muat 1 halaman; kalau Nilai
     meluber, page2 menyambung langsung (sama seperti aturan cetak).
   - Baris tabel tidak terpotong di tengah (pemotongan halaman
     selalu di batas baris/blok).
   - Tiap siswa mulai di halaman baru, nomor halaman mulai dari 1
     lagi per siswa.
   - Watermark logo di tengah tiap halaman (opacity 12%).

   Nomor halaman digambar langsung oleh jsPDF di dasar area konten,
   BUKAN lewat position: absolute di HTML — jadi tidak bisa lagi
   "lompat" ke halaman berikutnya.

   Pemakaian:  await unduhPdfCetak([htmlKartu1, htmlKartu2, ...], 'Nama File');
   (tiap htmlKartu = string HTML 1 kartu ".rapor-cetak" dari
   buatKartuRapor / buatKartuIdentitas / buatFormatPkl)
   ============================================================ */
(function () {
  var HALAMAN_W = 210;      // mm, A4
  var HALAMAN_H = 297;      // mm, A4
  var MARGIN = 12.7;        // mm, Narrow — samakan dengan @page di style.css
  var LEBAR_KONTEN = HALAMAN_W - 2 * MARGIN;   // 184.6mm
  var TINGGI_KONTEN = HALAMAN_H - 2 * MARGIN;  // 271.6mm
  var RESERVASI_NOMOR = 7;  // mm di dasar konten yang dikosongkan untuk nomor halaman
  var GAP_HEADER = 3;       // mm antara Identitas (header berulang) dan isi
  var SKALA = 2.5;          // resolusi render (2.5x ≈ 240 dpi)
  var KUALITAS_JPEG = 0.95;
  var WATERMARK_MM = 90;    // 340px di CSS ≈ 90mm
  var WATERMARK_OPACITY = 0.12;

  function tunggu(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function bersihkanNamaFile(nama) {
    return String(nama || 'dokumen').replace(/[\\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim() || 'dokumen';
  }

  // Muat logo sebagai data URL untuk watermark. Gagal muat = tanpa watermark
  // (PDF tetap jadi).
  function muatLogo() {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = img.naturalWidth;
          c.height = img.naturalHeight;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ dataUrl: c.toDataURL('image/png'), w: img.naturalWidth, h: img.naturalHeight });
        } catch (e) { resolve(null); }
      };
      img.onerror = function () { resolve(null); };
      img.src = 'assets/logo.png';
    });
  }

  // Iframe tersembunyi (di luar layar) sebagai "kertas" render: dokumen
  // terpisah tanpa scroll & tanpa CSS aplikasi (sidebar dsb), tapi memakai
  // stylesheet yang sama supaya tampilan kartu identik dengan preview.
  async function buatIframeRender() {
    var iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:1400px;border:0;';
    document.body.appendChild(iframe);

    var d = iframe.contentDocument;
    d.open();
    d.write('<!doctype html><html><head><meta charset="utf-8"><base href="' + document.baseURI + '"></head><body></body></html>');
    d.close();

    var menunggu = [];
    Array.prototype.forEach.call(document.querySelectorAll('link[rel="stylesheet"], style'), function (node) {
      var salinan = node.cloneNode(true);
      if (salinan.tagName === 'LINK') {
        menunggu.push(new Promise(function (res) {
          salinan.onload = res;
          salinan.onerror = res;
          setTimeout(res, 6000);
        }));
      }
      d.head.appendChild(salinan);
    });

    // Aturan khusus mode PDF: kartu tanpa bingkai/padding layar (sama seperti
    // @media print), lebar persis area konten A4, watermark & nomor halaman
    // HTML dimatikan (keduanya digambar oleh jsPDF).
    var st = d.createElement('style');
    st.textContent =
      'html,body{margin:0;padding:0;background:#fff;}' +
      '#pdfRoot{width:' + LEBAR_KONTEN + 'mm;background:#fff;}' +
      '#pdfRoot .rapor-cetak{border:none!important;padding:0!important;margin:0!important;border-radius:0!important;box-sizing:border-box;width:100%;}' +
      '#pdfRoot .rapor-cetak::before{display:none!important;}' +
      '#pdfRoot .rapor-cetak__page-no{display:none!important;}' +
      '#pdfRoot .rapor-cetak__page1 + .rapor-cetak__page2{margin-top:0!important;padding-top:0!important;border-top:none!important;}';
    d.head.appendChild(st);

    await Promise.all(menunggu);
    try { if (d.fonts && d.fonts.ready) await d.fonts.ready; } catch (e) { /* abaikan */ }
    return iframe;
  }

  // Titik-titik (dalam px, relatif ke atas bodyEl) yang boleh dijadikan
  // batas halaman: sebelum baris tabel (bukan baris pertama, supaya judul
  // kolom tidak terpisah dari isinya), sebelum judul bar, sebelum kotak
  // Catatan/tanda tangan. Bar/judul tidak boleh terpisah dari isi
  // pertamanya, jadi elemen persis setelah bar tidak dijadikan kandidat.
  function kumpulkanTitikPotong(bodyEl) {
    var top0 = bodyEl.getBoundingClientRect().top;
    var hasil = [];
    var daftar = bodyEl.querySelectorAll('tr, .rapor-cetak__bar, .rapor-cetak__box, .rapor-cetak__footer, .rapor-cetak__page2');
    Array.prototype.forEach.call(daftar, function (el) {
      var prev = el.previousElementSibling;
      var adalahBar = el.classList.contains('rapor-cetak__bar');
      var adalahBlokAwal = el.classList.contains('rapor-cetak__page2');
      if (!adalahBar && !adalahBlokAwal) {
        if (!prev) return; // baris/elemen pertama: jangan dipisah dari induknya
        if (prev.classList && prev.classList.contains('rapor-cetak__bar')) return;
      }
      hasil.push(el.getBoundingClientRect().top - top0);
    });
    hasil.sort(function (a, b) { return a - b; });
    return hasil;
  }

  // Tentukan posisi awal tiap halaman (px, relatif ke atas bodyEl).
  function hitungAwalHalaman(totalPx, kapasitasPx, titik, page2Top) {
    var awal = [0];
    var start = 0;
    var guard = 0;
    while (guard++ < 200) {
      var batas = start + kapasitasPx;

      // Aturan cetak: kalau bagian Nilai (page1) muat 1 halaman, page2
      // selalu mulai di halaman berikutnya. Kalau meluber, page2 mengalir
      // langsung menyambung.
      if (start === 0 && page2Top !== null && page2Top > 1 && page2Top <= kapasitasPx + 1) {
        awal.push(page2Top);
        start = page2Top;
        continue;
      }

      if (totalPx <= batas + 1) break;

      var pilih = null;
      for (var i = titik.length - 1; i >= 0; i--) {
        if (titik[i] <= batas && titik[i] > start + 24) { pilih = titik[i]; break; }
      }
      if (pilih === null) pilih = batas; // 1 blok lebih tinggi dari halaman: potong paksa
      awal.push(pilih);
      start = pilih;
    }
    return awal;
  }

  function potongCanvas(sumber, sy, tinggi) {
    var c = document.createElement('canvas');
    c.width = sumber.width;
    c.height = Math.max(1, Math.round(tinggi));
    var ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(sumber, 0, Math.round(sy), sumber.width, Math.round(tinggi), 0, 0, sumber.width, Math.round(tinggi));
    return c;
  }

  function gambarWatermark(pdf, logo) {
    if (!logo) return;
    var rasio = logo.w / logo.h;
    var w = WATERMARK_MM, h = WATERMARK_MM;
    if (rasio > 1) h = WATERMARK_MM / rasio; else w = WATERMARK_MM * rasio;
    try {
      pdf.setGState(new pdf.GState({ opacity: WATERMARK_OPACITY }));
      pdf.addImage(logo.dataUrl, 'PNG', (HALAMAN_W - w) / 2, (HALAMAN_H - h) / 2, w, h);
      pdf.setGState(new pdf.GState({ opacity: 1 }));
    } catch (e) { /* watermark gagal: lanjut tanpa */ }
  }

  function gambarNomor(pdf, no) {
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(51, 51, 51);
    // Baseline 1.5mm di atas garis margin bawah — selalu di dasar halaman.
    pdf.text(String(no), HALAMAN_W / 2, HALAMAN_H - MARGIN - 1.5, { align: 'center' });
  }

  async function unduhPdfCetak(daftarHtmlKartu, namaFile) {
    if (!window.html2canvas || !window.jspdf || !window.jspdf.jsPDF) {
      throw new Error('Pustaka PDF belum termuat (html2canvas / jsPDF). Periksa koneksi internet lalu muat ulang halaman.');
    }
    if (!daftarHtmlKartu || !daftarHtmlKartu.length) throw new Error('Tidak ada data untuk dijadikan PDF.');

    var pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    var logo = await muatLogo();
    var iframe = await buatIframeRender();
    var d = iframe.contentDocument;
    var pertama = true;

    try {
      for (var k = 0; k < daftarHtmlKartu.length; k++) {
        d.body.innerHTML = '<div id="pdfRoot">' + daftarHtmlKartu[k] + '</div>';
        var root = d.getElementById('pdfRoot');
        var kartu = root.firstElementChild;
        await tunggu(60); // beri waktu layout/gambar

        var frame = kartu.querySelector('.rapor-cetak__print-frame');
        var headerEl = frame ? frame.querySelector(':scope > thead .rapor-cetak__biodata') : null;
        // PENTING: ":scope >" di sini WAJIB, bukan hiasan. Tanpa ":scope",
        // "tbody > tr > td" dicari ke SELURUH keturunan frame, dan tabel
        // Nilai (.rapor-cetak__nilai) di dalam page1 JUGA punya struktur
        // <tbody><tr><td> — begitu juga tabel Identitas Siswa
        // (.rapor-cetak__biodata) di dalam <thead>. querySelector cuma
        // mengembalikan match PERTAMA dalam urutan dokumen, yaitu sel
        // <td> label "Nama" di tabel Identitas (karena <thead> mendahului
        // <tbody> milik print-frame sendiri) — bukan <td> pembungkus
        // seluruh isi rapor yang dimaksud. Akibatnya bodyEl jadi sel
        // sekecil label "Nama" itu sendiri, lalu di-stretch penuh selebar
        // halaman PDF (mmPerPx dihitung dari lebar sel itu) — inilah
        // yang membuat hasil "Unduh PDF" hancur/rusak (cuma tulisan
        // "Nama" raksasa 1 halaman). ":scope >" membatasi pencarian ke
        // ANAK LANGSUNG frame saja, jadi selalu kena <tbody> milik
        // print-frame sendiri.
        var bodyEl = frame ? frame.querySelector(':scope > tbody > tr > td') : kartu;
        if (!bodyEl) bodyEl = kartu;

        var opsi = { scale: SKALA, backgroundColor: '#ffffff', useCORS: true, logging: false };

        var headerCanvas = null, headerMm = 0;
        if (headerEl) {
          var hr = headerEl.getBoundingClientRect();
          headerCanvas = await window.html2canvas(headerEl, opsi);
          headerMm = hr.height * (LEBAR_KONTEN / hr.width);
        }

        var br = bodyEl.getBoundingClientRect();
        var mmPerPx = LEBAR_KONTEN / br.width;
        var bodyCanvas = await window.html2canvas(bodyEl, opsi);
        var rasioCanvas = bodyCanvas.height / br.height; // px canvas per px CSS

        var kapasitasMm = TINGGI_KONTEN - RESERVASI_NOMOR - (headerCanvas ? headerMm + GAP_HEADER : 0);
        var kapasitasPx = kapasitasMm / mmPerPx;

        var page2El = bodyEl.querySelector('.rapor-cetak__page2');
        var page2Top = page2El ? page2El.getBoundingClientRect().top - br.top : null;
        var titik = kumpulkanTitikPotong(bodyEl);
        var awal = hitungAwalHalaman(br.height, kapasitasPx, titik, page2Top);

        for (var p = 0; p < awal.length; p++) {
          var mulai = awal[p];
          var akhir = (p + 1 < awal.length) ? awal[p + 1] : br.height;
          if (akhir - mulai < 1) continue;

          if (!pertama) pdf.addPage('a4', 'portrait');
          pertama = false;

          gambarWatermark(pdf, logo);

          var y = MARGIN;
          if (headerCanvas) {
            pdf.addImage(headerCanvas.toDataURL('image/jpeg', KUALITAS_JPEG), 'JPEG', MARGIN, y, LEBAR_KONTEN, headerMm);
            y += headerMm + GAP_HEADER;
          }

          var irisan = potongCanvas(bodyCanvas, mulai * rasioCanvas, (akhir - mulai) * rasioCanvas);
          var irisanMm = (akhir - mulai) * mmPerPx;
          pdf.addImage(irisan.toDataURL('image/jpeg', KUALITAS_JPEG), 'JPEG', MARGIN, y, LEBAR_KONTEN, irisanMm);

          gambarNomor(pdf, p + 1);
        }
      }
      pdf.save(bersihkanNamaFile(namaFile) + '.pdf');
    } finally {
      if (iframe && iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }
  }

  window.unduhPdfCetak = unduhPdfCetak;
})();
