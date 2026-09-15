-- =========================================================
-- MIGRASI: dua fitur baru
--   1. Kolom "email" di profiles — supaya Data Guru bisa
--      diunduh (Excel) lengkap dengan email, tidak cuma nama.
--   2. Tabel mapel_urutan_kelas — supaya urutan nomor mapel
--      pada rapor bisa diatur BERBEDA per kelas (bukan cuma
--      satu angka global di mata_pelajaran.urutan_rapor).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

-- ---------------------------------------------------------
-- 1. profiles.email
--    Diisi otomatis oleh Edge Function admin-create-guru saat
--    akun guru baru dibuat. Akun guru yang sudah ada SEBELUM
--    migrasi ini dijalankan akan kosong (NULL) — admin bisa
--    membuat ulang / mengisi manual lewat SQL Editor kalau perlu.
-- ---------------------------------------------------------
alter table public.profiles add column if not exists email text;

-- ---------------------------------------------------------
-- 2. mapel_urutan_kelas
--    Satu baris = urutan nomor mapel tsb pada rapor, KHUSUS
--    untuk satu kelas. Kalau untuk pasangan (mapel, kelas)
--    tidak ada baris di sini, aplikasi jatuh balik (fallback)
--    ke mata_pelajaran.urutan_rapor (urutan default/global).
-- ---------------------------------------------------------
create table if not exists public.mapel_urutan_kelas (
  id uuid primary key default gen_random_uuid(),
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  urutan_rapor integer not null,
  unique (mapel_id, kelas_id)
);

alter table public.mapel_urutan_kelas enable row level security;

drop policy if exists "Semua user login boleh baca mapel_urutan_kelas" on public.mapel_urutan_kelas;
create policy "Semua user login boleh baca mapel_urutan_kelas" on public.mapel_urutan_kelas for select
using (auth.uid() is not null);

drop policy if exists "Admin kelola mapel_urutan_kelas" on public.mapel_urutan_kelas;
create policy "Admin kelola mapel_urutan_kelas" on public.mapel_urutan_kelas for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- =========================================================
-- CATATAN PEMAKAIAN (mapel_urutan_kelas):
-- Menu Admin → "Mata Pelajaran" → sub-menu "Mata Pelajaran Per
-- Tingkat":
--   1. Pilih Tingkat (10/11/12) → daftar kelas tingkat itu muncul.
--   2. Ceklis kelas mana saja yang mau diberi urutan yang sama.
--   3. Isi angka urutan tiap mapel, klik Simpan.
--   4. Angka tsb tersimpan per kelas yang dicentang di tabel ini.
-- Kalau nanti fitur cetak rapor dibuat, urutan mapel di rapor
-- kelas X = ambil dari mapel_urutan_kelas WHERE kelas_id = X,
-- kalau tidak ada baru pakai mata_pelajaran.urutan_rapor.
-- =========================================================
