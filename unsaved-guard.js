/* =========================================================
 * UNSAVED-GUARD — Peringatan "Perubahan Belum Disimpan"
 * Dipakai bersama oleh admin.html dan guru.html.
 *
 * WAJIB dimuat SEBELUM supabase-client.js (lihat bagian
 * "Deteksi simpan berhasil" di bawah).
 *
 * ---------------------------------------------------------
 * PRINSIP
 * ---------------------------------------------------------
 * Peringatan HANYA muncul kalau pengguna benar-benar mengubah
 * isian. Sekadar membuka halaman TIDAK memicu peringatan, walau
 * halaman itu mengisi field lewat JavaScript (mis. capaian yang
 * disusun otomatis, atau data yang dimuat setelah render).
 *
 * Caranya: "nilai dasar" tiap field dicatat tepat SEBELUM
 * interaksi pengguna pertama (klik / ketik / fokus / tombol),
 * bukan saat render. Jadi nilai yang diisi program saat
 * halaman dimuat otomatis menjadi nilai dasar, bukan "perubahan".
 * Field dianggap berubah kalau nilainya SEKARANG berbeda dari
 * nilai dasarnya — mengetik lalu menghapus kembali sampai sama
 * dengan semula tidak dianggap perubahan. Import Excel, "Susun
 * Otomatis", dan "Kosongkan Semua" ikut terdeteksi karena nilai
 * dasarnya sudah dicatat sebelum tombolnya diklik.
 *
 * ---------------------------------------------------------
 * KAPAN PERINGATAN MUNCUL (jika ada perubahan)
 * ---------------------------------------------------------
 *  1. Pindah menu di sidebar atau klik "Keluar".
 *  2. Menutup modal (tombol ×, "Batal", atau klik area gelap).
 *  3. Klik "Batal" pada baris yang sedang diedit inline.
 *  4. Klik elemen ber-atribut data-guard-nav (lihat di bawah).
 *  5. Refresh / tutup tab / pindah alamat (dialog bawaan browser).
 *
 * ---------------------------------------------------------
 * ATRIBUT / API YANG BISA DIPAKAI DI MARKUP
 * ---------------------------------------------------------
 *  data-guard-ignore
 *      Field (atau wadahnya) yang BUKAN data — mis. kolom cari,
 *      filter — tidak dihitung sebagai perubahan. Semua isi
 *      .toolbar sudah otomatis diabaikan.
 *
 *  data-guard-scope="<selector CSS>"
 *      Dipasang di TOMBOL SIMPAN: hanya field yang cocok selector
 *      ini yang dianggap sudah tersimpan setelah simpan berhasil.
 *      Perlu kalau satu halaman punya dua tombol simpan dengan
 *      field yang berbeda. Tanpa atribut ini, cakupannya
 *      otomatis: <form> / modal / baris tabel / .collapsible-body
 *      terdekat, atau seluruh #content.
 *
 *  data-guard-nav="<selector CSS wilayah>"
 *      Dipasang di tombol yang MEMUAT ULANG suatu wilayah halaman
 *      (mis. "Tampilkan Siswa"). Kalau wilayah itu punya
 *      perubahan belum disimpan, klik tombol ini meminta konfirmasi.
 *
 *  UnsavedGuard.markSaved(scope?)
 *      Menganggap isian saat ini sebagai kondisi tersimpan.
 *      scope: selector CSS, elemen, atau kosong (semua). Dipakai
 *      kalau kode memuat data ke field yang sudah tampil.
 *
 *  UnsavedGuard.hasChanges(root?)
 *      true kalau ada perubahan belum disimpan.
 * ========================================================= */
