/* =========================================================
 * SAMBUTAN-GURU — Pop up kalimat penyemangat setelah guru login
 *
 * Alur:
 *  1. index.html memasang penanda "baru login" (sessionStorage)
 *     begitu login guru berhasil.
 *  2. guru.html memanggil SambutanGuru.tampilkanJikaBaruLogin(nama)
 *     setelah nama guru dimuat. Penanda langsung dihapus, jadi pop up
 *     muncul SEKALI per login (refresh halaman tidak memunculkannya
 *     lagi).
 *
 * Pop up berisi salam sesuai jam + nama guru, lalu satu kalimat
 * penyemangat acak (ada unsur komedinya, dan selalu ada Pak Sugeng).
 * Kalimat yang sama tidak muncul dua kali berturut-turut di
 * peramban yang sama.
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
    { ikon: '☕', teks: 'Kopi Pak Sugeng sudah siap di dapur, E-Rapor sudah siap di layar. Tinggal satu yang belum siap: tumpukan nilai yang menunggu dicintai. Semangat!' },
    { ikon: '🍌', teks: 'Pesan dari dapur: pisang goreng Pak Sugeng dan semangat itu sama-sama paling enak kalau masih hangat. Yuk, mulai isi nilainya selagi hangat!' },
    { ikon: '🍚', teks: 'Mengisi nilai itu seperti menanak nasi ala Pak Sugeng: sabar, api kecil, dan jangan sering-sering dibuka tutupnya. Hasilnya pasti pulen!' },
    { ikon: '💪', teks: 'Kalau Pak Sugeng sanggup memasak untuk satu sekolah tanpa mengeluh, {nama} pasti sanggup menuntaskan rapor satu kelas. Bismillah, gas!' },
    { ikon: '🍵', teks: 'Siswa boleh lupa PR, tapi kita jangan lupa minum. Pak Sugeng sudah menyiapkan teh hangat, tinggal diambil di dapur!' },
    { ikon: '🍳', teks: 'Kolom nilai yang masih kosong itu seperti wajan Pak Sugeng sebelum diisi: bersih dan penuh harapan. Yuk, diisi pelan-pelan!' },
    { ikon: '🧂', teks: 'Rapor yang dicicil hari ini adalah ketenangan di akhir semester. Pak Sugeng pun menyiapkan bumbu dulu sebelum masak. Kita siapkan nilainya dulu!' },
    { ikon: '😄', teks: 'Tugas Anda mulia: membuat siswa bangga lewat rapor. Tugas Pak Sugeng juga mulia: membuat Anda bahagia lewat gorengan. Kita saling menguatkan!' },
    { ikon: '🌟', teks: 'Guru hebat bukan yang tidak pernah lelah, tapi yang tahu di mana Pak Sugeng menyimpan camilan. Istirahat sebentar boleh, lalu lanjut lagi!' },
    { ikon: '📊', teks: 'Fun fact: 9 dari 10 salah input nilai terjadi saat perut kosong. (Datanya karangan sendiri, tapi Pak Sugeng menyetujui.) Isi perut dulu, baru simpan nilai!' },
    { ikon: '🎯', teks: 'Target hari ini sederhana: nilai terisi, siswa tersenyum, dan Pak Sugeng tidak perlu mengingatkan jam makan lebih dari dua kali.' },
    { ikon: '🧘', teks: 'Tarik napas... hembuskan... Kalau nilainya terasa banyak, bayangkan Pak Sugeng menyiapkan nasi kotak untuk satu sekolah. Nilai satu kelas pasti lebih ringan!' },
    { ikon: '🔥', teks: 'Semangat menyala! Semoga koneksi internet hari ini selancar gorengan Pak Sugeng meluncur ke piring: cepat, lancar, tanpa hambatan.' },
    { ikon: '🤝', teks: 'Guru dan Pak Sugeng punya kesamaan: sama-sama bekerja keras di balik layar supaya semua orang kenyang. Yang satu kenyang ilmu, yang satu kenyang nasi.' },
    { ikon: '🌶️', teks: 'Nilai yang dicicil itu seperti sambal Pak Sugeng: sedikit-sedikit, tapi bikin hari lebih bersemangat. Mulai dari satu kelas dulu ya!' },
    { ikon: '🎉', teks: 'Halo, {nama}! Hari ini Anda selangkah lebih dekat ke rapor yang selesai, dan selangkah lebih dekat ke dapur Pak Sugeng. Dua-duanya layak diperjuangkan!' },
    { ikon: '🧩', teks: 'Kalau ada TP yang bikin bingung, ingat: resep serumit apa pun jadi enak kalau dikerjakan langkah demi langkah, seperti Pak Sugeng mengaduk sayur asem.' },
    { ikon: '🐢', teks: 'Pelan-pelan tidak apa-apa. Pak Sugeng juga tidak pernah memaksa air cepat mendidih, tapi air tetap mendidih pada waktunya. Rapor pun begitu!' },
    { ikon: '🫖', teks: 'Pengumuman: teh manis Pak Sugeng dipercaya menaikkan semangat mengisi nilai hingga 200%. Belum ada penelitian resmi, tapi sudah terbukti oleh pengalaman kita bersama.' },
    { ikon: '🎒', teks: 'Siswa-siswa beruntung punya guru yang mau repot menilai dengan teliti. Dari dapur, Pak Sugeng mengangguk setuju sambil membalik tempe.' },
    { ikon: '📝', teks: 'Jangan lupa klik Simpan sebelum pindah halaman. Pak Sugeng pun tidak pernah lupa mematikan kompor. Disiplin itu keren!' },
    { ikon: '🥁', teks: 'Drum roll... Guru paling berdedikasi hari ini adalah {nama}! Hadiahnya: senyum Pak Sugeng dan sepiring semangat dari dapur (gorengan menyusul kalau masih ada).' },
    { ikon: '🌈', teks: 'Kadang rapor terasa seperti soal cerita yang tidak ada habisnya. Tenang, Pak Sugeng sudah membuktikan bahwa antrean sepanjang apa pun selesai kalau dikerjakan satu per satu.' },
    { ikon: '😎', teks: 'Bekerja cerdas itu penting. Bekerja cerdas sambil ditemani teh buatan Pak Sugeng itu lebih penting. Selamat bekerja!' },
    { ikon: '🎈', teks: 'Satu nilai lagi, satu senyum siswa lagi. Satu gorengan lagi, satu senyum Pak Sugeng lagi. Hidup ini sederhana, ayo dinikmati!' },
    { ikon: '🦸', teks: 'Tanpa jubah dan tanpa spatula, Anda tetap pahlawan. Pak Sugeng pahlawan dapur, Anda pahlawan kelas. Duet yang sulit dikalahkan!' },
    { ikon: '💡', teks: 'Tips hari ini: isi nilai TP, PTS, dan PAS, lalu sisanya biar E-Rapor yang menghitung. Anda tinggal istirahat sambil menunggu gorengan Pak Sugeng matang.' },
    { ikon: '🌤️', teks: '{nama}, semoga hari ini hatinya sejuk, sinyalnya lancar, dan gorengan Pak Sugeng panjang umur di piring kita semua.' },
    { ikon: '🎶', teks: 'Kalau rapor bisa bernyanyi, ia akan menyanyikan terima kasih untuk Anda. Kalau Pak Sugeng bisa bernyanyi, lagunya pasti "makan dulu, baru input nilai".' },
    { ikon: '🏆', teks: 'Ada dua hal di sekolah ini yang tidak pernah mengecewakan: kerja keras para guru dan sambal Pak Sugeng. Terima kasih sudah menjadi bagian dari yang pertama!' },
    { ikon: '🥘', teks: 'Kata orang, rapor itu ibarat opor: kalau dimasak terburu-buru, rasanya kurang mantap. Pak Sugeng memasaknya pelan, kita menilainya teliti. Sama-sama mantap!' },
    { ikon: '🍢', teks: 'Nilai TP yang lengkap itu seperti sate tusuk Pak Sugeng: tersusun rapi, tidak ada yang terlewat, dan bikin senang yang melihatnya.' },
    { ikon: '🧊', teks: 'Kalau kepala mulai panas gara-gara rapor, ada es teh Pak Sugeng yang siap mendinginkan. Kalau es tehnya habis, ingat saja: Anda sudah berjuang hebat!' },
    { ikon: '🥜', teks: 'Kerupuk itu renyah karena digoreng dengan sabar oleh Pak Sugeng. Nilai itu akurat karena diisi dengan teliti oleh Anda. Hasil bagus memang butuh proses!' },
    { ikon: '⏰', teks: 'Bel istirahat berbunyi, antrean gorengan Pak Sugeng terbentuk. Bel tenggat rapor belum berbunyi, jadi masih ada waktu untuk mencicil. Manfaatkan ya!' },
    { ikon: '🛠️', teks: 'Kalau laptop mendadak lemot, tarik napas dulu. Kompor Pak Sugeng yang ngambek saja akhirnya menyala juga. Coba muat ulang halamannya!' },
    { ikon: '🍜', teks: 'Rapor selesai lebih cepat dari mi instan Pak Sugeng? Belum tentu. Tapi rapor yang dicicil dari sekarang pasti lebih tenang daripada yang dikebut semalam.' },
    { ikon: '📅', teks: 'Tenggat itu seperti antrean nasi Pak Sugeng: yang datang lebih awal dapat yang paling hangat. Yuk, cicil nilainya hari ini!' },
    { ikon: '🎓', teks: 'Setiap nilai yang Anda isi adalah harapan kecil untuk masa depan siswa. Setiap piring yang disiapkan Pak Sugeng adalah harapan kecil untuk perut mereka. Dua-duanya sama-sama berarti.' },
    { ikon: '🍞', teks: 'Masakan Pak Sugeng menguatkan badan, semangat Anda menguatkan sekolah. Selamat bekerja, dan jangan lupa makan!' },
    { ikon: '🥄', teks: 'Sendok Pak Sugeng tahu rasanya, kalkulator E-Rapor tahu nilainya, dan Anda tahu siswa-siswa Anda. Tim yang lengkap!' },
    { ikon: '🍲', teks: 'Tumpukan nilai itu ibarat panci besar Pak Sugeng: kelihatannya banyak, tapi kalau diambil satu sendok demi satu sendok, lama-lama habis juga.' },
    { ikon: '🎤', teks: 'Cek, cek, satu dua. Pengumuman dari dapur: kehadiran {nama} bikin hari ini lebih semangat, dan Pak Sugeng menitip salam sambil menggoreng tahu.' },
    { ikon: '🚦', teks: 'Lampu hijau untuk hari ini: nilai boleh diisi, rapor boleh dicicil, dan camilan Pak Sugeng boleh dinikmati (secukupnya, ya).' },
    { ikon: '🕵️', teks: 'Detektif nilai sedang bertugas mencari kolom yang belum terisi. Barang bukti: aroma gorengan Pak Sugeng dari arah dapur. Kasus segera terpecahkan!' },
    { ikon: '🎨', teks: 'Rapor itu karya seni, dan guru adalah seniman-nya. Pak Sugeng juga seniman: kanvasnya piring, catnya sambal. Dua seniman dalam satu sekolah!' },
    { ikon: '🧮', teks: 'Rumus rahasia hari ini: (nilai diisi teliti × semangat) + segelas teh Pak Sugeng = guru bahagia. Terbukti secara tidak ilmiah.' },
    { ikon: '🌻', teks: 'Semoga hari ini murid-murid rajin, sinyal jinak, dan tidak ada nilai yang tersimpan di kolom yang salah. Pak Sugeng sudah mengaminkan dari dapur.' },
    { ikon: '🥳', teks: 'Selamat, {nama}! Anda berhasil login, dan itu sudah setengah dari perjuangan. Setengah lainnya ada di dapur Pak Sugeng: bakwan yang masih hangat.' },
    { ikon: '🍛', teks: 'Pelan tapi pasti, seperti nasi Pak Sugeng yang matang tanpa perlu diteriaki. Nilai pun begitu: diisi dengan tenang, hasilnya juga tenang.' },
    { ikon: '🧯', teks: 'Kalau ada kolom nilai yang bikin pusing, tenang, ada tombol Simpan dan ada Pak Sugeng. Yang satu menyelamatkan data, yang satu menyelamatkan perut.' },
    { ikon: '🎁', teks: 'Hadiah kecil untuk Anda hari ini: kalimat semangat ini, plus kabar burung bahwa Pak Sugeng mungkin menyisakan satu bakwan. Kabar belum terkonfirmasi.' },
    { ikon: '🏃', teks: 'Jangan menunggu semuanya sempurna untuk mulai. Kompor Pak Sugeng juga dinyalakan dulu, rasanya disempurnakan sambil jalan.' },
    { ikon: '📞', teks: 'Kalau bingung soal E-Rapor, tanya sesama guru. Kalau bingung soal makan siang, tanya Pak Sugeng. Pembagian tugas yang adil!' },
    { ikon: '🌙', teks: 'Rapor yang baik lahir dari guru yang cukup istirahat dan cukup makan. Pak Sugeng menjaga yang kedua, Anda jangan lupa yang pertama.' },
    { ikon: '🍿', teks: 'Guru itu multitalenta: pandai mendidik, pandai menilai, dan pandai menemukan Pak Sugeng saat lapar. Talenta yang terakhir itu wajib dimiliki semua orang.' },
    { ikon: '🧠', teks: 'Otak yang lelah butuh dua hal: istirahat dan gorengan hangat Pak Sugeng. Otak yang segar cukup satu: lanjutkan saja mengisi nilainya!' },
    { ikon: '🌊', teks: 'Tumpukan tugas terasa seperti ombak? Tenang, Pak Sugeng sudah biasa menghadapi jam makan siang yang datang bergelombang. Ombak apa pun bisa dilewati.' },
    { ikon: '🛎️', teks: 'Ting! Notifikasi dari semangat: Anda sudah login, nilai menanti, dan Pak Sugeng sedang menggoreng sesuatu yang harum. Hari ini pasti lancar!' },
    { ikon: '🤗', teks: 'Terima kasih sudah setia mendampingi siswa-siswa kita. Pak Sugeng menitip salam dan setangkup semangat, plus satu pesan kecil: jangan lupa makan.' }
  ];

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
      '<p class="sambutan-teks">' + teks + '</p>' +
      '<button type="button" class="btn-small btn-small--primary sambutan-tutup">Siap, semangat! 💪</button>' +
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
    jumlahKalimat: KALIMAT.length
  };
})();
