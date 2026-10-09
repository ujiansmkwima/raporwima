-- =========================================================
-- MIGRASI: BUKU INDUK SISWA
--
--   Menambah aplikasi Buku Induk di samping E-Rapor & Supervisi.
--   FILE INI DIBUAT OTOMATIS dari bukuinduk-fields.js (daftar isian
--   Buku Induk). Aman dijalankan berkali-kali.
--
--   Jalankan di Supabase Dashboard -> SQL Editor, SETELAH schema.sql,
--   profiles.sql, migrasi_rekap_presensi.sql, migrasi_ekstrakurikuler.sql
--   dan migrasi_pkl.sql (migrasi lain yang sudah kamu pakai tidak perlu
--   diulang).
--
--   Sinkron dengan E-Rapor:
--     * Biodata dasar (nama, NIS, NISN, TTL, alamat, orang tua, wali,
--       asal sekolah, tanggal masuk, status) TETAP di tabel public.siswa
--       yang sama dengan E-Rapor. Diubah di Buku Induk = berubah juga di
--       E-Rapor (Cetak Identitas, dll), dan sebaliknya.
--     * Isian tambahan Buku Induk (NIK, data kesehatan, pendidikan orang
--       tua, data lulus/keluar, foto, dst) ada di bi_siswa_detail.
--     * Nilai, presensi, ekskul & PKL per semester DITARIK dari tabel
--       E-Rapor lalu diarsipkan di bi_riwayat_semester.
-- =========================================================

-- ---------------------------------------------------------
-- 0) Fungsi bantu hak akses
--    security definer supaya policy tidak saling memanggil RLS
-- ---------------------------------------------------------
create or replace function public.bi_is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;

-- Apakah user yang login adalah WALI KELAS dari siswa ini
-- pada tahun ajaran yang sedang aktif?
create or replace function public.bi_is_wali_siswa(p_siswa uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.wali_kelas wk
    join public.tahun_ajaran ta on ta.id = wk.tahun_ajaran_id and ta.is_aktif = true
    join public.siswa_kelas sk on sk.kelas_id = wk.kelas_id and sk.tahun_ajaran_id = wk.tahun_ajaran_id
    where wk.guru_id = auth.uid()
      and sk.siswa_id = p_siswa
  );
$$;

grant execute on function public.bi_is_admin() to authenticated;
grant execute on function public.bi_is_wali_siswa(uuid) to authenticated;

-- ---------------------------------------------------------
-- 1) bi_siswa_detail — isian tambahan Buku Induk (1 baris / siswa)
-- ---------------------------------------------------------
create table if not exists public.bi_siswa_detail (
  siswa_id uuid primary key references public.siswa(id) on delete cascade,
  foto text,                         -- foto 3x4 SAAT MASUK (data URL JPEG kecil)
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now()
);

