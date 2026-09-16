-- =========================================================
-- MIGRASI: Catatan Wali Kelas pada Rapor
--
--   Format Cetak Rapor (mengikuti contoh cetak resmi) punya kotak
--   "Catatan Wali Kelas" per siswa, di samping kotak Ketidakhadiran.
--   Ditambahkan sebagai kolom baru di tabel rekap_presensi karena
--   tabel itu sudah 1 baris per (siswa, kelas, tahun ajaran) yang
--   dikelola wali kelas — jadi catatan ini otomatis mengikuti scope
--   yang sama, tidak perlu tabel baru.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

alter table public.rekap_presensi add column if not exists catatan_wali_kelas text;

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Guru → "Cetak Rapor" (wali kelas): kotak "Catatan Wali
-- Kelas" langsung bisa diisi & disimpan dari layar itu, per siswa
-- yang sedang dipilih, lalu langsung tampil di hasil cetak.
-- =========================================================
