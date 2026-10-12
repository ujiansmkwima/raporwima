-- =========================================================
-- MIGRASI: PENGAJUAN PEMBETULAN DATA OLEH SISWA
--
--   Jalankan di Supabase Dashboard -> SQL Editor (project RAPOR).
--   Aman dijalankan berkali-kali.
--   Prasyarat: migrasi_akun_siswa.sql dan migrasi_buku_induk.sql.
--
--   Alur:
--     1) Siswa membetulkan isian biodatanya lalu "Ajukan".
--        Perubahan TIDAK langsung tersimpan ke data siswa, hanya masuk
--        ke tabel pengajuan_data_siswa (status menunggu).
--     2) Wali kelas siswa itu (atau admin) melihat notifikasi, lalu
--        TERIMA  -> perubahan ditulis ke data siswa (siswa / bi_siswa_detail),
--                   baris pengajuan dihapus;
--        TOLAK   -> baris pengajuan DIHAPUS, tidak ada yang tersimpan.
--
--   TIDAK BOLEH diubah siswa (dipaksa di database, bukan hanya di layar):
--     NIS, NISN, NIK, No. KK  (+ status siswa dan seluruh isian
--     "Keluar Sekolah" / catatan khusus, yang memang urusan sekolah).
--
--   Siswa tidak punya akses tulis langsung ke tabel apa pun; semua lewat
--   3 fungsi di bawah ini.
-- =========================================================

-- ---------------------------------------------------------
-- 1) Tabel pengajuan (maksimal 1 pengajuan menunggu per siswa)
-- ---------------------------------------------------------
create table if not exists public.pengajuan_data_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null unique references public.siswa(id) on delete cascade,
  -- {"nama_kolom": {"lama": <nilai lama>, "baru": <nilai baru>}, ...}
  perubahan jsonb not null,
  diajukan_pada timestamptz not null default now()
);

alter table public.pengajuan_data_siswa enable row level security;

-- Hanya BACA. Tidak ada policy insert/update/delete -> semua tulis lewat fungsi.
drop policy if exists "Admin baca pengajuan data siswa" on public.pengajuan_data_siswa;
create policy "Admin baca pengajuan data siswa" on public.pengajuan_data_siswa
  for select using (public.bi_is_admin());

drop policy if exists "Wali baca pengajuan data siswa kelasnya" on public.pengajuan_data_siswa;
create policy "Wali baca pengajuan data siswa kelasnya" on public.pengajuan_data_siswa
  for select using (public.bi_is_wali_siswa(siswa_id));

drop policy if exists "Siswa baca pengajuannya sendiri" on public.pengajuan_data_siswa;
create policy "Siswa baca pengajuannya sendiri" on public.pengajuan_data_siswa
  for select using (siswa_id = public.siswa_id_saya());

-- ---------------------------------------------------------
-- 2) Daftar kolom yang BOLEH diajukan (selain ini ditolak).
--    Diturunkan dari bukuinduk-fields.js, dikurangi:
--    nis, nisn, nik, no_kk, status, dan tab "Keluar Sekolah".
-- ---------------------------------------------------------
create or replace function public.pengajuan_kolom_siswa()
returns text[] language sql immutable as $$
  select array[
    'nama','tempat_lahir','tanggal_lahir','jenis_kelamin','agama','status_keluarga','anak_ke',
    'alamat_siswa','no_telp_siswa','nama_ayah','pekerjaan_ayah','nama_ibu','pekerjaan_ibu',
    'alamat_ortu','no_telp_ortu','nama_wali','pekerjaan_wali','no_telp_wali','alamat_wali',
    'sekolah_asal','tanggal_masuk','kelas_masuk'
  ];
$$;

