-- =========================================================
-- MIGRASI: AKUN LOGIN SISWA (username = NIS, sandi awal = siswa123)
--
--   Jalankan di Supabase Dashboard -> SQL Editor (project RAPOR).
--   Aman dijalankan berkali-kali.
--
--   CATATAN PENTING: akun "siswa123" yang dibuat sync-rapor.ts ada di
--   project UJIANWIMA, bukan di project rapor ini. Project rapor belum
--   punya akun siswa, jadi migrasi ini membuatnya.
--
--   Yang dikerjakan:
--     1) Kolom siswa.auth_user_id (penghubung siswa <-> akun login).
--     2) Fungsi bantu is_staff() & siswa_id_saya().
--     3) PENGETATAN policy lama "semua user login boleh baca ..."
--        pada tabel berisi data pribadi (siswa, siswa_kelas, dll).
--        TANPA langkah ini, akun siswa bisa membaca biodata SELURUH
--        siswa lewat API. Guru & admin tidak terpengaruh.
--     4) Policy baca-saja: siswa hanya boleh melihat data MILIKNYA
--        (rapor, presensi, buku induk, ekskul, kokurikuler, foto).
--     5) Pembuatan akun otomatis (trigger) + sinkron massal untuk
--        siswa yang sudah ada.
--
--   Email login internal siswa: <NIS>@siswa.raporwima.local
--   (siswa tidak perlu tahu; di halaman Masuk cukup ketik NIS).
-- =========================================================

-- ---------------------------------------------------------
-- 0) Ekstensi
-- ---------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------
-- 1) Penghubung siswa <-> akun login
-- ---------------------------------------------------------
alter table public.siswa
  add column if not exists auth_user_id uuid unique references auth.users(id) on delete set null;

-- ---------------------------------------------------------
-- 2) Fungsi bantu (security definer supaya policy tidak saling memanggil RLS)
-- ---------------------------------------------------------
create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('admin', 'guru')
  );
$$;

create or replace function public.siswa_id_saya()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select s.id from public.siswa s where s.auth_user_id = auth.uid() limit 1;
$$;

revoke all on function public.is_staff() from public, anon;
revoke all on function public.siswa_id_saya() from public, anon;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.siswa_id_saya() to authenticated;

-- Nama wali kelas untuk rapor siswa yang sedang login (siswa tidak boleh
-- membaca tabel profiles, jadi lewat fungsi ini; hanya untuk kelas MILIKNYA).
create or replace function public.nama_wali_kelas_siswa(p_tahun_ajaran uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select p.nama
  from public.siswa_kelas sk
  join public.wali_kelas wk on wk.kelas_id = sk.kelas_id and wk.tahun_ajaran_id = sk.tahun_ajaran_id
  join public.profiles p on p.id = wk.guru_id
  where sk.siswa_id = public.siswa_id_saya()
    and sk.tahun_ajaran_id = p_tahun_ajaran
  limit 1;
$$;
revoke all on function public.nama_wali_kelas_siswa(uuid) from public, anon;
grant execute on function public.nama_wali_kelas_siswa(uuid) to authenticated;

-- ---------------------------------------------------------
-- 3) PENGETATAN policy lama: dari "semua user login" -> "guru/admin saja"
--    (hanya tabel berisi data pribadi / internal sekolah)
-- ---------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('siswa',                    'Semua user login boleh baca siswa'),
      ('siswa_kelas',              'Semua user login boleh baca siswa_kelas'),
      ('ekstrakurikuler_siswa',    'Semua user login boleh baca ekstrakurikuler_siswa'),
      ('pembina_ekstrakurikuler',  'Semua user login boleh baca pembina_ekstrakurikuler'),
      ('pj_kokurikuler',           'Semua user login boleh baca pj_kokurikuler'),
      ('supervisi_guru',           'baca supervisi_guru'),
      ('supervisi_mapel',          'baca supervisi_mapel'),
      ('supervisi_form',           'baca supervisi_form'),
      ('supervisi_penugasan',      'baca supervisi_penugasan')
    ) as t(tabel, nama_policy)
  loop
    if to_regclass('public.' || r.tabel) is not null then
      execute format('drop policy if exists %I on public.%I', r.nama_policy, r.tabel);
      execute format('drop policy if exists %I on public.%I', 'Staf baca ' || r.tabel, r.tabel);
      execute format(
        'create policy %I on public.%I for select using (public.is_staff())',
        'Staf baca ' || r.tabel, r.tabel
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------
-- 4) Policy baca-saja untuk SISWA (hanya data miliknya sendiri)
-- ---------------------------------------------------------
drop policy if exists "Siswa baca dirinya sendiri" on public.siswa;
create policy "Siswa baca dirinya sendiri" on public.siswa
  for select using (auth_user_id = auth.uid());

