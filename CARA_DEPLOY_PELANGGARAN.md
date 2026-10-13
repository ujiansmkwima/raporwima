# Catatan Pelanggaran dari CP -> Buku Induk, Wali Kelas, Siswa

## File
- BARU  `pelanggaran-cp.js`  (modul pembaca data CP; URL & anon key project CP ada di bagian atas file)
- UBAH  `bukuinduk-core.js` (v=10), `bukuinduk-admin.html`, `bukuinduk-guru.html`, `guru.html`, `siswa.html`
- Tidak ada migrasi SQL dan tidak ada perubahan di aplikasi CP.

## Hasil
- Buku Induk (admin & wali kelas): tab baru **Pelanggaran (CP)** per siswa + bagian
  "N. Catatan Pelanggaran" pada Cetak Biodata/Lengkap (tidak ikut di Cetak Nilai).
- Wali kelas (guru.html): menu **Pelanggaran Kelas** - ringkasan per siswa (TA aktif) dan detail semua tahun ajaran.
- Siswa: menu **Lihat Catatan Pelanggaran** - hanya catatan miliknya, dikelompokkan per tahun ajaran, beserta poin.

## Cara pencocokan siswa
1. NIS (bila kolom NIS di pv_siswa CP terisi), lalu
2. Nama (huruf besar/kecil dan spasi ganda diabaikan). Bila ada dua siswa bernama sama, dicocokkan dengan kelas;
   bila masih ambigu, catatan itu dilewati agar tidak salah orang.
Saran: isi kolom NIS saat menarik siswa dari rapor di CP supaya pencocokan memakai NIS.

## Catatan keamanan
Tabel CP memakai policy `anon_all` (siapa pun yang punya anon key bisa membaca). Modul ini hanya mengirim
permintaan GET dan memfilter berdasarkan siswa yang login, tetapi pembatasannya ada di sisi aplikasi, bukan di database.
Jika kelak ingin pembatasan ketat, salin data pv_catatan ke database rapor (edge function) dan pakai RLS.
