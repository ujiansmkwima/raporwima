-- =========================================================
-- MIGRASI: LOG AKTIVITAS PER APLIKASI
--
--   Jalankan di Supabase Dashboard -> SQL Editor, SETELAH
--   migrasi_log_aktivitas.sql. Aman dijalankan berkali-kali.
--
--   Yang ditambahkan:
--     1) Kolom log_aktivitas.aplikasi  -> E-Rapor / Buku Induk / PKL /
--        Supervisi / Pengaturan Sekolah / Akun / Portal Siswa, supaya
--        aplikasi "Log Aktivitas" bisa menyaring per aplikasi.
--     2) Trigger pencatat perubahan untuk tabel BUKU INDUK
--        (bi_siswa_detail, bi_riwayat_semester, bi_catatan) dan
--        SUPERVISI (supervisi_*). Tabel E-Rapor & PKL sudah punya
--        trigger dari migrasi_log_aktivitas.sql.
--     3) Perbaikan pencatatan: foto / gambar (data URL) dicatat
--        sebagai "[gambar]", dan isi JSON yang besar (mis. arsip nilai
--        satu semester) dicatat sebagai "[data diubah]" agar tabel log
--        tidak membengkak. Kolom updated_by / dicatat_oleh diabaikan.
--     4) catat_aktivitas() menerima parameter aplikasi (opsional).
--     5) Log lama diberi label aplikasi (backfill).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Kolom aplikasi
-- ---------------------------------------------------------
alter table public.log_aktivitas add column if not exists aplikasi text;
create index if not exists ix_log_aktivitas_aplikasi on public.log_aktivitas (aplikasi, waktu desc);

-- Peta tabel -> aplikasi
create or replace function public.fn_log_aplikasi_tabel(t text)
returns text
language sql
immutable
as $$
  select case
    when t like 'bi\_%' or t = 'pengajuan_data_siswa'                then 'Buku Induk'
    when t in ('nilai_pkl', 'pkl_pembimbing', 'pkl_penguji')          then 'PKL'
    when t like 'supervisi\_%'                                        then 'Supervisi'
    when t in ('tahun_ajaran', 'profil_sekolah')                      then 'Pengaturan Sekolah'
    when t = 'profiles'                                               then 'Akun'
    else 'E-Rapor'
  end;
$$;

