-- Identitas pada form supervisi diambil dari data admin (Penugasan Guru & Profil Sekolah).
-- Jalankan di Supabase SQL Editor (aman diulang), SETELAH migrasi_supervisi.sql.
alter table public.supervisi_jadwal add column if not exists kelas text;
alter table public.supervisi_jadwal add column if not exists jenjang text;
alter table public.supervisi_jadwal add column if not exists unit_kerja text;