drop policy if exists "Siswa baca penempatan kelasnya" on public.siswa_kelas;
create policy "Siswa baca penempatan kelasnya" on public.siswa_kelas
  for select using (siswa_id = public.siswa_id_saya());

drop policy if exists "Siswa baca nilai rapornya" on public.nilai;
create policy "Siswa baca nilai rapornya" on public.nilai
  for select using (siswa_id = public.siswa_id_saya() and jenis = 'rapor');

do $$
declare
  t text;
begin
  foreach t in array array[
    'rekap_presensi',
    'ekstrakurikuler_siswa',
    'nilai_ekstrakurikuler',
    'nilai_kokurikuler',
    'bi_siswa_detail',
    'bi_riwayat_semester'
  ]
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'Siswa baca ' || t || ' miliknya', t);
      execute format(
        'create policy %I on public.%I for select using (siswa_id = public.siswa_id_saya())',
        'Siswa baca ' || t || ' miliknya', t
      );
    end if;
  end loop;
end $$;

-- Foto Buku Induk (bucket privat): siswa boleh membuat link foto MILIKNYA.
do $$
begin
  if to_regprocedure('public.bi_foto_siswa_id(text)') is not null then
    execute 'drop policy if exists "BI foto siswa baca fotonya sendiri" on storage.objects';
    execute $p$
      create policy "BI foto siswa baca fotonya sendiri" on storage.objects
        for select to authenticated
        using (bucket_id = 'buku-induk-foto'
               and public.bi_foto_siswa_id(name) = public.siswa_id_saya())
    $p$;
  end if;
end $$;

-- NIK & No. KK terenkripsi: izinkan siswa mendekripsi (hanya nilai yang lolos
-- RLS, yaitu miliknya sendiri). Hanya dijalankan kalau migrasi enkripsi sudah ada.
do $$
begin
  if to_regprocedure('public.bi_dekripsi(text[])') is not null then
    execute $fn$
      create or replace function public.bi_dekripsi(p_vals text[])
      returns text[] language plpgsql security definer stable
      set search_path = public, extensions
      as $body$
      declare hasil text[];
      begin
        if auth.uid() is null
           or not (public.bi_is_admin()
                   or exists (select 1 from public.wali_kelas wk where wk.guru_id = auth.uid())
                   or public.siswa_id_saya() is not null) then
          raise exception 'tidak berizin';
        end if;
        if p_vals is null or cardinality(p_vals) = 0 then return '{}'; end if;
        select array_agg(public.bi_dec(u.v) order by u.n) into hasil
        from unnest(p_vals) with ordinality as u(v, n);
        return hasil;
      end $body$
    $fn$;
    execute 'revoke all on function public.bi_dekripsi(text[]) from public, anon';
    execute 'grant execute on function public.bi_dekripsi(text[]) to authenticated';
  end if;
end $$;

-- ---------------------------------------------------------
-- 5) Pembuatan akun siswa
--    Fungsi-fungsi ini MEMBUAT AKUN, jadi TIDAK boleh bisa dipanggil dari
--    aplikasi (dicabut dari anon/authenticated). Hanya SQL Editor & trigger.
-- ---------------------------------------------------------
create or replace function public.siswa_email(p_nis text)
returns text
language sql
immutable
as $$
  select lower(btrim(p_nis)) || '@siswa.raporwima.local';
$$;

create or replace function public.buat_akun_siswa(p_siswa_id uuid, p_password text default 'siswa123')
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  s record;
  v_email text;
  v_uid uuid;
