-- =========================================================
-- CATATAN (update): skema sumber nilai_pkl di file ini
-- ('guru_pendamping' & 'dudi') SUDAH DIPERBARUI oleh
-- migrasi_pkl_penguji.sql menjadi ('dudi' & 'penguji') — jalankan
-- migrasi_pkl_penguji.sql SETELAH file ini. Lihat file tsb untuk
-- skema Nilai DUDI (guru pembimbing) & Nilai Penguji (guru penguji,
-- ditunjuk terpisah lewat tabel baru pkl_penguji).
-- =========================================================

-- =========================================================
-- MIGRASI: Penilaian PKL (Praktik Kerja Lapangan)
--
--   Modul PKL BERDIRI SENDIRI — TIDAK lewat menu "Input Nilai"
--   biasa (tidak terikat mata_pelajaran/penugasan_guru), dan
--   nilainya TIDAK ditulis ke tabel nilai / tidak muncul di
--   Cetak Rapor biasa. PKL punya format cetak sendiri.
--
--   Skema:
--   1) tabel pkl_pembimbing — Admin menetapkan seorang guru
--      sebagai Pembimbing PKL untuk siswa TERTENTU (bukan satu
--      kelas penuh — admin memilih nama anak satu per satu,
--      boleh dari kelas manapun), pada tahun ajaran tertentu.
--      Guru tsb otomatis mendapat menu "Nilai PKL" di
--      dashboardnya, berisi daftar siswa yang ditugaskan
--      kepadanya. Tabel ini juga menyimpan identitas DUDI
--      (tempat PKL) per siswa, diisi oleh guru pembimbing.
--      Satu siswa hanya punya SATU pembimbing PKL per tahun
--      ajaran.
--
--   2) tabel nilai_pkl — nilai TP 1-4, diisi DUA kali per siswa:
--      satu baris sumber = 'guru_pendamping' (penilaian oleh
--      guru pembimbing di sekolah) dan satu baris sumber =
--      'dudi' (penilaian dari DUDI/tempat PKL, direkap oleh
--      guru pembimbing yang sama). nilai_akhir per baris = rata-
--      rata TP1-4 baris itu (dihitung aplikasi). Nilai Akhir PKL
--      keseluruhan = rata-rata nilai_akhir 'guru_pendamping' dan
--      nilai_akhir 'dudi' (dihitung aplikasi saat ditampilkan/
--      dicetak, tidak disimpan sebagai kolom terpisah).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor, SETELAH schema.sql.
-- =========================================================

-- ---------- 1) Pembimbing PKL + identitas DUDI per siswa ----------
create table if not exists public.pkl_pembimbing (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,

  -- Identitas DUDI (Dunia Usaha/Dunia Industri = tempat PKL siswa
  -- ini), diisi guru pembimbing lewat menu "Nilai PKL" — dipakai
  -- untuk format cetak PKL, tidak wajib diisi supaya assignment
  -- oleh Admin tetap bisa dilakukan sebelum data DUDI lengkap.
  nama_dudi text,
  alamat_dudi text,
  nama_pembimbing_dudi text,
  tanggal_mulai date,
  tanggal_selesai date,

  created_at timestamptz default now(),
  unique (siswa_id, tahun_ajaran_id)  -- 1 siswa = 1 pembimbing PKL per tahun ajaran
);

alter table public.pkl_pembimbing enable row level security;

drop policy if exists "Guru baca pembimbing pkl miliknya" on public.pkl_pembimbing;
create policy "Guru baca pembimbing pkl miliknya" on public.pkl_pembimbing for select
using (guru_id = auth.uid());

-- Guru pembimbing boleh mengubah data DUDI (nama_dudi dkk) untuk
-- siswa yang jadi tanggung jawabnya sendiri, tapi TIDAK boleh
-- mengganti guru_id/siswa_id penugasan (itu wewenang Admin).
drop policy if exists "Guru ubah data dudi siswa binaannya" on public.pkl_pembimbing;
create policy "Guru ubah data dudi siswa binaannya" on public.pkl_pembimbing for update
using (guru_id = auth.uid())
with check (guru_id = auth.uid());

