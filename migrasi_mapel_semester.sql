-- =========================================================
-- MIGRASI: cakupan Semester untuk Mata Pelajaran
-- Jalankan ini di Supabase Dashboard → SQL Editor.
--
-- Menambahkan pilihan "Semester" pada Mata Pelajaran, mirip pola
-- yang sudah ada untuk "Kelas" (berlaku_untuk / mapel_kelas):
--   - berlaku_semester = 'semua'    -> mapel ini berlaku di Semester
--                                      1 s.d. 6 (seperti kondisi
--                                      sebelumnya, tidak berubah).
--   - berlaku_semester = 'tertentu' -> mapel ini HANYA berlaku di
--                                      semester yang dicentang
--                                      (Semester 1-6), diisi ke tabel
--                                      mapel_semester.
--
-- Penomoran semester 1-6 sama dengan yang dipakai di Leger Nilai
-- 6 Semester: 1-2 = kelas X, 3-4 = kelas XI, 5-6 = kelas XII.
--
-- Aman dijalankan berkali-kali. Mapel yang sudah ada otomatis
-- 'semua' (tidak ada yang hilang dari kelas/semester manapun).
-- =========================================================

alter table public.mata_pelajaran add column if not exists berlaku_semester text not null default 'semua';

alter table public.mata_pelajaran drop constraint if exists mata_pelajaran_berlaku_semester_check;
alter table public.mata_pelajaran add constraint mata_pelajaran_berlaku_semester_check
  check (berlaku_semester in ('semua', 'tertentu'));

-- Tabel penghubung: mapel ini berlaku di semester keberapa saja
-- (1-6), KALAU berlaku_semester = 'tertentu'.
create table if not exists public.mapel_semester (
  id uuid primary key default gen_random_uuid(),
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  semester_ke integer not null check (semester_ke between 1 and 6),
  unique (mapel_id, semester_ke)
);

alter table public.mapel_semester enable row level security;

drop policy if exists "Semua user login boleh baca mapel_semester" on public.mapel_semester;
create policy "Semua user login boleh baca mapel_semester" on public.mapel_semester for select using (auth.uid() is not null);

drop policy if exists "Admin kelola mapel_semester" on public.mapel_semester;
create policy "Admin kelola mapel_semester" on public.mapel_semester for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
