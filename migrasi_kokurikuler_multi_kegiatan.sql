-- =========================================================
-- MIGRASI: Kokurikuler jadi multi-kegiatan per siswa
--
--   Perubahan dari struktur nilai_kokurikuler lama:
--     - SEBELUM: 1 baris per (siswa, kelas, tahun ajaran), isi
--       Predikat + Deskripsi. Satu siswa cuma bisa punya SATU
--       catatan kokurikuler per tahun ajaran.
--     - SESUDAH: kolom "predikat" dihapus (tidak dipakai lagi).
--       Kolom baru "nama_kegiatan" ditambahkan. Batasan unique
--       lama (1 baris per siswa+kelas+tahun) DIHAPUS, sehingga
--       satu siswa bisa punya BANYAK baris kokurikuler (satu
--       baris per kegiatan yang diikuti), masing-masing dengan
--       Nama Kegiatan + Deskripsi sendiri.
--
--   Jalankan ini SETELAH migrasi_nilai_kokurikuler.sql pernah
--   dijalankan sebelumnya (mengubah tabel yang sudah ada).
--   Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
--   → SQL Editor.
-- =========================================================

-- 1) Tambah kolom nama_kegiatan (teks bebas, diisi PJ Kokurikuler
--    per baris/kegiatan).
alter table public.nilai_kokurikuler
  add column if not exists nama_kegiatan text;

-- 2) Hapus batasan unik lama yang membatasi 1 siswa = 1 baris per
--    kelas+tahun ajaran, supaya siswa bisa punya banyak kegiatan.
alter table public.nilai_kokurikuler
  drop constraint if exists nilai_kokurikuler_siswa_id_kelas_id_tahun_ajaran_id_key;

-- 3) Hapus kolom predikat — kokurikuler sekarang hanya
--    Nama Kegiatan + Deskripsi (tidak ada nilai Predikat).
alter table public.nilai_kokurikuler
  drop column if exists predikat;

-- Re-tegaskan RLS & policy (tidak berubah secara logika, cuma
-- dipastikan tetap ada dan konsisten setelah perubahan kolom).
alter table public.nilai_kokurikuler enable row level security;

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
-- CATATAN PEMAKAIAN (setelah migrasi ini):
-- Menu Guru → "Nilai Kokurikuler — <nama kelas>" (PJ Kokurikuler):
--   untuk tiap siswa, guru bisa menambahkan lebih dari satu baris
--   kegiatan lewat tombol "+ Tambah Kegiatan" — tiap baris diisi
--   Nama Kegiatan + Deskripsi. Baris bisa dihapus dengan tombol
--   "Hapus". Tidak ada lagi input Predikat.
--
-- Menu Guru → "Kokurikuler — <nama kelas>" (Wali kelas, baca saja):
--   menampilkan rekap seluruh kegiatan kokurikuler tiap siswa
--   (bisa lebih dari satu kegiatan per siswa) untuk kebutuhan
--   cetak rapor.
-- =========================================================