-- foto 3x4 SAAT LULUS / meninggalkan sekolah (pasangan kolom foto = saat masuk)
alter table public.bi_siswa_detail add column if not exists foto_lulus text;
alter table public.bi_siswa_detail add column if not exists nik text;
alter table public.bi_siswa_detail add column if not exists no_kk text;
alter table public.bi_siswa_detail add column if not exists kewarganegaraan text;
alter table public.bi_siswa_detail add column if not exists jumlah_saudara integer;
alter table public.bi_siswa_detail add column if not exists bahasa_sehari text;
alter table public.bi_siswa_detail add column if not exists hobi text;
alter table public.bi_siswa_detail add column if not exists email_siswa text;
alter table public.bi_siswa_detail add column if not exists kelurahan text;
alter table public.bi_siswa_detail add column if not exists kecamatan text;
alter table public.bi_siswa_detail add column if not exists kab_kota text;
alter table public.bi_siswa_detail add column if not exists provinsi text;
alter table public.bi_siswa_detail add column if not exists kode_pos text;
alter table public.bi_siswa_detail add column if not exists tinggal_dengan text;
alter table public.bi_siswa_detail add column if not exists jarak_sekolah text;
alter table public.bi_siswa_detail add column if not exists transportasi text;
alter table public.bi_siswa_detail add column if not exists golongan_darah text;
alter table public.bi_siswa_detail add column if not exists tinggi_badan numeric(5,1);
alter table public.bi_siswa_detail add column if not exists berat_badan numeric(5,1);
alter table public.bi_siswa_detail add column if not exists riwayat_penyakit text;
alter table public.bi_siswa_detail add column if not exists ayah_tahun_lahir text;
alter table public.bi_siswa_detail add column if not exists ayah_pendidikan text;
alter table public.bi_siswa_detail add column if not exists ayah_penghasilan text;
alter table public.bi_siswa_detail add column if not exists ibu_tahun_lahir text;
alter table public.bi_siswa_detail add column if not exists ibu_pendidikan text;
alter table public.bi_siswa_detail add column if not exists ibu_penghasilan text;
alter table public.bi_siswa_detail add column if not exists wali_hubungan text;
alter table public.bi_siswa_detail add column if not exists wali_pendidikan text;
alter table public.bi_siswa_detail add column if not exists wali_penghasilan text;
alter table public.bi_siswa_detail add column if not exists tahun_lulus_smp text;
alter table public.bi_siswa_detail add column if not exists no_ijazah_smp text;
alter table public.bi_siswa_detail add column if not exists diterima_sebagai text;
alter table public.bi_siswa_detail add column if not exists no_pendaftaran text;
alter table public.bi_siswa_detail add column if not exists program_keahlian_masuk text;
alter table public.bi_siswa_detail add column if not exists pindahan_dari text;
alter table public.bi_siswa_detail add column if not exists pindahan_alasan text;
alter table public.bi_siswa_detail add column if not exists alasan_keluar text;
alter table public.bi_siswa_detail add column if not exists tanggal_keluar date;
alter table public.bi_siswa_detail add column if not exists tujuan_pindah text;
alter table public.bi_siswa_detail add column if not exists no_ijazah text;
alter table public.bi_siswa_detail add column if not exists tanggal_ijazah date;
alter table public.bi_siswa_detail add column if not exists melanjutkan_ke text;
alter table public.bi_siswa_detail add column if not exists keterangan_keluar text;
alter table public.bi_siswa_detail add column if not exists catatan_khusus text;

alter table public.bi_siswa_detail enable row level security;

drop policy if exists "BI admin kelola detail" on public.bi_siswa_detail;
create policy "BI admin kelola detail" on public.bi_siswa_detail for all
using (public.bi_is_admin()) with check (public.bi_is_admin());

drop policy if exists "BI wali kelola detail siswa kelasnya" on public.bi_siswa_detail;
create policy "BI wali kelola detail siswa kelasnya" on public.bi_siswa_detail for all
using (public.bi_is_wali_siswa(siswa_id)) with check (public.bi_is_wali_siswa(siswa_id));

-- ---------------------------------------------------------
-- 2) bi_riwayat_semester — arsip per semester (nilai, presensi, ekskul)
--    sumber: 'rapor' = ditarik dari E-Rapor, 'manual' = diisi tangan
--    (mis. data tahun lama / siswa pindahan sebelum ada E-Rapor).
--    dikunci = true -> tidak ditimpa saat "Tarik dari E-Rapor".
-- ---------------------------------------------------------
create table if not exists public.bi_riwayat_semester (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  ta_nama text not null,                      -- contoh '2025/2026'
  ta_semester text not null check (ta_semester in ('Gasal', 'Genap')),
  semester_ke integer check (semester_ke between 1 and 6),
  kelas_nama text,
  nilai jsonb not null default '[]'::jsonb,   -- [{mapel, kode, nilai, kkm, urut}]
  jumlah_sakit integer default 0,
  jumlah_izin integer default 0,
  jumlah_alpha integer default 0,
  catatan_wali text,
  ekskul jsonb not null default '[]'::jsonb,  -- [{nama, predikat}]
  nilai_pkl numeric(5,2),
  sumber text not null default 'rapor' check (sumber in ('rapor', 'manual')),
  dikunci boolean not null default false,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique (siswa_id, ta_nama, ta_semester)
);

