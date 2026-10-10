-- =========================================================
-- MIGRASI: Slideshow Login -> Supabase Storage
-- Jalankan di Supabase -> SQL Editor (aman diulang).
-- Prasyarat: migrasi_slideshow_login.sql sudah dijalankan.
--
-- Gambar disimpan sebagai file di bucket "login-slideshow".
-- Bucket ini PUBLIK (baca) karena slideshow tampil di halaman Masuk
-- sebelum user login; hanya ADMIN yang boleh mengunggah/mengubah/menghapus.
-- Kolom login_slideshow.gambar hanya menyimpan PATH file.
-- Batas ukuran file di server: 80 KB (browser sudah mengompres otomatis).
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('login-slideshow', 'login-slideshow', true, 81920, array['image/jpeg'])
on conflict (id) do update
  set public = true,
      file_size_limit = 81920,
      allowed_mime_types = array['image/jpeg'];

drop policy if exists "Admin kelola file login-slideshow" on storage.objects;
create policy "Admin kelola file login-slideshow" on storage.objects for all to authenticated
using (bucket_id = 'login-slideshow'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (bucket_id = 'login-slideshow'
  and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
