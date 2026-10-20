/* =========================================================
 * SAMBUTAN-GURU — Pop up kalimat penyemangat setelah guru login
 *
 * Alur:
 *  1. index.html memasang penanda "baru login" (sessionStorage)
 *     begitu login guru berhasil (admin tidak).
 *  2. portal.html (Menu Utama, halaman pertama setelah login)
 *     memanggil SambutanGuru.tampilkanJikaBaruLogin(nama) setelah
 *     nama guru dimuat. Penanda langsung dihapus, jadi pop up muncul
 *     SEKALI per login (refresh halaman tidak memunculkannya lagi,
 *     dan masuk ke E-Rapor tidak memunculkannya).
 *
 * Pop up berisi salam sesuai jam + nama guru, satu kalimat
 * penyemangat acak (ada unsur komedinya), dan — kalau waktu sholat
 * sedang berjalan — pengingat untuk sholat dulu.
 * Kalimat yang sama tidak muncul dua kali berturut-turut di
 * peramban yang sama.
 *
 * Waktu sholat dihitung langsung di peramban (tanpa internet),
 * metode Kemenag RI (Subuh 20°, Isya 18°, ihtiyath +2 menit) untuk
 * Tambak, Banyumas, zona WIB. Ubah LOKASI di bawah kalau perlu.
 *
 * Menambah kalimat: cukup tambah satu baris {ikon, teks} di KALIMAT.
 * Di dalam teks, {nama} akan diganti nama guru.
 * ========================================================= */