create index if not exists idx_bi_riwayat_siswa on public.bi_riwayat_semester (siswa_id);

-- kokurikuler per semester: [{nama, deskripsi}] (nama kegiatan + deskripsi capaian)
alter table public.bi_riwayat_semester add column if not exists kokurikuler jsonb not null default '[]'::jsonb;

alter table public.bi_riwayat_semester enable row level security;

drop policy if exists "BI admin kelola riwayat" on public.bi_riwayat_semester;
create policy "BI admin kelola riwayat" on public.bi_riwayat_semester for all
using (public.bi_is_admin()) with check (public.bi_is_admin());

drop policy if exists "BI wali kelola riwayat siswa kelasnya" on public.bi_riwayat_semester;
create policy "BI wali kelola riwayat siswa kelasnya" on public.bi_riwayat_semester for all
using (public.bi_is_wali_siswa(siswa_id)) with check (public.bi_is_wali_siswa(siswa_id));

-- ---------------------------------------------------------
-- 3) bi_catatan — prestasi, beasiswa, pelanggaran/pembinaan, dll
-- ---------------------------------------------------------
create table if not exists public.bi_catatan (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kategori text not null default 'Prestasi',
  tanggal date,
  tingkat text,                      -- sekolah / kecamatan / kabupaten / provinsi / nasional ...
  uraian text not null,
  dicatat_oleh uuid references public.profiles(id),
  created_at timestamptz default now()
);

create index if not exists idx_bi_catatan_siswa on public.bi_catatan (siswa_id);

alter table public.bi_catatan enable row level security;

drop policy if exists "BI admin kelola catatan" on public.bi_catatan;
create policy "BI admin kelola catatan" on public.bi_catatan for all
using (public.bi_is_admin()) with check (public.bi_is_admin());

drop policy if exists "BI wali kelola catatan siswa kelasnya" on public.bi_catatan;
create policy "BI wali kelola catatan siswa kelasnya" on public.bi_catatan for all
using (public.bi_is_wali_siswa(siswa_id)) with check (public.bi_is_wali_siswa(siswa_id));

-- ---------------------------------------------------------
-- 4) Wali kelas boleh MENGUBAH biodata siswa di kelasnya
--    (tabel siswa, yang sama dengan E-Rapor). Sebelumnya hanya admin.
--    Catatan: kolom tidak bisa dibatasi lewat RLS; di layar, NIS/NISN
--    dan Status hanya bisa diubah oleh Admin.
-- ---------------------------------------------------------
drop policy if exists "BI wali ubah biodata siswa kelasnya" on public.siswa;
create policy "BI wali ubah biodata siswa kelasnya" on public.siswa for update
using (public.bi_is_wali_siswa(id)) with check (public.bi_is_wali_siswa(id));

-- ---------------------------------------------------------
-- 5) Wali kelas boleh MEMBACA nilai ekskul & PKL siswa di kelasnya
--    (supaya "Tarik dari E-Rapor" lengkap). Hanya baca.
-- ---------------------------------------------------------
drop policy if exists "BI wali baca nilai ekskul kelasnya" on public.nilai_ekstrakurikuler;
create policy "BI wali baca nilai ekskul kelasnya" on public.nilai_ekstrakurikuler for select
using (public.bi_is_wali_siswa(siswa_id));

drop policy if exists "BI wali baca nilai pkl kelasnya" on public.nilai_pkl;
create policy "BI wali baca nilai pkl kelasnya" on public.nilai_pkl for select
using (public.bi_is_wali_siswa(siswa_id));

-- =========================================================
-- CATATAN PEMAKAIAN
--   * Login -> halaman Menu Utama -> pilih Buku Induk.
--   * Admin   : bukuinduk-admin.html (semua siswa, mutasi/kelulusan,
--               sinkron massal dari E-Rapor, impor/ekspor Excel, cetak).
--   * Wali kelas: bukuinduk-guru.html (siswa kelasnya saja).
-- =========================================================
