# Login Siswa (NIS + siswa123)

## File baru / berubah
- BARU  `migrasi_akun_siswa.sql`  -> jalankan di Supabase (project RAPOR) -> SQL Editor
- BARU  `siswa.html`              -> portal siswa
- UBAH  `index.html`, `portal.html`, `supabase-client.js`, `guru.html`, `admin.html`

## Langkah
1. Jalankan `migrasi_akun_siswa.sql` (aman diulang). Di akhir otomatis membuat akun semua siswa ber-NIS.
   Hasilnya (jumlah akun dibuat / dilewati / gagal) tampil di panel hasil.
2. Upload file-file di atas ke hosting.
3. Coba login di halaman Masuk: ketik NIS, sandi `siswa123`.

## Catatan
- Akun siswa = `<NIS>@siswa.raporwima.local` (siswa cukup mengetik NIS).
- Siswa baru / NIS diubah / siswa dihapus -> akun mengikuti otomatis (trigger).
- Siswa tanpa NIS (atau NIS mengandung spasi) dilewati: lihat query pemeriksaan di akhir file SQL.
- Lupa sandi:  `select public.reset_sandi_siswa('NIS');`  (SQL Editor)
- Migrasi ini MENGETATKAN policy lama "semua user login boleh baca siswa/siswa_kelas/dst"
  menjadi guru/admin saja. Tanpa itu, siswa bisa membaca biodata semua siswa lewat API.
- Menu Catatan Pelanggaran: sudah aktif, membaca dari aplikasi CP (lihat `CARA_DEPLOY_PELANGGARAN.md`).

## Terbitkan Rapor ke Siswa (BARU)
Rapor tidak lagi langsung terlihat siswa. Admin harus menerbitkannya per periode (tahun ajaran + semester),
dengan tanggal & jam terbit yang diatur. Satu klik berlaku untuk semua siswa & kelas pada periode itu.

File: BARU `migrasi_terbit_rapor.sql` · UBAH `admin.html`, `siswa.html`

Langkah:
1. Jalankan `migrasi_terbit_rapor.sql` di Supabase SQL Editor (setelah `migrasi_akun_siswa.sql`; aman diulang).
   Setelah ini SEMUA periode berstatus belum terbit.
2. Upload `admin.html` dan `siswa.html`.
3. Panel Admin -> menu **Terbitkan Rapor** -> pilih periode -> atur tanggal & jam -> klik **Terbitkan**.

Catatan:
- Waktu di masa depan = terjadwal; rapor otomatis terbuka saat waktunya tiba (tanpa perlu klik lagi).
- Tombol **Tarik kembali** menyembunyikan rapor dari siswa lagi.
- Dikunci di database (RLS): nilai rapor, kokurikuler, ekskul, dan nama wali kelas tidak bisa dibaca siswa sebelum terbit.
- Menu Lihat Presensi siswa tidak ikut dikunci (data presensi tetap tampil seperti sebelumnya).

## Reset Sandi Siswa oleh Admin (BARU)
File: BARU `migrasi_reset_sandi_siswa.sql` · UBAH `admin.html`

1. Jalankan `migrasi_reset_sandi_siswa.sql` di Supabase SQL Editor (aman diulang).
2. Upload `admin.html`.
3. Panel Admin -> Siswa -> tombol **Reset Sandi** di baris siswa -> konfirmasi.
   Sandi kembali ke `siswa123`. Kalau siswa ber-NIS belum punya akun, akunnya sekalian dibuat.
Hanya role admin yang bisa memanggil fungsinya (dicek di dalam fungsi).

## Pengajuan Pembetulan Data oleh Siswa (BARU)
Siswa membetulkan datanya sendiri lewat menu **Pengajuan Pembetulan Data** (Edit -> ubah -> Ajukan).
Perubahan TIDAK langsung tersimpan. Wali kelas (atau admin) mendapat notifikasi, lalu:
- **Terima**  -> perubahan disimpan ke data siswa (tabel siswa / bi_siswa_detail), pengajuan dihapus.
- **Tolak**   -> pengajuan DIHAPUS dari database, tidak ada yang disimpan.

File: BARU `migrasi_pengajuan_data_siswa.sql`, `pengajuan-data.js`
      UBAH `siswa.html`, `guru.html`, `admin.html`, `style.css`

Langkah:
1. Jalankan `migrasi_pengajuan_data_siswa.sql` di Supabase SQL Editor (aman diulang).
2. Upload `pengajuan-data.js`, `siswa.html`, `guru.html`, `admin.html`, `bukuinduk-guru.html`, `bukuinduk-admin.html`, `style.css`.
3. Muat ulang aplikasi (Ctrl+F5).

Catatan:
- TIDAK bisa diubah siswa: NIS, NISN, NIK, No. KK. Dipaksa di database (fungsi menolak kolom lain),
  bukan hanya disembunyikan di layar. Juga tidak bisa: status siswa dan seluruh isian tab "Keluar Sekolah"
  (ijazah, tanggal keluar, catatan khusus) karena itu urusan sekolah.
- Satu siswa hanya punya satu pengajuan menunggu. Siswa bisa membatalkannya, lalu mengajukan ulang.
- Notifikasi muncul di aplikasi **Buku Induk** (bukan E-Rapor): angka merah di menu "Pengajuan Data Siswa" + pop-up saat ada pengajuan baru (dicek tiap 1 menit).
- Wali kelas hanya melihat pengajuan siswa kelasnya (tahun ajaran aktif). Admin melihat semua.
- Siswa tidak punya akses tulis langsung ke tabel mana pun; semua lewat fungsi
  ajukan_pembetulan_data / batalkan_pengajuan_data. Terima/tolak lewat proses_pengajuan_data (hanya wali kelas siswa itu / admin).
