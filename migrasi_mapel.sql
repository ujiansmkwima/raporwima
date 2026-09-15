-- =========================================================
-- MIGRASI: lengkapi tabel mata_pelajaran
-- Jalankan ini di Supabase Dashboard → SQL Editor KALAU database
-- kamu sudah pernah menjalankan schema.sql versi lama (yang tabel
-- mata_pelajaran-nya cuma punya kolom kode, nama, kkm).
--
-- Aman dijalankan berkali-kali. Data mata pelajaran yang sudah ada
-- TIDAK terhapus:
--   - kolom "urutan_rapor" akan kosong (NULL) — bisa diisi lewat
--     form Tambah di menu Mata Pelajaran nanti (untuk mapel baru),
--     mapel yang sudah ada tetap tampil di bagian bawah tabel.
--   - kolom "berlaku_untuk" otomatis terisi 'semua' untuk semua
--     mapel yang sudah ada (artinya dipakai semua kelas, seperti
--     kondisi sebelumnya).
-- =========================================================

alter table public.mata_pelajaran add column if not exists urutan_rapor integer;
alter table public.mata_pelajaran add column if not exists berlaku_untuk text not null default 'semua';

-- Pastikan hanya nilai 'semua' / 'tertentu' yang boleh disimpan
-- (aman dijalankan berkali-kali, drop dulu kalau constraint sudah ada)
alter table public.mata_pelajaran drop constraint if exists mata_pelajaran_berlaku_untuk_check;
alter table public.mata_pelajaran add constraint mata_pelajaran_berlaku_untuk_check
  check (berlaku_untuk in ('semua', 'tertentu'));

-- Tabel penghubung: mapel mana dipakai di kelas mana, KALAU
-- berlaku_untuk = 'tertentu'.
create table if not exists public.mapel_kelas (
  id uuid primary key default gen_random_uuid(),
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  unique (mapel_id, kelas_id)
);

alter table public.mapel_kelas enable row level security;

drop policy if exists "Semua user login boleh baca mapel_kelas" on public.mapel_kelas;
create policy "Semua user login boleh baca mapel_kelas" on public.mapel_kelas for select using (auth.uid() is not null);

drop policy if exists "Admin kelola mapel_kelas" on public.mapel_kelas;
create policy "Admin kelola mapel_kelas" on public.mapel_kelas for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
