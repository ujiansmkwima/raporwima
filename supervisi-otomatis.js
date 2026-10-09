/* supervisi-otomatis.js — isi jawaban otomatis (draft) berdasarkan TARGET NILAI berupa ANGKA yang diketik pengguna.
   Target boleh berupa persentase (25–100, mis. 88) atau rata-rata skala (1–4, mis. 3,5). Angka ≤ 4 dianggap rata-rata.
   Kategori ditentukan dari persentase memakai AMBANG di bawah (sama dengan predikat di PDF):
     Sangat Baik ≥ 86 · Baik 71–85 · Cukup 56–70 · Perlu Pembinaan < 56.
   Skor tiap butir (1–4) disebar acak supaya jumlahnya pas dengan target (dan kategorinya sama dengan yang diketik).
   Butir yang sudah diisi manual (ctx.tetap) tidak diubah; sisa butir menyesuaikan agar total tetap mengarah ke target.

   Supaya terbaca seperti ditulis manusia:
   1. Setiap butir dikenali topiknya (pedagogis, lingkungan, digital, asesmen awal, dst.) dari teks pertanyaan,
      lalu komentarnya dibuat khusus untuk topik itu dan disesuaikan dengan nilainya (4 = pujian, 3 = pujian ringan + saran).
   2. Kalimat dirangkai dari potongan-potongan (pembuka, isi, sambungan, penutup), bukan template utuh.
   3. Tiap kali dijalankan dipilih "gaya" penulis: ringkas / biasa / naratif; panjang & tanda baca ikut bervariasi antarbutir.
   4. Kalimat yang sama tidak dipakai dua kali dalam satu formulir selama masih ada pilihan lain.
   5. Kesimpulan (kelebihan, hal yang ditingkatkan, rekomendasi, refleksi) diambil dari butir yang benar-benar dinilai
      tinggi / rendah pada formulir yang sama, jadi isinya konsisten dengan nilai.
   Kalau admin mengubah pertanyaan, butir yang topiknya tak dikenali memakai kumpulan kalimat umum.
   Bank kalimat topik SMK + pola kalimat + jawaban sudut pandang guru ada di supervisi-bank.js (wajib dimuat SEBELUM file ini). */
