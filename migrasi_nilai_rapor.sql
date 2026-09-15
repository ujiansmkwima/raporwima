-- =========================================================
-- MIGRASI: Nilai Rapor + Capaian Pembelajaran (narasi)
--
--   Menu Guru → "Input Nilai" disederhanakan: sekarang guru
--   hanya mengisi 2 hal per siswa — Nilai Rapor (angka) dan
--   Capaian Pembelajaran (narasi teks), bukan lagi 3 nilai
--   terpisah (pengetahuan/keterampilan/sikap).
--
--   Capaian Pembelajaran diambil otomatis dari Tujuan
--   Pembelajaran yang sudah dicentang guru per siswa di menu
--   "Pilih Tujuan Pembelajaran" (kolom baik & kurang), lalu
--   disimpan sebagai teks supaya bisa disunting manual kalau
--   perlu sebelum dicetak ke rapor.
--
--   1) Kolom baru: nilai.capaian_pembelajaran (text)
--   2) Constraint jenis diperlonggar: tambah opsi 'rapor',
--      opsi lama (pengetahuan/keterampilan/sikap) tetap
--      dipertahankan di constraint supaya data lama tidak
--      error, walau UI guru tidak lagi memakainya.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

alter table public.nilai add column if not exists capaian_pembelajaran text;

alter table public.nilai drop constraint if exists nilai_jenis_check;
alter table public.nilai add constraint nilai_jenis_check
  check (jenis in ('pengetahuan', 'keterampilan', 'sikap', 'rapor'));

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Guru → "Input Nilai" → pilih mapel & kelas yang diajar →
-- untuk tiap siswa, isi "Nilai Rapor" (0–100) dan "Capaian
-- Pembelajaran". Tombol "Ambil dari TP Terpilih" pada tiap baris
-- akan mengisi ulang teks Capaian Pembelajaran dari Tujuan
-- Pembelajaran (baik/kurang) yang sudah dicentang guru untuk siswa
-- tsb di menu "Pilih Tujuan Pembelajaran" — teksnya tetap boleh
-- disunting manual sebelum disimpan.
-- =========================================================
