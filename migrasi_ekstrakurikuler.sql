-- =========================================================
-- MIGRASI: Ekstrakurikuler (bank kegiatan, peserta, pembina,
--          dan nilai ekstrakurikuler per siswa)
--
--   1) tabel ekstrakurikuler — bank nama kegiatan ekstrakurikuler
--      (Pramuka, Paskibra, Futsal, dst). Tidak terikat tahun
--      ajaran — sama seperti mata_pelajaran/kelas, dipakai lagi
--      tahun berikutnya.
--
--   2) tabel ekstrakurikuler_siswa — siswa mana saja yang ikut
--      kegiatan ekstrakurikuler apa, pada tahun ajaran tertentu.
--      Satu siswa boleh ikut lebih dari satu ekstrakurikuler.
--      Diisi Admin di menu "Ekstrakurikuler" → "Peserta
--      Ekstrakurikuler".
--
--   3) tabel pembina_ekstrakurikuler — guru yang ditugaskan
--      sebagai pembina sebuah ekstrakurikuler, pada tahun ajaran
--      tertentu. Sama pola dengan pj_kokurikuler: satu
--      ekstrakurikuler boleh punya lebih dari satu pembina, dan
--      satu guru boleh membina lebih dari satu ekstrakurikuler.
--      Diisi Admin di menu "Ekstrakurikuler" → "Penugasan
--      Pembina Ekstrakurikuler".
--
--   4) tabel nilai_ekstrakurikuler — nilai yang diisi guru
--      pembina untuk tiap siswa peserta ekstrakurikulernya:
--      Predikat (Sangat Baik/Baik/Cukup/Kurang) + Deskripsi
--      (narasi bebas). Diisi guru di menu "Nilai Ekstrakurikuler"
--      pada dashboard guru (menu ini otomatis muncul kalau guru
--      ditugaskan sebagai pembina).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

-- ---------- 1) Bank Ekstrakurikuler ----------
create table if not exists public.ekstrakurikuler (
  id uuid primary key default gen_random_uuid(),
  nama text not null unique,
  created_at timestamptz default now()
);

alter table public.ekstrakurikuler enable row level security;

drop policy if exists "Semua user login boleh baca ekstrakurikuler" on public.ekstrakurikuler;
create policy "Semua user login boleh baca ekstrakurikuler" on public.ekstrakurikuler for select
using (auth.uid() is not null);

drop policy if exists "Admin kelola ekstrakurikuler" on public.ekstrakurikuler;
create policy "Admin kelola ekstrakurikuler" on public.ekstrakurikuler for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- 2) Peserta Ekstrakurikuler ----------
create table if not exists public.ekstrakurikuler_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  ekstrakurikuler_id uuid not null references public.ekstrakurikuler(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  created_at timestamptz default now(),
  unique (siswa_id, ekstrakurikuler_id, tahun_ajaran_id)
);

alter table public.ekstrakurikuler_siswa enable row level security;

drop policy if exists "Semua user login boleh baca ekstrakurikuler_siswa" on public.ekstrakurikuler_siswa;
create policy "Semua user login boleh baca ekstrakurikuler_siswa" on public.ekstrakurikuler_siswa for select
using (auth.uid() is not null);

drop policy if exists "Admin kelola ekstrakurikuler_siswa" on public.ekstrakurikuler_siswa;
create policy "Admin kelola ekstrakurikuler_siswa" on public.ekstrakurikuler_siswa for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_ekskul_siswa_scope
  on public.ekstrakurikuler_siswa (ekstrakurikuler_id, tahun_ajaran_id);

