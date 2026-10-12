-- =========================================================
-- MIGRASI: ADMIN BISA RESET SANDI SISWA DARI PANEL
--
--   Jalankan di Supabase Dashboard -> SQL Editor (project RAPOR).
--   Aman dijalankan berkali-kali. Jalankan SETELAH migrasi_akun_siswa.sql.
--
--   Fungsi admin_reset_sandi_siswa(siswa_id) dipanggil dari tombol
--   "Reset Sandi" di menu Siswa (admin.html). Hanya user ber-role
--   'admin' yang lolos; guru/siswa ditolak oleh pengecekan di dalam fungsi.
--
--   - Sandi dikembalikan ke 'siswa123'.
--   - Kalau siswa (ber-NIS) belum punya akun, akunnya sekalian dibuat.
-- =========================================================

create or replace function public.admin_reset_sandi_siswa(p_siswa_id uuid)
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid;
  v_nis text;
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'tidak berizin';
  end if;

  select auth_user_id, nis into v_uid, v_nis from public.siswa where id = p_siswa_id;
  if not found then return 'Siswa tidak ditemukan'; end if;

  if v_uid is null then
    if v_nis is null or btrim(v_nis) = '' or btrim(v_nis) ~ '\s' then
      return 'Siswa belum punya NIS yang valid (kosong / ada spasi), akun tidak bisa dibuat';
    end if;
    v_uid := public.buat_akun_siswa(p_siswa_id);   -- sandi awal siswa123
    if v_uid is null then return 'Gagal membuat akun siswa'; end if;
    return 'OK';
  end if;

  update auth.users
     set encrypted_password = crypt('siswa123', gen_salt('bf')), updated_at = now()
   where id = v_uid;
  return 'OK';
end $$;

revoke all on function public.admin_reset_sandi_siswa(uuid) from public, anon;
grant execute on function public.admin_reset_sandi_siswa(uuid) to authenticated;
