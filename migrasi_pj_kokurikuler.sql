-- =========================================================
-- MIGRASI: Penanggung Jawab Kokurikuler
--
--   Tabel pj_kokurikuler — mirip wali_kelas, tapi SATU kelas
--   boleh punya LEBIH DARI SATU penanggung jawab kokurikuler
--   (misalnya tiap kelas ada 2-3 guru berbeda yang menangani
--   kokurikuler). Bedanya dengan wali_kelas:
--     - wali_kelas: unique(kelas_id, tahun_ajaran_id)  → 1 kelas = 1 wali
--     - pj_kokurikuler: TIDAK ada batas itu → 1 kelas bisa
--       ditangani banyak guru sekaligus, dan satu guru juga
--       boleh jadi PJ kokurikuler di lebih dari satu kelas.
--   Yang dicegah cuma kombinasi PERSIS SAMA (guru+kelas+tahun)
--   supaya tidak dobel.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

create table if not exists public.pj_kokurikuler (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  unique (guru_id, kelas_id, tahun_ajaran_id)
);

alter table public.pj_kokurikuler enable row level security;

drop policy if exists "Guru baca status pj kokurikuler miliknya" on public.pj_kokurikuler;
create policy "Guru baca status pj kokurikuler miliknya" on public.pj_kokurikuler for select
using (guru_id = auth.uid());

drop policy if exists "Semua user login boleh baca pj_kokurikuler" on public.pj_kokurikuler;
create policy "Semua user login boleh baca pj_kokurikuler" on public.pj_kokurikuler for select
using (auth.uid() is not null);

drop policy if exists "Admin kelola pj_kokurikuler" on public.pj_kokurikuler;
create policy "Admin kelola pj_kokurikuler" on public.pj_kokurikuler for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → "Penugasan Guru" → bagian "Penanggung Jawab
-- Kokurikuler": pilih guru + kelas, klik "Tetapkan". Bisa
-- diulang dengan guru lain untuk kelas yang sama — tidak akan
-- ditolak selama kombinasi guru+kelas-nya berbeda dari yang
-- sudah ada.
-- =========================================================