var SvOto = (function () {
  var AMBANG = [[86, 'Sangat Baik'], [71, 'Baik'], [56, 'Cukup']], TERENDAH = 'Perlu Pembinaan', MIN_PERSEN = 25;
  function kategori(persen) { for (var i = 0; i < AMBANG.length; i++) if (persen >= AMBANG[i][0]) return AMBANG[i][1]; return TERENDAH; }
  // Baca target yang diketik -> { persen, rata, kat } atau null bila tidak valid
  function baca(v) {
    var t = String(v === null || v === undefined ? '' : v).trim().replace('%', '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(t)) return null;
    var x = parseFloat(t), pct = x <= 4 ? x / 4 * 100 : x;
    if (pct < MIN_PERSEN - 1e-9 || pct > 100) return null;
    pct = Math.round(pct);
    return { persen: pct, rata: pct / 25, kat: kategori(pct) };
  }

  /* ====================== BANK KALIMAT PER TOPIK ======================
     ok     = klausa pujian (tanpa titik, huruf kecil di awal)
     kurang = klausa temuan / hal yang perlu ditingkatkan
     aksi   = frasa tindakan (diawali kata kerja) untuk rekomendasi / tindak lanjut
     obs    = klausa pengamatan saat pembelajaran berlangsung (dipakai di kolom "Bukti Pembelajaran") */
  var ASPEK = [
    { k: 'tahap', re: /\(a\) awal|penutupan pembelajaran/,
      ok: ['kegiatan awal, inti, dan penutup berjalan sesuai rancangan', 'urutan kegiatan dari pembukaan sampai penutup mengikuti perencanaan dengan rapi', 'alur pembelajaran dari awal hingga akhir konsisten dengan yang direncanakan', 'ketiga tahap pembelajaran terlaksana runtut dan tidak terputus'],
      kurang: ['kegiatan penutup terasa agak terburu-buru dibanding rancangannya', 'pembagian waktu antartahap belum sepenuhnya sesuai rencana', 'transisi dari kegiatan inti ke penutup masih bisa dirapikan'],
      aksi: ['mengatur alokasi waktu tiap tahap agar penutupan tidak terpotong', 'menyiapkan penanda transisi antartahap kegiatan', 'menyediakan waktu yang cukup untuk refleksi di akhir pelajaran'],
      obs: ['guru membuka pelajaran dengan apersepsi, melanjutkan ke kegiatan inti, lalu menutup dengan simpulan bersama murid', 'guru memulai dengan pertanyaan pemantik, kemudian murid bekerja pada kegiatan inti dan pelajaran ditutup dengan rangkuman', 'kegiatan dibuka dengan salam dan apersepsi, inti berlangsung sesuai langkah di perencanaan, lalu ditutup dengan refleksi singkat', 'tahapan kegiatan mengikuti rencana, dan guru menutup dengan menyimpulkan materi bersama-sama'] },
    { k: 'dpl', re: /profil lulusan/,
      ok: ['tujuan dan langkah pembelajaran sudah mengarah pada dimensi profil lulusan', 'keterkaitan dengan dimensi profil lulusan tampak jelas sejak rumusan tujuan', 'dimensi profil lulusan yang dituju konsisten dari tujuan sampai kegiatan', 'arah pencapaian profil lulusan mudah terbaca'],
      kurang: ['keterkaitan dengan dimensi profil lulusan masih bisa dipertegas pada langkah inti', 'dimensi profil lulusan belum dimunculkan secara eksplisit dalam kegiatan murid', 'indikator ketercapaian dimensi profil lulusan belum sepenuhnya terlihat'],
      aksi: ['menegaskan dimensi profil lulusan yang disasar pada setiap kegiatan inti', 'merumuskan indikator yang menunjukkan capaian dimensi profil lulusan', 'mengaitkan tujuan pembelajaran dengan dimensi profil lulusan secara lebih eksplisit'],
      obs: ['murid menunjukkan sikap dan kebiasaan yang sejalan dengan dimensi profil lulusan yang dituju, misalnya bernalar kritis dan bekerja sama', 'kegiatan yang dilakukan murid mengarah pada dimensi profil lulusan yang sudah dirancang', 'guru mengingatkan tujuan pembelajaran dan mengaitkannya dengan karakter yang ingin dikuatkan'] },
    { k: 'kriteria', re: /kriteria/,
      ok: ['kriteria penilaian sudah jelas dan sesuai dengan tujuan', 'rubrik atau kriteria yang dipakai memudahkan pengukuran ketercapaian', 'kriteria ketercapaian disampaikan kepada murid sehingga penilaian transparan'],
      kurang: ['kriteria penilaian belum diuraikan sampai tingkat indikator', 'kriteria belum disampaikan secara jelas kepada murid', 'rubrik penilaian masih perlu dilengkapi deskriptor tiap level'],
      aksi: ['menyusun rubrik dengan deskriptor yang jelas pada tiap level capaian', 'menyampaikan kriteria penilaian kepada murid sebelum kegiatan dimulai', 'menyelaraskan kriteria dengan indikator ketercapaian tujuan'],
      obs: ['guru menilai berdasarkan kriteria yang sudah ditetapkan dan menyampaikannya kepada murid', 'penilaian mengacu pada rubrik sehingga murid tahu apa yang diharapkan', 'kriteria penilaian dijelaskan di awal dan dipakai saat memberi umpan balik'] },
    { k: 'asesmen_awal', re: /asesmen pada awal|asesmen awal/,
      ok: ['asesmen awal sudah dirancang untuk mengetahui kesiapan dan pengetahuan awal murid', 'kesiapan emosional dan pengetahuan awal murid diperhatikan sejak awal pelajaran', 'hasil asesmen awal bisa langsung dipakai untuk menyesuaikan kegiatan', 'bentuk asesmen awal sederhana namun tepat sasaran'],
      kurang: ['asesmen awal lebih menonjol pada aspek pengetahuan, sedangkan kesiapan emosional belum tergali', 'belum jelas bagaimana hasil asesmen awal dipakai untuk menyesuaikan kegiatan', 'instrumen asesmen awal belum diuraikan'],
      aksi: ['menambahkan asesmen awal yang menggali kesiapan emosional murid', 'menuliskan tindak lanjut dari hasil asesmen awal', 'menyiapkan instrumen asesmen awal yang singkat dan mudah dipakai'],
      obs: ['guru membuka dengan pertanyaan singkat untuk mengetahui pengetahuan awal dan kesiapan murid', 'guru menanyakan kabar dan pengalaman murid sebelum masuk ke materi', 'asesmen awal dilakukan lewat tanya jawab dan hasilnya dipakai guru menyesuaikan penjelasan'] },
    { k: 'asesmen_proses', re: /selama proses|umpan balik/,
      ok: ['asesmen selama proses sudah terencana dan memakai beragam teknik', 'umpan balik dari guru ke murid maupun sebaliknya sudah tergambar', 'pemantauan perkembangan belajar murid berlangsung sepanjang kegiatan', 'teknik asesmen proses bervariasi dan sesuai kegiatan'],
      kurang: ['umpan balik dari murid kepada guru belum terlihat', 'teknik asesmen selama proses masih didominasi tanya jawab', 'tindak lanjut dari umpan balik belum dijelaskan'],
      aksi: ['menambah teknik asesmen proses seperti observasi, jurnal, atau penilaian sejawat', 'menyediakan kesempatan bagi murid memberi umpan balik kepada guru', 'mencatat hasil pemantauan agar umpan balik bisa ditindaklanjuti'],
      obs: ['guru berkeliling memantau kerja murid dan memberi umpan balik langsung', 'guru memberi komentar pada pekerjaan murid, dan murid diberi kesempatan menanggapi', 'umpan balik diberikan selama kegiatan sehingga murid bisa segera memperbaiki pekerjaannya'] },
    { k: 'asesmen_hasil', re: /hasil pembelajaran|ketercapaian tujuan|mengukur/,
      ok: ['asesmen hasil sudah dirancang beragam untuk mengukur ketercapaian kompetensi', 'bentuk asesmen (tes, proyek, presentasi, portofolio) sesuai dengan tujuan pembelajaran', 'asesmen akhir mampu menjadi bukti keberhasilan pembelajaran', 'ketercapaian tujuan diukur dengan cara yang tepat dan jelas'],
      kurang: ['bentuk asesmen hasil masih cenderung tunggal', 'cara mengukur ketercapaian sebagian tujuan belum dijelaskan', 'asesmen hasil belum memberi ruang bagi murid menunjukkan kompetensi dengan cara berbeda'],
      aksi: ['memvariasikan bentuk asesmen hasil, misalnya dengan proyek atau presentasi', 'menjelaskan cara mengukur ketercapaian setiap tujuan pembelajaran', 'memberi pilihan cara bagi murid untuk menunjukkan kompetensinya'],
      obs: ['guru melakukan penilaian di akhir kegiatan melalui tugas dan tanya jawab untuk melihat ketercapaian tujuan', 'hasil kerja murid dinilai sesuai tujuan yang ditetapkan', 'asesmen akhir dilakukan dengan bentuk yang sesuai dengan karakteristik murid'] },
    { k: 'selaras', re: /selaras/,
      ok: ['tujuan, langkah, dan asesmen pembelajaran sudah nyambung satu sama lain', 'tujuan, langkah, dan asesmen tersusun searah dan saling menguatkan', 'asesmen yang dipilih sesuai dengan tujuan dan kegiatan yang direncanakan', 'keselarasan tujuan, kegiatan, dan penilaian terlihat konsisten'],
      kurang: ['asesmen belum sepenuhnya mengukur tujuan yang dirumuskan', 'ada beberapa langkah yang belum terhubung langsung dengan tujuan pembelajaran', 'rumusan tujuan dan bentuk asesmen masih perlu disejajarkan'],
      aksi: ['menyelaraskan bentuk asesmen dengan rumusan tujuan pembelajaran', 'mengecek kembali keterkaitan setiap langkah dengan tujuan yang ingin dicapai', 'menambahkan indikator yang menghubungkan tujuan, kegiatan, dan asesmen'],
      obs: ['kegiatan dan penilaian yang dilakukan guru sejalan dengan tujuan pembelajaran', 'apa yang dikerjakan murid selaras dengan tujuan yang disampaikan di awal', 'guru menjaga agar kegiatan tetap mengarah pada tujuan pembelajaran'] },
    { k: 'pedagogis', re: /pedagogis/,
      ok: ['praktik pedagogis yang dipilih sudah tergambar pada langkah dan asesmen pembelajaran', 'pendekatan mengajar yang dituliskan tampak nyata dalam kegiatan', 'pilihan model dan metode pembelajaran cocok dengan tujuan yang ingin dicapai', 'praktik pedagogis terlihat konsisten di setiap tahap kegiatan'],
      kurang: ['praktik pedagogis yang dituliskan belum semuanya tampak pada langkah kegiatan', 'peran murid dalam model yang dipilih masih bisa diperkuat', 'langkah kegiatan belum menggambarkan sintaks model pembelajaran secara utuh'],
      aksi: ['menjabarkan praktik pedagogis ke dalam langkah kegiatan yang lebih rinci', 'menyesuaikan sintaks model pembelajaran dengan kegiatan murid', 'memberi ruang lebih besar bagi murid untuk berperan aktif dalam kegiatan'],
      obs: ['guru menerapkan model pembelajaran sesuai yang direncanakan dan murid terlibat dalam diskusi serta pengerjaan tugas', 'guru memfasilitasi murid bekerja dalam kelompok kecil, dan pendekatan yang dipilih berjalan sebagaimana rencana', 'praktik mengajar guru tampak sejalan dengan pendekatan yang dituliskan pada perencanaan'] },
    { k: 'lingkungan', re: /lingkungan belajar/,
      ok: ['lingkungan belajar yang dirancang sudah tampak pada kegiatan yang disusun', 'suasana dan ruang belajar dipertimbangkan dengan baik dalam langkah pembelajaran', 'rancangan lingkungan belajar mendukung keterlibatan murid', 'pemanfaatan ruang dan sumber belajar di sekitar murid sudah terlihat'],
      kurang: ['lingkungan belajar yang ditulis belum banyak terlihat dalam langkah kegiatan', 'pemanfaatan lingkungan sekitar sebagai sumber belajar masih bisa diperluas', 'penataan ruang dan suasana kelas belum digambarkan secara jelas'],
      aksi: ['menuliskan penataan ruang dan suasana belajar pada langkah kegiatan', 'memanfaatkan lingkungan sekitar sekolah sebagai sumber belajar', 'menciptakan suasana kelas yang lebih aman dan mengundang murid berpendapat'],
      obs: ['suasana kelas kondusif, dan murid merasa nyaman bertanya dan menyampaikan pendapat', 'penataan tempat duduk mendukung kerja kelompok dan murid bergerak leluasa', 'guru memanfaatkan ruang kelas dan sumber belajar yang tersedia dengan baik'] },
    { k: 'kemitraan', re: /kemitraan/,
      ok: ['kemitraan pembelajaran yang dituliskan sudah tergambar pada langkah kegiatan', 'peran rekan sejawat, orang tua, atau pihak lain terlihat dalam rancangan', 'kolaborasi dengan pihak lain dipikirkan dengan baik', 'bentuk kemitraan yang direncanakan relevan dengan tujuan pembelajaran'],
      kurang: ['bentuk kemitraan yang ditulis belum jelas wujudnya dalam kegiatan', 'peran mitra pembelajaran belum diuraikan secara spesifik', 'kemitraan dengan pihak di luar kelas masih bisa diperluas'],
      aksi: ['menjelaskan peran mitra pembelajaran pada langkah kegiatan', 'melibatkan rekan guru atau narasumber sesuai kebutuhan materi', 'merancang bentuk kolaborasi yang lebih konkret dengan pihak di luar kelas'],
      obs: ['guru berkolaborasi dengan murid dan pihak lain sesuai rencana kemitraan', 'murid bekerja sama dalam kelompok dan guru melibatkan pihak lain bila diperlukan', 'kemitraan pembelajaran tampak melalui kerja sama antarmurid dan dukungan rekan sejawat'] },
    { k: 'digital', re: /digital/,
      ok: ['pemanfaatan teknologi digital tergambar jelas pada langkah pembelajaran', 'sarana digital yang dipilih sesuai dengan kebutuhan materi', 'teknologi digital dipakai untuk menunjang kegiatan belajar, bukan sekadar pelengkap', 'penggunaan media digital dalam rancangan sudah cukup bervariasi'],
      kurang: ['pemanfaatan digital masih terbatas pada penyajian materi', 'belum terlihat bagaimana murid sendiri memakai teknologi digital untuk belajar', 'pilihan aplikasi atau media digital perlu dikaitkan lebih kuat dengan tujuan'],
      aksi: ['melibatkan murid secara langsung dalam memakai perangkat atau aplikasi digital', 'memvariasikan media digital sesuai kebutuhan kegiatan', 'menuliskan fungsi teknologi digital pada setiap langkah yang memakainya'],
      obs: ['guru memanfaatkan media digital untuk menyajikan materi dan murid ikut menggunakannya dalam kegiatan', 'perangkat digital dipakai sesuai rencana dan membantu murid memahami materi', 'penggunaan teknologi digital berjalan lancar dan menunjang kegiatan belajar'] },
    { k: 'memuliakan', re: /memuliakan/,
      ok: ['sikap saling menghargai antara guru dan murid serta antarmurid tergambar dalam langkah kegiatan', 'bahasa verbal maupun nonverbal yang memuliakan sudah dipikirkan', 'kegiatan mendorong murid saling mendengarkan dan menghargai pendapat', 'budaya saling menghormati terlihat jelas dalam rancangan'],
      kurang: ['tindakan saling memuliakan belum banyak dituliskan dalam langkah kegiatan', 'contoh bahasa dan sikap yang memuliakan belum diuraikan', 'penghargaan terhadap kontribusi murid belum tergambar jelas'],
      aksi: ['menuliskan tindakan konkret yang menunjukkan sikap saling memuliakan', 'membiasakan apresiasi atas pendapat dan kontribusi setiap murid', 'menyusun kesepakatan kelas tentang cara berbicara dan menghargai teman'],
      obs: ['guru menyapa dan menanggapi murid dengan ramah, dan murid saling mendengarkan saat teman berbicara', 'murid terbiasa menghargai pendapat teman, dan guru memberi apresiasi pada jawaban murid', 'bahasa yang digunakan guru maupun murid santun dan saling menguatkan'] },
    { k: 'memahami', re: /memahami/,
      ok: ['langkah pembelajaran sudah memberi ruang bagi murid untuk membangun pemahaman secara aktif', 'kegiatan memahami tergambar baik lewat eksplorasi dari berbagai sumber', 'murid diajak menggali konsep, tidak hanya menerima penjelasan guru', 'pengalaman memahami sudah dirancang bermakna dan bertahap'],
      kurang: ['kegiatan memahami masih didominasi penjelasan guru', 'sumber belajar untuk membangun pemahaman murid belum cukup beragam', 'pertanyaan pemantik untuk pemahaman mendalam masih bisa diperkaya'],
      aksi: ['menambah kegiatan eksplorasi dari berbagai sumber agar murid membangun pemahamannya sendiri', 'menyiapkan pertanyaan pemantik yang lebih menantang', 'mengurangi porsi ceramah dan memperbanyak aktivitas murid dalam memahami konsep'],
      obs: ['murid menggali konsep melalui bacaan, diskusi, dan tanya jawab dengan guru', 'guru memancing pemahaman lewat pertanyaan pemantik dan murid mencari jawaban dari berbagai sumber', 'murid tampak terlibat aktif dalam memahami materi, bukan hanya mendengarkan'] },
    { k: 'mengaplikasi', re: /mengaplikasi/,
      ok: ['murid berkesempatan menerapkan pemahaman pada situasi nyata', 'kegiatan mengaplikasi terhubung dengan konteks kehidupan sehari-hari murid', 'tugas penerapan yang dirancang kontekstual dan bermakna', 'ada ruang yang cukup bagi murid untuk mempraktikkan apa yang dipahami'],
      kurang: ['konteks penerapan masih terlalu umum dan belum dekat dengan kehidupan murid', 'kesempatan murid mempraktikkan pemahaman masih terbatas', 'tugas penerapan perlu dibuat lebih kontekstual'],
      aksi: ['mengaitkan tugas penerapan dengan masalah nyata di sekitar murid', 'memberi lebih banyak waktu bagi murid untuk mempraktikkan pemahamannya', 'menyiapkan variasi konteks penerapan sesuai minat murid'],
      obs: ['murid mengerjakan tugas yang menghubungkan materi dengan contoh nyata di sekitar mereka', 'murid menerapkan konsep dalam kegiatan praktik atau pemecahan masalah', 'guru memberi kesempatan murid mencoba langsung dan menerapkan pemahamannya'] },
    { k: 'merefleksi', re: /merefleksi/,
      ok: ['kegiatan refleksi sudah dirancang agar murid menilai proses belajarnya sendiri', 'murid diajak memaknai proses dan hasil belajar serta menentukan langkah berikutnya', 'refleksi terencana dengan baik dan tidak hanya menjadi formalitas di akhir', 'ruang bagi murid untuk mengelola belajarnya secara mandiri sudah terlihat'],
      kurang: ['refleksi masih berupa pertanyaan umum di akhir pelajaran', 'murid belum cukup diarahkan untuk menentukan tindak lanjut belajarnya', 'waktu untuk refleksi kurang tergambar dalam langkah pembelajaran'],
      aksi: ['menyediakan panduan refleksi yang membantu murid menilai proses belajarnya', 'meminta murid menuliskan tindak lanjut belajar secara mandiri', 'mengalokasikan waktu khusus untuk refleksi di setiap pertemuan'],
      obs: ['di akhir kegiatan murid menceritakan apa yang sudah dipelajari dan kesulitan yang dialami', 'guru membimbing murid merefleksikan proses belajar dan merencanakan perbaikan', 'murid menuliskan atau menyampaikan refleksi singkat tentang pembelajaran hari itu'] },
    { k: 'prinsip', re: /prinsip pembelajaran mendalam|berkesadaran/,
      ok: ['prinsip berkesadaran, bermakna, dan menggembirakan sudah tampak pada pengalaman belajar', 'murid diajak sadar akan tujuan belajarnya, dan kegiatannya terasa bermakna', 'suasana menggembirakan terjaga di sepanjang langkah pembelajaran', 'ketiga prinsip pembelajaran mendalam tercermin hampir di setiap tahap'],
      kurang: ['prinsip pembelajaran mendalam belum tercermin di setiap pengalaman belajar', 'unsur menggembirakan masih kurang terlihat pada sebagian kegiatan', 'kebermaknaan kegiatan bagi murid masih bisa dijelaskan lebih kuat'],
      aksi: ['memastikan setiap pengalaman belajar memuat unsur berkesadaran, bermakna, dan menggembirakan', 'menambahkan kegiatan yang lebih menyenangkan dan dekat dengan murid', 'menjelaskan kepada murid manfaat kegiatan agar belajar lebih berkesadaran'],
      obs: ['murid tampak antusias dan menyadari tujuan kegiatan yang dilakukan', 'suasana belajar menyenangkan dan murid merasakan manfaat dari kegiatan yang dikerjakan', 'murid terlibat penuh dan terlihat menikmati proses belajarnya'] },
    { k: 'karakteristik', re: /karakteristik/,
      ok: ['pengalaman belajar sudah disesuaikan dengan karakteristik murid', 'kebutuhan, minat, dan kemampuan murid dipertimbangkan dengan baik', 'kegiatan cukup beragam sehingga mengakomodasi gaya belajar murid yang berbeda', 'perbedaan tingkat kemampuan murid sudah diperhatikan dalam rancangan'],
      kurang: ['diferensiasi untuk murid dengan kebutuhan berbeda belum terlihat jelas', 'hasil pemetaan karakteristik murid belum tampak dalam kegiatan', 'variasi kegiatan untuk gaya belajar yang berbeda masih terbatas'],
      aksi: ['memetakan kebutuhan dan minat murid lalu menuangkannya dalam kegiatan', 'menyediakan pilihan kegiatan atau tugas bagi murid dengan kemampuan berbeda', 'menambah variasi kegiatan untuk berbagai gaya belajar'],
      obs: ['guru memberi bantuan tambahan kepada murid yang membutuhkan dan tantangan bagi yang sudah cepat paham', 'kegiatan memberi pilihan sehingga murid dengan gaya belajar berbeda tetap terlayani', 'guru menyesuaikan penjelasan dengan kemampuan dan kebutuhan murid di kelas'] }
  ];
  // Cadangan untuk butir yang topiknya tidak dikenali (mis. pertanyaan diubah admin)
  var UMUM = {
    k: 'umum',
    ok: ['sudah tergambar dengan baik', 'cukup jelas dan konsisten pada langkah pembelajaran', 'sesuai dengan rancangan dan mendukung tujuan pembelajaran', 'sudah memadai dan mudah dipahami', 'terlihat konsisten di seluruh kegiatan'],
    kurang: ['masih bisa diperjelas pada beberapa bagian', 'perlu dirinci lagi agar lebih mudah diterapkan', 'belum sepenuhnya tergambar pada seluruh langkah', 'variasinya masih bisa diperkaya'],
    aksi: ['melengkapi bagian yang masih kurang jelas', 'memperkaya variasi kegiatan', 'memperjelas uraian pada langkah pembelajaran'],
    obs: ['guru melaksanakan kegiatan sesuai rencana dan murid mengikuti dengan baik', 'kegiatan berjalan lancar dan murid terlibat', 'pelaksanaan sejalan dengan yang direncanakan', 'guru mengelola kegiatan dengan tenang dan murid merespons dengan baik']
  };

  // Nama topik + tindakan khusus pelaksanaan di kelas (dipakai untuk form implementasi/supervisi)
  var NAMA = { tahap: 'tahapan kegiatan (awal, inti, penutup)', dpl: 'pengarahan pada dimensi profil lulusan', kriteria: 'penggunaan kriteria penilaian', asesmen_awal: 'asesmen awal', asesmen_proses: 'asesmen dan umpan balik selama proses', asesmen_hasil: 'asesmen hasil belajar', selaras: 'keselarasan tujuan, kegiatan, dan asesmen', pedagogis: 'praktik pedagogis', lingkungan: 'penciptaan lingkungan belajar', kemitraan: 'kemitraan pembelajaran', digital: 'pemanfaatan teknologi digital', memuliakan: 'sikap saling memuliakan', memahami: 'pengalaman belajar memahami', mengaplikasi: 'pengalaman belajar mengaplikasi', merefleksi: 'kegiatan refleksi bersama murid', prinsip: 'penerapan prinsip pembelajaran mendalam', karakteristik: 'penyesuaian dengan karakteristik murid', umum: 'bagian ini' };
  var AKSI_I = {
    tahap: ['mengatur alokasi waktu agar setiap tahap terlaksana penuh', 'menyediakan waktu yang cukup untuk penutupan dan refleksi'],
    dpl: ['mengingatkan murid pada tujuan dan karakter yang ingin dikuatkan di tiap kegiatan', 'memberi contoh konkret perilaku yang mencerminkan dimensi profil lulusan'],
    kriteria: ['menyampaikan kriteria penilaian kepada murid sebelum kegiatan dimulai', 'memakai rubrik saat memberi umpan balik kepada murid'],
    asesmen_awal: ['melakukan asesmen awal yang singkat namun menggali kesiapan emosional murid', 'memanfaatkan hasil asesmen awal untuk menyesuaikan kegiatan'],
    asesmen_proses: ['memberi umpan balik kepada lebih banyak murid selama kegiatan', 'membuka kesempatan bagi murid untuk memberi umpan balik kepada guru'],
    asesmen_hasil: ['memvariasikan bentuk asesmen akhir', 'menjelaskan kepada murid bagaimana ketercapaian tujuan dinilai'],
    selaras: ['menjaga agar kegiatan dan penilaian tetap mengarah pada tujuan', 'mengecek kembali kesesuaian kegiatan dengan tujuan di tengah pelajaran'],
    pedagogis: ['memberi ruang lebih besar bagi murid untuk berperan aktif', 'menerapkan sintaks model pembelajaran secara lebih utuh'],
    lingkungan: ['menata ruang kelas agar murid lebih leluasa bekerja sama', 'membangun suasana yang membuat semua murid berani berpendapat'],
    kemitraan: ['melibatkan rekan guru atau narasumber sesuai rencana kemitraan', 'memperjelas peran tiap mitra saat kegiatan berlangsung'],
    digital: ['melibatkan murid secara langsung dalam memakai perangkat digital', 'menyiapkan cadangan bila perangkat atau jaringan bermasalah'],
    memuliakan: ['membiasakan apresiasi pada setiap kontribusi murid', 'menegaskan kesepakatan kelas tentang cara berbicara dan menghargai teman'],
    memahami: ['menambah kesempatan murid menggali konsep dari berbagai sumber', 'mengajukan pertanyaan pemantik yang lebih menantang'],
    mengaplikasi: ['memberi lebih banyak waktu bagi murid untuk mempraktikkan pemahamannya', 'mengaitkan tugas penerapan dengan contoh yang lebih dekat dengan murid'],
    merefleksi: ['menyediakan waktu khusus untuk refleksi di akhir pelajaran', 'mengarahkan murid menuliskan tindak lanjut belajarnya sendiri'],
    prinsip: ['memastikan setiap kegiatan terasa bermakna dan menggembirakan bagi murid', 'menjelaskan manfaat kegiatan kepada murid sejak awal'],
    karakteristik: ['memberi pilihan tugas bagi murid dengan kemampuan berbeda', 'memberi pendampingan tambahan bagi murid yang membutuhkan']
  };
  ASPEK.concat([UMUM]).forEach(function (a) { a.nama = NAMA[a.k]; a.aksiI = AKSI_I[a.k] || a.aksi; });

  /* ====================== POTONGAN PENYUSUN KALIMAT ====================== */
  var OPEN_PRA = ['Secara umum,', 'Menurut saya,', 'Dari hasil telaah,', 'Sejauh ini,', 'Pada dasarnya,', 'Setelah dibaca,'];
  var OPEN_PRA_OK = OPEN_PRA.concat(['Terlihat bahwa', 'Tampak bahwa']);
  var OPEN_OBS = ['Selama pembelajaran,', 'Pada saat observasi,', 'Dari yang saya amati,', 'Di kelas,', 'Saat kegiatan berlangsung,'];
  var OPEN_CAT = ['Menurut saya,', 'Secara umum,', 'Sejauh ini,', 'Sebagai catatan,', 'Pada dasarnya,'];
  var RINGAN = ['sudah cukup baik', 'secara garis besar sudah sesuai', 'arahnya sudah tepat', 'dasarnya sudah baik', 'sudah cukup tergambar', 'sudah lumayan jelas'];
  var EKOR4 = ['sehingga mudah diterapkan di kelas', 'dan layak dipertahankan', 'yang menjadi salah satu kekuatan bagian ini', 'dan patut dijadikan contoh bagi rekan guru', 'sehingga alurnya terasa utuh'];
  var EKOR3 = ['meskipun secara keseluruhan sudah dapat diterima', 'dan akan lebih kuat bila dilengkapi contoh konkret', 'dan perbaikan kecil di bagian ini akan sangat membantu'];
  var EKOR_OBS4 = ['dan hasilnya terlihat pada antusiasme murid', 'sehingga kegiatan berjalan efektif', 'serta suasana kelas tetap kondusif', 'dan murid mengikuti setiap tahapan dengan baik'];
  var KENDALA3 = ['sebagian murid masih terlihat pasif', 'waktu kegiatan terasa agak terbatas', 'keterlibatan murid belum merata', 'ada bagian yang berjalan kurang optimal', 'beberapa murid tampak perlu pendampingan lebih', 'transisi antarkegiatan sedikit memakan waktu', 'kegiatan berjalan agak cepat sehingga tidak semua murid sempat menuntaskan', 'sebagian murid belum berani menyampaikan pendapat', 'penguatan kepada murid masih bisa ditambah', 'perhatian beberapa murid sempat teralihkan'];
  var SAMBUNG_PLUS = [', dan ', ', serta ', '; selain itu, ', '. Selain itu, '];
  var SAMBUNG_KONTRAS = [', namun ', ', hanya saja ', ', tetapi ', '; meski begitu, ', '. Meski demikian, '];
  var SINGKAT4 = ['Sudah memadai.', 'Sudah baik.', 'Tergambar jelas.', 'Sudah sesuai.', 'Baik, pertahankan.', 'Sudah jelas dan lengkap.', 'Memadai.'];
  var SINGKAT_CAT4 = ['Sudah baik, pertahankan.', 'Baik.', 'Dipertahankan.', 'Sudah sesuai.', 'Tidak ada catatan khusus.', 'Bagus, lanjutkan.'];
  var OK_I = ['{n} sudah berjalan dengan baik', '{n} terlaksana sesuai rencana', '{n} sudah tampak nyata dalam praktik di kelas', '{n} sudah dilaksanakan dengan baik dan konsisten', '{n} berlangsung lancar sesuai yang direncanakan'];
  var KURANG_I = ['{n} sudah berjalan, tetapi masih bisa dimaksimalkan', '{n} perlu diperkuat pada saat pelaksanaan', '{n} belum merata di seluruh kegiatan', 'pelaksanaan {n} masih perlu ditingkatkan', '{n} belum sepenuhnya sesuai dengan yang direncanakan'];
  var FRAME_SARAN = ['Sebaiknya ', 'Disarankan untuk ', 'Ke depan, perlu ', 'Perlu '];

  var KECIL_PRA = ['Variasi kegiatan dan pemanfaatan teknologi digital masih bisa dikembangkan lagi', 'Contoh konkret pada beberapa langkah dapat ditambah agar lebih mudah diterapkan', 'Alokasi waktu tiap kegiatan dapat dirinci lebih tegas', 'Instrumen asesmen dapat dilampirkan lebih lengkap', 'Rumusan pertanyaan pemantik masih bisa dipertajam'];
  var REKOM_BAIK = ['Perencanaan sudah sangat baik; lanjutkan dengan penyempurnaan kecil pada rumusan langkah, lalu bagikan sebagai praktik baik kepada rekan guru.', 'Cukup dilakukan revisi ringan, misalnya melengkapi contoh konkret pada tiap langkah; selebihnya dapat dipertahankan.', 'Tidak ada revisi mendasar. Pertahankan kualitas ini dan dokumentasikan sebagai contoh perencanaan pembelajaran mendalam.', 'Perencanaan sudah selaras dengan prinsip pembelajaran mendalam; tinggal dirapikan pada bagian-bagian kecil.'];
  var EKOR_KEL = ['sehingga perencanaan mudah dipahami dan diterapkan', 'dan ini menjadi modal yang baik untuk pelaksanaan di kelas', 'yang membuat dokumen perencanaan terasa matang'];
  var PELAJARAN = ['Persiapan yang matang membuat kegiatan berjalan lebih lancar dan murid lebih mudah terlibat', 'Pembelajaran yang dirancang sesuai karakteristik murid membuat mereka lebih antusias', 'Kegiatan yang bermakna dan dekat dengan kehidupan murid membuat pemahaman lebih mudah terbentuk', 'Langkah pembelajaran yang runtut membantu guru mengelola kelas dengan lebih tenang', 'Memberi ruang bagi murid untuk aktif terbukti meningkatkan keberanian mereka bertanya dan berpendapat'];
  var PENDUKUNG = ['kesiapan media dan perangkat pembelajaran', 'antusiasme murid', 'lingkungan kelas yang kondusif', 'dukungan rekan sejawat dan pimpinan', 'ketersediaan sarana di sekolah', 'perencanaan yang disusun jauh hari', 'kerja sama yang baik antarmurid', 'pembiasaan rutin yang sudah terbentuk sebelumnya'];
  var BELUM_UMUM = ['Pengelolaan waktu masih dapat dioptimalkan', 'Sebagian kecil murid belum terlibat merata', 'Refleksi bersama murid belum sepenuhnya mendalam', 'Umpan balik belum sempat diberikan secara individual kepada semua murid'];
  var PENGHAMBAT = ['keterbatasan waktu pelajaran', 'keterbatasan sarana dan perangkat', 'kemampuan murid yang beragam dalam satu kelas', 'jumlah murid yang cukup banyak', 'gangguan teknis pada perangkat digital', 'alokasi waktu yang padat'];
  var RTL_UMUM = ['mendokumentasikan praktik yang sudah baik', 'berdiskusi dengan rekan sejawat untuk perbaikan', 'memperbaiki perencanaan berdasarkan hasil refleksi', 'melaksanakan asesmen awal secara konsisten', 'mencoba variasi strategi pada pertemuan berikutnya'];
  var CAT_BAIK = ['Sudah baik dan layak dilanjutkan', 'Secara umum sudah baik', 'Pelaksanaannya sudah baik, dengan beberapa hal yang masih bisa dikembangkan', 'Sudah berjalan baik'];
  var CAT_SB = ['Sangat baik dan layak menjadi contoh praktik baik', 'Sudah sangat baik; pertahankan', 'Kualitasnya sangat baik dan konsisten', 'Sangat baik, tinggal disempurnakan pada hal-hal kecil'];
  var CAT_EKOR_SB = ['Silakan dibagikan kepada rekan guru sebagai praktik baik', 'Layak didokumentasikan untuk dibagikan dalam forum berbagi praktik baik', 'Pertahankan konsistensinya pada pertemuan berikutnya'];

  /* ====================== GABUNGKAN BANK BARU ====================== */
  var BK = window.SvBank || { SUP: [], TELAAH: [], TAMBAH: {}, P: {}, GURU: {} }, P = BK.P, G = BK.GURU;
  ASPEK.forEach(function (a) {   // topik lama: skema obs/ok/kurang/aksi -> s/p/w/ak
    var t = BK.TAMBAH[a.k] || {};
    a.s = (a.obs || []).concat(t.s || []); a.p = t.p || []; a.w = t.w || []; a.ak = a.aksi;
  });
  UMUM.s = UMUM.obs; UMUM.p = []; UMUM.w = []; UMUM.ak = UMUM.aksi;
  BK.SUP.forEach(function (a) { a.aksiI = a.ak; a.ok = a.ok || a.s; a.kurang = a.kurang || a.p; a.aksi = a.ak; });
  BK.TELAAH.forEach(function (a) { a.kurang = a.kr; a.aksi = a.ak; });
  var SUPALL = BK.SUP.concat(ASPEK);   // topik baru (lebih spesifik) dicocokkan lebih dulu
  var TUMUM = { k: 't_umum', nama: 'bagian ini', ok: UMUM.ok, kr: UMUM.kurang, ak: UMUM.aksi };

  var CAT_CUKUP = ['Secara umum cukup, tetapi masih banyak ruang untuk perbaikan', 'Sudah cukup memadai; perlu penguatan pada beberapa bagian', 'Hasilnya cukup, dengan sejumlah hal yang perlu dibenahi', 'Cukup baik sebagai langkah awal, namun belum konsisten'];
  var CAT_KURANG = ['Masih memerlukan pembinaan dan pendampingan yang lebih intensif', 'Belum memenuhi harapan; perlu perbaikan pada banyak bagian', 'Perlu pendampingan lanjutan agar kualitasnya meningkat', 'Banyak komponen yang belum tampak sehingga perlu dibina secara bertahap'];
  var KAT_SUM = {
    'Sangat Baik': ['Secara keseluruhan pembelajaran berjalan sangat baik dan layak dibagikan sebagai praktik baik.', 'Pembelajaran ini menunjukkan kualitas yang konsisten dari awal sampai akhir.', 'Kualitas pembelajarannya sangat baik; tinggal dijaga konsistensinya.'],
    'Baik': ['Secara keseluruhan pembelajaran sudah baik dan tinggal disempurnakan pada beberapa bagian.', 'Pembelajaran berjalan baik; beberapa catatan di bawah dapat menjadi bahan penyempurnaan.', 'Sudah baik secara umum, dengan beberapa bagian yang masih bisa diperkuat.'],
    'Cukup': ['Secara keseluruhan pembelajaran sudah cukup, namun masih membutuhkan penguatan di beberapa bagian.', 'Pembelajaran berjalan cukup baik, tetapi belum konsisten pada beberapa aspek penting.'],
    'Perlu Pembinaan': ['Secara keseluruhan pembelajaran masih memerlukan pembinaan yang terarah.', 'Banyak aspek yang belum tampak, sehingga perlu pendampingan bertahap.']
  };
  var EKSTRA_GURU = ['Saya juga menyiapkan alternatif kegiatan bila waktu tidak mencukupi.', 'Semua perangkat sudah saya siapkan sebelum pertemuan.', 'Rencana ini saya diskusikan dulu dengan rekan sejawat.', 'Saya akan menyesuaikan di kelas bila respons murid berbeda dari perkiraan.', 'Saya berusaha agar setiap murid mendapat kesempatan terlibat.'];
  var PJ = ['Guru bersangkutan bersama supervisor', 'Supervisor', 'Waka Kurikulum', 'Kepala sekolah dan guru bersangkutan', 'Ketua MGMP dan Waka Kurikulum', 'Guru dan rekan sejawat (peer coaching)'];
  var INDIKATOR = ['tampak pada observasi ulang', 'dibuktikan dengan perangkat yang sudah direvisi', 'terlihat pada catatan asesmen formatif', 'dinilai dengan instrumen supervisi yang sama dan skor meningkat', 'terdokumentasi pada jurnal mengajar'];
  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

  /* ====================== UTILITAS ====================== */
  var dipakai = {}, MODE = 'pra', ST = {};
  function rn(n) { return Math.floor(Math.random() * n); }
  function ada(p) { return Math.random() < p; }
  function acak(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rn(i + 1), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pilih(a) {
    if (!a || !a.length) return '';
    var sisa = a.filter(function (x) { return !dipakai[x]; }), src = sisa.length ? sisa : a, x = src[rn(src.length)];
    dipakai[x] = 1; return x;
  }
  function pilihN(a, n) { var h = [], i; for (i = 0; i < n && i < a.length; i++) h.push(pilih(a.filter(function (x) { return h.indexOf(x) < 0; }))); return h; }
  function kap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }
  function lc(s) { s = String(s || ''); return /^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1); }
  function daftar(a) { return a.length < 2 ? (a[0] || '') : a.length === 2 ? a[0] + ' dan ' + a[1] : a.slice(0, -1).join(', ') + ', dan ' + a[a.length - 1]; }
  // Seperti daftar(), tetapi memakai "serta" bila ada butir yang sudah memuat kata "dan"
  function daftarN(a) { return a.some(function (x) { return / dan /.test(x); }) ? (a.length < 3 ? a.join(' serta ') : a.slice(0, -1).join(', ') + ', serta ' + a[a.length - 1]) : daftar(a); }
  function akhiri(s, gaya) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return s;
    s = kap(s);
    if (/[.!?]$/.test(s)) return s;
    if (gaya === 'ringkas' && s.length < 90 && ada(0.4)) return s;   // catatan singkat sering tanpa titik
    return s + '.';
  }
  // Token {mapel} {kelas} {r} {sapa} + sebutan "murid" yang konsisten dalam satu formulir
  function done(s) {
    s = String(s || '').replace(/\{mapel\}/g, ST.mapel || 'mata pelajaran ini').replace(/\{kelas\}/g, ST.kelas || 'ini').replace(/\{r\}/g, ST.ruang || 'kelas').replace(/\{sapa\}/g, ST.sapa || 'Bapak/Ibu');
    if (ST.sebut && ST.sebut !== 'murid') s = s.replace(/\bmurid\b/g, ST.sebut).replace(/\bMurid\b/g, kap(ST.sebut));
    return s;
  }
  function telaahQ(q) { return q.tipe === 'pilihan' && (q.opsi || []).some(function (o) { return /^sesuai/i.test(o); }); }
  function aspekDari(q) {
    var t = String(q.teks || '').toLowerCase(), tel = telaahQ(q), list = tel ? BK.TELAAH : SUPALL, i;
    for (i = 0; i < list.length; i++) if (list[i].re.test(t)) return list[i];
    return tel ? TUMUM : UMUM;
  }
  function gayaItem(gForm) { return ada(0.7) ? gForm : pilih(['ringkas', 'biasa', 'naratif']); }
  function bukanUmum(l) { var h = l.filter(function (x) { return x.A.k !== 'umum' && x.A.k !== 't_umum'; }); return h.length ? h : l; }
  function unikA(l) { var s = {}; return l.filter(function (x) { if (s[x.A.k]) return false; s[x.A.k] = 1; return true; }); }
  function frame(A) { return pilih(P.FRAME) + pilih(MODE === 'sup' ? (A.aksiI || A.ak) : (A.aksi || A.ak)); }
  function bukaObs() {
    var l = P.OPEN_OBS.slice();
    if (ST.mapel) l.push('Pada pelajaran ' + ST.mapel + ',');
    if (ST.kelas) l.push('Di kelas ' + ST.kelas + ',');
    return pilih(l);
  }
  function kOk(A) { return MODE === 'sup' ? pilih(P.OK_I).replace('{n}', A.nama) : pilih(A.ok); }
  function kKurang(A) { return MODE === 'sup' ? pilih(P.KURANG_I).replace('{n}', A.nama) : pilih(A.kurang); }
  function kAksi(A) { return pilih(MODE === 'sup' ? (A.aksiI || A.ak) : (A.aksi || A.ak)); }
  function obsLemah(x) {
    var A = x.A, l = (x.v <= 2 && A.w && A.w.length) ? A.w : (A.p && A.p.length ? A.p : A.kurang);
    return pilih(l);
  }

  /* ====================== KOMENTAR PER BUTIR ====================== */
  // Kolom "Bukti Pembelajaran" (form pelaksanaan): apa yang terlihat di kelas, sesuai nilai 1–4
  function bukti(A, v, gaya) {
    var s, op = ada(gaya === 'ringkas' ? 0.15 : 0.35) ? bukaObs() + ' ' : '';
    if (v >= 4) {
      s = pilih(A.s);
      if (gaya === 'naratif') {
        if (ada(0.5)) s += pilih(P.DAMPAK4);
        else if (A.s.length > 1 && ada(0.4)) s += pilih(P.SAMBUNG_PLUS) + pilih(A.s);
      } else if (gaya === 'biasa' && ada(0.25)) s += pilih(P.DAMPAK4);
    } else if (v === 3) {
      s = (A.p && A.p.length) ? pilih(A.p) : pilih(A.s) + pilih(P.KONTRAS) + pilih(KENDALA3);
      if (gaya === 'naratif' && ada(0.4)) s += '. ' + pilih(P.POS_RINGAN3);
    } else {
      s = (A.w && A.w.length) ? pilih(A.w) : ((A.p && A.p.length) ? pilih(A.p) : pilih(KENDALA3));
      if (v === 2 && A.w && A.w.length > 1 && gaya !== 'ringkas' && ada(0.35)) s += pilih(P.SAMBUNG_PLUS) + pilih(A.w);
    }
    return akhiri(op + s, gaya);
  }
  // Kolom "Catatan" / "Bukti / Catatan" (umpan balik kepada guru) pada form pelaksanaan
  function catatanSup(A, v, gaya) {
    var n = A.nama, s, m;
    if (v >= 4) {
      if (gaya === 'ringkas' && ada(0.45)) return pilih(P.SING4);
      s = kap(pilih(P.OK_I).replace('{n}', n));
      if (gaya !== 'ringkas' && ada(0.35)) s += pilih(P.OK_EKOR);
      return akhiri(s, gaya);
    }
    if (v === 3) {
      m = gaya === 'ringkas' ? 0 : rn(3);
      s = m === 0 ? pilih(P.KURANG_I).replace('{n}', n) : m === 1 ? frame(A) : pilih(P.KURANG_I).replace('{n}', n) + '. ' + frame(A);
      return akhiri(s, gaya);
    }
    s = (v === 2 ? pilih(P.KURANG2_I) : pilih(P.BELUM_I)).replace('{n}', n) + '. ' + frame(A);
    return akhiri(s, gaya);
  }
  // Kolom "Komentar Kritis" (telaah dokumen perencanaan)
  function komentarPra(A, v, gaya) {
    var s, m;
    if (v >= 4) {
      if (gaya === 'ringkas' && ada(0.4)) return akhiri(pilih(SINGKAT4), gaya);
      s = pilih(A.ok);
      if (gaya !== 'ringkas' && ada(gaya === 'naratif' ? 0.5 : 0.3)) s = pilih(OPEN_PRA_OK) + ' ' + s;
      if (gaya === 'naratif' && A.ok.length > 1 && ada(0.4)) s += pilih(P.SAMBUNG_PLUS) + pilih(A.ok);
      else if (gaya === 'naratif' && ada(0.4)) s += ', ' + pilih(EKOR4);
      return akhiri(s, gaya);
    }
    m = v <= 2 ? (ada(0.5) ? 0 : 2) : rn(4);
    if (gaya === 'ringkas' || m === 0) s = pilih(A.kurang);
    else if (m === 1) s = frame(A);
    else if (m === 2) s = pilih(A.kurang) + '; ' + lc(frame(A));
    else s = pilih(RINGAN) + pilih(P.KONTRAS) + pilih(A.kurang);
    if (v <= 2 && gaya !== 'ringkas' && ada(0.5)) s = (v === 1 ? 'Belum memadai: ' : 'Masih lemah: ') + lc(s);
    if (gaya !== 'ringkas' && m !== 1 && v === 3 && ada(gaya === 'naratif' ? 0.5 : 0.25)) s = pilih(OPEN_PRA) + ' ' + lc(s);
    if (gaya === 'naratif' && v === 3 && ada(0.4)) s += ', ' + pilih(EKOR3);
    return akhiri(s, gaya);
  }
  // Kolom "Catatan" pada telaah perangkat (Ada / Sesuai / Perlu perbaikan)
  function catatanTelaah(A, v, gaya) {
    var s;
    if (v >= 4) {
      s = pilih(A.ok);
      if (gaya !== 'ringkas' && ada(0.4)) s = pilih(['Sudah sesuai; ', 'Baik, ', 'Lengkap dan jelas: ']) + lc(s);
      return akhiri(s, gaya);
    }
    if (v === 3) {
      s = pilih(['Secara umum sudah ada, namun ', 'Sudah cukup, hanya saja ', 'Perangkat tersedia, tetapi ']) + lc(pilih(A.kr));
      if (gaya !== 'ringkas' && ada(0.6)) s += '. ' + frame(A);
      return akhiri(s, gaya);
    }
    s = (v === 1 ? pilih(['Perlu perbaikan: ', 'Belum memadai: ']) : pilih(['Perlu perbaikan: ', 'Masih lemah, ', ''])) + lc(pilih(A.kr)) + '. ' + frame(A);
    return akhiri(s, gaya);
  }

  /* ====================== KESIMPULAN: PENGAMAT (SUPERVISOR) ====================== */
  function sebutKat(kat, g) { return ada(g === 'ringkas' ? 0.3 : 0.55) ? ' ' + pilih(KAT_SUM[kat]) : ''; }
  var KUAT_MINIM = ['murid tetap mengikuti kegiatan dengan tertib', 'guru berupaya menyelesaikan materi sesuai waktu yang tersedia', 'ada niat baik guru untuk melibatkan murid dalam kegiatan', 'perangkat dan bahan ajar sudah disiapkan sebelum pelajaran', 'guru tetap menjaga suasana kelas agar bisa dilanjutkan'];
  function kekuatanSup(kuat, kat, g) {
    if (!kuat.length) return akhiri('Kekuatan yang tampak masih terbatas: ' + daftar(pilihN(KUAT_MINIM, 2)) + '.' + sebutKat(kat, g), g);
    var c = kuat.slice(0, g === 'ringkas' ? 2 : 3).map(function (x) { return pilih(x.A.s); }), s, a = rn(5);
    if (c.length === 1) return akhiri(akhiri(pilih(['Kekuatan yang tampak: ', 'Yang paling menonjol, ', '']) + (a % 2 ? c[0] : lc(c[0])), g) + sebutKat(kat, g), g);
    if (a === 0 && c.some(function (x) { return /;/.test(x); })) a = 2;
    if (a === 0) s = 'Kekuatan yang tampak: ' + c.join('; ') + '.';
    else if (a === 1) s = kap(c[0]) + '. Selain itu, ' + c[1] + (c[2] ? ', dan ' + c[2] : '') + '.';
    else if (a === 2) s = c.map(function (x, i) { return (i + 1) + ') ' + kap(x) + '.'; }).join(' ');
    else if (a === 3) s = 'Yang paling menonjol, ' + c[0] + '. Hal baik lainnya, ' + c[1] + (c[2] ? '; ' + c[2] : '') + '.';
    else s = kap(c[0]) + pilih(P.DAMPAK4) + '. ' + kap(c[1]) + '.';
    return akhiri(s + sebutKat(kat, g), g);
  }
  function areaSup(lemah, kat, g) {
    var c, s, a;
    if (!lemah.length) return akhiri('Tidak ada kelemahan yang berarti; hal kecil yang masih bisa dikembangkan adalah ' + pilih(P.KECIL_SUP), g);
    c = lemah.slice(0, g === 'ringkas' ? 2 : 3).map(obsLemah);
    a = rn(4);
    if ((a === 0 || a === 3) && c.some(function (x) { return /;/.test(x); })) a = 2;
    if (a === 0) s = 'Area pengembangan: ' + c.join('; ') + '. ' + frame(lemah[0].A);
    else if (a === 1) s = kap(c[0]) + (c[1] ? '. Selain itu, ' + c[1] : '') + '. Untuk itu, ' + lc(frame(lemah[0].A));
    else if (a === 2) s = c.map(function (x, i) { return (i + 1) + ') ' + kap(x) + ' (saran: ' + kAksi(lemah[i].A) + ').'; }).join(' ');
    else s = 'Beberapa hal yang perlu dibenahi: ' + c.join('; ') + '. ' + (lemah[1] ? frame(lemah[1].A) : frame(lemah[0].A));
    return akhiri(s, g);
  }
  function kesimpulanPra(kuat, lemah, kat, g) {
    var s = pilih({ 'Sangat Baik': ['Perangkat pembelajaran sudah sangat baik dan siap diobservasi.', 'Secara umum perangkat sangat memadai dan selaras dengan prinsip pembelajaran mendalam.'], 'Baik': ['Perangkat pembelajaran sudah baik dan siap diobservasi dengan beberapa penyempurnaan kecil.', 'Secara umum perangkat sudah memadai; ada beberapa bagian yang perlu dilengkapi sebelum observasi.'], 'Cukup': ['Perangkat pembelajaran cukup memadai, tetapi beberapa komponen penting perlu diperbaiki sebelum observasi.'], 'Perlu Pembinaan': ['Perangkat pembelajaran masih perlu banyak perbaikan; disepakati pendampingan sebelum observasi dilaksanakan.'] }[kat]);
    if (lemah.length) s += ' Yang perlu dilengkapi: ' + daftarN(lemah.slice(0, 2).map(function (x) { return lc(x.A.nama); })) + '.';
    if (lemah.length) s += ' Disepakati bahwa guru akan ' + kAksi(lemah[0].A) + (lemah[1] && ada(0.6) ? ', serta ' + kAksi(lemah[1].A) : '') + '.';
    else s += ' Tidak ada revisi mendasar; guru cukup merapikan bagian kecil dan mempertahankan kualitas yang ada.';
    s += pilih([' Observasi difokuskan pada ', ' Fokus pengamatan nanti: ']) + (kuat.length || lemah.length ? daftarN(unikA(lemah.concat(kuat)).slice(0, 2).map(function (x) { return lc(x.A.nama); })) : 'praktik pedagogis dan asesmen') + '.';
    return s;
  }
  function pembinaan(k) {
    if (/digital|x_digital|t_tek/.test(k)) return 'Pelatihan teknologi/AI';
    if (/^t_(cp|tp|modul|kerangka|jenjang|dpl)/.test(k)) return pilih(['Pendampingan penyusunan modul ajar', 'Lokakarya perangkat dan asesmen']);
    if (/x_kolab|x_produk|x_lingk|t_dudi|t_media/.test(k)) return ST.kejuruan ? pilih(['Magang/industry attachment guru produktif', 'Kunjungan kelas timbal balik']) : 'Komunitas belajar (KKG/MGMP)';
    if (/x_formatif|x_rubrik|x_umpan|asesmen|t_diag|t_sumatif|kriteria/.test(k)) return 'Lokakarya perangkat dan asesmen';
    if (/x_diferensiasi|x_nalar|x_model/.test(k)) return pilih(['Kunjungan kelas timbal balik', 'Komunitas belajar (KKG/MGMP)']);
    return pilih(['Coaching/mentoring sejawat', 'Kunjungan kelas timbal balik', 'Komunitas belajar (KKG/MGMP)']);
  }
  function waktuTindak() {
    var m = /^(\d{4})-(\d{1,2})/.exec(ST.tglISO || ''), pil = ['Minggu ke-2 setelah supervisi', '2–3 minggu setelah supervisi', 'Dalam 1 bulan', 'Sebelum akhir semester'];
    if (m) { var i = parseInt(m[2], 10) % 12; pil.push(BULAN[i] + ' ' + (parseInt(m[2], 10) === 12 ? parseInt(m[1], 10) + 1 : m[1])); }
    return pilih(pil);
  }
  function rtlN(n, lemah, kuat) {
    var it = lemah[n - 1], temuan, bentuk, target;
    if (it) {
      temuan = kap(obsLemah(it));
      bentuk = pembinaan(it.A.k);
      target = 'Pada observasi berikutnya guru ' + kAksi(it.A) + '; ' + pilih(INDIKATOR);
    } else {
      var kk = kuat[n - 1 - lemah.length];
      temuan = kk ? 'Praktik baik pada ' + kk.A.nama + ' perlu dipertahankan dan dibagikan' : pilih(P.KECIL_SUP);
      bentuk = kk ? 'Komunitas belajar (KKG/MGMP)' : pilih(['Coaching/mentoring sejawat', 'Kunjungan kelas timbal balik']);
      target = kk ? 'Guru membagikan praktiknya dalam satu forum berbagi; ' + pilih(INDIKATOR) : 'Penyempurnaan terlihat pada pertemuan berikutnya; ' + pilih(INDIKATOR);
    }
    return [temuan, bentuk, target, pilih(PJ), waktuTindak()].join(' | ');
  }
  function pemantauan(lemah) {
    var tgl = '(tanggal diisi saat monitoring)', m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(ST.tglISO || '');
    if (m) { var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + 21 + rn(15))); tgl = d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }
    var fokus = lemah.length ? daftarN(lemah.slice(0, 2).map(function (x) { return lc(x.A.nama); })) : 'konsistensi praktik baik';
    return [tgl, pilih(['Kunjungan kelas ulang dan pemeriksaan perangkat', 'Observasi lanjutan dan diskusi reflektif', 'Pemeriksaan perangkat dan pengamatan singkat di kelas']) + ' untuk melihat ' + fokus, 'Belum (diisi saat monitoring)', pilih(['Lanjutkan pembinaan sesuai hasil monitoring', 'Evaluasi capaian lalu tetapkan target berikutnya', 'Sesuaikan bentuk pembinaan dengan perkembangan guru'])].join(' | ');
  }

  /* ====================== JAWABAN SUDUT PANDANG GURU ====================== */
  function guruTulis(pool, lanjut) { var s = pilih(pool); if (lanjut && ada(0.6)) s += ' ' + pilih(lanjut); if (ada(0.3)) s += ' ' + pilih(EKSTRA_GURU); return s; }
  function guruBerhasil(kuat) {
    var a = kuat.length ? lc(kuat[0].A.nama) : 'keterlibatan murid dalam kegiatan', t = pilih(G.berhasil);
    return t.replace('{a}', a).replace('{A}', kap(a)).replace('{b}', pilih(G.bukti));
  }
  function guruUbah(lemah) {
    if (!lemah.length) return pilih(G.ubahKecil);
    return pilih(G.ubah).replace('{a}', daftarN(lemah.slice(0, 2).map(function (x) { return lc(x.A.nama); })));
  }
  function guruHasil(kat, lemah) {
    var x, a = lemah.length ? lc(lemah[0].A.nama) : 'beberapa bagian kecil';
    if (kat === 'Sangat Baik') { x = 85 + rn(11); return pilih(['Sebagian besar murid (sekitar ' + x + '%) mencapai TP dengan hasil kerja yang sesuai kriteria; hanya sedikit yang masih perlu perbaikan.', 'Hasil asesmen menunjukkan sekitar ' + x + '% murid sudah mencapai TP, dan produk mereka umumnya memenuhi kriteria yang ditetapkan.']); }
    if (kat === 'Baik') { x = 70 + rn(15); return pilih(['Sekitar ' + x + '% murid sudah mencapai TP; sisanya perlu pendampingan tambahan, terutama pada ' + a + '.', 'Hasil asesmen cukup baik: kira-kira ' + x + '% murid tuntas, sedangkan yang lain akan saya beri remedial singkat.']); }
    if (kat === 'Cukup') { x = 55 + rn(15); return pilih(['Baru sekitar ' + x + '% murid yang mencapai TP; saya perlu memperkuat ' + a + ' dan menyiapkan remedial.', 'Hasilnya sedang: sekitar ' + x + '% murid tuntas, dan sisanya masih kesulitan sehingga akan saya dampingi.']); }
    x = 35 + rn(20);
    return pilih(['Hasilnya belum memuaskan: hanya sekitar ' + x + '% murid yang mencapai TP, sehingga saya perlu merancang remedial dan memperbaiki ' + a + '.', 'Sebagian besar murid belum mencapai TP (yang tuntas sekitar ' + x + '%); saya akan mengulang bagian yang belum dipahami.']);
  }
  function guruKomitmen(lemah) {
    var a = lemah.length ? daftarN(lemah.slice(0, 2).map(function (x) { return lc(x.A.nama); })) : 'peningkatan kualitas pembelajaran';
    return pilih(G.komitmen).replace('{a}', a).replace('{ak}', lemah.length ? kAksi(lemah[0].A) : 'mempertahankan dan mengembangkan praktik yang sudah baik');
  }

  /* ====================== KESIMPULAN: FORM PERENCANAAN / IMPLEMENTASI VERSI AWAL ====================== */
  function tulisKelebihan(kuat, gaya) {
    var o = kuat.map(function (x) { return kOk(x.A); }).slice(0, gaya === 'ringkas' ? 2 : 3), fr;
    if (!o.length) o = pilihN(UMUM.ok, 2);
    if (o.length === 1) return akhiri(pilih(['Kelebihannya: ' + o[0], 'Perencanaan ini kuat karena ' + o[0], kap(o[0])]), gaya);
    fr = rn(3);
    if (gaya === 'ringkas') return akhiri(o[0] + '; ' + o[1], gaya);
    if (fr === 0) return akhiri('Kelebihannya: ' + daftar(o), gaya);
    if (fr === 1) return akhiri('Perencanaan ini kuat karena ' + o[0] + ' dan ' + o[1] + (o[2] ? '; selain itu, ' + o[2] : ''), gaya);
    return akhiri(o[0] + '. Selain itu, ' + o[1] + (o[2] ? ', dan ' + o[2] : '') + (gaya === 'naratif' && ada(0.6) ? ', ' + pilih(EKOR_KEL) : ''), gaya);
  }
  function tulisDitingkatkan(lemah, gaya) {
    var k = lemah.length ? pilihN(lemah.map(function (x) { return kKurang(x.A); }), 3).slice(0, gaya === 'ringkas' ? 2 : 3) : [lc(pilih(KECIL_PRA))], fr;
    if (k.length === 1) return akhiri(k[0], gaya);
    fr = rn(3);
    if (fr === 0) return akhiri('Hal yang perlu ditingkatkan: ' + k.join('; '), gaya);
    if (fr === 1) return akhiri(k[0] + '. Selain itu, ' + k.slice(1).join(', serta '), gaya);
    return akhiri('Perlu perhatian pada beberapa hal: ' + daftar(k), gaya);
  }
  function tulisRekomendasi(lemah, gaya) {
    var a, fr;
    if (!lemah.length) return pilih(REKOM_BAIK);
    a = lemah.slice(0, gaya === 'naratif' ? 3 : 2).map(function (x) { return kAksi(x.A); });
    if (a.length === 1) return akhiri(pilih(['Disarankan untuk ' + a[0] + ', agar prinsip pembelajaran mendalam semakin tergambar pada setiap pengalaman belajar', 'Revisi sebaiknya difokuskan pada satu hal: ' + a[0]]), gaya);
    fr = rn(4);
    if (fr === 0) return akhiri('Disarankan untuk ' + daftar(a) + ', lalu merevisi perencanaan sesuai prinsip pembelajaran mendalam', gaya);
    if (fr === 1) return akhiri('Revisi sebaiknya difokuskan pada ' + (a.length === 2 ? 'dua hal' : 'tiga hal') + ': ' + a.join('; '), gaya);
    if (fr === 2) return akhiri('Lakukan revisi ringan: ' + a.join('; ') + '. Setelah itu perencanaan siap diterapkan', gaya);
    return akhiri('Perlu ' + a[0] + ', kemudian lanjutkan dengan ' + daftar(a.slice(1)), gaya);
  }
  function tulisPelajaran(kuat, gaya) {
    var p = pilih(PELAJARAN), h = pilihN(PENDUKUNG, gaya === 'naratif' ? 3 : 2), fr = rn(3), s;
    if (gaya === 'ringkas') return akhiri(p + '. Pendukung: ' + h.join(', '), gaya);
    s = fr === 0 ? p + '. Faktor pendukung: ' + daftar(h) : fr === 1 ? p + ', didukung oleh ' + daftar(h) : 'Faktor pendukung utamanya ' + daftar(h) + '. ' + p;
    if (kuat.length && ada(0.5)) s += '. Hal yang paling terasa berhasil: ' + lc(kuat[0].A.nama);
    return akhiri(s, gaya);
  }
  function tulisBelum(lemah, sangatBaik, gaya) {
    var b = [], h = pilihN(PENGHAMBAT, 2), s;
    if (lemah.length) b = pilihN(lemah.map(function (x) { return kKurang(x.A); }), 2);
    if (!b.length || ada(0.4)) b.push(lc(pilih(BELUM_UMUM)));
    b = b.slice(0, gaya === 'ringkas' ? 1 : 2);
    s = kap(b[0]) + (b[1] ? '; ' + b[1] : '');
    if (sangatBaik && ada(0.5)) s = 'Hampir seluruh target tercapai; ' + lc(s);
    s += (gaya === 'ringkas' ? '. Penghambat: ' + h[0] : '. Faktor penghambat: ' + daftar(h.slice(0, gaya === 'naratif' ? 2 : 1)));
    return akhiri(s, gaya);
  }
  function tulisRtl(lemah, gaya) {
    var a = lemah.map(function (x) { return kAksi(x.A); }).slice(0, 2).concat(pilihN(RTL_UMUM, 2));
    a = a.slice(0, gaya === 'ringkas' ? 2 : gaya === 'naratif' ? 4 : 3);
    return akhiri(pilih(['Ke depan: ', 'Rencana tindak lanjut: ', 'Langkah berikutnya: ', '']) + daftar(a), gaya);
  }
  // Isian "Catatan / Tindak Lanjut" di bawah tiap form
  var CAT_PRA = { 'Sangat Baik': ['Perencanaan sudah sangat baik dan layak dijadikan contoh', 'Perangkat sangat memadai; pertahankan'], 'Baik': ['Perencanaan sudah baik dan siap dipakai dengan sedikit penyempurnaan', 'Perangkat secara umum sudah baik'], 'Cukup': ['Perencanaan cukup memadai, tetapi beberapa bagian perlu diperbaiki', 'Perangkat sudah cukup, namun belum lengkap'], 'Perlu Pembinaan': ['Perencanaan masih perlu banyak perbaikan', 'Perangkat belum memadai dan perlu didampingi'] };
  function catatanUmum(kat, lemah, gaya) {
    var s = pilih(MODE === 'pra' ? CAT_PRA[kat] : kat === 'Sangat Baik' ? CAT_SB : kat === 'Baik' ? CAT_BAIK : kat === 'Cukup' ? CAT_CUKUP : CAT_KURANG);
    if (lemah.length && (kat !== 'Sangat Baik' || ada(0.5))) s += '. ' + pilih(['Tindak lanjut: ', 'Ke depan, perlu ', 'Disepakati untuk ']) + kAksi(lemah[rn(Math.min(2, lemah.length))].A);
    else if (kat === 'Sangat Baik' && ada(0.6)) s += '. ' + pilih(CAT_EKOR_SB);
    return akhiri(s, gaya);
  }
  // Isian identitas pada form (info)
  function infoIsi(t, ctx, kat) {
    var m, y;
    if (/mata pelajaran/.test(t)) return (ctx.mapel && ctx.mapel !== '—') ? ctx.mapel : '';
    if (/^fase/.test(t)) return /^xii?(\s|$|-|\.)|^xi(\s|$)/i.test(ST.kelas) ? (/^x(\s|$|-)/i.test(ST.kelas) ? 'E' : 'F') : '';
    if (/semester/.test(t) && (m = /^(\d{4})-(\d{1,2})/.exec(ST.tglISO || ''))) { y = +m[1]; return +m[2] >= 7 ? 'Gasal / ' + y + '/' + (y + 1) : 'Genap / ' + (y - 1) + '/' + y; }
    if (/hari, tanggal/.test(t) && ST.tglISO) { try { return new Date(ST.tglISO + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); } catch (e) { return ''; } }
    if (/fokus supervisi/.test(t)) return pilihN(['Praktik pedagogis', 'Kemitraan', 'Lingkungan belajar', 'Pemanfaatan digital', 'Asesmen'].concat(ST.kejuruan ? ['Pembelajaran kejuruan TEFA-DUDI'] : []), 2).join(', ');
    if (/^kelas/.test(t)) return ST.kelas || '';
    return '';
  }

  /* ====================== FUNGSI UTAMA ====================== */
  // Sebar skor 1–4 pada m butir bebas. Butir lain (c buah, jumlah skor S) sudah tetap. Jumlah dibuat sedekat mungkin dengan target
  // dan bila bisa kategorinya sama dengan yang diketik.
  function sebar(m, c, S, tg) {
    if (!m) return [];
    var N = m + c, d = Math.max(m, Math.min(4 * m, Math.round(tg.persen / 100 * 4 * N) - S)), g;
    for (g = 0; g < 8 && kategori(Math.round((S + d) / (4 * N) * 100)) !== tg.kat; g++) {
      var nd = Math.round((S + d) / (4 * N) * 100) < tg.persen ? d + 1 : d - 1;
      if (nd < m || nd > 4 * m) break;
      d = nd;
    }
    var base = Math.floor(d / m), rem = d - base * m, a = [], i, t;
    for (i = 0; i < m; i++) a.push(i < rem ? base + 1 : base);
    for (t = 0; t < Math.floor(m / 3); t++) { var x = rn(m), y = rn(m); if (x !== y && a[x] < 4 && a[y] > 1) { a[x]++; a[y]--; } }
    return acak(a);
  }
  function pilihanKat(op, kat) {
    var ix = -1;
    op.forEach(function (o, i) { if (ix < 0 && o.toLowerCase().indexOf(kat.toLowerCase()) === 0) ix = i; });
    if (ix < 0) op.forEach(function (o, i) { if (ix < 0 && /^sesuai/i.test(o)) ix = i; });
    return ix >= 0 ? String(ix + 1) : '';
  }
  function isi(f, target, ctx) {
    var tg = (target && typeof target === 'object') ? target : baca(target);
    if (!tg) throw new Error('Target nilai harus berupa angka ' + MIN_PERSEN + '–100 (persen) atau 1–4 (rata-rata).');
    ctx = ctx || {}; dipakai = {};
    var awal = ctx.jawabanAwal || {}, tetap = ctx.tetap || {}, pen = window.SvForm ? SvForm.penentu(f) : null, kat = tg.kat;
    if (window.SvForm) f = SvForm.aktif(f, awal);   // mapel non-kejuruan: indikator (K) dilewati
    var kej = !!(pen && String(awal[pen.id]) === '1');
    ST = { mapel: (ctx.mapel && ctx.mapel !== '—') ? ctx.mapel : '', kelas: ctx.kelas || '', tglISO: ctx.tanggal || '', kejuruan: kej,
      ruang: kej ? ['bengkel', 'ruang praktik', 'laboratorium'][rn(3)] : 'kelas',
      sebut: ['murid', 'murid', 'murid', 'murid', 'siswa', 'siswa', 'peserta didik'][rn(7)], sapa: ['Bapak/Ibu', 'Bapak/Ibu', 'guru'][rn(3)] };
    var jw = {}, gForm = pilih(['ringkas', 'biasa', 'biasa', 'naratif']), pq = f.pertanyaan;
    var skala = pq.filter(function (q) { return q.tipe === 'skala'; });
    var bc = pq.filter(function (q) { return q.tipe === 'bukti_catatan'; });
    var telaah = pq.filter(telaahQ);
    // Skala dengan kolom "Bukti ..." (atau butir bukti_catatan) = form pelaksanaan; selain itu telaah perencanaan
    MODE = (skala.some(function (q) { return /bukti/i.test(q.komentar || ''); }) || (!skala.length && bc.length)) ? 'sup' : 'pra';
    var nb = {}, asp = {}, S = 0, c = 0, bebas = [];
    skala.forEach(function (q) {
      var v = parseInt(tetap[q.id], 10);
      if (v >= 1 && v <= 4) { nb[q.id] = v; S += v; c++; } else bebas.push(q);
    });
    var sk = sebar(bebas.length, c, S, tg);
    bebas.forEach(function (q, i) { nb[q.id] = sk[i]; });
    var bk = sebar(bc.length, 0, 0, tg); bc.forEach(function (q, i) { nb[q.id] = bk[i]; });
    var tk = sebar(telaah.length, 0, 0, tg); telaah.forEach(function (q, i) { nb[q.id] = tk[i]; });
    var butir = pq.filter(function (q) { return nb[q.id] !== undefined; });
    butir.forEach(function (q) { asp[q.id] = aspekDari(q); });
    var daftarB = butir.map(function (q) { return { A: asp[q.id], v: nb[q.id] }; });
    var kuat = acak(unikA(bukanUmum(daftarB.filter(function (x) { return x.v === 4; }))));
    var lemah = unikA(bukanUmum(acak(daftarB.filter(function (x) { return x.v <= 3; })).sort(function (a, b) { return a.v - b.v; })));
    if (!daftarB.some(function (x) { return x.v === 4; })) kuat = [];
    if (!daftarB.some(function (x) { return x.v <= 3; })) lemah = [];
    var total = 0; skala.forEach(function (q) { total += nb[q.id]; });
    var katAkhir = skala.length ? kategori(Math.round(total / (skala.length * 4) * 100)) : kat;

    pq.forEach(function (q) {
      var t = q.teks.toLowerCase(), g = gayaItem(gForm), v;
      if (q.tipe === 'skala') {
        v = nb[q.id]; jw[q.id] = String(v);
        if (q.komentar) jw[q.id + '_k'] = MODE === 'sup' ? (/bukti/i.test(q.komentar) ? bukti(asp[q.id], v, g) : catatanSup(asp[q.id], v, g)) : komentarPra(asp[q.id], v, g);
        // Bila kolomnya "Bukti / Catatan" (satu kolom), gabungkan pengamatan dan saran singkat agar tetap relevan
        if (MODE === 'sup' && /bukti/i.test(q.komentar || '') && v <= 3 && ada(0.55)) jw[q.id + '_k'] = akhiri(jw[q.id + '_k'].replace(/\.$/, '') + '. ' + frame(asp[q.id]), g);
        else if (MODE === 'sup' && /bukti/i.test(q.komentar || '') && v === 4 && g !== 'ringkas' && ada(0.25)) jw[q.id + '_k'] = akhiri(jw[q.id + '_k'].replace(/\.$/, '') + '. ' + pilih(P.SING4), g);
      } else if (q.tipe === 'pilihan') {
        var op = q.opsi || [];
        if (telaahQ(q)) {
          v = nb[q.id]; var A = asp[q.id], iS = -1, iA = -1, iP = -1;
          op.forEach(function (o, i) { if (/^sesuai/i.test(o)) iS = i; else if (/^ada/i.test(o)) iA = i; else if (/perlu|kurang/i.test(o)) iP = i; });
          var ix = v >= 4 ? iS : v === 3 ? (iA >= 0 ? iA : iS) : (iP >= 0 ? iP : iS);
          jw[q.id] = ix >= 0 ? String(ix + 1) : '';
          if (q.komentar) jw[q.id + '_k'] = catatanTelaah(A, v, g);
        } else if (/hasil supervisi/.test(t)) {
          jw[q.id] = pilihanKat(op, katAkhir); if (q.komentar) jw[q.id + '_k'] = '';
        } else {
          jw[q.id] = pilihanKat(op, kat); if (q.komentar) jw[q.id + '_k'] = '';
        }
      } else if (q.tipe === 'ya_tidak') jw[q.id] = 'Ya';
      else if (q.tipe === 'bukti_catatan') {
        v = nb[q.id];
        jw[q.id + '_b'] = bukti(asp[q.id], v, g);
        jw[q.id + '_c'] = catatanSup(asp[q.id], v, g);
      } else if (q.tipe === 'info') jw[q.id] = infoIsi(t, ctx, kat);
      else if (q.tipe === 'teks') {
        var m;
        jw[q.id] =
          (m = /rencana tindak lanjut (\d)/.exec(t)) ? rtlN(parseInt(m[1], 10), lemah, kuat) :
          /pemantauan tindak lanjut/.test(t) ? pemantauan(lemah) :
          /komitmen guru/.test(t) ? guruKomitmen(lemah) :
          /kekuatan yang tampak/.test(t) ? kekuatanSup(kuat, katAkhir, g) :
          /area pengembangan/.test(t) ? areaSup(lemah, katAkhir, g) :
          /tujuan pembelajaran hari ini/.test(t) ? guruTulis(G.tujuan, G.lanjutTujuan) :
          /kondisi awal murid/.test(t) ? guruTulis(G.kondisi, G.lanjutKondisi) :
          /pengalaman belajar apa yang membuat/.test(t) ? guruTulis(G.bermakna, G.lanjutBermakna) :
          /mengecek pemahaman dan memberi umpan balik/.test(t) ? guruTulis(G.cek, G.lanjutCek) :
          /tantangan apa yang anda antisipasi/.test(t) ? (pilih(G.tantanganA) + ' ' + pilih(G.tantanganB)) :
          /kesimpulan pra-supervisi/.test(t) ? kesimpulanPra(kuat, lemah, katAkhir, g) :
          /bagian mana yang paling berhasil/.test(t) ? guruBerhasil(kuat) :
          /ingin anda ubah/.test(t) ? guruUbah(lemah) :
          /dibandingkan tp|hasil asesmen\/produk/.test(t) ? guruHasil(katAkhir, lemah) :
          /apa kendala \(waktu|kendala.*dukungan/.test(t) ? (pilih(G.kendalaA) + ' ' + pilih(G.kendalaB)) :
          /kelebihan/.test(t) ? tulisKelebihan(kuat, g) :
          /ditingkatkan/.test(t) ? tulisDitingkatkan(lemah, g) :
          /rekomendasi/.test(t) ? tulisRekomendasi(lemah, g) :
          /pelajaran apa/.test(t) ? tulisPelajaran(kuat, g) :
          /belum memuaskan/.test(t) ? tulisBelum(lemah, katAkhir === 'Sangat Baik', g) :
          /tindak lanjut/.test(t) ? tulisRtl(lemah, g) : catatanUmum(katAkhir, lemah, g);
      }
    });
    if (pen && awal[pen.id]) jw[pen.id] = String(awal[pen.id]);   // pilihan jenis mapel dari supervisor dipertahankan
    Object.keys(jw).forEach(function (k) { if (typeof jw[k] === 'string') jw[k] = done(jw[k]); });
    var skor = skala.length ? { rata: (total / skala.length).toFixed(2).replace('.', ','), persen: Math.round(total / (skala.length * 4) * 100) } : null;
    if (skor) skor.kat = kategori(skor.persen);
    var cat = done(catatanUmum(katAkhir, lemah, gForm));
    return { jawaban: jw, catatan: cat, skor: skor };
  }
  return { isi: isi, baca: baca, kategori: kategori, AMBANG: AMBANG, TERENDAH: TERENDAH, MIN_PERSEN: MIN_PERSEN };
})();
