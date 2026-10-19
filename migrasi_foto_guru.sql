-- =========================================================
-- MIGRASI: Foto Profil Guru/Admin -> Supabase Storage
-- Jalankan di Supabase -> SQL Editor (aman diulang).
--
-- Foto disimpan sebagai file di bucket PRIVAT "foto-guru".
-- Kolom profiles.foto_path hanya menyimpan PATH file
-- (mis. "<user_id>/foto-1730000000000.jpg").
--
-- Siapa boleh apa:
--   * Admin  : unggah / ganti / hapus foto SEMUA guru (dan foto sendiri).
--   * Guru   : unggah / ganti / hapus foto SENDIRI saja.
--   * Semua user login boleh MELIHAT foto (lewat signed URL).
--
-- Perubahan kolom foto_path dilakukan lewat fungsi set_foto_profil()
-- (bukan UPDATE langsung ke profiles), supaya guru tidak bisa
-- mengubah kolom lain seperti role.
-- =========================================================

-- 1. Kolom path foto di profiles
alter table public.profiles add column if not exists foto_path text;

-- 2. Bucket privat. Batas 150 KB di server (browser sudah mengompres ke ±50 KB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('foto-guru', 'foto-guru', false, 153600, array['image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = 153600,
      allowed_mime_types = array['image/jpeg'];

-- 3. Pengecek admin (security definer supaya tidak kena RLS profiles)
create or replace function public.foto_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin');
$$;
grant execute on function public.foto_is_admin() to authenticated;

-- 4. Policy Storage
drop policy if exists "Foto guru: semua login boleh lihat" on storage.objects;
create policy "Foto guru: semua login boleh lihat" on storage.objects for select to authenticated
using (bucket_id = 'foto-guru');

drop policy if exists "Foto guru: admin kelola" on storage.objects;
create policy "Foto guru: admin kelola" on storage.objects for all to authenticated
using (bucket_id = 'foto-guru' and public.foto_is_admin())
with check (bucket_id = 'foto-guru' and public.foto_is_admin());

-- Guru: hanya folder miliknya sendiri (nama folder = user id), dan harus punya baris profiles.
drop policy if exists "Foto guru: kelola milik sendiri" on storage.objects;
create policy "Foto guru: kelola milik sendiri" on storage.objects for all to authenticated
using (
  bucket_id = 'foto-guru'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.profiles p where p.id = auth.uid())
)
with check (
  bucket_id = 'foto-guru'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from public.profiles p where p.id = auth.uid())
);

-- 5. Fungsi simpan path foto.
--    p_user kosong / sama dengan diri sendiri -> foto sendiri.
--    p_user orang lain -> hanya admin.
--    p_path null -> hapus foto.
create or replace function public.set_foto_profil(p_path text, p_user uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target uuid;
begin
  if auth.uid() is null then
    raise exception 'Belum login.';
  end if;
  v_target := coalesce(p_user, auth.uid());
  if v_target <> auth.uid() and not public.foto_is_admin() then
    raise exception 'Hanya admin yang boleh mengubah foto guru lain.';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> v_target::text then
    raise exception 'Path foto tidak valid.';
  end if;
  update public.profiles set foto_path = p_path where id = v_target;
  if not found then
    raise exception 'Profil tidak ditemukan.';
  end if;
end;
$$;
revoke all on function public.set_foto_profil(text, uuid) from public;
grant execute on function public.set_foto_profil(text, uuid) to authenticated;
