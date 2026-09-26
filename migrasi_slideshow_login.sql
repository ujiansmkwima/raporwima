-- =========================================================
-- MIGRASI: Slideshow Login
--
--   Tabel untuk gambar-gambar yang tampil bergantian (slideshow) di
--   panel kiri halaman Masuk (index.html), sebelum user login. Tiap
--   baris = 1 gambar (disimpan sebagai data URL base64, sama seperti
--   tanda tangan Kepala Sekolah di migrasi_tanggal_dan_ttd_kepsek.sql
--   — tidak perlu setup Supabase Storage/bucket terpisah) + kolom
--   `urutan` untuk mengatur giliran tampil.
--
--   PENTING soal akses: tabel-tabel lain di aplikasi ini cuma boleh
--   dibaca user yang SUDAH login (auth.uid() is not null), tapi
--   slideshow ini harus tampil di halaman Masuk SEBELUM user login,
--   jadi policy SELECT-nya sengaja dibuka untuk siapa saja (memakai
--   anon key sekalipun). Tetap aman karena isinya cuma gambar
--   promosi/galeri sekolah, bukan data pribadi siswa/nilai. Hanya
--   admin yang login yang boleh menambah/mengurutkan/menghapus.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

create table if not exists public.login_slideshow (
  id uuid primary key default gen_random_uuid(),
  gambar text not null,
  urutan integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.login_slideshow enable row level security;

drop policy if exists "Semua orang boleh baca login_slideshow" on public.login_slideshow;
create policy "Semua orang boleh baca login_slideshow" on public.login_slideshow for select
using (true);

drop policy if exists "Admin kelola login_slideshow" on public.login_slideshow;
create policy "Admin kelola login_slideshow" on public.login_slideshow for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → "Slideshow Login": upload gambar (foto kegiatan
-- sekolah, prestasi siswa, dll — sebaiknya potret/vertikal), atur
-- urutan tampil lewat tombol naik/turun, hapus gambar yang tidak
-- dipakai lagi lewat tombol hapus.
--
-- Halaman Masuk (index.html): kalau ada minimal 1 gambar di
-- login_slideshow, panel kiri halaman Masuk otomatis menampilkan
-- slideshow-nya (gambar bergantian otomatis), form login bergeser ke
-- kanan. Kalau belum ada gambar sama sekali, halaman Masuk tampil
-- seperti biasa (form login di tengah, tanpa slideshow).
-- =========================================================
