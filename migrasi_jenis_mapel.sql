-- MIGRASI: tambah kolom "Jenis Mata Pelajaran" pada tabel mata_pelajaran
-- Dipakai untuk membedakan Mata Pelajaran Umum (A) dan Mata Pelajaran
-- Kejuruan (B), sesuai format rapor SMK.
--
-- Cara pakai: buka Supabase SQL Editor, tempel isi file ini, lalu klik Run.

alter table public.mata_pelajaran
  add column if not exists jenis_mapel text not null default 'umum';

alter table public.mata_pelajaran drop constraint if exists mata_pelajaran_jenis_mapel_check;
alter table public.mata_pelajaran add constraint mata_pelajaran_jenis_mapel_check
  check (jenis_mapel in ('umum', 'kejuruan'));