(function () {
  'use strict';
  if (window.UnsavedGuard) return;

  // ---------- Konfigurasi ----------
  // Field hanya dihitung kalau berada di area konten atau modal
  // (bukan sidebar/topbar).
  var AREA_FORM = '#content, .modal-overlay';

  // Wadah yang seluruh isinya BUKAN data (tombol aksi & filter).
  var ABAIKAN_WADAH = '.toolbar, [data-guard-ignore]';

  // Kontrol yang fungsinya hanya memilih tampilan / mencari /
  // menyaring / memilih baris — bukan isian yang perlu disimpan.
  var ABAIKAN_KONTROL = [
    // Pemilih mapel/kelas untuk membuka halaman (guru)
    '#selPilihMapel', '#selPilihKelas', '#selPilihMapelSaja',
    // Cari, urut, filter (admin & guru)
    '#sCari', '#sSortBy', '#sFilterKelas', '#sFilterStatus',
    '#legerCari', '#legerWaliCari',
    // Pemilih untuk menampilkan tabel / rekap / pratinjau (admin)
    '#pklGuru', '#pklKelas', '#pklGuruPenguji', '#pklKelasPenguji',
    '#pklRekapKelas', '#pesEkskul', '#pesKelas', '#rekapEkskul',
    '#nkAsal', '#nkTujuan',
    // Ceklis pemilih baris untuk "Hapus Terpilih" + "pilih semua"
    '#kSelectAll', '.kRowChk', '#mSelectAll', '.mRowChk',
    '#sSelectAll', '.sRowChk', '#gSelectAll', '.gRowChk',
    '#pSelectAll', '.pRowChk', '#ekSelectAll', '.ekRowChk',
    '#pesSelectAllChk', '#pklSelectAllChk', '#pklPengujiSelectAllChk',
    // Ceklis kelas yang hanya menentukan data apa yang dimuat
    '.mtKelasChk',
    // Opsi penyusunan catatan otomatis & ceklis cetak (guru)
    '#optNilai', '#optCapaian', '#optPresensi', '#optSemangat',
    '.pkl-cetak-check', '.cetak-rapor-check', '.cetak-identitas-check',
    '#checkSemuaPklCetak', '#checkSemuaCetak', '#checkSemuaIdent'
  ].join(', ');

  var TIPE_BUKAN_DATA = { file: 1, button: 1, submit: 1, reset: 1, image: 1, hidden: 1 };

  // Tombol yang dianggap "menyimpan": type=submit di dalam form,
  // atau tulisan/id-nya mengandung kata-kata ini.
  var TEKS_SIMPAN = /simpan|tambah|tetapkan|tugaskan|proses|terapkan|perbarui/i;

  var PESAN_PINDAH =
    'Ada isian yang belum disimpan.\n\n' +
    'Kalau kamu pindah sekarang, perubahan tersebut akan HILANG.\n\n' +
    'Klik "OK" untuk tetap pindah TANPA menyimpan, atau "Batal" untuk kembali dan menyimpan dulu.';
  var PESAN_MENYIMPAN =
    'Penyimpanan data sedang berjalan.\n\n' +
    'Kalau kamu pindah sekarang, sebagian data bisa GAGAL tersimpan.\n\n' +
    'Klik "Batal" untuk menunggu sampai selesai (disarankan), atau "OK" untuk tetap pindah.';
  var PESAN_TUTUP =
    'Ada isian di formulir ini yang belum disimpan.\n\n' +
    'Kalau ditutup sekarang, isian tersebut akan HILANG.\n\n' +
    'Klik "OK" untuk menutup TANPA menyimpan, atau "Batal" untuk kembali ke formulir.';
  var PESAN_MUAT_ULANG =
    'Ada isian di bagian ini yang belum disimpan.\n\n' +
    'Kalau dilanjutkan, isian tersebut akan HILANG.\n\n' +
    'Klik "OK" untuk melanjutkan TANPA menyimpan, atau "Batal" untuk kembali.';

  // ---------- Nilai dasar tiap field ----------
  var dasar = new WeakMap();      // field -> nilai dasar (string)
  var bukanData = new WeakSet();  // cache: kontrol yang bukan isian data

  function kontrolData(el) {
    if (bukanData.has(el)) return false;
    var ok = true;
    if (el.tagName === 'INPUT' && TIPE_BUKAN_DATA[(el.type || '').toLowerCase()]) ok = false;
    else if (!el.closest(AREA_FORM)) ok = false;
    else if (el.closest(ABAIKAN_WADAH) || el.matches(ABAIKAN_KONTROL)) ok = false;
    if (!ok) bukanData.add(el);
    return ok;
  }

  function daftarKontrol(root) {
    var hasil = [];
    var awal = (root && root.querySelectorAll) ? root : document;
    var nodes = awal.querySelectorAll('input, textarea, select');
    for (var i = 0; i < nodes.length; i++) {
      if (kontrolData(nodes[i])) hasil.push(nodes[i]);
    }
    return hasil;
  }

  function nilaiSekarang(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.checked ? '1' : '0';
    if (el.tagName === 'SELECT' && el.multiple) {
      return Array.prototype.filter.call(el.options, function (o) { return o.selected; })
        .map(function (o) { return o.value; }).join('\u0001');
    }
    return el.value;
  }

  // Cadangan kalau event input/change datang untuk field yang belum
  // sempat dicatat: pakai nilai bawaan dari markup HTML-nya.
  function nilaiMarkup(el) {
    if (el.type === 'checkbox' || el.type === 'radio') return el.defaultChecked ? '1' : '0';
    if (el.tagName === 'SELECT') {
      if (el.multiple) {
        return Array.prototype.filter.call(el.options, function (o) { return o.defaultSelected; })
          .map(function (o) { return o.value; }).join('\u0001');
      }
      for (var i = 0; i < el.options.length; i++) {
        if (el.options[i].defaultSelected) return el.options[i].value;
      }
      return el.options.length ? el.options[0].value : '';
    }
    return el.defaultValue;
  }

  // Catat nilai dasar untuk field yang BELUM pernah dicatat. Dipanggil
  // tepat sebelum interaksi pengguna, jadi nilainya masih "asli".
  function catatDasarBaru() {
    var list = daftarKontrol(document);
    for (var i = 0; i < list.length; i++) {
      if (!dasar.has(list[i])) dasar.set(list[i], nilaiSekarang(list[i]));
    }
  }

  // ---------- Cakupan (scope) ----------
  // scope = { selector: '...' } atau { el: Element }
  function dalamScope(el, scope) {
    if (!scope) return true;
    if (scope.selector) return el.matches(scope.selector);
    return !!scope.el && scope.el.contains(el);
  }

  function tentukanScope(tombol) {
    var eksplisit = tombol.getAttribute('data-guard-scope');
    if (eksplisit) return { selector: eksplisit };
    var el = tombol.closest('form, .modal-box, tr, .collapsible-body') ||
      document.getElementById('content') || document.body;
    return { el: el };
  }

  function scopeDariArgumen(arg) {
    if (!arg) return null;
    if (typeof arg === 'string') return { selector: arg };
    return { el: arg };
  }

  // Jadikan isian SAAT INI sebagai kondisi tersimpan.
  function tetapkanDasar(scope) {
    var list = daftarKontrol(document);
    for (var i = 0; i < list.length; i++) {
      if (dalamScope(list[i], scope)) dasar.set(list[i], nilaiSekarang(list[i]));
    }
  }

  // ---------- Sesi simpan ----------
  // Klik tombol simpan membuka "sesi". Kalau sesudahnya ada permintaan
  // tulis ke Supabase dan SEMUANYA berhasil, isian di cakupan tombol
  // itu dianggap tersimpan. Kalau gagal atau tidak ada permintaan tulis
  // (mis. validasi form menolak), isian tetap dianggap belum tersimpan.
  //   status 'siaga'   : tombol diklik, belum ada permintaan tulis
  //   status 'menulis' : ada permintaan tulis yang berjalan/selesai
  var sesiList = [];
  var tulisAktif = 0;

  function buangSesi(s) {
    clearTimeout(s.timer);
    clearTimeout(s.kadaluarsa);
    var i = sesiList.indexOf(s);
    if (i >= 0) sesiList.splice(i, 1);
  }

  function mulaiSesi(scope) {
    var s = { scope: scope, status: 'siaga', ok: 0, gagal: 0, timer: null };
    // Kalau dalam 10 detik tidak ada permintaan tulis, sesi dibuang.
    s.kadaluarsa = setTimeout(function () { if (s.status === 'siaga') buangSesi(s); }, 10000);
    sesiList.push(s);
  }

  // Interaksi baru sebelum ada permintaan tulis = simpan tadi tidak
  // menghasilkan penulisan (mis. validasi gagal): sesi dibuang.
  function tutupSesiSiaga() {
    sesiList.filter(function (s) { return s.status === 'siaga'; }).forEach(buangSesi);
  }

  function selesaiSesi(s) {
    buangSesi(s);
    if (s.gagal === 0 && s.ok > 0) tetapkanDasar(s.scope);
  }

  function catatTulisMulai() {
    tulisAktif++;
    sesiList.forEach(function (s) {
      if (s.status === 'siaga') s.status = 'menulis';
      clearTimeout(s.timer);
    });
  }

  function catatTulisSelesai(berhasil) {
    tulisAktif = Math.max(0, tulisAktif - 1);
    sesiList.forEach(function (s) {
      if (s.status !== 'menulis') return;
      if (berhasil) s.ok++; else s.gagal++;
    });
    if (tulisAktif > 0) return;
    // Beri jeda singkat: simpan biasanya terdiri dari beberapa
    // permintaan berurutan (hapus lalu tulis ulang).
    sesiList.forEach(function (s) {
      if (s.status !== 'menulis') return;
      clearTimeout(s.timer);
      s.timer = setTimeout(function () { selesaiSesi(s); }, 600);
    });
  }

  // Field yang penyimpanannya SUDAH selesai tetapi belum "dikunci" (masih
  // dalam jeda 600 ms) tidak dianggap perubahan, supaya klik "Simpan"
  // lalu pindah menu sesaat setelah selesai tidak diperingatkan palsu.
  // (Selama permintaan tulis masih berjalan, pindah menu diperingatkan
  // dengan pesan tersendiri — lihat cegatKalauPerlu.)
  function sedangMenyimpan(el) {
    return sesiList.some(function (s) {
      return s.status === 'menulis' && dalamScope(el, s.scope);
    });
  }

  // ---------- Deteksi simpan berhasil ----------
  // Semua permintaan tulis ke Supabase (REST maupun Edge Function)
  // lewat fetch. Karena itu fetch dibungkus di sini. File ini harus
  // dimuat SEBELUM supabase-client.js supaya klien Supabase memakai
  // fetch yang sudah dibungkus.
  var fetchAsli = window.fetch;
  if (typeof fetchAsli === 'function') {
    window.fetch = function (input, init) {
      var url = '';
      var method = 'GET';
      try {
        url = typeof input === 'string' ? input : ((input && input.url) || String(input));
        method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (err) { /* abaikan */ }

      var promise = fetchAsli.apply(window, arguments);
      var tulis = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' &&
        /\/(rest|functions)\/v1\//.test(url);
      if (!tulis) return promise;

      catatTulisMulai();
      return promise.then(function (res) {
        catatTulisSelesai(!!(res && res.ok));
        return res;
      }, function (err) {
        catatTulisSelesai(false);
        throw err;
      });
    };
  }

  // ---------- Pengecekan perubahan ----------
  function adaPerubahan(root, opsi) {
    var abaikanSaatMenyimpan = !!(opsi && opsi.abaikanSaatMenyimpan);
    var list = daftarKontrol(root || document);
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!dasar.has(el)) continue;                          // belum pernah disentuh
      if (dasar.get(el) === nilaiSekarang(el)) continue;     // sama seperti semula
      if (abaikanSaatMenyimpan && sedangMenyimpan(el)) continue;
      return true;
    }
    return false;
  }

  // ---------- Konfirmasi ----------
  var lewatiUnloadSampai = 0;

  // Mengembalikan true kalau aksi DIBATALKAN (pengguna memilih tetap di
  // halaman), false kalau aksi boleh lanjut.
  function cegatKalauPerlu(e, wilayah, pesan, keluarHalaman) {
    // Pindah halaman di TENGAH penyimpanan berbahaya: handler simpan
    // biasanya membaca isi layar setelah menunggu server, jadi kalau
    // layar sudah diganti, sisa penyimpanan bisa gagal.
    var sedangBerjalan = wilayah === document && tulisAktif > 0 &&
      sesiList.some(function (s) { return s.status === 'menulis'; });
    if (sedangBerjalan) pesan = PESAN_MENYIMPAN;
    else if (!adaPerubahan(wilayah, { abaikanSaatMenyimpan: true })) return false;
    if (window.confirm(pesan)) {
      // Sudah setuju membuang perubahan: jangan tanya lagi lewat dialog
      // bawaan browser (mis. saat "Keluar" berujung pindah halaman).
      if (keluarHalaman) lewatiUnloadSampai = Date.now() + 10000;
      return false;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    return true;
  }

  function pemicuSimpan(tombol) {
    if (tombol.hasAttribute('data-guard-scope') || tombol.hasAttribute('data-simpan')) return true;
    if (tombol.disabled) return false;
    var tipe = (tombol.getAttribute('type') || (tombol.tagName === 'BUTTON' ? 'submit' : '')).toLowerCase();
    if (tipe === 'submit' && tombol.form) return true;
    return TEKS_SIMPAN.test((tombol.id || '') + ' ' + (tombol.textContent || tombol.value || ''));
  }

  // ---------- Pemasangan listener (fase capture di document) ----------
  // Fase capture membuat pengecekan berjalan LEBIH DULU daripada
  // handler klik milik tiap menu/tombol; kalau pengguna membatalkan,
  // handler aslinya tidak pernah terpanggil.

  // Catat nilai dasar tepat sebelum pengguna mengubah sesuatu.
  ['pointerdown', 'keydown', 'focusin', 'beforeinput'].forEach(function (nama) {
    document.addEventListener(nama, function (e) {
      catatDasarBaru();
      if (nama === 'pointerdown' || nama === 'keydown') {
        if (e.isTrusted) tutupSesiSiaga();
      }
    }, true);
  });

  // Cadangan: kalau ada perubahan yang lolos dari event di atas, pakai
  // nilai bawaan markup sebagai nilai dasar.
  ['input', 'change'].forEach(function (nama) {
    document.addEventListener(nama, function (e) {
      var t = e.target;
      if (!e.isTrusted || !t || !t.tagName || dasar.has(t)) return;
      if (kontrolData(t)) dasar.set(t, nilaiMarkup(t));
    }, true);
  });

  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return;   // hanya klik pengguna sungguhan
    var t = e.target;
    if (!t || !t.closest) return;

    // 1) Pindah menu sidebar / Keluar
    if (t.closest('.sidebar .menu-item, #logoutBtn')) {
      // Dialog bawaan browser hanya dilewati untuk "Keluar" (yang berujung
      // pindah halaman). Pindah menu biasa tetap dilindungi.
      cegatKalauPerlu(e, document, PESAN_PINDAH, !!t.closest('#logoutBtn'));
      return;
    }

    // 2) Tutup modal: tombol ×, Batal, atau klik area gelap
    var overlay = null;
    if (t.classList.contains('modal-overlay')) overlay = t;
    else if (t.closest('.modal-box__close, #modalCancelBtn')) overlay = t.closest('.modal-overlay');
    if (overlay) {
      cegatKalauPerlu(e, overlay, PESAN_TUTUP, false);
      return;
    }

    // 3) Batal pada edit baris inline
    var batal = t.closest('[data-batal]');
    if (batal) {
      cegatKalauPerlu(e, batal.closest('tr') || document, PESAN_TUTUP, false);
      return;
    }

    // 4) Tombol yang memuat ulang satu wilayah halaman
    var nav = t.closest('[data-guard-nav]');
    if (nav) {
      var wilayah = document.querySelector(nav.getAttribute('data-guard-nav'));
      if (wilayah && cegatKalauPerlu(e, wilayah, PESAN_MUAT_ULANG, false)) return;
    }

    // 5) Tombol simpan: buka sesi untuk mendeteksi simpan berhasil
    var tombol = t.closest('button, input[type="submit"], [data-simpan], [data-guard-scope]');
    if (tombol && pemicuSimpan(tombol)) mulaiSesi(tentukanScope(tombol));
  }, true);

  // Submit form (termasuk tekan Enter di kolom teks).
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.closest) mulaiSesi({ el: f });
  }, true);

  // Refresh / tutup tab / pindah alamat.
  window.addEventListener('beforeunload', function (e) {
    if (Date.now() < lewatiUnloadSampai) return;
    if (!adaPerubahan(document)) return;
    e.preventDefault();
    e.returnValue = '';
  });

  // ---------- API publik ----------
  window.UnsavedGuard = {
    hasChanges: function (root) { return adaPerubahan(root || document); },
    markSaved: function (scope) { tetapkanDasar(scopeDariArgumen(scope)); }
  };
})();
