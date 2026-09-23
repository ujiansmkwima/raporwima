-- =========================================================
-- MIGRASI: "Ganjil" -> "Gasal"
-- Jalankan SEKALI di Supabase Dashboard -> SQL Editor.
--
-- Penulisan baku untuk semester pertama adalah "Gasal", bukan
-- "Ganjil". Kode aplikasi (admin.html, guru.html, schema.sql)
-- sudah diubah untuk memakai "Gasal". Skrip ini menyesuaikan
-- data yang SUDAH TERLANJUR tersimpan di tabel tahun_ajaran
-- (kolom semester) supaya tetap cocok dengan kode terbaru.
--
-- Jalankan skrip ini SEBELUM menerapkan (deploy) versi baru
-- admin.html / guru.html, supaya tidak ada jeda saat data lama
-- ("Ganjil") sudah tidak dikenali kode baru.
-- =========================================================

-- 1) Lepas dulu constraint lama yang cuma mengizinkan 'Ganjil'/'Genap'
alter table public.tahun_ajaran
  drop constraint if exists tahun_ajaran_semester_check;

-- 2) Ubah semua baris yang masih tertulis 'Ganjil' menjadi 'Gasal'
update public.tahun_ajaran
  set semester = 'Gasal'
  where semester = 'Ganjil';

-- 3) Pasang lagi constraint dengan nilai yang baku: 'Gasal' / 'Genap'
alter table public.tahun_ajaran
  add constraint tahun_ajaran_semester_check
  check (semester in ('Gasal', 'Genap'));

-- Cek hasil migrasi (opsional, boleh dijalankan terpisah untuk verifikasi):
-- select nama, semester, is_aktif from public.tahun_ajaran order by nama, semester;
