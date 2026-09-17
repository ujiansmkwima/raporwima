-- =========================================================
-- MIGRASI: mata pelajaran agama per agama siswa
-- Jalankan ini di Supabase Dashboard -> SQL Editor.
--
-- Tujuan: supaya "Pendidikan Agama Islam dan Budi Pekerti",
-- "Pendidikan Agama Buddha dan Budi Pekerti", "Pendidikan Agama
-- Kristen dan Budi Pekerti", "Pendidikan Agama Katolik dan Budi
-- Pekerti", "Pendidikan Agama Konghucu dan Budi Pekerti" bisa
-- dibuat sebagai 5 mata pelajaran TERPISAH di menu Mata Pelajaran,
-- masing-masing "ditandai" untuk satu agama lewat kolom baru
-- agama_spesifik. Efeknya (sudah ditangani di admin.html/guru.html):
--   1. Saat Cetak Rapor, tiap siswa HANYA melihat baris mapel agama
--      yang cocok dengan agamanya sendiri (bukan kelima-limanya).
--   2. Saat guru mapel agama tsb. membuka Input Nilai, daftar siswa
--      di kelas itu otomatis disaring: hanya siswa yang agamanya
--      sama dengan agama_spesifik mapel itu yang muncul.
--
-- Aman dijalankan berkali-kali. Mapel yang sudah ada TIDAK
-- terhapus/berubah -- agama_spesifik akan NULL (artinya "bukan
-- mapel agama / berlaku untuk semua siswa apapun agamanya"),
-- sama seperti kondisi sebelumnya.
-- =========================================================

alter table public.mata_pelajaran add column if not exists agama_spesifik text;

alter table public.mata_pelajaran drop constraint if exists mata_pelajaran_agama_spesifik_check;
alter table public.mata_pelajaran add constraint mata_pelajaran_agama_spesifik_check
  check (agama_spesifik is null or agama_spesifik in ('Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'));
