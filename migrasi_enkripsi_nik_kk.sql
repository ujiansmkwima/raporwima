-- =========================================================
-- MIGRASI: Enkripsi NIK & No. KK di bi_siswa_detail
-- Jalankan di Supabase -> SQL Editor (aman diulang).
-- Prasyarat: migrasi_buku_induk.sql sudah dijalankan.
--
-- Hasil: di Table Editor kolom nik & no_kk tampil seperti
--   enc:ww0ECQMC8x...   (bukan angka asli).
-- Aplikasi tetap menampilkan angka asli lewat fungsi bi_dekripsi
-- (hanya admin & wali kelas). Menyimpan tetap kirim angka biasa —
-- trigger yang mengenkripsi otomatis.
--
-- Kunci enkripsi dibuat acak & disimpan di Supabase Vault (nama: bi_key).
-- !! WAJIB simpan salinan kunci di tempat aman (langkah 7). Bila kunci
--    hilang, NIK & KK yang sudah terenkripsi TIDAK bisa dipulihkan.
-- Pemilik proyek Supabase tetap bisa mendekripsi lewat SQL Editor.
-- =========================================================

-- 0) (Disarankan) cadangan sementara. Berisi angka ASLI — HAPUS setelah langkah 8 lolos!
-- create table if not exists public.zz_backup_nik_kk as
--   select siswa_id, nik, no_kk from public.bi_siswa_detail;
-- alter table public.zz_backup_nik_kk enable row level security;  -- tanpa policy = tak bisa diakses lewat API

-- 1) Ekstensi
create extension if not exists pgcrypto with schema extensions;

-- 2) Kunci acak di Vault (dibuat sekali; tidak ditimpa bila sudah ada)
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bi_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'bi_key',
      'Kunci enkripsi NIK & No. KK Buku Induk');
  end if;
end $$;

-- 3) Fungsi internal (TIDAK bisa dipanggil dari aplikasi / API)
create or replace function public.bi_kunci()
returns text language sql security definer stable
set search_path = public, extensions, vault
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'bi_key' $$;

create or replace function public.bi_enc(t text)
returns text language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if t is null or btrim(t) = '' then return t; end if;
  if t like 'enc:%' then return t; end if;          -- sudah terenkripsi
  return 'enc:' || replace(encode(pgp_sym_encrypt(t, public.bi_kunci()), 'base64'), E'\n', '');
end $$;

create or replace function public.bi_dec(t text)
returns text language plpgsql security definer stable
set search_path = public, extensions
as $$
begin
  if t is null or t not like 'enc:%' then return t; end if;
  return pgp_sym_decrypt(decode(substr(t, 5), 'base64'), public.bi_kunci());
end $$;

revoke all on function public.bi_kunci()        from public, anon, authenticated;
revoke all on function public.bi_enc(text)      from public, anon, authenticated;
revoke all on function public.bi_dec(text)      from public, anon, authenticated;

-- 4) Trigger: enkripsi otomatis setiap insert / update
create or replace function public.bi_enkripsi_trg()
returns trigger language plpgsql security definer
set search_path = public, extensions
as $$
begin
  new.nik   := public.bi_enc(new.nik);
  new.no_kk := public.bi_enc(new.no_kk);
  return new;
end $$;
revoke all on function public.bi_enkripsi_trg() from public, anon, authenticated;

drop trigger if exists bi_enkripsi_nik_kk on public.bi_siswa_detail;
create trigger bi_enkripsi_nik_kk
before insert or update on public.bi_siswa_detail
for each row execute function public.bi_enkripsi_trg();

-- 5) Fungsi baca untuk aplikasi: dekripsi daftar nilai "enc:..." (urutan hasil = urutan input)
--    Hanya admin & wali kelas. Nilai yang bisa diberikan ke fungsi ini pun hanya
--    yang lolos RLS bi_siswa_detail (admin: semua; wali: siswa kelasnya).
create or replace function public.bi_dekripsi(p_vals text[])
returns text[] language plpgsql security definer stable
set search_path = public, extensions
as $$
declare hasil text[];
begin
  if auth.uid() is null
     or not (public.bi_is_admin()
             or exists (select 1 from public.wali_kelas wk where wk.guru_id = auth.uid())) then
    raise exception 'tidak berizin';
  end if;
  if p_vals is null or cardinality(p_vals) = 0 then return '{}'; end if;
  select array_agg(public.bi_dec(u.v) order by u.n) into hasil
  from unnest(p_vals) with ordinality as u(v, n);
  return hasil;
end $$;
revoke all on function public.bi_dekripsi(text[]) from public, anon;
grant execute on function public.bi_dekripsi(text[]) to authenticated;

-- 6) Enkripsi data NIK & KK yang SUDAH ada (trigger yang bekerja)
update public.bi_siswa_detail
   set nik = nik, no_kk = no_kk
 where (nik   is not null and btrim(nik)   <> '' and nik   not like 'enc:%')
    or (no_kk is not null and btrim(no_kk) <> '' and no_kk not like 'enc:%');

-- 7) SIMPAN KUNCI di tempat aman (password manager). Jalankan sendiri, salin hasilnya:
--    select decrypted_secret as kunci_bi_key from vault.decrypted_secrets where name = 'bi_key';

-- 8) Pemeriksaan (jalankan manual):
--    a) harus 0 baris (tidak ada angka polos tersisa):
--       select count(*) from public.bi_siswa_detail
--        where (nik not like 'enc:%' and btrim(nik) <> '') or (no_kk not like 'enc:%' and btrim(no_kk) <> '');
--    b) isi harus cocok dengan cadangan (bila langkah 0 dipakai), harus 0 baris:
--       select b.siswa_id from public.zz_backup_nik_kk b join public.bi_siswa_detail d using (siswa_id)
--        where public.bi_dec(d.nik) is distinct from b.nik or public.bi_dec(d.no_kk) is distinct from b.no_kk;
--    c) setelah lolos & kunci tersimpan:  drop table public.zz_backup_nik_kk;

-- =========================================================
-- ROLLBACK (kembali ke angka polos) — jalankan hanya bila perlu:
--   alter table public.bi_siswa_detail disable trigger bi_enkripsi_nik_kk;
--   update public.bi_siswa_detail set nik = public.bi_dec(nik), no_kk = public.bi_dec(no_kk);
--   drop trigger bi_enkripsi_nik_kk on public.bi_siswa_detail;
-- =========================================================