create or replace function public.pengajuan_kolom_detail()
returns text[] language sql immutable as $$
  select array[
    'kewarganegaraan','jumlah_saudara','bahasa_sehari','hobi','email_siswa',
    'kelurahan','kecamatan','kab_kota','provinsi','kode_pos','tinggal_dengan','jarak_sekolah',
    'transportasi','golongan_darah','tinggi_badan','berat_badan','riwayat_penyakit',
    'ayah_tahun_lahir','ayah_pendidikan','ayah_penghasilan',
    'ibu_tahun_lahir','ibu_pendidikan','ibu_penghasilan',
    'wali_hubungan','wali_pendidikan','wali_penghasilan',
    'tahun_lulus_smp','no_ijazah_smp','diterima_sebagai','no_pendaftaran',
    'program_keahlian_masuk','pindahan_dari','pindahan_alasan'
  ];
$$;

-- ---------------------------------------------------------
-- 3) SISWA: ajukan pembetulan.  p_baru = {"kolom": nilaiBaru, ...}
--    (hanya kolom yang diubah; nilai kosong = null)
-- ---------------------------------------------------------
create or replace function public.ajukan_pembetulan_data(p_baru jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sid uuid := public.siswa_id_saya();
  v_cur_siswa jsonb;
  v_cur_detail jsonb;
  v_k text;
  v_v jsonb;
  v_lama jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_part_siswa jsonb := '{}'::jsonb;
  v_part_detail jsonb := '{}'::jsonb;
begin
  if v_sid is null then raise exception 'Hanya akun siswa yang dapat mengajukan pembetulan data'; end if;
  if p_baru is null or jsonb_typeof(p_baru) <> 'object' then raise exception 'Format data tidak valid'; end if;

  select to_jsonb(s) into v_cur_siswa from public.siswa s where s.id = v_sid;
  select coalesce((select to_jsonb(d) from public.bi_siswa_detail d where d.siswa_id = v_sid), '{}'::jsonb) into v_cur_detail;

  for v_k, v_v in select key, value from jsonb_each(p_baru) loop
    if not (v_k = any (public.pengajuan_kolom_siswa()) or v_k = any (public.pengajuan_kolom_detail())) then
      raise exception 'Isian "%" tidak boleh diubah oleh siswa', v_k;
    end if;

    -- rapikan: teks dipangkas, kosong -> null, batasi panjang
    if jsonb_typeof(v_v) = 'string' then
      if length(btrim(v_v #>> '{}')) = 0 then v_v := 'null'::jsonb;
      else
        if length(v_v #>> '{}') > 1000 then raise exception 'Isian "%" terlalu panjang', v_k; end if;
        v_v := to_jsonb(btrim(v_v #>> '{}'));
      end if;
    end if;

    if v_k = 'nama' and v_v = 'null'::jsonb then raise exception 'Nama tidak boleh kosong'; end if;
    if v_k = 'jenis_kelamin' and v_v is distinct from 'null'::jsonb and (v_v #>> '{}') not in ('L', 'P') then
      raise exception 'Jenis kelamin harus L atau P';
    end if;

    if v_k = any (public.pengajuan_kolom_siswa()) then
      v_lama := coalesce(v_cur_siswa -> v_k, 'null'::jsonb);
      if v_lama is distinct from v_v then v_part_siswa := v_part_siswa || jsonb_build_object(v_k, v_v); end if;
    else
      v_lama := coalesce(v_cur_detail -> v_k, 'null'::jsonb);
      if v_lama is distinct from v_v then v_part_detail := v_part_detail || jsonb_build_object(v_k, v_v); end if;
    end if;

    if v_lama is distinct from v_v then
      v_diff := v_diff || jsonb_build_object(v_k, jsonb_build_object('lama', v_lama, 'baru', v_v));
    end if;
  end loop;

  if v_diff = '{}'::jsonb then raise exception 'Tidak ada data yang berubah'; end if;

  -- uji tipe (tanggal, angka, dst) SEKARANG supaya salah isi langsung ketahuan
  begin
    perform jsonb_populate_record(null::public.siswa, v_part_siswa);
    perform jsonb_populate_record(null::public.bi_siswa_detail, v_part_detail);
  exception when others then
    raise exception 'Ada isian yang formatnya tidak valid (tanggal / angka): %', sqlerrm;
  end;

  insert into public.pengajuan_data_siswa (siswa_id, perubahan, diajukan_pada)
  values (v_sid, v_diff, now())
  on conflict (siswa_id) do update set perubahan = excluded.perubahan, diajukan_pada = now();

  return 'OK';
end $$;

-- ---------------------------------------------------------
-- 4) SISWA: batalkan pengajuannya sendiri
-- ---------------------------------------------------------
create or replace function public.batalkan_pengajuan_data()
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.siswa_id_saya() is null then raise exception 'Hanya akun siswa'; end if;
  delete from public.pengajuan_data_siswa where siswa_id = public.siswa_id_saya();
  return 'OK';
end $$;

-- ---------------------------------------------------------
-- 5) WALI KELAS / ADMIN: terima atau tolak
--    terima -> tulis ke data siswa lalu hapus pengajuan
--    tolak  -> hapus pengajuan (tidak ada yang disimpan)
-- ---------------------------------------------------------
create or replace function public.proses_pengajuan_data(p_id uuid, p_setuju boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p public.pengajuan_data_siswa%rowtype;
  v_k text;
  v_x jsonb;
  v_baru jsonb;
  v_ada_detail boolean := false;
begin
  select * into v_p from public.pengajuan_data_siswa where id = p_id;
  if not found then return 'SUDAH_TIDAK_ADA'; end if;

  if auth.uid() is null or not (public.bi_is_admin() or public.bi_is_wali_siswa(v_p.siswa_id)) then
    raise exception 'tidak berizin';
  end if;

  if not coalesce(p_setuju, false) then
    delete from public.pengajuan_data_siswa where id = p_id;
    return 'DITOLAK';
  end if;

  for v_k, v_x in select key, value from jsonb_each(v_p.perubahan) loop
    v_baru := v_x -> 'baru';
    if v_k = any (public.pengajuan_kolom_siswa()) then
      execute format(
        'update public.siswa s set %1$I = r.%1$I from (select * from jsonb_populate_record(null::public.siswa, $1)) r where s.id = $2', v_k)
        using jsonb_build_object(v_k, v_baru), v_p.siswa_id;
    elsif v_k = any (public.pengajuan_kolom_detail()) then
      if not v_ada_detail then
        insert into public.bi_siswa_detail (siswa_id) values (v_p.siswa_id) on conflict (siswa_id) do nothing;
        v_ada_detail := true;
      end if;
      execute format(
        'update public.bi_siswa_detail d set %1$I = r.%1$I from (select * from jsonb_populate_record(null::public.bi_siswa_detail, $1)) r where d.siswa_id = $2', v_k)
        using jsonb_build_object(v_k, v_baru), v_p.siswa_id;
    end if;
    -- kolom lain (mis. NIS/NISN/NIK/KK) diabaikan: tidak pernah boleh lewat jalur ini
  end loop;

  if v_ada_detail then
    update public.bi_siswa_detail set updated_by = auth.uid(), updated_at = now() where siswa_id = v_p.siswa_id;
  end if;

  delete from public.pengajuan_data_siswa where id = p_id;
  return 'DISETUJUI';
end $$;

revoke all on function public.ajukan_pembetulan_data(jsonb) from public, anon;
revoke all on function public.batalkan_pengajuan_data() from public, anon;
revoke all on function public.proses_pengajuan_data(uuid, boolean) from public, anon;
grant execute on function public.ajukan_pembetulan_data(jsonb) to authenticated;
grant execute on function public.batalkan_pengajuan_data() to authenticated;
grant execute on function public.proses_pengajuan_data(uuid, boolean) to authenticated;

-- =========================================================
-- PEMERIKSAAN (manual)
--   select p.diajukan_pada, s.nama, p.perubahan
--     from public.pengajuan_data_siswa p join public.siswa s on s.id = p.siswa_id;
-- =========================================================
