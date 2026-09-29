/* supervisi-otomatis.js — isi jawaban otomatis (draft) berdasarkan TARGET NILAI: 'BAIK' atau 'SANGAT BAIK'.
   Skala 1–4: BAIK = ±25% butir bernilai 4, sisanya 3 (rata-rata ≈ 3,27 / 82%);
              SANGAT BAIK = ±80% butir bernilai 4, sisanya 3 (rata-rata ≈ 3,80 / 95%).
   Ubah nilai P4 di bawah kalau ingin komposisi lain (jumlah butir 4 juga diberi selisih ±1 supaya tidak selalu sama).

   Supaya terbaca seperti ditulis manusia:
   1. Setiap butir dikenali topiknya (pedagogis, lingkungan, digital, asesmen awal, dst.) dari teks pertanyaan,
      lalu komentarnya dibuat khusus untuk topik itu dan disesuaikan dengan nilainya (4 = pujian, 3 = pujian ringan + saran).
   2. Kalimat dirangkai dari potongan-potongan (pembuka, isi, sambungan, penutup), bukan template utuh.
   3. Tiap kali dijalankan dipilih "gaya" penulis: ringkas / biasa / naratif; panjang & tanda baca ikut bervariasi antarbutir.
   4. Kalimat yang sama tidak dipakai dua kali dalam satu formulir selama masih ada pilihan lain.
   5. Kesimpulan (kelebihan, hal yang ditingkatkan, rekomendasi, refleksi) diambil dari butir yang benar-benar dinilai
      tinggi / rendah pada formulir yang sama, jadi isinya konsisten dengan nilai.
   Kalau admin mengubah pertanyaan, butir yang topiknya tak dikenali memakai kumpulan kalimat umum. */
