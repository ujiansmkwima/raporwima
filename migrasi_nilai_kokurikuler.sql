-- =========================================================
-- MIGRASI: Nilai Kokurikuler
--
--   Tabel nilai_kokurikuler — nilai yang diisi guru Penanggung
--   Jawab (PJ) Kokurikuler untuk tiap siswa DI KELAS yang
--   ditanganinya: Predikat (Sangat Baik/Baik/Cukup/Kurang) +
--   Deskripsi (narasi bebas). Sama pola dengan
--   nilai_ekstrakurikuler, bedanya nilai_kokurikuler terikat ke
--   KELAS langsung (bukan ke satu kegiatan), karena satu kelas
--   bisa punya lebih dari satu PJ Kokurikuler yang berbagi
--   tanggung jawab menilai siswa yang sama.
--
--   Diisi guru di menu "Kokurikuler" pada dashboard guru (menu
--   ini otomatis muncul kalau guru ditugaskan sebagai PJ
--   Kokurikuler kelas tsb). Wali kelas kelas yang sama bisa
--   MELIHAT (read-only) nilai ini untuk kebutuhan rekap/cetak
--   rapor, walau bukan PJ-nya.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

create table if not exists public.nilai_kokurikuler (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  predikat text check (predikat in ('Sangat Baik', 'Baik', 'Cukup', 'Kurang')),
  deskripsi text,
  guru_id uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique (siswa_id, kelas_id, tahun_ajaran_id)
);

alter table public.nilai_kokurikuler enable row level security;

-- PJ Kokurikuler: boleh kelola (baca+tulis) nilai kokurikuler
-- untuk siswa di kelas yang jadi tanggung jawabnya.
drop policy if exists "PJ kelola nilai kokurikuler kelas binaannya" on public.nilai_kokurikuler;
create policy "PJ kelola nilai kokurikuler kelas binaannya" on public.nilai_kokurikuler for all
using (
  exists (
    select 1 from public.pj_kokurikuler pk
    join public.siswa_kelas sk on sk.kelas_id = pk.kelas_id and sk.tahun_ajaran_id = pk.tahun_ajaran_id
    where pk.guru_id = auth.uid()
      and pk.kelas_id = nilai_kokurikuler.kelas_id
      and pk.tahun_ajaran_id = nilai_kokurikuler.tahun_ajaran_id
      and sk.siswa_id = nilai_kokurikuler.siswa_id
  )
)
with check (
  exists (
    select 1 from public.pj_kokurikuler pk
    join public.siswa_kelas sk on sk.kelas_id = pk.kelas_id and sk.tahun_ajaran_id = pk.tahun_ajaran_id
    where pk.guru_id = auth.uid()
      and pk.kelas_id = nilai_kokurikuler.kelas_id
      and pk.tahun_ajaran_id = nilai_kokurikuler.tahun_ajaran_id
      and sk.siswa_id = nilai_kokurikuler.siswa_id
  )
);

-- Wali kelas: boleh BACA (tidak menulis) nilai kokurikuler siswa
-- di kelas yang diampunya, untuk kebutuhan rekap/cetak rapor —
-- sama pola dengan nilai_ekstrakurikuler.
drop policy if exists "Wali kelas baca nilai kokurikuler kelasnya" on public.nilai_kokurikuler;
create policy "Wali kelas baca nilai kokurikuler kelasnya" on public.nilai_kokurikuler for select
using (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = nilai_kokurikuler.kelas_id
      and wk.tahun_ajaran_id = nilai_kokurikuler.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola nilai_kokurikuler" on public.nilai_kokurikuler;
create policy "Admin kelola nilai_kokurikuler" on public.nilai_kokurikuler for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_nilai_koku_scope
  on public.nilai_kokurikuler (kelas_id, tahun_ajaran_id);

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Guru → "Kokurikuler — <nama kelas>" (muncul otomatis kalau
-- guru ditugaskan sebagai PJ Kokurikuler kelas tsb, lewat menu
-- Admin → "Penugasan Guru" → "Penanggung Jawab Kokurikuler"):
-- guru mengisi Predikat + Deskripsi untuk tiap siswa di kelas itu.
--
-- Wali kelas yang BUKAN PJ kelasnya sendiri tetap melihat menu
-- "Kokurikuler — <nama kelas>" dalam mode baca saja (lihat nilai
-- yang sudah diisi PJ), untuk direkap ke rapor.
-- =========================================================
