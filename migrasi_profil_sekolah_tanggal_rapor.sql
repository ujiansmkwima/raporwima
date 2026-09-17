-- =========================================================
-- MIGRASI: Tambah kolom Tanggal Rapor ke Profil Sekolah
--
--   Menambahkan kolom `tanggal_rapor` (tanggal) ke tabel
--   public.profil_sekolah, dipakai di baris tanda tangan Cetak Rapor
--   ("Tambak, 12 Desember 2026") sebagai pengganti bagian titik-titik
--   yang tadinya harus ditulis tangan. Diisi lewat menu Admin →
--   "Profil Sekolah", dan Cetak Rapor otomatis memakai nilai terbaru
--   dari sini.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

alter table public.profil_sekolah
  add column if not exists tanggal_rapor date;

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → "Profil Sekolah": isi Tanggal Rapor, lalu Simpan.
--
-- Menu Guru → "Cetak Rapor" (wali kelas): baris tanda tangan Wali
-- Kelas ("Tambak, ...") otomatis memakai tanggal ini kalau sudah
-- diisi. Kalau belum diisi, baris tanda tangan tetap menampilkan
-- titik-titik seperti sebelumnya supaya bisa ditulis tangan.
-- =========================================================
