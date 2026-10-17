-- =========================================================
-- MIGRASI: LOG AKTIVITAS
--
--   Jalankan di Supabase Dashboard -> SQL Editor (project RAPOR).
--   Aman dijalankan berkali-kali.
--
--   Mencatat "siapa melakukan apa dan kapan":
--     1) Perubahan data (tambah / ubah / hapus) dicatat OTOMATIS oleh
--        trigger database, jadi tidak ada yang terlewat walaupun
--        perubahan dilakukan dari halaman mana pun.
--     2) Login, logout, cetak, dan unduh dicatat oleh aplikasi lewat
--        fungsi catat_aktivitas().
--
--   Supaya log tidak membanjir, perubahan beruntun oleh pengguna yang
--   sama pada tabel & aksi yang sama dalam 2 menit DIGABUNG menjadi
--   satu baris (kolom jumlah bertambah). Contoh: guru menyimpan nilai
--   35 siswa sekaligus = 1 baris "Mengubah 35 data Nilai Rapor".
--
--   Log hanya bisa DIBACA admin. Tidak ada yang bisa mengubah/menghapus
--   baris log lewat API, kecuali admin memakai fungsi pembersihan
--   log lama (hapus_log_aktivitas_lama).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Tabel log
-- ---------------------------------------------------------
create table if not exists public.log_aktivitas (
  id          uuid primary key default gen_random_uuid(),
  waktu       timestamptz not null default now(),   -- kejadian pertama
  waktu_akhir timestamptz not null default now(),   -- kejadian terakhir (untuk penggabungan)
  user_id     uuid,                                 -- auth.users.id (null = sistem / SQL Editor)
  user_nama   text,
  user_role   text,                                 -- admin / guru / siswa / sistem
  aksi        text not null check (aksi in ('tambah', 'ubah', 'hapus', 'login', 'logout', 'cetak', 'unduh', 'lainnya')),
  modul       text not null,                        -- label tampilan, mis. 'Nilai Rapor'
  tabel       text,                                 -- nama tabel (untuk aksi data)
  jumlah      integer not null default 1,           -- jumlah baris yang tergabung
  ringkasan   text,                                 -- contoh/keterangan singkat
  detail      jsonb not null default '[]'::jsonb,   -- maksimal 30 item: [{l: label, d: {kolom: nilai | [lama, baru]}}]
  ip          text
);

create index if not exists ix_log_aktivitas_waktu on public.log_aktivitas (waktu desc);
create index if not exists ix_log_aktivitas_user  on public.log_aktivitas (user_id, waktu desc);
create index if not exists ix_log_aktivitas_modul on public.log_aktivitas (modul, waktu desc);
create index if not exists ix_log_aktivitas_gabung on public.log_aktivitas (user_id, tabel, aksi, waktu_akhir desc);

alter table public.log_aktivitas enable row level security;

-- Hanya admin yang boleh MEMBACA. Sengaja TIDAK ada policy insert/update/delete:
-- penulisan hanya lewat trigger dan fungsi security definer di bawah.
drop policy if exists "Admin baca log_aktivitas" on public.log_aktivitas;
create policy "Admin baca log_aktivitas" on public.log_aktivitas for select
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

revoke insert, update, delete on public.log_aktivitas from anon, authenticated;

-- ---------------------------------------------------------
-- 2) Identitas pelaku (dipakai trigger & fungsi catat)
-- ---------------------------------------------------------
create or replace function public.fn_log_pelaku(out p_id uuid, out p_nama text, out p_role text)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  p_id := auth.uid();
  if p_id is null then
    p_nama := 'Sistem / SQL Editor';
    p_role := 'sistem';
    return;
  end if;

  select pr.nama, pr.role into p_nama, p_role from public.profiles pr where pr.id = p_id;
  if p_role is null then
    -- Akun siswa tidak punya baris di profiles; dikenali lewat siswa.auth_user_id.
    select s.nama into p_nama from public.siswa s where s.auth_user_id = p_id limit 1;
    if p_nama is not null then
      p_role := 'siswa';
    else
      p_role := 'sistem';
    end if;
  end if;
end;
$$;

create or replace function public.fn_log_ip()
returns text
language plpgsql
stable
as $$
declare
  h text;
