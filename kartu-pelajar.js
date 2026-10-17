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
 *   Prog. Keahlian   -> bi_siswa_detail.program_keahlian_masuk
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
    logoPemerintah: 'assets/logo-tutwuri.png',
    stempel: 'assets/stempel-wima.png',
    logoSekolah: 'assets/logo.png'
  };

  var LEBAR = 1005, TINGGI = 652;   // koordinat desain (px)
  var FONT = "'Plus Jakarta Sans', 'Segoe UI', Arial, sans-serif";
  var RADIUS = 37;                  // sudut kartu (px desain) = 3,18 mm, ukuran kartu ID standar

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
      'border-radius:calc(' + RADIUS + ' * var(--u,1px));box-shadow:0 6px 18px -6px rgba(15,23,42,.35);font-family:' + FONT + ';color:#1b1b1b;' +
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
      '--u:calc(85.6mm / ' + LEBAR + ') !important;box-shadow:none !important;border:0.2mm solid #bbb;border-radius:3.18mm;}' +
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
      keDataUrl(KP.stempel),
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
      foto: imgs[0], logoPem: imgs[1], logoSek: imgs[2], stempel: imgs[3], ttd: imgs[4],
      tanggal: tgl,
      kota: profil.kota_ttd || KP.kotaCadangan,
      kepsek: profil.kepala_sekolah || KP.kepsekCadangan,
      kosong: {
        foto: !imgs[0], tanggal: !tgl, keahlian: !keahlian, alamat: !sw.alamat_siswa
      }
    };
  }

  // ---------------------------------------------------------------
  // Desain kartu (modern: hijau tua, aksen emas, sudut membulat)
  // ---------------------------------------------------------------
  var WARNA = { tua: '#0b3d24', sedang: '#17803f', emas: '#f5b82e', emasMuda: '#ffd24d', teks: '#0f2a1b', label: '#4b5d52', latar: '#f4f8f5', lingkaran: '#e3f0e8' };

  function bgDepan() {
    return '<svg class="kp-bg" viewBox="0 0 ' + LEBAR + ' ' + TINGGI + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="kpGd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + WARNA.tua + '"/><stop offset="1" stop-color="' + WARNA.sedang + '"/></linearGradient></defs>' +
      '<rect width="' + LEBAR + '" height="' + TINGGI + '" fill="' + WARNA.latar + '"/>' +
      '<circle cx="1005" cy="652" r="270" fill="' + WARNA.lingkaran + '"/>' +
      '<circle cx="1005" cy="652" r="175" fill="#d3e9db"/>' +
      '<circle cx="0" cy="652" r="130" fill="' + WARNA.lingkaran + '"/>' +
      '<path d="M0,171 Q502.5,211 1005,171" fill="none" stroke="' + WARNA.emas + '" stroke-width="10"/>' +
      '<path d="M0,0 H1005 V166 Q502.5,206 0,166 Z" fill="url(#kpGd)"/>' +
      '</svg>';
  }

  function bgBelakang() {
    return '<svg class="kp-bg" viewBox="0 0 ' + LEBAR + ' ' + TINGGI + '" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="kpGb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + WARNA.tua + '"/><stop offset="1" stop-color="' + WARNA.sedang + '"/></linearGradient></defs>' +
      '<rect width="' + LEBAR + '" height="' + TINGGI + '" fill="' + WARNA.latar + '"/>' +
      '<circle cx="0" cy="652" r="230" fill="' + WARNA.lingkaran + '"/>' +
      '<circle cx="1005" cy="330" r="150" fill="' + WARNA.lingkaran + '"/>' +
      '<path d="M0,123 Q502.5,173 1005,123" fill="none" stroke="' + WARNA.emas + '" stroke-width="10"/>' +
      '<path d="M0,0 H1005 V118 Q502.5,168 0,118 Z" fill="url(#kpGb)"/>' +
      '<rect y="612" width="' + LEBAR + '" height="40" fill="url(#kpGb)"/>' +
      '<rect y="608" width="' + LEBAR + '" height="5" fill="' + WARNA.emas + '"/>' +
      '</svg>';
  }

  // Lingkaran putih berisi logo (dengan cincin emas)
  function lencana(x, y, s, src) {
    var dalam = Math.round(s * 0.76);
    return '<div class="kp-abs" style="' + box(x, y, s, s, 'background:#fff;border-radius:50%;border:' + U(4) + ' solid ' + WARNA.emasMuda + ';' +
      'box-shadow:0 ' + U(3) + ' ' + U(8) + ' rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;') + '">' +
      '<img alt="" src="' + esc(src) + '" style="width:' + U(dalam) + ';height:' + U(dalam) + ';object-fit:contain;display:block;"></div>';
  }

  function chip(teks, x, y, w) {
    return '<div class="kp-abs" style="' + box(x, y, w, 32, 'background:' + WARNA.tua + ';color:#fff;border-radius:' + U(16) + ';display:flex;align-items:center;justify-content:center;' +
      'font-weight:800;letter-spacing:' + U(4) + ';' + fs(17, 20)) + '">' + esc(teks) + '</div>';
  }

  function barisData(label, nilai, uk) {
    return '<div style="' + fs(22, 29) + 'font-weight:500;color:' + WARNA.label + ';">' + esc(label) + '</div>' +
      '<div style="' + fs(22, 29) + 'font-weight:600;color:' + WARNA.label + ';text-align:center;">:</div>' +
      '<div style="' + fs(uk || 24, 29) + 'font-weight:700;color:' + WARNA.teks + ';overflow-wrap:anywhere;">' + esc(nilai) + '</div>';
  }

  function depanHtml(d) {
    var h = bgDepan();

    // Header
    h += lencana(34, 18, 100, d.logoPem);
    h += lencana(871, 18, 100, d.logoSek);
    h += '<div class="kp-abs" style="' + box(150, 16, 705, null, 'text-align:center;color:#d8efe0;font-weight:600;letter-spacing:' + U(2.5) + ';' + fs(21, 28)) + '">' +
      esc(KP.instansi1) + '<br>' + esc(KP.instansi2) + '</div>';
    h += '<div class="kp-abs" style="' + box(150, 72, 705, null, 'text-align:center;color:' + WARNA.emasMuda + ';font-weight:800;letter-spacing:' + U(1) + ';white-space:nowrap;' + fs(40, 48)) + '">' + esc(KP.sekolah) + '</div>';
    h += '<div class="kp-abs" style="' + box(60, 130, 885, null, 'text-align:center;color:#fff;font-weight:500;white-space:nowrap;' + fs(14, 20)) + '">' + esc(KP.alamat) + '</div>';

    // Foto (bingkai putih membulat + blok aksen emas)
    h += '<div class="kp-abs" style="' + box(40, 238, 240, 324, 'background:' + WARNA.emas + ';border-radius:' + U(26) + ';') + '"></div>';
    h += '<div class="kp-abs" style="' + box(28, 226, 240, 324, 'background:#e2ece6;border-radius:' + U(26) + ';overflow:hidden;border:' + U(5) + ' solid #fff;box-shadow:0 ' + U(4) + ' ' + U(12) + ' rgba(0,0,0,.25);') + '">' +
      (d.foto
        ? '<img alt="Foto" src="' + esc(d.foto) + '" style="width:100%;height:100%;object-fit:cover;object-position:center top;display:block;">'
        : '<div style="height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:#2f5d43;font-weight:700;' + fs(22, 28) + '">FOTO<br>BELUM<br>ADA</div>') +
      '</div>';

    // Data (grid: baris menyesuaikan tinggi otomatis bila teks panjang)
    var ukAlamat = (d.alamat || '').length > 80 ? 18 : ((d.alamat || '').length > 50 ? 20 : 24);
    var ukNama = (d.nama || '').length > 30 ? 18 : ((d.nama || '').length > 22 ? 21 : 24);
    h += '<div class="kp-abs" style="' + box(300, 226, 693, null, 'display:grid;grid-template-columns:' + U(210) + ' ' + U(22) + ' 1fr;row-gap:' + U(3) + ';align-items:start;') + '">' +
      barisData('Nomor Induk', d.nis) +
      barisData('Nama', d.nama, ukNama) +
      barisData('Jenis Kelamin', d.jk) +
      barisData('TTL', d.ttl) +
      barisData('Alamat', d.alamat, ukAlamat) +
      barisData('Prog. Keahlian', d.keahlian) +
      '</div>';

    // Tanda tangan + stempel Kepala Sekolah
    var tk = 'color:' + WARNA.teks + ';';
    h += '<div class="kp-abs" style="' + box(588, 498, 400, null, tk + 'font-weight:500;' + fs(20, 26)) + '">' + esc(d.kota) + ', ' + esc(d.tanggal) + '</div>';
    h += '<div class="kp-abs" style="' + box(588, 522, 400, null, tk + 'font-weight:600;' + fs(20, 26)) + '">Kepala Sekolah</div>';
    if (d.stempel) {
      h += '<img class="kp-abs" alt="" src="' + esc(d.stempel) + '" style="' + box(548, 492, 124, 124, 'object-fit:contain;opacity:.85;') + '">';
    }
    if (d.ttd) {
      h += '<img class="kp-abs" alt="" src="' + esc(d.ttd) + '" style="' + box(590, 506, 270, 104, 'object-fit:contain;object-position:left center;') + '">';
    }
    h += '<div class="kp-abs" style="' + box(588, 608, 410, null, tk + 'font-weight:700;' + fs(20, 26)) + '">' + esc(d.kepsek) + '</div>';

    // Masa berlaku
    h += '<div class="kp-abs" style="' + box(28, 598, 450, 38, 'background:linear-gradient(90deg,' + WARNA.tua + ',' + WARNA.sedang + ');border-radius:' + U(19) + ';box-shadow:0 ' + U(3) + ' ' + U(6) + ' rgba(0,0,0,.22);display:flex;align-items:center;padding-left:' + U(24) + ';color:#fff;font-weight:600;white-space:nowrap;' + fs(17, 22)) + '">' +
      '<span style="display:inline-block;width:' + U(10) + ';height:' + U(10) + ';border-radius:50%;background:' + WARNA.emasMuda + ';margin-right:' + U(12) + ';"></span>' +
      esc(KP.masaBerlaku) + '</div>';
    return h;
  }

  function belakangHtml(d) {
    var h = bgBelakang();
    h += '<div class="kp-abs" style="' + box(100, 16, 805, null, 'text-align:center;color:' + WARNA.emasMuda + ';font-weight:800;letter-spacing:' + U(2) + ';white-space:nowrap;' + fs(27, 34)) + '">' + esc(KP.sekolah) + '</div>';
    h += lencana(440, 56, 125, d.logoSek);

    h += chip('VISI', 442, 196, 120);
    h += '<div class="kp-abs" style="' + box(60, 236, 885, null, 'text-align:center;font-weight:800;color:' + WARNA.tua + ';' + fs(28, 36)) + '">' + esc(KP.visi) + '</div>';
    h += chip('MISI', 442, 290, 120);

    var li = KP.misi.map(function (m, i) {
      return '<div style="display:flex;align-items:center;height:' + U(42) + ';">' +
        '<div style="flex:none;width:' + U(30) + ';height:' + U(30) + ';border-radius:50%;background:' + WARNA.emas + ';color:#14321f;display:flex;align-items:center;justify-content:center;font-weight:800;' + fs(16, 18) + '">' + (i + 1) + '</div>' +
        '<div style="margin-left:' + U(14) + ';font-weight:600;color:' + WARNA.teks + ';white-space:nowrap;' + fs(21, 26) + '">' + esc(m) + '</div></div>';
    }).join('');
    h += '<div class="kp-abs" style="' + box(110, 336, 740, null, '') + '">' + li + '</div>';

    var teksQr = 'SMK WIDYA MANDALA TAMBAK | NIS: ' + d.nis + ' | ' + d.nama;
    var qr = qrSvg(teksQr);
    h += '<div class="kp-abs" style="' + box(850, 462, 126, 126, 'background:#fff;padding:' + U(6) + ';border-radius:' + U(10) + ';box-shadow:0 ' + U(3) + ' ' + U(8) + ' rgba(0,0,0,.2);') + '">' + qr + '</div>';

    h += '<div class="kp-abs" style="' + box(40, 620, 800, null, 'color:#fff;font-weight:500;white-space:nowrap;' + fs(14, 22)) + '">Apabila kartu ini ditemukan, harap dikembalikan ke ' + esc(KP.sekolah) + '.</div>';
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
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
    var asal = document.querySelector('.kp-card[data-sisi="' + sisi + '"]');
    if (!asal) throw new Error('Kartu tidak ditemukan');
    var wadah = document.createElement('div');
    wadah.style.cssText = 'position:fixed;left:-99999px;top:0;width:' + LEBAR + 'px;height:' + TINGGI + 'px;';
    var salin = asal.cloneNode(true);
    salin.style.cssText = 'width:' + LEBAR + 'px;height:' + TINGGI + 'px;--u:1px;box-shadow:none;border-radius:' + RADIUS + 'px;aspect-ratio:auto;';
    wadah.appendChild(salin);
    document.body.appendChild(wadah);
    try {
      var canvas = await window.html2canvas(salin, { scale: 2, useCORS: true, backgroundColor: null, width: LEBAR, height: TINGGI, logging: false });
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
    if (d.kosong.keahlian) peringatan.push('Program Keahlian belum diisi di Buku Induk.');
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
