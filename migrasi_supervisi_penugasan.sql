-- =========================================================
-- MIGRASI: SALINAN PENUGASAN GURU untuk modul Supervisi
--   Diisi tombol "Muat Ulang dari E-Rapor" (Data Guru & Mapel), bersama data guru & mapel.
--   Dipakai saat membuat jadwal: setelah memilih guru, pilihan Mapel hanya mapel yang
--   ditugaskan ke guru tsb (tahun ajaran aktif), dan Kelas terisi otomatis.
-- Jalankan di Supabase SQL Editor SETELAH migrasi_supervisi.sql. Aman diulang.
-- =========================================================
create table if not exists public.supervisi_penugasan (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.supervisi_guru(id) on delete cascade,
  mapel_id uuid not null references public.supervisi_mapel(id) on delete cascade,
  kelas text,
  unique (guru_id, mapel_id, kelas)
);
alter table public.supervisi_penugasan enable row level security;
drop policy if exists "baca supervisi_penugasan" on public.supervisi_penugasan;
drop policy if exists "admin kelola supervisi_penugasan" on public.supervisi_penugasan;
create policy "baca supervisi_penugasan" on public.supervisi_penugasan for select using (auth.uid() is not null);
create policy "admin kelola supervisi_penugasan" on public.supervisi_penugasan for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
