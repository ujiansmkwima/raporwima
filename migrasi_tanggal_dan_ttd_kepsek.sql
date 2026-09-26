-- =========================================================
-- MIGRASI: Tanggal Tengah Semester, Tanggal Nilai PKL, dan
--          Tanda Tangan (gambar) Kepala Sekolah
--
--   Sebelum migrasi ini, Cetak Nilai Tengah Semester dan Cetak Nilai
--   PKL sama-sama memakai satu kolom `tanggal_rapor` untuk baris
--   tanda tangan, padahal tanggalnya biasanya berbeda dari tanggal
--   rapor akhir semester. Migrasi ini menambah dua kolom tanggal baru
--   yang terpisah, ditambah kolom untuk menyimpan gambar tanda tangan
--   Kepala Sekolah dan 3 saklar untuk mengatur di format cetak mana
--   saja gambar tanda tangan itu ditampilkan.
--
--   Kolom baru pada public.profil_sekolah:
--     - tanggal_tengah_semester : tanggal untuk baris tanda tangan di
--                                 Cetak Nilai Tengah Semester.
--     - tanggal_pkl             : tanggal untuk baris tanda tangan di
--                                 Cetak Nilai PKL.
--     - ttd_kepala_sekolah      : gambar tanda tangan Kepala Sekolah,
--                                 disimpan sebagai data URL base64
--                                 (mis. "data:image/png;base64,...").
--                                 Diupload lewat menu Admin → "Profil
--                                 Sekolah". Disimpan langsung di baris
--                                 ini (bukan Supabase Storage) supaya
--                                 tidak perlu setup bucket terpisah;
--                                 gambar otomatis dikecilkan di sisi
--                                 browser sebelum disimpan.
--     - tampil_ttd_rapor            : true/false, tampilkan gambar
--                                     tanda tangan di Cetak Rapor
--                                     (dan Cetak Identitas).
--     - tampil_ttd_tengah_semester  : true/false, tampilkan gambar
--                                     tanda tangan di Cetak Nilai
--                                     Tengah Semester.
--     - tampil_ttd_pkl              : true/false, tampilkan gambar
--                                     tanda tangan di Cetak Nilai PKL.
--
--   Kalau salah satu saklar tampil_ttd_* bernilai false (atau gambar
--   belum diupload), ruang tanda tangan di format cetak terkait tetap
--   kosong seperti sebelumnya (supaya bisa ditandatangani tulis
--   tangan di atas kertas cetakan) — tidak ada perubahan perilaku
--   untuk sekolah yang belum memakai fitur ini.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

alter table public.profil_sekolah
  add column if not exists tanggal_tengah_semester date,
  add column if not exists tanggal_pkl date,
  add column if not exists ttd_kepala_sekolah text,
  add column if not exists tampil_ttd_rapor boolean not null default true,
  add column if not exists tampil_ttd_tengah_semester boolean not null default true,
  add column if not exists tampil_ttd_pkl boolean not null default true;

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → "Profil Sekolah":
--   - Isi "Tanggal Tengah Semester" dan "Tanggal Nilai PKL" (terpisah
--     dari "Tanggal Rapor" yang sudah ada), lalu Simpan.
--   - Upload gambar tanda tangan Kepala Sekolah (PNG/JPG, sebaiknya
--     latar transparan), lalu centang di format cetak mana saja
--     gambar itu mau dipakai: Rapor, Tengah Semester, PKL (boleh
--     dicentang semua). Bisa juga dihapus lagi lewat tombol "Hapus
--     Tanda Tangan".
--
-- Menu Guru → "Cetak Rapor" / "Cetak Nilai Tengah Semester" / "Nilai
-- PKL" → "Cetak Nilai PKL": baris tanggal & tanda tangan Kepala
-- Sekolah otomatis memakai kolom yang sesuai dari sini.
-- =========================================================
