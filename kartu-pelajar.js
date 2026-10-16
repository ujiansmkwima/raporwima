/* kartu-pelajar.js
 * -----------------------------------------------------------------
 * Menu "Kartu Pelajar Digital" di Portal Siswa (siswa.html).
 *
 * Sumber data (semuanya dari Buku Induk, tidak ada input baru):
 *   Nomor Induk      -> siswa.nis
 *   Nama             -> siswa.nama
 *   Jenis Kelamin    -> siswa.jenis_kelamin
 *   TTL              -> siswa.tempat_lahir + siswa.tanggal_lahir
 *   Alamat           -> siswa.alamat_siswa + bi_siswa_detail.kelurahan/kecamatan/kab_kota
 *   Komp. Keahlian   -> bi_siswa_detail.program_keahlian_masuk
 *                       (cadangan: konsentrasi / program keahlian kelas)
 *   Foto             -> bi_siswa_detail.foto  (foto "Saat Masuk")
 *   Tanggal kartu    -> siswa.tanggal_masuk   (= Tanggal Diterima)
 *   Kepala Sekolah   -> profil_sekolah (nama, kota, gambar tanda tangan)
 *
 * Bergantung pada fungsi/variabel global siswa.html:
 *   content, S, supabaseClient, escapeHtml, formatTanggalIndonesia,
 *   headHtml, cekError
 *
 * Ukuran kartu dihitung dari satu variabel --u (= lebar kartu / 1005),
 * jadi tampilan layar, cetak (85,6 mm) dan unduhan PNG selalu sama.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  // ---- Teks tetap kartu (ubah di sini bila perlu) ----
  var KP = {
    instansi1: 'PEMERINTAH PROVINSI JAWA TENGAH',
    instansi2: 'DINAS PENDIDIKAN',
    sekolah: 'SMK WIDYA MANDALA TAMBAK',
    alamat: 'Komplek PonPes Sikeris Desa Purwodadi, Kecamatan Tambak, Kabupaten Banyumas - Telp. +62812-2664-430',
    masaBerlaku: 'Masa Berlaku Sampai Siswa Lulus SMK',
    visi: '\u201CSMK Berbasis IPTEK dan IMTAK\u201D',
    misi: [
      'Wawasan Pendidikan Utuh, Profesional dan Kekeluargaan',
      'Ibadah Sebagai Landasan Pada Setiap Kinerjanya',
      'Mulia Dalam Akhlak, Kompeten, Nasionalis dan Global',
      'Amanah, Santun, Kompetitif dan Sinergis'
    ],
    kepsekCadangan: 'Agung Pambudi, S.E., S. Kom., M.M.',
    kotaCadangan: 'Tambak',
    logoPemerintah: 'assets/logo-kemdikdasmen.png',
    logoSekolah: 'assets/logo.png'
  };

  var LEBAR = 1005, TINGGI = 652;   // koordinat desain (px)
  var FONT = "Verdana, 'DejaVu Sans', 'Plus Jakarta Sans', Arial, sans-serif";

  var CDN_H2C = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  var CDN_QR = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';

  // ---------------------------------------------------------------
  // Gaya (disisipkan sekali)
  // ---------------------------------------------------------------
  function pasangGaya() {
    if (document.getElementById('kpStyle')) return;
    var st = document.createElement('style');
    st.id = 'kpStyle';
    st.textContent =
      '.kp-wrap{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;max-width:1160px;margin-top:6px;}' +
      '.kp-item__t{font-size:12.5px;font-weight:700;color:var(--ink-soft);margin:0 0 6px;}' +
      '.kp-card{position:relative;width:100%;aspect-ratio:' + LEBAR + '/' + TINGGI + ';overflow:hidden;background:#fff;' +
      'border-radius:calc(14 * var(--u,1px));box-shadow:0 6px 18px -6px rgba(15,23,42,.35);font-family:' + FONT + ';color:#1b1b1b;' +
      '-webkit-print-color-adjust:exact;print-color-adjust:exact;--u:0.5px;}' +
      '.kp-card *{box-sizing:border-box;}' +
      '.kp-card svg.kp-bg{position:absolute;left:0;top:0;width:100%;height:100%;display:block;}' +
      '.kp-abs{position:absolute;}' +
      '.kp-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px;}' +
      '.kp-note{font-size:12.5px;color:var(--ink-soft);margin-top:14px;line-height:1.6;}' +
      '.kp-warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:10px;padding:10px 14px;font-size:13px;margin:0 0 14px;line-height:1.55;}' +
      '@media print{' +
      '.kp-wrap{display:block;margin:0;max-width:none;}' +
      '.kp-item{break-inside:avoid;margin:0 0 6mm;}' +
      '.kp-item__t{display:none;}' +
      '.kp-card{width:85.6mm !important;height:' + (85.6 * TINGGI / LEBAR).toFixed(2) + 'mm !important;' +
      '--u:calc(85.6mm / ' + LEBAR + ') !important;box-shadow:none !important;border:0.2mm solid #999;border-radius:2.5mm;}' +
      '.kp-note,.kp-warn{display:none !important;}' +
      '}';
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------
  // Util
  // ---------------------------------------------------------------
  var U = function (n) { return 'calc(' + n + ' * var(--u))'; };
  function box(x, y, w, h, extra) {
    return 'left:' + U(x) + ';top:' + U(y) + ';' + (w != null ? 'width:' + U(w) + ';' : '') +
      (h != null ? 'height:' + U(h) + ';' : '') + (extra || '');
  }
  function fs(n, lh) { return 'font-size:' + U(n) + ';line-height:' + (lh ? U(lh) : '1.2') + ';'; }
  function esc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }

  var skripDimuat = {};
  function muatSkrip(src) {
    if (skripDimuat[src]) return skripDimuat[src];
    skripDimuat[src] = new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { res(); };
      s.onerror = function () { delete skripDimuat[src]; rej(new Error('Gagal memuat pustaka: ' + src)); };
      document.head.appendChild(s);
    });
    return skripDimuat[src];
  }

  // Ubah URL gambar jadi data URL agar aman dipakai saat diunduh jadi PNG.
  function keDataUrl(src) {
    if (!src || String(src).indexOf('data:') === 0) return Promise.resolve(src || null);
    return fetch(src).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.blob();
    }).then(function (b) {
      return new Promise(function (res) {
        var fr = new FileReader();
        fr.onload = function () { res(fr.result); };
        fr.onerror = function () { res(src); };
        fr.readAsDataURL(b);
      });
    }).catch(function () { return src; });
  }

  function besar(s) { return String(s == null ? '' : s).trim().toUpperCase(); }

  function sudahMengandung(teks, bagian) {
    return String(teks || '').toLowerCase().indexOf(String(bagian || '').toLowerCase()) !== -1;
  }

  function susunAlamat(sw, det) {
    var jalan = String(sw.alamat_siswa || '').trim();
    var kel = String(det.kelurahan || '').trim();
    var kec = String(det.kecamatan || '').trim().replace(/^kec(amatan)?\.?\s+/i, '');
    var kab = String(det.kab_kota || '').trim().replace(/^kab(upaten)?\.?\s+/i, '');
    var bagian = [];
    if (jalan) bagian.push(jalan);
    if (kel && !sudahMengandung(jalan, kel)) bagian.push(kel);
    var teks = bagian.join(', ');
    var akhir = [];
    if (kec && !sudahMengandung(teks, kec)) akhir.push('KEC. ' + kec);
    if (kab && !sudahMengandung(teks, kab)) akhir.push(kab);
    if (akhir.length) teks += (teks ? ' ' : '') + akhir.join(', ');
    return besar(teks);
  }

  function qrSvg(teks) {
    if (typeof window.qrcode !== 'function') return '';
    try {
      var q = window.qrcode(0, 'M');
      q.addData(teks);
      q.make();
      var n = q.getModuleCount(), tepi = 1, d = '';
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (q.isDark(r, c)) d += 'M' + (c + tepi) + ' ' + (r + tepi) + 'h1v1h-1z';
        }
      }
      var k = n + tepi * 2;
      return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + k + ' ' + k + '" width="100%" height="100%" shape-rendering="crispEdges">' +
        '<rect width="' + k + '" height="' + k + '" fill="#fff"/><path d="' + d + '" fill="#111"/></svg>';
    } catch (e) { return ''; }
  }

  // ---------------------------------------------------------------
  // Pengambilan data
  // ---------------------------------------------------------------
  async function muatData() {
    var id = S.siswa.id;
    var r = await Promise.all([
      supabaseClient.from('siswa').select('*').eq('id', id).maybeSingle(),
      supabaseClient.from('bi_siswa_detail').select('*').eq('siswa_id', id).maybeSingle(),
      supabaseClient.from('profil_sekolah').select('*').maybeSingle()
    ]);
    var sw = (r[0] && r[0].data) || S.siswa;
    S.siswa = sw;
    var det = cekError(r[1], 'buku induk').data || {};
    var profil = (r[2] && !r[2].error && r[2].data) || {};

    // Kelas terbaru siswa (untuk cadangan Komp. Keahlian)
    var kelas = null;
    for (var i = 0; i < S.periodeList.length && !kelas; i++) kelas = S.kelasPerTA[S.periodeList[i].id] || null;

    var fotoUrl = null;
    if (det.foto) {
      if (String(det.foto).indexOf('data:') === 0) fotoUrl = det.foto;
      else {
        var sg = await supabaseClient.storage.from('buku-induk-foto').createSignedUrl(det.foto, 3600);
        fotoUrl = (sg.error || !sg.data) ? null : sg.data.signedUrl;
      }
    }

    var imgs = await Promise.all([
      keDataUrl(fotoUrl),
      keDataUrl(KP.logoPemerintah),
      keDataUrl(KP.logoSekolah),
      keDataUrl(profil.ttd_kepala_sekolah || null),
      muatSkrip(CDN_QR).catch(function () { return null; })
    ]);

    var keahlian = det.program_keahlian_masuk || (kelas && (kelas.konsentrasi_keahlian || kelas.program_keahlian)) || '';
    var jk = sw.jenis_kelamin === 'L' ? 'LAKI-LAKI' : (sw.jenis_kelamin === 'P' ? 'PEREMPUAN' : besar(sw.jenis_kelamin));
    var tgl = sw.tanggal_masuk ? formatTanggalIndonesia(sw.tanggal_masuk) : '';
    var ttl = besar(sw.tempat_lahir) + (sw.tanggal_lahir ? (sw.tempat_lahir ? ', ' : '') + besar(formatTanggalIndonesia(sw.tanggal_lahir)) : '');

    return {
      nis: sw.nis || '', nama: besar(sw.nama), jk: jk, ttl: ttl,
      alamat: susunAlamat(sw, det), keahlian: besar(keahlian),
      foto: imgs[0], logoPem: imgs[1], logoSek: imgs[2], ttd: imgs[3],
      tanggal: tgl,
      kota: profil.kota_ttd || KP.kotaCadangan,
      kepsek: profil.kepala_sekolah || KP.kepsekCadangan,
      kosong: {
        foto: !imgs[0], tanggal: !tgl, keahlian: !keahlian, alamat: !sw.alamat_siswa
      }
    };
  }

  // ---------------------------------------------------------------
  // Desain kartu
  // ---------------------------------------------------------------
  function bgDepan() {
    return '<svg class="kp-bg" viewBox="0 0 ' + LEBAR + ' ' + TINGGI + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="' + LEBAR + '" height="' + TINGGI + '" fill="#ffffff"/>' +
      '<polygon points="1005,205 1005,250 955,205" fill="#fdfbd2"/>' +
      '<polygon points="1005,362 1005,652 585,652" fill="#fdfbd2"/>' +
      '<polygon points="0,282 14,282 0,420" fill="#cfcfc0"/>' +
      '<polygon points="0,540 255,540 345,652 0,652" fill="#d3d3ca"/>' +
      '<rect width="' + LEBAR + '" height="172" fill="#5e5e50"/>' +
      '<rect y="172" width="' + LEBAR + '" height="33" fill="#7bc043"/>' +
      '<rect x="1" y="1" width="' + (LEBAR - 2) + '" height="' + (TINGGI - 2) + '" fill="none" stroke="#6b6b6b" stroke-width="2"/>' +
      '</svg>';
  }

  function bgBelakang() {
    return '<svg class="kp-bg" viewBox="0 0 ' + LEBAR + ' ' + TINGGI + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect width="' + LEBAR + '" height="' + TINGGI + '" fill="#ffffff"/>' +
      '<polygon points="0,0 225,0 0,222" fill="#5e5e50"/>' +
      '<polygon points="228,15 228,100 142,100" fill="#fdf79a"/>' +
      '<polygon points="117,115 245,115 117,242" fill="#7bc043"/>' +
      '<polygon points="25,220 110,138 110,220" fill="#fdf79a"/>' +
      '<polygon points="1005,432 1005,652 835,652" fill="#5e5e50"/>' +
      '<polygon points="855,432 755,535 855,535" fill="#7bc043"/>' +
      '<polygon points="905,432 985,432 905,512" fill="#fdf79a"/>' +
      '<rect x="1.5" y="1.5" width="' + (LEBAR - 3) + '" height="' + (TINGGI - 3) + '" fill="none" stroke="#555" stroke-width="3"/>' +
      '</svg>';
  }

  function barisData(label, nilai, y, lh) {
    return '<div class="kp-abs" style="' + box(273, y, 235, null, fs(25, lh || 30) + 'font-weight:600;') + '">' + esc(label) + '</div>' +
      '<div class="kp-abs" style="' + box(503, y, 20, null, fs(25, lh || 30) + 'font-weight:600;') + '">:</div>' +
      nilai;
  }

  function depanHtml(d) {
    var h = bgDepan();

    // Header
    h += '<img class="kp-abs" alt="" src="' + esc(d.logoPem) + '" style="' + box(40, 15, 106, 110, 'object-fit:contain;') + '">';
    h += '<img class="kp-abs" alt="" src="' + esc(d.logoSek) + '" style="' + box(860, 20, 104, 105, 'object-fit:contain;') + '">';
    h += '<div class="kp-abs" style="' + box(150, 18, 705, null, 'text-align:center;color:#fff;font-weight:700;letter-spacing:' + U(1) + ';' + fs(30, 36)) + '">' +
      esc(KP.instansi1) + '<br>' + esc(KP.instansi2) + '</div>';
    h += '<div class="kp-abs" style="' + box(150, 90, 705, null, 'text-align:center;color:#fff;font-weight:700;letter-spacing:' + U(1.5) + ';' + fs(38, 40)) + '">' + esc(KP.sekolah) + '</div>';
    h += '<div class="kp-abs" style="' + box(60, 128, 885, null, 'text-align:center;color:#fff;font-weight:700;white-space:nowrap;' + fs(14, 20)) + '">' + esc(KP.alamat) + '</div>';

    // Foto
    h += '<div class="kp-abs" style="' + box(15, 236, 240, 324, 'background:#d71414;overflow:hidden;') + '">' +
      (d.foto
        ? '<img alt="Foto" src="' + esc(d.foto) + '" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;">'
        : '<div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;font-weight:700;' + fs(22, 28) + '">FOTO<br>BELUM<br>ADA</div>') +
      '</div>';

    // Data
    var ukAlamat = (d.alamat || '').length > 78 ? 21 : 25;
    var nilaiStyle = function (ukuran) { return fs(ukuran, 30) + 'font-weight:700;overflow-wrap:anywhere;'; };
    var y = 236;
    h += barisData('Nomor Induk', '<div class="kp-abs" style="' + box(532, y, 455, null, nilaiStyle(25)) + '">' + esc(d.nis) + '</div>', y);
    y += 30;
    h += barisData('Nama', '<div class="kp-abs" style="' + box(532, y, 455, null, nilaiStyle(25)) + '">' + esc(d.nama) + '</div>', y);
    y += 30;
    h += barisData('Jenis Kelamin', '<div class="kp-abs" style="' + box(532, y, 455, null, nilaiStyle(25)) + '">' + esc(d.jk) + '</div>', y);
    y += 30;
    h += barisData('TTL', '<div class="kp-abs" style="' + box(532, y, 455, null, nilaiStyle(25)) + '">' + esc(d.ttl) + '</div>', y);
    y += 30;
    var barisAlamat = Math.max(1, Math.ceil(((d.alamat || '').length || 1) / (ukAlamat === 25 ? 33 : 40)));
    h += barisData('Alamat', '<div class="kp-abs" style="' + box(532, y, 460, null, nilaiStyle(ukAlamat)) + '">' + esc(d.alamat) + '</div>', y);
    y += 30 * Math.min(barisAlamat, 3);
    h += barisData('Komp. Keahlian', '<div class="kp-abs" style="' + box(532, y, 455, null, nilaiStyle(25)) + '">' + esc(d.keahlian) + '</div>', y);

    // Tanda tangan kepala sekolah
    var ttdTop = 528;
    h += '<div class="kp-abs" style="' + box(588, 482, 400, null, fs(21, 26)) + '">' + esc(d.kota) + ', ' + esc(d.tanggal) + '</div>';
    h += '<div class="kp-abs" style="' + box(588, 507, 400, null, fs(21, 26)) + '">Kepala Sekolah</div>';
    if (d.ttd) {
      h += '<img class="kp-abs" alt="" src="' + esc(d.ttd) + '" style="' + box(600, ttdTop, 180, 62, 'object-fit:contain;object-position:left center;') + '">';
    }
    h += '<div class="kp-abs" style="' + box(588, 592, 410, null, fs(21, 26)) + '">' + esc(d.kepsek) + '</div>';

    // Masa berlaku
    h += '<div class="kp-abs" style="' + box(32, 598, 446, 38, 'background:#fff;border-radius:' + U(19) + ';box-shadow:' + U(3) + ' ' + U(2) + ' 0 #c9c9bd;display:flex;align-items:center;padding-left:' + U(34) + ';font-style:italic;font-weight:700;white-space:nowrap;' + fs(18, 22)) + '">' +
      esc(KP.masaBerlaku) + '</div>';
    return h;
  }

  function belakangHtml(d) {
    var h = bgBelakang();
    h += '<img class="kp-abs" alt="" src="' + esc(d.logoSek) + '" style="' + box(455, 40, 92, 92, 'object-fit:contain;') + '">';
    h += '<div class="kp-abs" style="' + box(100, 158, 805, null, 'text-align:center;font-weight:700;' + fs(29, 38)) + '">VISI<br>' + esc(KP.visi) + '<br><span style="display:block;margin-top:' + U(6) + ';">MISI</span></div>';
    var li = KP.misi.map(function (m, i) {
      return '<div style="' + fs(24, 50) + 'font-weight:700;white-space:nowrap;">' + (i + 1) + '. ' + esc(m) + '</div>';
    }).join('');
    h += '<div class="kp-abs" style="' + box(62, 295, 930, null, '') + '">' + li + '</div>';

    var teksQr = 'SMK WIDYA MANDALA TAMBAK | NIS: ' + d.nis + ' | ' + d.nama;
    var qr = qrSvg(teksQr);
    h += '<div class="kp-abs" style="' + box(815, 486, 140, 140, 'background:#fff;padding:' + U(6) + ';border-radius:' + U(4) + ';') + '">' + qr + '</div>';
    return h;
  }

  // ---------------------------------------------------------------
  // Skala kartu (--u) mengikuti lebar tampilan
  // ---------------------------------------------------------------
  function pasangSkala(root) {
    var kartu = root.querySelectorAll('.kp-card');
    function atur() {
      kartu.forEach(function (k) {
        var w = k.getBoundingClientRect().width;
        if (w > 0) k.style.setProperty('--u', (w / LEBAR) + 'px');
      });
    }
    atur();
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(atur);
      kartu.forEach(function (k) { ro.observe(k); });
    } else {
      window.addEventListener('resize', atur);
    }
  }

  // ---------------------------------------------------------------
  // Unduh PNG
  // ---------------------------------------------------------------
  async function unduhPng(sisi, nama) {
    await muatSkrip(CDN_H2C);
    var asal = document.querySelector('.kp-card[data-sisi="' + sisi + '"]');
    if (!asal) throw new Error('Kartu tidak ditemukan');
    var wadah = document.createElement('div');
    wadah.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + LEBAR + 'px;height:' + TINGGI + 'px;';
    var salin = asal.cloneNode(true);
    salin.style.cssText = 'width:' + LEBAR + 'px;height:' + TINGGI + 'px;--u:1px;box-shadow:none;border-radius:0;aspect-ratio:auto;';
    wadah.appendChild(salin);
    document.body.appendChild(wadah);
    try {
      var canvas = await window.html2canvas(salin, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: LEBAR, height: TINGGI, logging: false });
      var blob = await new Promise(function (res) { canvas.toBlob(res, 'image/png'); });
      if (!blob) throw new Error('Gagal membuat gambar');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = nama + '.png';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    } finally {
      wadah.remove();
    }
  }

  // ---------------------------------------------------------------
  // Tampilan menu
  // ---------------------------------------------------------------
  var tokenKP = 0;

  window.renderKartuPelajar = async function renderKartuPelajar() {
    pasangGaya();
    var token = ++tokenKP;
    var judul = 'Kartu Pelajar Digital';
    var deskripsi = 'Kartu pelajarmu dalam bentuk digital. Data dan foto diambil dari Buku Induk.';
    content.innerHTML = headHtml(judul, deskripsi) + '<div class="panel-note">Menyiapkan kartu...</div>';
    var d;
    try {
      d = await muatData();
    } catch (err) {
      if (token !== tokenKP) return;
      content.innerHTML = headHtml(judul, deskripsi) +
        '<div class="panel-note">Gagal memuat kartu: ' + esc(err.message || err) + '</div>';
      return;
    }
    if (token !== tokenKP) return;

    var peringatan = [];
    if (d.kosong.foto) peringatan.push('Foto Buku Induk belum ada, minta wali kelas mengunggahnya.');
    if (d.kosong.tanggal) peringatan.push('Tanggal Diterima belum diisi di Buku Induk, sehingga tanggal pada kartu masih kosong.');
    if (d.kosong.keahlian) peringatan.push('Program / Konsentrasi Keahlian belum diisi di Buku Induk.');
    if (d.kosong.alamat) peringatan.push('Alamat belum diisi di Buku Induk.');

    content.innerHTML =
      headHtml(judul, deskripsi) +
      (peringatan.length ? '<div class="kp-warn no-print"><b>Data belum lengkap:</b><br>' + peringatan.map(esc).join('<br>') +
        '<br>Lengkapi lewat menu <b>Pengajuan Pembetulan Data</b> atau sampaikan ke wali kelas.</div>' : '') +
      '<div class="kp-toolbar no-print">' +
      '<button class="btn-small btn-small--primary" id="kpCetak"><i data-lucide="printer" style="width:14px;height:14px;"></i> Cetak / Simpan PDF</button>' +
      '<button class="btn-small" id="kpDepan"><i data-lucide="download" style="width:14px;height:14px;"></i> Unduh Depan (PNG)</button>' +
      '<button class="btn-small" id="kpBelakang"><i data-lucide="download" style="width:14px;height:14px;"></i> Unduh Belakang (PNG)</button>' +
      '<span id="kpStatus" style="font-size:12.5px;color:var(--ink-soft);align-self:center;"></span>' +
      '</div>' +
      '<div class="kp-wrap">' +
      '<div class="kp-item"><div class="kp-item__t">Tampak Depan</div><div class="kp-card" data-sisi="depan">' + depanHtml(d) + '</div></div>' +
      '<div class="kp-item"><div class="kp-item__t">Tampak Belakang</div><div class="kp-card" data-sisi="belakang">' + belakangHtml(d) + '</div></div>' +
      '</div>' +
      '<div class="kp-note no-print">Tanggal pada kartu mengikuti <b>Tanggal Diterima</b> di Buku Induk. ' +
      'Untuk mencetak, pilih ukuran kertas asli (100%) tanpa penyesuaian; kartu tercetak berukuran 85,6 mm.</div>';

    if (window.lucide) lucide.createIcons();
    pasangSkala(content);

    var status = document.getElementById('kpStatus');
    function info(t) { if (status) status.textContent = t || ''; }
    var namaBerkas = 'Kartu Pelajar - ' + (S.siswa.nama || 'Siswa');

    document.getElementById('kpCetak').addEventListener('click', function () {
      var asli = document.title;
      document.title = namaBerkas;
      window.print();
      document.title = asli;
    });
    [['kpDepan', 'depan', ' (Depan)'], ['kpBelakang', 'belakang', ' (Belakang)']].forEach(function (c) {
      document.getElementById(c[0]).addEventListener('click', async function () {
        info('Membuat gambar...');
        try { await unduhPng(c[1], namaBerkas + c[2]); info(''); }
        catch (e) { info('Gagal mengunduh: ' + (e.message || e)); }
      });
    });
  };
})();
