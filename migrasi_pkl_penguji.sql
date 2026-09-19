-- =========================================================
-- MIGRASI: Pisah Nilai PKL — Nilai DUDI (guru pendamping) &
--          Nilai Penguji (guru penguji, ditunjuk terpisah)
--
--   Perubahan dari migrasi_pkl.sql:
--   - Guru PEMBIMBING (pkl_pembimbing) sekarang HANYA mengisi
--     data DUDI (nama DUDI, alamat DUDI, nama pembimbing DUDI,
--     tanggal mulai/selesai = waktu PKL) + Nilai TP1-4 sumber
--     'dudi' (rekap nilai dari DUDI/tempat PKL).
--   - Guru PENGUJI (tabel baru pkl_penguji) mengisi Nilai TP1-4
--     sumber 'penguji' — nilai uji kompetensi PKL, dilakukan
--     guru penguji yang ditunjuk Admin secara TERPISAH dari
--     pembimbing (boleh guru yang sama, boleh berbeda).
--   - nilai_pkl.sumber sekarang berisi ('dudi', 'penguji')
--     (sebelumnya ('guru_pendamping', 'dudi')). Baris lama
--     sumber='guru_pendamping' dipindah jadi 'penguji' supaya
--     nilai yang sudah pernah diisi tidak hilang; guru_id baris
--     itu tetap guru pendamping lama sampai Admin menugaskan
--     guru penguji sebenarnya lewat menu "Penguji PKL" dan guru
--     itu menyimpan ulang nilainya.
--   - Nilai Akhir PKL keseluruhan = rata-rata nilai_akhir sumber
--     'dudi' & 'penguji' (dihitung di aplikasi, sama seperti
--     sebelumnya — cuma labelnya berubah).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard →
-- SQL Editor, SETELAH schema.sql dan migrasi_pkl.sql.
-- =========================================================

-- ---------- 1) Penguji PKL: penunjukan guru penguji per siswa ----------
create table if not exists public.pkl_penguji (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  created_at timestamptz default now(),
  unique (siswa_id, tahun_ajaran_id)  -- 1 siswa = 1 penguji PKL per tahun ajaran
);

alter table public.pkl_penguji enable row level security;

drop policy if exists "Guru baca penugasan penguji miliknya" on public.pkl_penguji;
create policy "Guru baca penugasan penguji miliknya" on public.pkl_penguji for select
using (guru_id = auth.uid());

drop policy if exists "Wali kelas baca penguji pkl kelasnya" on public.pkl_penguji;
create policy "Wali kelas baca penguji pkl kelasnya" on public.pkl_penguji for select
using (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = pkl_penguji.kelas_id
      and wk.tahun_ajaran_id = pkl_penguji.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola pkl_penguji" on public.pkl_penguji;
create policy "Admin kelola pkl_penguji" on public.pkl_penguji for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_pkl_penguji_guru
  on public.pkl_penguji (guru_id, tahun_ajaran_id);
create index if not exists idx_pkl_penguji_kelas
  on public.pkl_penguji (kelas_id, tahun_ajaran_id);


-- ---------- 2) nilai_pkl: ganti sumber 'guru_pendamping' -> 'penguji' ----------
alter table public.nilai_pkl drop constraint if exists nilai_pkl_sumber_check;

update public.nilai_pkl set sumber = 'penguji' where sumber = 'guru_pendamping';

alter table public.nilai_pkl add constraint nilai_pkl_sumber_check
  check (sumber in ('dudi', 'penguji'));

comment on column public.nilai_pkl.sumber is '''dudi'' = rekap nilai dari DUDI/tempat PKL (diisi guru pembimbing), ''penguji'' = nilai uji kompetensi PKL (diisi guru penguji yang ditunjuk Admin)';

-- Guru pembimbing: kelola nilai sumber 'dudi' SAJA, untuk siswa binaannya.
drop policy if exists "Guru kelola nilai pkl siswa binaannya" on public.nilai_pkl;
drop policy if exists "Pembimbing kelola nilai dudi siswa binaannya" on public.nilai_pkl;
create policy "Pembimbing kelola nilai dudi siswa binaannya" on public.nilai_pkl for all
using (
  sumber = 'dudi' and exists (
    select 1 from public.pkl_pembimbing pb
    where pb.guru_id = auth.uid()
      and pb.siswa_id = nilai_pkl.siswa_id
      and pb.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
  )
)
with check (
  sumber = 'dudi' and exists (
    select 1 from public.pkl_pembimbing pb
    where pb.guru_id = auth.uid()
      and pb.siswa_id = nilai_pkl.siswa_id
      and pb.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
  )
);

-- Guru penguji: kelola nilai sumber 'penguji' SAJA, untuk siswa yang ditunjuk.
drop policy if exists "Penguji kelola nilai penguji siswa ditunjuknya" on public.nilai_pkl;
create policy "Penguji kelola nilai penguji siswa ditunjuknya" on public.nilai_pkl for all
using (
  sumber = 'penguji' and exists (
    select 1 from public.pkl_penguji pg
    where pg.guru_id = auth.uid()
      and pg.siswa_id = nilai_pkl.siswa_id
      and pg.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
  )
)
with check (
  sumber = 'penguji' and exists (
    select 1 from public.pkl_penguji pg
    where pg.guru_id = auth.uid()
      and pg.siswa_id = nilai_pkl.siswa_id
      and pg.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
  )
);

-- Kebijakan Wali Kelas (baca) & Admin (kelola semua) pada nilai_pkl
-- dari migrasi_pkl.sql tidak berubah dan tetap berlaku untuk kedua
-- sumber ('dudi' & 'penguji').

-- =========================================================
-- CATATAN PEMAKAIAN (skema baru):
--
-- Menu Admin → "PKL":
--   - "Pembimbing PKL": seperti sebelumnya — Admin menunjuk guru
--     pembimbing per siswa (per nama anak, lintas kelas). Guru ini
--     mengisi data DUDI (nama DUDI, alamat DUDI, nama pembimbing
--     DUDI, tanggal mulai/selesai) + Nilai DUDI (TP1-4) lewat menu
--     "Nilai PKL" di dashboardnya.
--   - "Penguji PKL" (BARU): Admin menunjuk guru penguji per siswa,
--     TERPISAH dari pembimbing (boleh guru yang sama, boleh
--     berbeda). Guru yang ditunjuk otomatis dapat menu "Nilai PKL
--     (Penguji)" di dashboardnya, berisi daftar siswa yang
--     ditunjuk kepadanya, dan HANYA mengisi Nilai Penguji (TP1-4)
--     — tidak mengisi/mengubah data DUDI.
--
-- Menu Guru → "Nilai PKL" (pembimbing): isi data DUDI + Nilai DUDI.
-- Menu Guru → "Nilai PKL (Penguji)" (penguji): isi Nilai Penguji saja.
--
-- Nilai Akhir PKL = rata-rata Nilai Akhir DUDI & Nilai Akhir
-- Penguji, dihitung di aplikasi (sama seperti sebelumnya, hanya
-- labelnya berubah dari "Guru Pendamping" jadi "Penguji").
-- =========================================================
