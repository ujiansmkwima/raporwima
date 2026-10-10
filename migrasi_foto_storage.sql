-- =========================================================
-- MIGRASI: Foto Buku Induk -> Supabase Storage
-- Jalankan di Supabase -> SQL Editor (aman diulang).
-- Prasyarat: migrasi_buku_induk.sql sudah dijalankan
--            (fungsi bi_is_admin & bi_is_wali_siswa).
--
-- Foto disimpan sebagai file di bucket PRIVAT "buku-induk-foto".
-- Kolom bi_siswa_detail.foto / foto_lulus hanya menyimpan PATH file.
-- Batas ukuran file di server: 50 KB (browser sudah mengompres otomatis).
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('buku-induk-foto', 'buku-induk-foto', false, 51200, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 51200,
      allowed_mime_types = array['image/jpeg'];

-- Nama file = "<siswa_id>/<masuk|lulus>-<timestamp>.jpg"; ambil siswa_id dari folder.
create or replace function public.bi_foto_siswa_id(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;
grant execute on function public.bi_foto_siswa_id(text) to authenticated;

drop policy if exists "BI foto admin kelola" on storage.objects;
create policy "BI foto admin kelola" on storage.objects for all to authenticated
using (bucket_id = 'buku-induk-foto' and public.bi_is_admin())
with check (bucket_id = 'buku-induk-foto' and public.bi_is_admin());

drop policy if exists "BI foto wali kelola siswa kelasnya" on storage.objects;
create policy "BI foto wali kelola siswa kelasnya" on storage.objects for all to authenticated
using (bucket_id = 'buku-induk-foto' and public.bi_is_wali_siswa(public.bi_foto_siswa_id(name)))
with check (bucket_id = 'buku-induk-foto' and public.bi_is_wali_siswa(public.bi_foto_siswa_id(name)));