begin
  h := current_setting('request.headers', true);
  if h is null or h = '' then return null; end if;
  return nullif(split_part(coalesce((h::json) ->> 'x-forwarded-for', ''), ',', 1), '');
exception when others then
  return null;
end;
$$;

-- ---------------------------------------------------------
-- 3) Label baris yang mudah dibaca ("Budi · Matematika · XI ANM 1")
--    Dibangun dari kolom penunjuk yang ada di baris tersebut.
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
  -- Nama milik baris itu sendiri (siswa, kelas, mapel, ekskul, tahun ajaran, profil guru)
  if coalesce(r ->> 'nama', '') <> '' then bagian := bagian || (r ->> 'nama'); end if;
  if coalesce(r ->> 'nama_sekolah', '') <> '' then bagian := bagian || (r ->> 'nama_sekolah'); end if;
  if coalesce(r ->> 'nama_kegiatan', '') <> '' then bagian := bagian || (r ->> 'nama_kegiatan'); end if;
  if coalesce(r ->> 'kode', '') <> '' and (r ->> 'nama') is null then bagian := bagian || (r ->> 'kode'); end if;
  if (r ->> 'semester') ~ '^[0-9]+$' then bagian := bagian || ('Smt ' || (r ->> 'semester')); end if;
  if (r ->> 'semester') in ('Gasal', 'Genap') then bagian := bagian || (r ->> 'semester'); end if;

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
-- 4) Fungsi trigger: catat tambah / ubah / hapus
--    Argumen trigger [0] = label modul yang ditampilkan.
--    Kegagalan mencatat log TIDAK PERNAH membatalkan simpan data.
-- ---------------------------------------------------------
create or replace function public.fn_log_perubahan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_modul   text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
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
  c_abaikan text[] := array['id', 'created_at', 'updated_at', 'auth_user_id', 'password', 'sandi'];
