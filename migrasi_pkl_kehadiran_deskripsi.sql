-- =========================================================
-- MIGRASI: Lengkapi Nilai PKL — Kehadiran + Deskripsi per TP
--
--   Menambah kolom pada tabel pkl_pembimbing (dibuat di
--   migrasi_pkl.sql) supaya menu Guru → "Nilai PKL" dan cetak
--   "Format Penilaian PKL" bisa mengikuti format resmi sekolah
--   (contoh: DAFTAR NILAI PESERTA DIDIK MATA PELAJARAN PKL):
--
--   1) Kehadiran selama PKL — Sakit / Ijin / Tanpa Keterangan,
--      diisi dalam satuan Hari oleh guru pembimbing. Terpisah
--      dari rekap_presensi (yang dipakai Cetak Rapor biasa),
--      karena ini presensi KHUSUS selama periode PKL, bukan
--      presensi satu semester penuh di sekolah.
--
--   2) Deskripsi per Tujuan Pembelajaran (TP 1-4) — narasi bebas
--      dari guru pembimbing untuk tiap salah satu dari 4 tujuan
--      pembelajaran PKL yang baku (soft skills, norma/POS/K3LH,
--      kompetensi teknis, alur bisnis dunia kerja). Ditampilkan
--      berdampingan dengan Skor tiap TP di format cetak.
--
--   3) Catatan umum — catatan akhir guru pembimbing tentang
--      pelaksanaan PKL siswa tsb, tampil di bagian bawah format
--      cetak (sebelum tabel Kehadiran).
--
--   Skor per TP yang dicetak (kolom "Skor") dihitung aplikasi
--   sebagai rata-rata nilai TP tsb dari sumber 'guru_pendamping'
--   dan 'dudi' (tabel nilai_pkl) — TIDAK disimpan sebagai kolom
--   terpisah, konsisten dengan catatan di migrasi_pkl.sql bahwa
--   Nilai Akhir PKL = gabungan penilaian sekolah & DU/DI.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor, SETELAH migrasi_pkl.sql.
-- =========================================================

alter table public.pkl_pembimbing add column if not exists sakit integer not null default 0;
alter table public.pkl_pembimbing add column if not exists ijin integer not null default 0;
alter table public.pkl_pembimbing add column if not exists tanpa_keterangan integer not null default 0;

alter table public.pkl_pembimbing add column if not exists deskripsi_tp1 text;
alter table public.pkl_pembimbing add column if not exists deskripsi_tp2 text;
alter table public.pkl_pembimbing add column if not exists deskripsi_tp3 text;
alter table public.pkl_pembimbing add column if not exists deskripsi_tp4 text;

alter table public.pkl_pembimbing add column if not exists catatan text;

comment on column public.pkl_pembimbing.sakit is 'Jumlah hari Sakit selama periode PKL, diisi guru pembimbing.';
comment on column public.pkl_pembimbing.ijin is 'Jumlah hari Ijin selama periode PKL, diisi guru pembimbing.';
comment on column public.pkl_pembimbing.tanpa_keterangan is 'Jumlah hari Tanpa Keterangan selama periode PKL, diisi guru pembimbing.';
comment on column public.pkl_pembimbing.deskripsi_tp1 is 'Deskripsi/narasi untuk Tujuan Pembelajaran 1 (soft skills) di format cetak PKL.';
comment on column public.pkl_pembimbing.deskripsi_tp2 is 'Deskripsi/narasi untuk Tujuan Pembelajaran 2 (norma/POS/K3LH) di format cetak PKL.';
comment on column public.pkl_pembimbing.deskripsi_tp3 is 'Deskripsi/narasi untuk Tujuan Pembelajaran 3 (kompetensi teknis) di format cetak PKL.';
comment on column public.pkl_pembimbing.deskripsi_tp4 is 'Deskripsi/narasi untuk Tujuan Pembelajaran 4 (alur bisnis dunia kerja) di format cetak PKL.';
comment on column public.pkl_pembimbing.catatan is 'Catatan umum guru pembimbing tentang pelaksanaan PKL siswa, tampil di bagian bawah format cetak.';

-- =========================================================
-- CATATAN PEMAKAIAN:
--
-- Menu Guru → "Nilai PKL": tiap kartu siswa binaan sekarang juga
-- punya kotak "Sakit / Ijin / Tanpa Keterangan (Hari)" dan kotak
-- Deskripsi di samping tiap baris TP 1-4, plus satu kotak
-- "Catatan" umum di bagian bawah. Semua ikut tersimpan lewat
-- tombol "Simpan Semua Nilai PKL" yang sudah ada.
--
-- Tombol "Cetak Format PKL" per siswa sekarang mengikuti format
-- resmi sekolah: identitas siswa & DUDI dua kolom (Nama Peserta
-- Didik/NISN/Tempat PKL/Tanggal PKL/Nama Instruktur/Nama
-- Pembimbing di kiri, Kelas/Program Keahlian/Konsentrasi Keahlian
-- di kanan), tabel Tujuan Pembelajaran dengan kolom Skor tunggal
-- (rata-rata Guru Pendamping & DUDI per TP) + Deskripsi, baris
-- Nilai Akhir, kotak Catatan, dan tabel Kehadiran.
-- =========================================================