-- ---------------------------------------------------------
-- 2) Pembersih nilai untuk rincian log
-- ---------------------------------------------------------
create or replace function public.fn_log_nilai(v jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when v is null then null
    when jsonb_typeof(v) = 'string' then
      case when left(v #>> '{}', 5) = 'data:' then to_jsonb('[gambar]'::text)
           else to_jsonb(left(v #>> '{}', 160)) end
    when jsonb_typeof(v) in ('object', 'array') then
      case when length(v::text) > 200 then to_jsonb('[data diubah]'::text) else v end
    else v
  end;
$$;

-- ---------------------------------------------------------
-- 3) Label baris (ditambah: tahun ajaran teks, kategori, DUDI)
-- ---------------------------------------------------------
create or replace function public.fn_log_label(r jsonb)
returns text
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  bagian text[] := '{}';
  v text;
begin
  if coalesce(r ->> 'nama', '') <> '' then bagian := bagian || (r ->> 'nama'); end if;
  if coalesce(r ->> 'nama_sekolah', '') <> '' then bagian := bagian || (r ->> 'nama_sekolah'); end if;
  if coalesce(r ->> 'nama_kegiatan', '') <> '' then bagian := bagian || (r ->> 'nama_kegiatan'); end if;
  if coalesce(r ->> 'nama_dudi', '') <> '' then bagian := bagian || ('DUDI: ' || (r ->> 'nama_dudi')); end if;
  if coalesce(r ->> 'kategori', '') <> '' then bagian := bagian || (r ->> 'kategori'); end if;
  if coalesce(r ->> 'kode', '') <> '' and (r ->> 'nama') is null then bagian := bagian || (r ->> 'kode'); end if;
  if (r ->> 'semester') ~ '^[0-9]+$' then bagian := bagian || ('Smt ' || (r ->> 'semester')); end if;
  if (r ->> 'semester') in ('Gasal', 'Genap') then bagian := bagian || (r ->> 'semester'); end if;
  -- Arsip semester Buku Induk (tahun ajaran disimpan sebagai teks)
  if coalesce(r ->> 'ta_nama', '') <> '' then
    bagian := bagian || trim((r ->> 'ta_nama') || ' ' || coalesce(r ->> 'ta_semester', ''));
  end if;

  if r ->> 'siswa_id' is not null then
    select s.nama into v from public.siswa s where s.id = (r ->> 'siswa_id')::uuid;
    if v is not null then bagian := bagian || v; end if;
  end if;
  if r ->> 'mapel_id' is not null then
    select m.nama into v from public.mata_pelajaran m where m.id = (r ->> 'mapel_id')::uuid;
    if v is not null then bagian := bagian || v; end if;
  end if;
  if r ->> 'ekstrakurikuler_id' is not null then
    select e.nama into v from public.ekstrakurikuler e where e.id = (r ->> 'ekstrakurikuler_id')::uuid;
    if v is not null then bagian := bagian || v; end if;
  end if;
  if r ->> 'kelas_id' is not null then
    select k.nama into v from public.kelas k where k.id = (r ->> 'kelas_id')::uuid;
    if v is not null then bagian := bagian || v; end if;
  end if;
  if r ->> 'guru_id' is not null then
    select p.nama into v from public.profiles p where p.id = (r ->> 'guru_id')::uuid;
    if v is not null then bagian := bagian || ('Guru: ' || v); end if;
  end if;
  if r ->> 'tahun_ajaran_id' is not null then
    select t.nama || ' ' || t.semester into v from public.tahun_ajaran t where t.id = (r ->> 'tahun_ajaran_id')::uuid;
    if v is not null then bagian := bagian || v; end if;
  end if;

  return nullif(left(array_to_string(bagian, ' · '), 250), '');
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------
-- 4) Fungsi trigger (versi baru: mengisi kolom aplikasi + pembersih nilai)
-- ---------------------------------------------------------
create or replace function public.fn_log_perubahan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modul   text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
  v_app     text := public.fn_log_aplikasi_tabel(TG_TABLE_NAME);
  v_aksi    text;
  v_baru    jsonb;
  v_lama    jsonb;
  v_ref     jsonb;
  v_d       jsonb := '{}'::jsonb;
  v_item    jsonb;
  v_label   text;
  v_key     text;
  v_uid     uuid;
  v_nama    text;
  v_role    text;
  v_id      uuid;
  c_abaikan text[] := array['id', 'created_at', 'updated_at', 'auth_user_id', 'password', 'sandi', 'updated_by', 'dicatat_oleh'];
begin
  begin
    if TG_OP = 'INSERT' then
      v_aksi := 'tambah'; v_baru := to_jsonb(NEW); v_ref := v_baru;
    elsif TG_OP = 'UPDATE' then
      v_aksi := 'ubah'; v_baru := to_jsonb(NEW); v_lama := to_jsonb(OLD); v_ref := v_baru;
    else
      v_aksi := 'hapus'; v_lama := to_jsonb(OLD); v_ref := v_lama;
    end if;

    if TG_OP = 'UPDATE' then
      for v_key in select jsonb_object_keys(v_baru) loop
        continue when v_key = any (c_abaikan) or v_key ~* '(nik|no_kk|^kk|enc|hash|token|sandi|password)' or v_key ~ '_id$';
        if (v_baru -> v_key) is distinct from (v_lama -> v_key) then
          v_d := v_d || jsonb_build_object(v_key, jsonb_build_array(
            public.fn_log_nilai(v_lama -> v_key),
            public.fn_log_nilai(v_baru -> v_key)));
        end if;
      end loop;
      -- Simpan ulang tanpa perubahan nyata -> tidak perlu dicatat.
      if v_d = '{}'::jsonb then return NEW; end if;
    else
      for v_key in select jsonb_object_keys(v_ref) loop
        continue when v_key = any (c_abaikan) or v_key ~* '(nik|no_kk|^kk|enc|hash|token|sandi|password)' or v_key ~ '_id$';
        continue when (v_ref -> v_key) = 'null'::jsonb;
        v_d := v_d || jsonb_build_object(v_key, public.fn_log_nilai(v_ref -> v_key));
      end loop;
    end if;

    v_label := public.fn_log_label(v_ref);
    v_item  := jsonb_build_object('l', v_label, 'd', v_d);

    select p.p_id, p.p_nama, p.p_role into v_uid, v_nama, v_role from public.fn_log_pelaku() p;

    -- Gabungkan dengan log sebelumnya (pengguna, tabel, aksi sama; < 2 menit)
    update public.log_aktivitas la
       set jumlah      = la.jumlah + 1,
           waktu_akhir = clock_timestamp(),
           detail      = case when jsonb_array_length(la.detail) < 30 then la.detail || v_item else la.detail end
     where la.id = (
       select x.id from public.log_aktivitas x
        where x.user_id is not distinct from v_uid
          and x.tabel = TG_TABLE_NAME
          and x.aksi = v_aksi
          and x.waktu_akhir > clock_timestamp() - interval '2 minutes'
        order by x.waktu_akhir desc
        limit 1
     )
    returning la.id into v_id;

    if v_id is null then
      insert into public.log_aktivitas (user_id, user_nama, user_role, aksi, modul, tabel, aplikasi, jumlah, ringkasan, detail, ip, waktu, waktu_akhir)
      values (v_uid, v_nama, v_role, v_aksi, v_modul, TG_TABLE_NAME, v_app, 1, v_label, jsonb_build_array(v_item), public.fn_log_ip(), clock_timestamp(), clock_timestamp());
    end if;
  exception when others then
    -- Logging tidak boleh menggagalkan operasi utama.
    null;
  end;

  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;

-- ---------------------------------------------------------
-- 5) Pasang trigger ke tabel Buku Induk & Supervisi
--    (tabel yang belum ada dilewati)
-- ---------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('bi_siswa_detail',      'Biodata Tambahan Siswa'),
      ('bi_riwayat_semester',  'Arsip Nilai Semester'),
      ('bi_catatan',           'Catatan Siswa (Prestasi, dll)'),
      ('supervisi_jadwal',     'Jadwal Supervisi'),
      ('supervisi_form',       'Form Supervisi'),
      ('supervisi_guru',       'Data Guru Supervisi'),
      ('supervisi_mapel',      'Mapel Supervisi'),
      ('supervisi_penugasan',  'Penugasan Supervisi'),
      ('supervisi_ttd',        'Tanda Tangan Supervisi'),
      ('login_slideshow',      'Slideshow Login')
    ) as v(tabel, modul)
  loop
    if to_regclass('public.' || t.tabel) is not null then
      execute format('drop trigger if exists trg_log_aktivitas on public.%I', t.tabel);
      execute format(
        'create trigger trg_log_aktivitas after insert or update or delete on public.%I
           for each row execute function public.fn_log_perubahan(%L)',
        t.tabel, t.modul);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------
