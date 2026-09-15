-- =========================================================
-- MIGRASI: PJ Kokurikuler per Nama Kegiatan + lingkup Kelas
--          (Kelas Tertentu / Semua Kelas)
--
--   Perubahan pada pj_kokurikuler:
--     - Kolom baru "nama_kegiatan" (wajib diisi Admin saat
--       menetapkan PJ) — nama kegiatan kokurikuler yang jadi
--       tanggung jawab guru tsb, mis. "P5 - Kearifan Lokal".
--     - Kolom "kelas_id" sekarang BOLEH NULL. NULL berarti
--       lingkup "Semua Kelas" — guru tsb jadi PJ kegiatan itu
--       untuk siswa di SELURUH kelas pada tahun ajaran ybs,
--       bukan cuma satu kelas tertentu.
--     - Batasan unik lama (guru+kelas+tahun) diganti dua unique
--       index (kelas tertentu vs semua kelas) yang juga
--       memperhitungkan nama_kegiatan, supaya satu guru tetap
--       bisa jadi PJ lebih dari satu kegiatan/kelas, tapi tidak
--       dobel untuk kombinasi guru+kegiatan+kelas yang sama persis.
--
--   Perubahan pada nilai_kokurikuler:
--     - Tambah batasan unik (siswa, nama_kegiatan, kelas, tahun)
--       supaya tidak ada dua baris nilai untuk siswa+kegiatan yang
--       sama, dan supaya guru bisa langsung upsert pakai kombinasi
--       ini tanpa perlu tahu id baris sebelumnya.
--     - Policy RLS PJ diperbarui: PJ boleh kelola nilai kokurikuler
--       untuk siswa di kelas yang cocok DENGAN lingkup PJ-nya (kelas
--       tertentu yang sama, ATAU PJ berlingkup "Semua Kelas"), dan
--       nama_kegiatan-nya harus sama dengan nama kegiatan PJ tsb.
--
--   Jalankan ini SETELAH migrasi_pj_kokurikuler.sql dan
--   migrasi_kokurikuler_multi_kegiatan.sql pernah dijalankan
--   sebelumnya. Aman dijalankan berkali-kali. Jalankan di Supabase
--   Dashboard → SQL Editor.
-- =========================================================

-- ---------- 1) pj_kokurikuler: nama_kegiatan + kelas nullable ----------

alter table public.pj_kokurikuler
  add column if not exists nama_kegiatan text;

-- Data lama (sebelum kolom ini ada) diberi nama generik supaya tidak
-- kosong; admin bisa mengedit ulang lewat hapus + tetapkan lagi kalau
-- perlu nama yang lebih spesifik.
update public.pj_kokurikuler set nama_kegiatan = 'Kokurikuler' where nama_kegiatan is null;

alter table public.pj_kokurikuler
  alter column nama_kegiatan set not null;

-- kelas_id sekarang boleh NULL (artinya "Semua Kelas").
alter table public.pj_kokurikuler
  alter column kelas_id drop not null;

-- Hapus batasan unik lama (guru+kelas+tahun) — sudah tidak relevan
-- karena sekarang butuh nama_kegiatan juga, dan kelas_id bisa null.
alter table public.pj_kokurikuler
  drop constraint if exists pj_kokurikuler_guru_id_kelas_id_tahun_ajaran_id_key;

-- Dua unique index terpisah karena NULL tidak bentrok dengan NULL lain
-- di batasan unik biasa (jadi perlu partial index untuk kasus "Semua Kelas").
drop index if exists ux_pj_koku_kelas_tertentu;
create unique index ux_pj_koku_kelas_tertentu
  on public.pj_kokurikuler (guru_id, nama_kegiatan, kelas_id, tahun_ajaran_id)
  where kelas_id is not null;

drop index if exists ux_pj_koku_semua_kelas;
create unique index ux_pj_koku_semua_kelas
  on public.pj_kokurikuler (guru_id, nama_kegiatan, tahun_ajaran_id)
  where kelas_id is null;

-- ---------- 2) nilai_kokurikuler: batasan unik + policy PJ ----------