-- ---------- 3) Penugasan Pembina Ekstrakurikuler ----------
create table if not exists public.pembina_ekstrakurikuler (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  ekstrakurikuler_id uuid not null references public.ekstrakurikuler(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  created_at timestamptz default now(),
  unique (guru_id, ekstrakurikuler_id, tahun_ajaran_id)
);

alter table public.pembina_ekstrakurikuler enable row level security;

drop policy if exists "Guru baca status pembina ekskul miliknya" on public.pembina_ekstrakurikuler;
create policy "Guru baca status pembina ekskul miliknya" on public.pembina_ekstrakurikuler for select
using (guru_id = auth.uid());

drop policy if exists "Semua user login boleh baca pembina_ekstrakurikuler" on public.pembina_ekstrakurikuler;
create policy "Semua user login boleh baca pembina_ekstrakurikuler" on public.pembina_ekstrakurikuler for select
using (auth.uid() is not null);

drop policy if exists "Admin kelola pembina_ekstrakurikuler" on public.pembina_ekstrakurikuler;
create policy "Admin kelola pembina_ekstrakurikuler" on public.pembina_ekstrakurikuler for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------- 4) Nilai Ekstrakurikuler ----------
create table if not exists public.nilai_ekstrakurikuler (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  ekstrakurikuler_id uuid not null references public.ekstrakurikuler(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  predikat text check (predikat in ('Sangat Baik', 'Baik', 'Cukup', 'Kurang')),
  deskripsi text,
  guru_id uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique (siswa_id, ekstrakurikuler_id, tahun_ajaran_id)
);

alter table public.nilai_ekstrakurikuler enable row level security;

drop policy if exists "Pembina kelola nilai ekstrakurikuler binaannya" on public.nilai_ekstrakurikuler;
create policy "Pembina kelola nilai ekstrakurikuler binaannya" on public.nilai_ekstrakurikuler for all
using (
  exists (
    select 1 from public.pembina_ekstrakurikuler pe
    join public.ekstrakurikuler_siswa es
      on es.ekstrakurikuler_id = pe.ekstrakurikuler_id
     and es.tahun_ajaran_id = pe.tahun_ajaran_id
    where pe.guru_id = auth.uid()
      and pe.ekstrakurikuler_id = nilai_ekstrakurikuler.ekstrakurikuler_id
      and pe.tahun_ajaran_id = nilai_ekstrakurikuler.tahun_ajaran_id
      and es.siswa_id = nilai_ekstrakurikuler.siswa_id
  )
)
with check (
  exists (
    select 1 from public.pembina_ekstrakurikuler pe
    join public.ekstrakurikuler_siswa es
      on es.ekstrakurikuler_id = pe.ekstrakurikuler_id
     and es.tahun_ajaran_id = pe.tahun_ajaran_id
    where pe.guru_id = auth.uid()
      and pe.ekstrakurikuler_id = nilai_ekstrakurikuler.ekstrakurikuler_id
      and pe.tahun_ajaran_id = nilai_ekstrakurikuler.tahun_ajaran_id
      and es.siswa_id = nilai_ekstrakurikuler.siswa_id
  )
);

-- Wali kelas: boleh BACA nilai ekstrakurikuler siswa di kelasnya,
-- untuk kebutuhan rekap/cetak rapor (sama pola dengan tabel nilai).
drop policy if exists "Wali kelas baca nilai ekstrakurikuler kelasnya" on public.nilai_ekstrakurikuler;
create policy "Wali kelas baca nilai ekstrakurikuler kelasnya" on public.nilai_ekstrakurikuler for select
using (
  exists (
    select 1 from public.wali_kelas wk
    join public.siswa_kelas sk on sk.kelas_id = wk.kelas_id and sk.tahun_ajaran_id = wk.tahun_ajaran_id
    where wk.guru_id = auth.uid()
      and sk.siswa_id = nilai_ekstrakurikuler.siswa_id
      and wk.tahun_ajaran_id = nilai_ekstrakurikuler.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola nilai_ekstrakurikuler" on public.nilai_ekstrakurikuler;
create policy "Admin kelola nilai_ekstrakurikuler" on public.nilai_ekstrakurikuler for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_nilai_ekskul_scope
  on public.nilai_ekstrakurikuler (ekstrakurikuler_id, tahun_ajaran_id);

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → "Ekstrakurikuler":
--   1. "Data Ekstrakurikuler" — tambah/edit/hapus daftar nama
--      kegiatan (Pramuka, Paskibra, dst).
--   2. "Peserta Ekstrakurikuler" — pilih ekstrakurikuler + kelas,
--      centang siswa yang ikut kegiatan tsb, simpan.
--   3. "Penugasan Pembina Ekstrakurikuler" — pilih guru + pilih
--      ekstrakurikuler, klik "Tetapkan". Guru tsb otomatis
--      mendapat menu "Nilai Ekstrakurikuler" di dashboardnya.
--
-- Menu Guru → "Nilai Ekstrakurikuler — <nama kegiatan>" (muncul
-- otomatis kalau guru ditugaskan jadi pembina): tampil daftar
-- semua siswa peserta kegiatan tsb (lintas kelas), guru mengisi
-- Predikat (dropdown: Sangat Baik/Baik/Cukup/Kurang) dan
-- Deskripsi (teks bebas) untuk tiap siswa, lalu simpan.
-- =========================================================