begin
  begin
    if TG_OP = 'INSERT' then
      v_aksi := 'tambah'; v_baru := to_jsonb(NEW); v_ref := v_baru;
    elsif TG_OP = 'UPDATE' then
      v_aksi := 'ubah'; v_baru := to_jsonb(NEW); v_lama := to_jsonb(OLD); v_ref := v_baru;
    else
      v_aksi := 'hapus'; v_lama := to_jsonb(OLD); v_ref := v_lama;
    end if;

    -- Susun rincian kolom (tanpa kolom id/teknis/sensitif; teks panjang dipotong)
    if TG_OP = 'UPDATE' then
      for v_key in select jsonb_object_keys(v_baru) loop
        continue when v_key = any (c_abaikan) or v_key ~* '(nik|no_kk|^kk|enc|hash|token|sandi|password)' or v_key ~ '_id$';
        if (v_baru -> v_key) is distinct from (v_lama -> v_key) then
          v_d := v_d || jsonb_build_object(v_key, jsonb_build_array(
            case when jsonb_typeof(v_lama -> v_key) = 'string' then to_jsonb(left(v_lama ->> v_key, 160)) else v_lama -> v_key end,
            case when jsonb_typeof(v_baru -> v_key) = 'string' then to_jsonb(left(v_baru ->> v_key, 160)) else v_baru -> v_key end));
        end if;
      end loop;
      -- Simpan ulang tanpa perubahan nyata (upsert dengan nilai sama) -> tidak perlu dicatat.
      if v_d = '{}'::jsonb then return NEW; end if;
    else
      for v_key in select jsonb_object_keys(v_ref) loop
        continue when v_key = any (c_abaikan) or v_key ~* '(nik|no_kk|^kk|enc|hash|token|sandi|password)' or v_key ~ '_id$';
        continue when (v_ref -> v_key) = 'null'::jsonb;
        v_d := v_d || jsonb_build_object(v_key,
          case when jsonb_typeof(v_ref -> v_key) = 'string' then to_jsonb(left(v_ref ->> v_key, 160)) else v_ref -> v_key end);
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
      insert into public.log_aktivitas (user_id, user_nama, user_role, aksi, modul, tabel, jumlah, ringkasan, detail, ip, waktu, waktu_akhir)
      values (v_uid, v_nama, v_role, v_aksi, v_modul, TG_TABLE_NAME, 1, v_label, jsonb_build_array(v_item), public.fn_log_ip(), clock_timestamp(), clock_timestamp());
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
-- 5) Pasang trigger ke tabel-tabel penting.
--    Tabel yang belum ada (migrasi belum dijalankan) dilewati.
-- ---------------------------------------------------------
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('nilai',                     'Nilai Rapor'),
      ('nilai_tp',                  'Nilai Tujuan Pembelajaran'),
      ('nilai_tengah_semester',     'Nilai Tengah Semester'),
      ('nilai_kokurikuler',         'Nilai Kokurikuler'),
      ('nilai_ekstrakurikuler',     'Nilai Ekstrakurikuler'),
      ('nilai_pkl',                 'Nilai PKL'),
      ('rekap_presensi',            'Presensi & Catatan Wali'),
      ('tujuan_pembelajaran',       'Tujuan Pembelajaran'),
      ('tujuan_pembelajaran_siswa', 'Tujuan Pembelajaran Siswa'),
      ('siswa',                     'Data Siswa'),
      ('siswa_kelas',               'Penempatan Kelas Siswa'),
      ('kelas',                     'Data Kelas'),
      ('mata_pelajaran',            'Mata Pelajaran'),
      ('mapel_kelas',               'Mapel per Kelas'),
      ('mapel_semester',            'Mapel per Semester'),
      ('mapel_urutan_kelas',        'Urutan Mapel'),
      ('penugasan_guru',            'Penugasan Mengajar'),
      ('wali_kelas',                'Wali Kelas'),
      ('pj_kokurikuler',            'PJ Kokurikuler'),
      ('kegiatan_kokurikuler',      'Kegiatan Kokurikuler'),
      ('ekstrakurikuler',           'Data Ekstrakurikuler'),
      ('ekstrakurikuler_siswa',     'Anggota Ekstrakurikuler'),
      ('pembina_ekstrakurikuler',   'Pembina Ekstrakurikuler'),
      ('pkl_pembimbing',            'Pembimbing PKL'),
      ('pkl_penguji',               'Penguji PKL'),
      ('tahun_ajaran',              'Tahun Ajaran'),
      ('profil_sekolah',            'Profil Sekolah'),
      ('rapor_terbit',              'Terbit Rapor'),
      ('pengaturan_penilaian',      'Pengaturan Penilaian'),
      ('pengajuan_data_siswa',      'Pengajuan Data Siswa'),
      ('profiles',                  'Akun Guru/Admin')
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
-- 6) Fungsi untuk dipanggil aplikasi: login, logout, cetak, unduh
-- ---------------------------------------------------------
create or replace function public.catat_aktivitas(
  p_aksi      text,
  p_modul     text,
  p_ringkasan text default null,
  p_detail    jsonb default null
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
begin
  if auth.uid() is null then return; end if;

  v_aksi := case when p_aksi in ('login', 'logout', 'cetak', 'unduh') then p_aksi else 'lainnya' end;

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

  insert into public.log_aktivitas (user_id, user_nama, user_role, aksi, modul, tabel, jumlah, ringkasan, detail, ip)
  values (
    v_uid, v_nama, v_role, v_aksi, left(coalesce(p_modul, '-'), 80), null, 1,
    left(p_ringkasan, 300),
    case when p_detail is not null and jsonb_typeof(p_detail) = 'array' then p_detail else '[]'::jsonb end,
    public.fn_log_ip()
  );
exception when others then
  null;
end;
$$;

revoke all on function public.catat_aktivitas(text, text, text, jsonb) from public;
grant execute on function public.catat_aktivitas(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------
-- 7) Pembersihan log lama (khusus admin)
--    Contoh: select public.hapus_log_aktivitas_lama(180);  -- hapus log > 180 hari
-- ---------------------------------------------------------
create or replace function public.hapus_log_aktivitas_lama(p_hari integer)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Hanya admin yang boleh menghapus log aktivitas.';
  end if;
  if p_hari is null or p_hari < 7 then
    raise exception 'Batas minimal 7 hari.';
  end if;

  delete from public.log_aktivitas where waktu < now() - make_interval(days => p_hari);
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.hapus_log_aktivitas_lama(integer) from public;
grant execute on function public.hapus_log_aktivitas_lama(integer) to authenticated;