(function () {
  'use strict';
  if (window.SambutanGuru) return;

  var KUNCI_BARU_LOGIN = 'erapor_sambutan_baru_login';
  var KUNCI_TERAKHIR = 'erapor_sambutan_terakhir';

  var KALIMAT = [
    { ikon: '☕', teks: 'Kopi sudah siap, E-Rapor sudah siap di layar. Tinggal satu yang belum siap: tumpukan nilai yang menunggu dicintai. Semangat!' },
    { ikon: '🍌', teks: 'Semangat dan pisang goreng itu sama-sama paling enak kalau masih hangat. Yuk, mulai isi nilainya selagi hangat!' },
    { ikon: '🍚', teks: 'Mengisi nilai itu seperti menanak nasi: sabar, api kecil, dan jangan sering-sering dibuka tutupnya. Hasilnya pasti pulen!' },
    { ikon: '💪', teks: 'Kalau {nama} sanggup menghadapi satu kelas penuh setiap hari, menuntaskan rapor satu kelas pasti juga sanggup. Bismillah, gas!' },
    { ikon: '🍵', teks: 'Siswa boleh lupa PR, tapi kita jangan lupa minum. Segelas teh hangat sebelum mengisi nilai itu investasi yang bagus!' },
    { ikon: '🍳', teks: 'Kolom nilai yang masih kosong itu seperti wajan sebelum diisi: bersih dan penuh harapan. Yuk, diisi pelan-pelan!' },
    { ikon: '🧂', teks: 'Rapor yang dicicil hari ini adalah ketenangan di akhir semester. Koki pun menyiapkan bumbu dulu sebelum masak. Kita siapkan nilainya dulu!' },
    { ikon: '😄', teks: 'Tugas Anda mulia: membuat siswa bangga lewat rapor. Dan membuat diri sendiri bangga karena tidak mengebut di menit terakhir!' },
    { ikon: '🌟', teks: 'Guru hebat bukan yang tidak pernah lelah, tapi yang tahu kapan harus istirahat sebentar lalu lanjut lagi. Boleh tarik napas dulu!' },
    { ikon: '📊', teks: 'Fun fact: 9 dari 10 salah input nilai terjadi saat perut kosong. (Datanya karangan sendiri, tapi terdengar meyakinkan.) Isi perut dulu, baru simpan nilai!' },
    { ikon: '🎯', teks: 'Target hari ini sederhana: nilai terisi, siswa tersenyum, dan Anda pulang dengan hati ringan.' },
    { ikon: '🧘', teks: 'Tarik napas... hembuskan... Kalau nilainya terasa banyak, ingat: panci sebesar apa pun lama-lama habis kalau diambil satu sendok demi satu sendok.' },
    { ikon: '🔥', teks: 'Semangat menyala! Semoga koneksi internet hari ini selancar gorengan meluncur ke piring: cepat, lancar, tanpa hambatan.' },
    { ikon: '🤝', teks: 'Guru dan E-Rapor punya kesamaan: sama-sama bekerja keras supaya semua orang tenang. Yang satu mendidik, yang satu menghitung.' },
    { ikon: '🌶️', teks: 'Nilai yang dicicil itu seperti sambal: sedikit-sedikit, tapi bikin hari lebih bersemangat. Mulai dari satu kelas dulu ya!' },
    { ikon: '🎉', teks: 'Halo, {nama}! Hari ini Anda selangkah lebih dekat ke rapor yang selesai. Selangkah demi selangkah, lama-lama sampai!' },
    { ikon: '🧩', teks: 'Kalau ada TP yang bikin bingung, ingat: resep serumit apa pun jadi enak kalau dikerjakan langkah demi langkah.' },
    { ikon: '🐢', teks: 'Pelan-pelan tidak apa-apa. Air tidak bisa dipaksa cepat mendidih, tapi tetap mendidih pada waktunya. Rapor pun begitu!' },
    { ikon: '🫖', teks: 'Pengumuman: teh manis dipercaya menaikkan semangat mengisi nilai hingga 200%. Belum ada penelitian resmi, tapi sudah terbukti oleh pengalaman kita bersama.' },
    { ikon: '🎒', teks: 'Siswa-siswa beruntung punya guru yang mau repot menilai dengan teliti. Terima kasih sudah teliti!' },
    { ikon: '📝', teks: 'Jangan lupa klik Simpan sebelum pindah halaman. Seperti mematikan kompor sebelum pergi: kebiasaan kecil yang menyelamatkan banyak hal!' },
    { ikon: '🥁', teks: 'Drum roll... Guru paling berdedikasi hari ini adalah {nama}! Hadiahnya: tepuk tangan meriah dari seluruh kolom nilai.' },
    { ikon: '🌈', teks: 'Kadang rapor terasa seperti soal cerita yang tidak ada habisnya. Tenang, antrean sepanjang apa pun selesai kalau dikerjakan satu per satu.' },
    { ikon: '😎', teks: 'Bekerja cerdas itu penting. Bekerja cerdas sambil ditemani minuman hangat itu lebih penting. Selamat bekerja!' },
    { ikon: '🎈', teks: 'Satu nilai lagi, satu senyum siswa lagi. Hidup ini sederhana, ayo dinikmati!' },
    { ikon: '🦸', teks: 'Tanpa jubah pun Anda tetap pahlawan: pahlawan kelas, pahlawan rapor, pahlawan yang jarang diberi tepuk tangan. Hari ini kami tepuk tangan dulu!' },
    { ikon: '💡', teks: 'Tips hari ini: isi nilai TP, PTS, dan PAS, lalu sisanya biar E-Rapor yang menghitung. Anda tinggal duduk manis.' },
    { ikon: '🌤️', teks: '{nama}, semoga hari ini hatinya sejuk, sinyalnya lancar, dan kopinya tidak keburu dingin.' },
    { ikon: '🎶', teks: 'Kalau rapor bisa bernyanyi, ia akan menyanyikan terima kasih untuk Anda.' },
    { ikon: '🏆', teks: 'Ada dua hal di sekolah ini yang tidak pernah mengecewakan: kerja keras para guru dan sambal kantin. Terima kasih sudah menjadi bagian dari yang pertama!' },
    { ikon: '🥘', teks: 'Kata orang, rapor itu ibarat opor: kalau dimasak terburu-buru, rasanya kurang mantap. Dinilai dengan teliti, hasilnya pasti mantap!' },
    { ikon: '🍢', teks: 'Nilai TP yang lengkap itu seperti sate tusuk: tersusun rapi, tidak ada yang terlewat, dan bikin senang yang melihatnya.' },
    { ikon: '🧊', teks: 'Kalau kepala mulai panas gara-gara rapor, es teh siap mendinginkan. Kalau es tehnya habis, ingat saja: Anda sudah berjuang hebat!' },
    { ikon: '🥜', teks: 'Kerupuk renyah karena digoreng dengan sabar. Nilai akurat karena diisi dengan teliti. Hasil bagus memang butuh proses!' },
    { ikon: '⏰', teks: 'Bel tenggat rapor belum berbunyi, jadi masih ada waktu untuk mencicil. Manfaatkan ya!' },
    { ikon: '🛠️', teks: 'Kalau laptop mendadak lemot, tarik napas dulu. Kompor yang ngambek saja akhirnya menyala juga. Coba muat ulang halamannya!' },
    { ikon: '🍜', teks: 'Rapor yang dicicil dari sekarang pasti lebih tenang daripada yang dikebut semalam. Mi instan saja butuh tiga menit!' },
    { ikon: '📅', teks: 'Tenggat itu seperti antrean nasi: yang datang lebih awal dapat yang paling hangat. Yuk, cicil nilainya hari ini!' },
    { ikon: '🎓', teks: 'Setiap nilai yang Anda isi adalah harapan kecil untuk masa depan siswa. Terima kasih sudah menjaga harapan itu.' },
    { ikon: '🍞', teks: 'Sarapan menguatkan badan, semangat menguatkan sekolah. Selamat bekerja, dan jangan lupa makan!' },
    { ikon: '🥄', teks: 'Kalkulator E-Rapor tahu nilainya, dan Anda tahu siswa-siswa Anda. Tim yang lengkap!' },
    { ikon: '🍲', teks: 'Tumpukan nilai itu ibarat panci besar: kelihatannya banyak, tapi kalau diambil satu sendok demi satu sendok, lama-lama habis juga.' },
    { ikon: '🎤', teks: 'Cek, cek, satu dua. Pengumuman: kehadiran {nama} bikin hari ini lebih semangat. Sekian dan terima kasih!' },
    { ikon: '🚦', teks: 'Lampu hijau untuk hari ini: nilai boleh diisi, rapor boleh dicicil, dan camilan boleh dinikmati (secukupnya, ya).' },
    { ikon: '🕵️', teks: 'Detektif nilai sedang bertugas mencari kolom yang belum terisi. Kasus segera terpecahkan!' },
    { ikon: '🎨', teks: 'Rapor itu karya seni, dan guru adalah senimannya. Kanvasnya kolom nilai, catnya ketelitian.' },
    { ikon: '🧮', teks: 'Rumus rahasia hari ini: (nilai diisi teliti × semangat) + segelas teh = guru bahagia. Terbukti secara tidak ilmiah.' },
    { ikon: '🌻', teks: 'Semoga hari ini murid-murid rajin, sinyal jinak, dan tidak ada nilai yang tersimpan di kolom yang salah.' },
    { ikon: '🥳', teks: 'Selamat, {nama}! Anda berhasil login, dan itu sudah setengah dari perjuangan. Setengah lainnya tinggal klik Simpan.' },
    { ikon: '🍛', teks: 'Pelan tapi pasti, seperti nasi yang matang tanpa perlu diteriaki. Nilai pun begitu: diisi dengan tenang, hasilnya juga tenang.' },
    { ikon: '🧯', teks: 'Kalau ada kolom nilai yang bikin pusing, tenang, ada tombol Simpan yang siap menyelamatkan data.' },
    { ikon: '🏃', teks: 'Jangan menunggu semuanya sempurna untuk mulai. Kompor dinyalakan dulu, rasanya disempurnakan sambil jalan.' },
    { ikon: '🌙', teks: 'Rapor yang baik lahir dari guru yang cukup istirahat dan cukup makan. Jangan lupa dua-duanya!' },
    { ikon: '🧠', teks: 'Otak yang lelah butuh dua hal: istirahat dan camilan hangat. Otak yang segar cukup satu: lanjutkan saja mengisi nilainya!' },
    { ikon: '🌊', teks: 'Tumpukan tugas terasa seperti ombak? Tenang, ombak apa pun bisa dilewati kalau dihadapi satu per satu.' },
    { ikon: '🛎️', teks: 'Ting! Notifikasi dari semangat: Anda sudah login, nilai menanti. Hari ini pasti lancar!' },
    { ikon: '🤗', teks: 'Terima kasih sudah setia mendampingi siswa-siswa kita. Jangan lupa makan, ya.' }
  ];


  // ---------- Waktu sholat (hitung lokal, metode Kemenag RI) ----------
  var LOKASI = { lat: -7.62, lng: 109.42, zona: 7 };   // Tambak, Banyumas, WIB
  var IHTIYATH_MENIT = 2;

  function rad(d) { return d * Math.PI / 180; }
  function deg(r) { return r * 180 / Math.PI; }
  function fix(x, n) { x = x % n; return x < 0 ? x + n : x; }

  // Jam desimal (waktu lokal WIB) untuk tanggal kalender y-m-d.
  function hitungWaktuSholat(y, m, d) {
    var jd = Date.UTC(y, m - 1, d, 12) / 86400000 + 2440587.5;
    var D = jd - 2451545.0;
    var g = fix(357.529 + 0.98560028 * D, 360);
    var q = fix(280.459 + 0.98564736 * D, 360);
    var L = fix(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)), 360);
    var e = 23.439 - 0.00000036 * D;
    var RA = fix(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(L)), Math.cos(rad(L)))), 360) / 15;
    var eqt = q / 15 - RA;
    if (eqt > 12) eqt -= 24; if (eqt < -12) eqt += 24;
    var decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(L))));
    var zuhur = 12 + LOKASI.zona - LOKASI.lng / 15 - eqt;

    function selisih(sudut) {   // jam dari zuhur sampai matahari di bawah/atas 'sudut'
      var c = (-Math.sin(rad(sudut)) - Math.sin(rad(LOKASI.lat)) * Math.sin(rad(decl))) /
              (Math.cos(rad(LOKASI.lat)) * Math.cos(rad(decl)));
      return deg(Math.acos(Math.max(-1, Math.min(1, c)))) / 15;
    }
    var sudutAsar = -deg(Math.atan(1 / (1 + Math.tan(rad(Math.abs(LOKASI.lat - decl))))));
    var ih = IHTIYATH_MENIT / 60;
    return {
      subuh:   zuhur - selisih(20) + ih,
      terbit:  zuhur - selisih(0.833),
      zuhur:   zuhur + ih,
      asar:    zuhur + selisih(sudutAsar) + ih,
      maghrib: zuhur + selisih(0.833) + ih,
      isya:    zuhur + selisih(18) + ih
    };
  }

  function format(jamDesimal) {
    var mnt = Math.round(jamDesimal * 60);
    var h = Math.floor(mnt / 60) % 24, m = mnt % 60;
    return (h < 10 ? '0' : '') + h + '.' + (m < 10 ? '0' : '') + m;
  }

  // Sholat fardhu yang waktunya sedang berjalan sekarang (WIB), atau null.
  // Subuh sampai terbit; Zuhur sampai Asar; Asar sampai Maghrib;
  // Maghrib sampai Isya; Isya sampai Subuh berikutnya.
  // Antara terbit dan Zuhur tidak ada pengingat.
  function sholatBerjalan(sekarang) {
    var wib = new Date((sekarang || new Date()).getTime() + LOKASI.zona * 3600000);
    var t = hitungWaktuSholat(wib.getUTCFullYear(), wib.getUTCMonth() + 1, wib.getUTCDate());
    var jam = wib.getUTCHours() + wib.getUTCMinutes() / 60;
    if (jam < t.subuh)   return { nama: 'Isya',    mulai: null };   // lewat tengah malam, masih waktu Isya
    if (jam < t.terbit)  return { nama: 'Subuh',   mulai: t.subuh };
    if (jam < t.zuhur)   return null;
    if (jam < t.asar)    return { nama: 'Zuhur',   mulai: t.zuhur };
    if (jam < t.maghrib) return { nama: 'Asar',    mulai: t.asar };
    if (jam < t.isya)    return { nama: 'Maghrib', mulai: t.maghrib };
    return { nama: 'Isya', mulai: t.isya };
  }

  function pengingatSholat() {
    var s = sholatBerjalan();
    if (!s) return null;
    var info = s.mulai == null
      ? 'Waktu Isya masih berjalan.'
      : 'Waktu ' + s.nama + ' sudah masuk sejak pukul ' + format(s.mulai) + ' WIB.';
    return { nama: s.nama, teks: info + ' Kalau belum, sholat ' + s.nama + ' dulu ya. Pekerjaan bisa menunggu, ibadah jangan ditunda.' };
  }

  function salamWaktu() {
    var jam = new Date().getHours();
    if (jam < 11) return 'Selamat pagi';
    if (jam < 15) return 'Selamat siang';
    if (jam < 18) return 'Selamat sore';
    return 'Selamat malam';
  }

  function esc(t) {
    return String(t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Pilih kalimat acak yang berbeda dari yang terakhir tampil.
  function pilihKalimat() {
    var terakhir = -1;
    try { terakhir = parseInt(localStorage.getItem(KUNCI_TERAKHIR), 10); } catch (e) { /* abaikan */ }
    var idx;
    do { idx = Math.floor(Math.random() * KALIMAT.length); }
    while (KALIMAT.length > 1 && idx === terakhir);
    try { localStorage.setItem(KUNCI_TERAKHIR, String(idx)); } catch (e) { /* abaikan */ }
    return KALIMAT[idx];
  }

  function tampilkan(namaGuru) {
    var nama = (namaGuru || '').trim() || 'Bapak/Ibu Guru';
    var k = pilihKalimat();
    var sholat = pengingatSholat();
    var teks = esc(k.teks).replace(/\{nama\}/g, '<strong>' + esc(nama) + '</strong>');

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay modal-overlay--sambutan';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'sambutanJudul');
    overlay.innerHTML =
      '<div class="modal-box sambutan-box">' +
      '<div class="sambutan-ikon" aria-hidden="true">' + k.ikon + '</div>' +
      '<div class="sambutan-judul" id="sambutanJudul">' + esc(salamWaktu()) + ', ' + esc(nama) + '!</div>' +
      (sholat
        ? '<div class="sambutan-sholat" role="note"><span aria-hidden="true">🕌</span><span>' + esc(sholat.teks) + '</span></div>'
        : '') +
      '<p class="sambutan-teks">' + teks + '</p>' +
      '<button type="button" class="btn-small btn-small--primary sambutan-tutup">' +
        (sholat ? 'Baik, sholat dulu 🤲' : 'Siap, semangat! 💪') + '</button>' +
      '</div>';
    document.body.appendChild(overlay);

    function tutup() {
      overlay.remove();
      document.removeEventListener('keydown', saatTombol);
    }
    function saatTombol(e) { if (e.key === 'Escape') tutup(); }

    var tombol = overlay.querySelector('.sambutan-tutup');
    tombol.addEventListener('click', tutup);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) tutup(); });
    document.addEventListener('keydown', saatTombol);
    tombol.focus();
  }

  // Dipanggil guru.html. Hanya menampilkan kalau penanda "baru login" ada,
  // lalu langsung menghapusnya.
  function tampilkanJikaBaruLogin(namaGuru) {
    var baru = false;
    try {
      baru = sessionStorage.getItem(KUNCI_BARU_LOGIN) === '1';
      sessionStorage.removeItem(KUNCI_BARU_LOGIN);
    } catch (e) { /* penyimpanan diblokir: lewati saja */ }
    if (baru) tampilkan(namaGuru);
  }

  window.SambutanGuru = {
    tampilkanJikaBaruLogin: tampilkanJikaBaruLogin,
    tampilkan: tampilkan,
    KUNCI_BARU_LOGIN: KUNCI_BARU_LOGIN,
    jumlahKalimat: KALIMAT.length,
    sholatBerjalan: sholatBerjalan,
    hitungWaktuSholat: hitungWaktuSholat
  };
})();