var SvOto = (function () {
  var P4 = { 'BAIK': 0.25, 'SANGAT BAIK': 0.8 };

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

  /* ====================== UTILITAS ====================== */
  var dipakai = {};   // kalimat yang sudah terpakai pada pengisian ini (agar tidak berulang)
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
  function daftar(a) { return a.length < 2 ? (a[0] || '') : a.length === 2 ? a[0] + ' dan ' + a[1] : a.slice(0, -1).join(', ') + ', dan ' + a[a.length - 1]; }
  function akhiri(s, gaya) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    if (!s) return s;
    s = kap(s);
    if (/[.!?]$/.test(s)) return s;
    if (gaya === 'ringkas' && s.length < 90 && ada(0.4)) return s;   // catatan singkat sering tanpa titik
    return s + '.';
  }
  var MODE = 'pra';   // 'pra' = form perencanaan (skala), 'sup' = form implementasi (bukti + catatan)
  function kOk(A) { return MODE === 'sup' ? pilih(OK_I).replace('{n}', A.nama) : pilih(A.ok); }
  function kKurang(A) { return MODE === 'sup' ? pilih(KURANG_I).replace('{n}', A.nama) : pilih(A.kurang); }
  function kAksi(A) { return pilih(MODE === 'sup' ? A.aksiI : A.aksi); }
  function aspekDari(teks) {
    var t = String(teks || '').toLowerCase();
    for (var i = 0; i < ASPEK.length; i++) if (ASPEK[i].re.test(t)) return ASPEK[i];
    return UMUM;
  }
  function gayaItem(gForm) { return ada(0.7) ? gForm : pilih(['ringkas', 'biasa', 'naratif']); }
  function bukanUmum(l) { var h = l.filter(function (a) { return a.k !== 'umum'; }); return h.length ? h : l; }
  function unik(l) { var s = {}; return l.filter(function (a) { if (s[a.k]) return false; s[a.k] = 1; return true; }); }

  /* ====================== KOMENTAR PER BUTIR ====================== */
  // Kolom "Komentar Kritis" (form perencanaan, skala 1–4)
  function komentarSkala(A, kuat, gaya) {
    var s;
    if (kuat) {
      if (gaya === 'ringkas' && ada(0.45)) return akhiri(pilih(SINGKAT4), gaya);
      s = pilih(A.ok);
      if (gaya !== 'ringkas' && ada(gaya === 'naratif' ? 0.5 : 0.3)) s = pilih(OPEN_PRA_OK) + ' ' + s;
      if (gaya === 'naratif' && ada(0.5)) s += ', ' + pilih(EKOR4);
      return akhiri(s, gaya);
    }
    var m = rn(4);
    if (gaya === 'ringkas' || m === 0) s = pilih(A.kurang);
    else if (m === 1) s = pilih(FRAME_SARAN) + pilih(A.aksi);
    else if (m === 2) s = pilih(A.kurang) + '; ' + kecilAwal(pilih(FRAME_SARAN)) + pilih(A.aksi);
    else s = pilih(RINGAN) + pilih(SAMBUNG_KONTRAS) + pilih(A.kurang);
    if (gaya !== 'ringkas' && m !== 1 && ada(gaya === 'naratif' ? 0.5 : 0.25)) s = pilih(OPEN_PRA) + ' ' + kecilAwal(s);
    if (gaya === 'naratif' && ada(0.4)) s += ', ' + pilih(EKOR3);
    return akhiri(s, gaya);
  }
  // Kolom "Bukti Pembelajaran" (form implementasi)
  function buktiObs(A, kuat, gaya) {
    var s = pilih(A.obs);
    if (gaya !== 'ringkas' && ada(gaya === 'naratif' ? 0.5 : 0.35)) s = pilih(OPEN_OBS) + ' ' + s;
    if (kuat) { if (gaya === 'naratif' && ada(0.6)) s += ', ' + pilih(EKOR_OBS4); }
    else if (ada(gaya === 'ringkas' ? 0.3 : 0.65)) s += pilih(SAMBUNG_KONTRAS) + pilih(KENDALA3);
    return akhiri(s, gaya);
  }
  // Kolom "Catatan" (form implementasi)
  function catatanButir(A, kuat, gaya) {
    var s, m;
    if (kuat) {
      if (gaya === 'ringkas' && ada(0.4)) return akhiri(pilih(SINGKAT_CAT4), gaya);
      s = kOk(A);
      if (gaya !== 'ringkas' && ada(0.3)) s = pilih(OPEN_CAT) + ' ' + kecilAwal(s);
      if (gaya === 'naratif' && ada(0.4)) s += ', ' + pilih(EKOR4);
      return akhiri(s, gaya);
    }
    m = rn(3);
    if (m === 0 || gaya === 'ringkas') s = kKurang(A);
    else if (m === 1) s = pilih(FRAME_SARAN) + kAksi(A);
    else s = pilih(RINGAN) + pilih(SAMBUNG_KONTRAS) + kKurang(A);
    if (gaya === 'naratif' && ada(0.3) && m !== 1) s = pilih(OPEN_CAT) + ' ' + kecilAwal(s);
    return akhiri(s, gaya);
  }
  function kecilAwal(s) { return s.charAt(0).toLowerCase() + s.slice(1); }

  /* ====================== KESIMPULAN & REFLEKSI ====================== */
  function tulisKelebihan(kuat, gaya) {
    var o = kuat.map(kOk).slice(0, gaya === 'ringkas' ? 2 : 3), fr;
    if (!o.length) o = pilihN(UMUM.ok, 2);
    if (o.length === 1) return akhiri(pilih(['Kelebihannya: ' + o[0], 'Perencanaan ini kuat karena ' + o[0], kap(o[0])]), gaya);
    fr = rn(3);
    if (gaya === 'ringkas') return akhiri(o[0] + '; ' + o[1], gaya);
    if (fr === 0) return akhiri('Kelebihannya: ' + daftar(o), gaya);
    if (fr === 1) return akhiri('Perencanaan ini kuat karena ' + o[0] + ' dan ' + o[1] + (o[2] ? '; selain itu, ' + o[2] : ''), gaya);
    return akhiri(o[0] + '. Selain itu, ' + o[1] + (o[2] ? ', dan ' + o[2] : '') + (gaya === 'naratif' && ada(0.6) ? ', ' + pilih(EKOR_KEL) : ''), gaya);
  }
  function tulisDitingkatkan(lemah, gaya) {
    var k = lemah.length ? pilihN(lemah.map(kKurang), 3).slice(0, gaya === 'ringkas' ? 2 : 3) : [kecilAwal(pilih(KECIL_PRA))], fr;
    if (k.length === 1) return akhiri(k[0], gaya);
    fr = rn(3);
    if (fr === 0) return akhiri('Hal yang perlu ditingkatkan: ' + k.join('; '), gaya);
    if (fr === 1) return akhiri(k[0] + '. Selain itu, ' + k.slice(1).join(', serta '), gaya);
    return akhiri('Perlu perhatian pada beberapa hal: ' + daftar(k), gaya);
  }
  function tulisRekomendasi(lemah, gaya) {
    var a, fr;
    if (!lemah.length) return pilih(REKOM_BAIK);
    a = lemah.slice(0, gaya === 'naratif' ? 3 : 2).map(kAksi);
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
    if (kuat.length && ada(0.45)) s += '. Hal yang paling terasa berhasil: ' + kOk(kuat[rn(kuat.length)]);
    return akhiri(s, gaya);
  }
  function tulisBelum(lemah, sangatBaik, gaya) {
    var b = [], h = pilihN(PENGHAMBAT, 2), s;
    if (lemah.length) b = pilihN(lemah.map(kKurang), 2);
    if (!b.length || ada(0.4)) b.push(kecilAwal(pilih(BELUM_UMUM)));
    b = b.slice(0, gaya === 'ringkas' ? 1 : 2);
    s = kap(b[0]) + (b[1] ? '; ' + b[1] : '');
    if (sangatBaik && ada(0.5)) s = 'Hampir seluruh target tercapai; ' + kecilAwal(s);
    s += (gaya === 'ringkas' ? '. Penghambat: ' + h[0] : '. Faktor penghambat: ' + daftar(h.slice(0, gaya === 'naratif' ? 2 : 1)));
    return akhiri(s, gaya);
  }
  function tulisRtl(lemah, gaya) {
    var a = lemah.map(kAksi).slice(0, 2).concat(pilihN(RTL_UMUM, 2));
    a = a.slice(0, gaya === 'ringkas' ? 2 : gaya === 'naratif' ? 4 : 3);
    return akhiri(pilih(['Ke depan: ', 'Rencana tindak lanjut: ', 'Langkah berikutnya: ', '']) + daftar(a), gaya);
  }
  function catatanUmum(target, lemah, gaya) {
    var s = pilih(target === 'BAIK' ? CAT_BAIK : CAT_SB);
    if (lemah.length && (target === 'BAIK' || ada(0.5))) s += '. Ke depan, perlu ' + kAksi(lemah[rn(lemah.length)]);
    else if (target === 'SANGAT BAIK' && ada(0.6)) s += '. ' + pilih(CAT_EKOR_SB);
    return akhiri(s, gaya);
  }

  /* ====================== FUNGSI UTAMA ====================== */
  function isi(f, target, ctx) {
    if (!P4[target]) throw new Error('Target nilai harus dipilih: BAIK atau SANGAT BAIK.');
    ctx = ctx || {}; dipakai = {};
    var jw = {}, gForm = pilih(['ringkas', 'biasa', 'biasa', 'naratif']), pq = f.pertanyaan;
    var skala = pq.filter(function (q) { return q.tipe === 'skala'; });
    MODE = skala.length ? 'pra' : 'sup';
    var butir = pq.filter(function (q) { return q.tipe === 'skala' || q.tipe === 'bukti_catatan'; });
    var n4 = Math.round(butir.length * P4[target]);
    if (butir.length >= 8) n4 = Math.max(0, Math.min(butir.length, n4 + rn(3) - 1));   // selisih ±1 supaya tiap hasil tidak persis sama
    var nilai = acak(butir.map(function (_, i) { return i < n4 ? 4 : 3; })), nb = {}, asp = {};
    butir.forEach(function (q, i) { nb[q.id] = nilai[i]; asp[q.id] = aspekDari(q.teks); });
    var kuat = unik(bukanUmum(butir.filter(function (q) { return nb[q.id] === 4; }).map(function (q) { return asp[q.id]; })));
    var lemah = unik(bukanUmum(butir.filter(function (q) { return nb[q.id] === 3; }).map(function (q) { return asp[q.id]; })));
    if (!butir.filter(function (q) { return nb[q.id] === 4; }).length) kuat = [];
    if (!butir.filter(function (q) { return nb[q.id] === 3; }).length) lemah = [];
    var acKuat = acak(kuat), acLemah = acak(lemah), total = 0;

    pq.forEach(function (q) {
      var t = q.teks.toLowerCase(), g = gayaItem(gForm), v, k;
      if (q.tipe === 'skala') {
        v = nb[q.id]; k = v === 4; total += v; jw[q.id] = String(v);
        if (q.komentar) jw[q.id + '_k'] = komentarSkala(asp[q.id], k, g);
      } else if (q.tipe === 'ya_tidak') jw[q.id] = 'Ya';
      else if (q.tipe === 'bukti_catatan') {
        k = nb[q.id] === 4;
        jw[q.id + '_b'] = buktiObs(asp[q.id], k, g);
        jw[q.id + '_c'] = catatanButir(asp[q.id], k, g);
      } else if (q.tipe === 'info') jw[q.id] = (/mata pelajaran/.test(t) && ctx.mapel && ctx.mapel !== '—') ? ctx.mapel : '';
      else if (q.tipe === 'teks') {
        jw[q.id] = /kelebihan/.test(t) ? tulisKelebihan(acKuat, g) :
          /ditingkatkan/.test(t) ? tulisDitingkatkan(acLemah, g) :
          /rekomendasi/.test(t) ? tulisRekomendasi(acLemah, g) :
          /pelajaran apa/.test(t) ? tulisPelajaran(acKuat, g) :
          /belum memuaskan/.test(t) ? tulisBelum(acLemah, target === 'SANGAT BAIK', g) :
          /tindak lanjut/.test(t) ? tulisRtl(acLemah, g) : catatanUmum(target, acLemah, g);
      }
    });
    var skor = skala.length ? { rata: (total / skala.length).toFixed(2).replace('.', ','), persen: Math.round(total / (skala.length * 4) * 100) } : null;
    return { jawaban: jw, catatan: catatanUmum(target, acLemah, gForm), skor: skor };
  }
  return { isi: isi };
})();