drop policy if exists "Wali kelas baca pembimbing pkl kelasnya" on public.pkl_pembimbing;
create policy "Wali kelas baca pembimbing pkl kelasnya" on public.pkl_pembimbing for select
using (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = pkl_pembimbing.kelas_id
      and wk.tahun_ajaran_id = pkl_pembimbing.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola pkl_pembimbing" on public.pkl_pembimbing;
create policy "Admin kelola pkl_pembimbing" on public.pkl_pembimbing for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_pkl_pembimbing_guru
  on public.pkl_pembimbing (guru_id, tahun_ajaran_id);
create index if not exists idx_pkl_pembimbing_kelas
  on public.pkl_pembimbing (kelas_id, tahun_ajaran_id);


-- ---------- 2) Nilai PKL: TP 1-4, dua sumber (guru pendamping & DUDI) ----------
create table if not exists public.nilai_pkl (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  sumber text not null check (sumber in ('guru_pendamping', 'dudi')),
  tp1 numeric(5,2),
  tp2 numeric(5,2),
  tp3 numeric(5,2),
  tp4 numeric(5,2),
  nilai_akhir numeric(5,2),  -- rata-rata tp1-4 baris ini, dihitung & dikirim aplikasi
  deskripsi text,            -- catatan/narasi bebas (opsional)
  guru_id uuid references public.profiles(id),  -- guru pembimbing yang input (sama untuk kedua sumber)
  updated_at timestamptz default now(),
  unique (siswa_id, sumber, tahun_ajaran_id)
);

comment on column public.nilai_pkl.sumber is '''guru_pendamping'' = dinilai guru pembimbing sekolah, ''dudi'' = dinilai tempat PKL (direkap guru pembimbing)';
comment on column public.nilai_pkl.nilai_akhir is 'Rata-rata TP1-4 untuk baris (sumber) ini. Nilai Akhir PKL keseluruhan = rata-rata nilai_akhir sumber guru_pendamping & dudi, dihitung di aplikasi.';

alter table public.nilai_pkl enable row level security;

-- Guru pembimbing: kelola (baca+tulis) nilai PKL HANYA untuk siswa
-- yang jadi tanggung jawabnya (lewat pkl_pembimbing).
drop policy if exists "Guru kelola nilai pkl siswa binaannya" on public.nilai_pkl;
create policy "Guru kelola nilai pkl siswa binaannya" on public.nilai_pkl for all
using (
  exists (
    select 1 from public.pkl_pembimbing pb
    where pb.guru_id = auth.uid()
      and pb.siswa_id = nilai_pkl.siswa_id
      and pb.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
  )
)
with check (
  exists (
    select 1 from public.pkl_pembimbing pb
    where pb.guru_id = auth.uid()
      and pb.siswa_id = nilai_pkl.siswa_id
      and pb.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
  )
);

-- Wali kelas: boleh BACA (tidak menulis) nilai PKL siswa di
-- kelasnya — nilai PKL tidak muncul di Cetak Rapor biasa, tapi
-- wali kelas tetap perlu memantau/menyediakan rekapnya kalau
-- diminta.
drop policy if exists "Wali kelas baca nilai pkl kelasnya" on public.nilai_pkl;
create policy "Wali kelas baca nilai pkl kelasnya" on public.nilai_pkl for select
using (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = nilai_pkl.kelas_id
      and wk.tahun_ajaran_id = nilai_pkl.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola nilai_pkl" on public.nilai_pkl;
create policy "Admin kelola nilai_pkl" on public.nilai_pkl for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_nilai_pkl_siswa
  on public.nilai_pkl (siswa_id, tahun_ajaran_id);
create index if not exists idx_nilai_pkl_kelas
  on public.nilai_pkl (kelas_id, tahun_ajaran_id);

-- =========================================================
-- CATATAN PEMAKAIAN:
--
-- Menu Admin → "PKL" → "Pembimbing PKL": pilih Guru + Kelas →
-- tampil daftar siswa kelas tsb → centang siswa yang dibimbing
-- guru tsb untuk PKL, simpan. Siswa yang sudah dicentang guru
-- lain akan DIPINDAH ke guru yang baru dicentang (1 siswa = 1
-- pembimbing). Guru yang ditugaskan otomatis mendapat menu
-- "Nilai PKL" di dashboardnya.
--
-- Menu Guru → "Nilai PKL" (muncul otomatis kalau guru ditetapkan
-- jadi pembimbing PKL siswa manapun): tampil daftar siswa yang
-- dibimbingnya (lintas kelas kalau ada lebih dari satu kelas).
-- Untuk tiap siswa: isi data DUDI (nama/alamat DUDI, nama
-- pembimbing DUDI, tanggal mulai/selesai), lalu isi Nilai TP 1-4
-- dari Guru Pendamping DAN dari DUDI (dua kolom terpisah). Nilai
-- Akhir tiap sumber dan Nilai Akhir PKL (rata-rata keduanya)
-- terhitung otomatis. Tersedia juga tombol "Cetak Format PKL"
-- per siswa — format cetak TERPISAH dari Cetak Rapor biasa, dan
-- nilai PKL TIDAK ikut muncul di Cetak Rapor.
-- =========================================================