begin
  select id, nis, nama, auth_user_id into s from public.siswa where id = p_siswa_id;
  if not found then return null; end if;
  if s.auth_user_id is not null then return s.auth_user_id; end if;
  if s.nis is null or btrim(s.nis) = '' or btrim(s.nis) ~ '\s' then return null; end if;

  v_email := public.siswa_email(s.nis);

  select id into v_uid from auth.users where email = v_email limit 1;

  if v_uid is null then
    v_uid := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(p_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nama', s.nama),
      now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_uid::text, v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end if;

  update public.siswa set auth_user_id = v_uid where id = p_siswa_id;
  return v_uid;
end $$;

-- Sinkron massal: buat akun untuk SEMUA siswa yang punya NIS tapi belum punya akun.
-- Jalankan manual:   select public.sinkron_akun_siswa();
create or replace function public.sinkron_akun_siswa(p_password text default 'siswa123')
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  r record;
  v_dibuat int := 0;
  v_tanpa_nis int := 0;
  v_gagal jsonb := '[]'::jsonb;
  v_hasil uuid;
begin
  for r in select id, nis, nama, auth_user_id from public.siswa where auth_user_id is null order by nama loop
    if r.nis is null or btrim(r.nis) = '' or btrim(r.nis) ~ '\s' then
      v_tanpa_nis := v_tanpa_nis + 1;
      continue;
    end if;
    begin
      v_hasil := public.buat_akun_siswa(r.id, p_password);
      if v_hasil is not null then v_dibuat := v_dibuat + 1; end if;
    exception when others then
      v_gagal := v_gagal || jsonb_build_array(jsonb_build_object('nis', r.nis, 'nama', r.nama, 'error', sqlerrm));
    end;
  end loop;
  return jsonb_build_object('akun_dibuat', v_dibuat, 'dilewati_tanpa_atau_salah_nis', v_tanpa_nis, 'gagal', v_gagal);
end $$;

-- Setel ulang sandi satu siswa ke default (mis. lupa sandi).
-- Jalankan manual:   select public.reset_sandi_siswa('12345');
create or replace function public.reset_sandi_siswa(p_nis text, p_password text default 'siswa123')
returns text
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  v_uid uuid;
begin
  select auth_user_id into v_uid from public.siswa where nis = btrim(p_nis);
  if v_uid is null then return 'NIS tidak ditemukan / belum punya akun'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = v_uid;
  return 'OK';
end $$;

revoke all on function public.buat_akun_siswa(uuid, text) from public, anon, authenticated;
revoke all on function public.sinkron_akun_siswa(text) from public, anon, authenticated;
revoke all on function public.reset_sandi_siswa(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 6) Trigger: siswa baru dibuat / NIS diubah / siswa dihapus -> akun mengikuti.
--    Semua dibungkus penangkap error: gagal membuat akun TIDAK boleh
--    menggagalkan admin menyimpan data siswa.
-- ---------------------------------------------------------
create or replace function public.trg_siswa_sinkron_akun()
returns trigger
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
begin
  begin
    if tg_op = 'INSERT' then
      if new.nis is not null and btrim(new.nis) <> '' then
        perform public.buat_akun_siswa(new.id);
      end if;

    elsif tg_op = 'UPDATE' then
      if new.nis is distinct from old.nis then
        if new.auth_user_id is not null and new.nis is not null and btrim(new.nis) <> '' then
          update auth.users set email = public.siswa_email(new.nis), updated_at = now()
            where id = new.auth_user_id;
          update auth.identities
            set identity_data = identity_data || jsonb_build_object('email', public.siswa_email(new.nis)),
                updated_at = now()
            where user_id = new.auth_user_id and provider = 'email';
        elsif new.auth_user_id is null and new.nis is not null and btrim(new.nis) <> '' then
          perform public.buat_akun_siswa(new.id);
        end if;
      end if;

    elsif tg_op = 'DELETE' then
      if old.auth_user_id is not null then
        delete from auth.users where id = old.auth_user_id;
      end if;
    end if;
  exception when others then
    raise warning 'Sinkron akun siswa gagal (%): %', tg_op, sqlerrm;
  end;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

revoke all on function public.trg_siswa_sinkron_akun() from public, anon, authenticated;

drop trigger if exists trg_siswa_akun_ins_upd on public.siswa;
create trigger trg_siswa_akun_ins_upd
after insert or update of nis on public.siswa
for each row execute function public.trg_siswa_sinkron_akun();

drop trigger if exists trg_siswa_akun_del on public.siswa;
create trigger trg_siswa_akun_del
after delete on public.siswa
for each row execute function public.trg_siswa_sinkron_akun();

-- ---------------------------------------------------------
-- 7) BUAT AKUN UNTUK SISWA YANG SUDAH ADA (jalankan sekali)
-- ---------------------------------------------------------
select public.sinkron_akun_siswa();

-- =========================================================
-- PEMERIKSAAN (jalankan manual setelah migrasi)
--
--  a) Berapa siswa yang sudah punya akun / belum:
--     select count(*) filter (where auth_user_id is not null) as punya_akun,
--            count(*) filter (where auth_user_id is null)     as belum
--       from public.siswa;
--
--  b) Siswa yang belum punya akun (biasanya NIS kosong / ada spasi):
--     select nis, nama from public.siswa where auth_user_id is null;
--
--  c) Pastikan TIDAK ada lagi policy "semua user login" pada tabel pribadi:
--     select tablename, policyname, qual from pg_policies
--      where schemaname = 'public' and qual like '%auth.uid() IS NOT NULL%';
--     (tabel yang BOLEH tersisa: tahun_ajaran, mata_pelajaran, mapel_kelas,
--      mapel_semester, kelas, ekstrakurikuler, mapel_urutan_kelas, profil_sekolah)
--
--  d) Sandi awal semua siswa = siswa123. Siswa disarankan menggantinya lewat
--     menu "Ganti Kata Sandi" di halaman siswa.
-- =========================================================
