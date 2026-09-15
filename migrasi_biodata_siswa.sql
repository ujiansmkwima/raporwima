-- =========================================================
-- MIGRASI: lengkapi biodata tabel siswa
-- Jalankan ini di Supabase Dashboard → SQL Editor KALAU database
-- kamu sudah pernah menjalankan schema.sql versi lama (yang cuma
-- punya kolom nis, nisn, nama, jenis_kelamin, tanggal_lahir, status).
--
-- Aman dijalankan berkali-kali — semua pakai "if not exists" jadi
-- tidak akan error kalau kolom sudah ada. Data siswa yang sudah ada
-- TIDAK terhapus, kolom baru cuma akan kosong dan bisa diisi lewat
-- form Edit atau import Excel.
-- =========================================================

alter table public.siswa add column if not exists tempat_lahir text;
alter table public.siswa add column if not exists agama text;
alter table public.siswa add column if not exists status_keluarga text;
alter table public.siswa add column if not exists anak_ke integer;
alter table public.siswa add column if not exists alamat_siswa text;
alter table public.siswa add column if not exists no_telp_siswa text;
alter table public.siswa add column if not exists sekolah_asal text;
alter table public.siswa add column if not exists kelas_masuk text;
alter table public.siswa add column if not exists tanggal_masuk date;
alter table public.siswa add column if not exists nama_ayah text;
alter table public.siswa add column if not exists nama_ibu text;
alter table public.siswa add column if not exists alamat_ortu text;
alter table public.siswa add column if not exists no_telp_ortu text;
alter table public.siswa add column if not exists pekerjaan_ayah text;
alter table public.siswa add column if not exists pekerjaan_ibu text;
alter table public.siswa add column if not exists nama_wali text;
alter table public.siswa add column if not exists alamat_wali text;
alter table public.siswa add column if not exists no_telp_wali text;
alter table public.siswa add column if not exists pekerjaan_wali text;
