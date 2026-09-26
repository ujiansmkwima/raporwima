-- =========================================================
-- MIGRASI: Judul & Deskripsi untuk Slideshow Login
--
--   Menambahkan kolom `judul` dan `deskripsi` ke tabel
--   public.login_slideshow (dibuat di migrasi_slideshow_login.sql),
--   supaya tiap gambar slideshow di halaman Masuk bisa dikasih judul
--   singkat + deskripsi, ditampilkan sebagai teks di atas gambar
--   (dengan latar gradasi gelap supaya tetap terbaca).
--
--   Jalankan migrasi_slideshow_login.sql dulu (membuat tabelnya)
--   sebelum menjalankan file ini.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

alter table public.login_slideshow
  add column if not exists judul text,
  add column if not exists deskripsi text;

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → "Slideshow Login": isi Judul (opsional) dan Deskripsi
-- (opsional) untuk tiap gambar, lalu Simpan. Boleh dikosongkan kalau
-- gambar itu tidak perlu teks — teksnya otomatis tidak ditampilkan di
-- halaman Masuk kalau kosong.
-- =========================================================
