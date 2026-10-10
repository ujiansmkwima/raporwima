-- =========================================================
-- MIGRASI: Data Sekolah lengkap di Profil Sekolah
--
--   Menambah kolom data identitas sekolah ke tabel
--   public.profil_sekolah, dipakai halaman "Cetak Data Sekolah"
--   (HAL 2 rapor: Nama Sekolah, NPSN/NSS, Alamat, Kelurahan,
--   Kecamatan, Kota/Kabupaten, Provinsi, Website, Email).
--   Diisi admin lewat menu Admin -> "Profil".
--
--   Kolom nama_sekolah & alamat_sekolah sudah ada sebelumnya.
--
--   Baris yang sudah ada diisi dengan data dari file Word
--   "HAL 2 IDENTITAS SEKOLAH" HANYA untuk kolom yang masih kosong
--   (data yang sudah diisi admin tidak ditimpa).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- -> SQL Editor.
-- =========================================================

alter table public.profil_sekolah
  add column if not exists npsn text,
  add column if not exists nss text,
  add column if not exists kelurahan text,
  add column if not exists kecamatan text,
  add column if not exists kab_kota text,
  add column if not exists provinsi text,
  add column if not exists website text,
  add column if not exists email text;

update public.profil_sekolah set
  npsn           = coalesce(nullif(npsn, ''), '69899923'),
  alamat_sekolah = coalesce(nullif(alamat_sekolah, ''), 'Komplek Pondok Pesantren Sikeris, RT 04/ RW 03 Desa Purwodadi'),
  kelurahan      = coalesce(nullif(kelurahan, ''), 'Purwodadi'),
  kecamatan      = coalesce(nullif(kecamatan, ''), 'Kecamatan Tambak'),
  kab_kota       = coalesce(nullif(kab_kota, ''), 'Kabupaten Banyumas'),
  provinsi       = coalesce(nullif(provinsi, ''), 'Jawa Tengah'),
  website        = coalesce(nullif(website, ''), 'http://www.smkwidyamandala.sch.id'),
  email          = coalesce(nullif(email, ''), 'smkwimatambak@gmail.com')
where singleton = true;

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Admin -> "Profil": isi/ubah data sekolah, lalu Simpan.
-- Wali kelas -> "Cetak Cover" dan "Cetak Data Sekolah"
-- otomatis memakai data terbaru dari sini.
-- =========================================================
