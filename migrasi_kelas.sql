-- =========================================================
-- MIGRASI: ubah kolom tabel kelas
-- dari: jurusan
-- jadi: program_keahlian, konsentrasi_keahlian
--
-- Jalankan ini di Supabase Dashboard → SQL Editor KALAU database
-- kamu sudah pernah menjalankan schema.sql versi lama (yang masih
-- punya kolom "jurusan" pada tabel kelas).
--
-- Aman dijalankan berkali-kali. Data "jurusan" yang sudah ada TIDAK
-- hilang — otomatis dipindahkan isinya ke kolom "program_keahlian",
-- baru kolom "jurusan" dihapus. "konsentrasi_keahlian" akan kosong
-- dan perlu diisi manual lewat form Edit di menu Kelas.
-- =========================================================

-- 1. Tambah dua kolom baru (aman kalau sudah ada)
alter table public.kelas add column if not exists program_keahlian text;
alter table public.kelas add column if not exists konsentrasi_keahlian text;

-- 2. Pindahkan data lama dari "jurusan" ke "program_keahlian",
--    hanya kalau kolom "jurusan" masih ada dan belum pernah dipindah
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'kelas' and column_name = 'jurusan'
  ) then
    update public.kelas
    set program_keahlian = jurusan
    where program_keahlian is null and jurusan is not null;

    alter table public.kelas drop column jurusan;
  end if;
end $$;