-- Batasan unik supaya 1 siswa cuma punya 1 baris nilai per kegiatan
-- (per kelas konkret siswa itu) per tahun ajaran — mencegah data dobel
-- dan memudahkan upsert langsung pakai kombinasi ini.
alter table public.nilai_kokurikuler
  drop constraint if exists ux_nilai_koku_siswa_kegiatan;
alter table public.nilai_kokurikuler
  add constraint ux_nilai_koku_siswa_kegiatan
  unique (siswa_id, nama_kegiatan, kelas_id, tahun_ajaran_id);

drop policy if exists "PJ kelola nilai kokurikuler kelas binaannya" on public.nilai_kokurikuler;
drop policy if exists "PJ kelola nilai kokurikuler kegiatannya" on public.nilai_kokurikuler;
create policy "PJ kelola nilai kokurikuler kegiatannya" on public.nilai_kokurikuler for all
using (
  exists (
    select 1 from public.pj_kokurikuler pk
    where pk.guru_id = auth.uid()
      and pk.tahun_ajaran_id = nilai_kokurikuler.tahun_ajaran_id
      and pk.nama_kegiatan = nilai_kokurikuler.nama_kegiatan
      and (pk.kelas_id is null or pk.kelas_id = nilai_kokurikuler.kelas_id)
  )
  and exists (
    select 1 from public.siswa_kelas sk
    where sk.siswa_id = nilai_kokurikuler.siswa_id
      and sk.kelas_id = nilai_kokurikuler.kelas_id
      and sk.tahun_ajaran_id = nilai_kokurikuler.tahun_ajaran_id
  )
)
with check (
  exists (
    select 1 from public.pj_kokurikuler pk
    where pk.guru_id = auth.uid()
      and pk.tahun_ajaran_id = nilai_kokurikuler.tahun_ajaran_id
      and pk.nama_kegiatan = nilai_kokurikuler.nama_kegiatan
      and (pk.kelas_id is null or pk.kelas_id = nilai_kokurikuler.kelas_id)
  )
  and exists (
    select 1 from public.siswa_kelas sk
    where sk.siswa_id = nilai_kokurikuler.siswa_id
      and sk.kelas_id = nilai_kokurikuler.kelas_id
      and sk.tahun_ajaran_id = nilai_kokurikuler.tahun_ajaran_id
  )
);

-- Wali kelas & Admin: policy lama tetap berlaku apa adanya (tidak
-- bergantung pada nama_kegiatan atau lingkup kelas PJ), jadi tidak
-- perlu diubah. Ditulis ulang di sini sekadar memastikan konsisten.
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

-- =========================================================
-- CATATAN PEMAKAIAN (setelah migrasi ini):
-- Menu Admin → "Penugasan Guru" → "Penanggung Jawab Kokurikuler":
--   isi Guru + Nama Kegiatan Kokurikuler (teks bebas, mis.
--   "P5 - Kearifan Lokal") + Kelas (pilih kelas tertentu, atau
--   biarkan "— Semua Kelas —" supaya PJ ini menilai siswa di
--   SEMUA kelas untuk kegiatan tsb). Bisa diulang dengan guru lain
--   untuk kombinasi kegiatan+kelas yang sama, atau guru yang sama
--   untuk kegiatan lain.
--
-- Menu Guru → "Nilai Kokurikuler — <nama kegiatan> — <kelas/Semua
-- Kelas>": tiap penugasan PJ tampil sebagai menu terpisah. Guru
-- mengisi Deskripsi per siswa dalam lingkup penugasannya (satu
-- kelas, atau lintas semua kelas kalau lingkupnya "Semua Kelas").
--
-- Menu Guru → "Kokurikuler — <nama kelas>" (Wali kelas, baca saja):
-- muncul otomatis kalau kelas wali BELUM tercakup PJ manapun (baik
-- PJ kelas tertentu maupun PJ "Semua Kelas") — menampilkan rekap
-- semua kegiatan kokurikuler siswa di kelasnya untuk kebutuhan
-- cetak rapor.
-- =========================================================