-- 6) catat_aktivitas() dengan parameter aplikasi (opsional)
--    Versi lama (4 parameter) dihapus dulu supaya panggilan tidak ambigu.
--    Aplikasi lama yang masih memanggil dengan 4 parameter tetap jalan.
-- ---------------------------------------------------------
drop function if exists public.catat_aktivitas(text, text, text, jsonb);

create or replace function public.catat_aktivitas(
  p_aksi      text,
  p_modul     text,
  p_ringkasan text default null,
  p_detail    jsonb default null,
  p_aplikasi  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_nama text;
  v_role text;
  v_aksi text;
  v_app  text;
begin
  if auth.uid() is null then return; end if;

  v_aksi := case when p_aksi in ('login', 'logout', 'cetak', 'unduh') then p_aksi else 'lainnya' end;

  -- Kalau aplikasi tidak dikirim: tebak dari nama modul.
  v_app := coalesce(
    nullif(left(trim(p_aplikasi), 40), ''),
    case when p_modul ilike '%pkl%' then 'PKL'
         when p_modul ilike '%buku induk%' then 'Buku Induk'
         when p_modul = 'Akun' then 'Akun'
         else 'E-Rapor' end
  );

  select p.p_id, p.p_nama, p.p_role into v_uid, v_nama, v_role from public.fn_log_pelaku() p;

  -- Cegah baris ganda dari klik/muat ulang beruntun (< 5 detik, isi sama)
  if exists (
    select 1 from public.log_aktivitas x
     where x.user_id = v_uid and x.aksi = v_aksi and x.modul = left(coalesce(p_modul, '-'), 80)
       and x.ringkasan is not distinct from left(p_ringkasan, 300)
       and x.waktu > now() - interval '5 seconds'
  ) then
    return;
  end if;

  insert into public.log_aktivitas (user_id, user_nama, user_role, aksi, modul, tabel, aplikasi, jumlah, ringkasan, detail, ip)
  values (
    v_uid, v_nama, v_role, v_aksi, left(coalesce(p_modul, '-'), 80), null, v_app, 1,
    left(p_ringkasan, 300),
    case when p_detail is not null and jsonb_typeof(p_detail) = 'array' then p_detail else '[]'::jsonb end,
    public.fn_log_ip()
  );
exception when others then
  null;
end;
$$;

revoke all on function public.catat_aktivitas(text, text, text, jsonb, text) from public;
grant execute on function public.catat_aktivitas(text, text, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------
-- 7) Backfill: beri label aplikasi pada log lama
-- ---------------------------------------------------------
update public.log_aktivitas
   set aplikasi = public.fn_log_aplikasi_tabel(tabel)
 where aplikasi is null and tabel is not null;

update public.log_aktivitas
   set aplikasi = case when modul ilike '%pkl%' then 'PKL'
                       when modul ilike '%buku induk%' then 'Buku Induk'
                       when modul = 'Akun' then 'Akun'
                       else 'E-Rapor' end
 where aplikasi is null;

-- =========================================================
-- CATATAN:
-- Perubahan pada tabel `siswa` (biodata) tetap dicatat sebagai
-- aplikasi "E-Rapor" karena tabelnya dipakai bersama E-Rapor dan
-- Buku Induk. Cetak & unduh dicatat oleh aplikasi sesuai halaman
-- yang dipakai (Buku Induk, E-Rapor, PKL, dst).
-- =========================================================
