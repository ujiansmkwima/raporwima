-- =========================================================
-- MIGRASI: TERBITKAN RAPOR KE SISWA
--
--   Jalankan di Supabase Dashboard -> SQL Editor (project RAPOR).
--   Aman dijalankan berkali-kali.
--   Jalankan SETELAH migrasi_akun_siswa.sql.
--
--   Sebelumnya siswa bisa langsung melihat rapor begitu nilai ada.
--   Sekarang rapor sebuah periode (tahun ajaran + semester) HANYA
--   terlihat oleh siswa setelah admin menerbitkannya, dan baru sejak
--   tanggal & jam terbit yang diatur. Pembatasan dilakukan di DATABASE
--   (RLS), jadi siswa tidak bisa menembusnya lewat API.
--
--   Yang dikerjakan:
--     1) Tabel rapor_terbit (1 baris per tahun ajaran/semester).
--     2) Fungsi rapor_sudah_terbit(tahun_ajaran).
--     3) Policy siswa untuk nilai, nilai_kokurikuler,
--        nilai_ekstrakurikuler diganti: hanya jika sudah terbit.
--     4) nama_wali_kelas_siswa() ikut dikunci (bagian dari rapor).
--
--   Setelah migrasi ini, SEMUA periode berstatus BELUM TERBIT
--   (siswa tidak bisa melihat rapor sampai admin menerbitkan).
-- =========================================================

-- ---------------------------------------------------------
-- 1) Tabel status terbit
-- ---------------------------------------------------------
create table if not exists public.rapor_terbit (
  tahun_ajaran_id uuid primary key references public.tahun_ajaran(id) on delete cascade,
  terbit_pada     timestamptz not null,
  diterbitkan_oleh uuid references public.profiles(id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table public.rapor_terbit enable row level security;

-- Semua user login boleh membaca (siswa perlu tahu rapor sudah terbit / kapan terbit).
-- Isinya hanya jadwal terbit, bukan data pribadi.
drop policy if exists "Semua user login boleh baca rapor_terbit" on public.rapor_terbit;
create policy "Semua user login boleh baca rapor_terbit" on public.rapor_terbit
  for select using (auth.uid() is not null);

-- Hanya admin yang boleh menerbitkan / mengubah jadwal / menarik kembali.
drop policy if exists "Admin kelola rapor_terbit" on public.rapor_terbit;
create policy "Admin kelola rapor_terbit" on public.rapor_terbit for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ---------------------------------------------------------
-- 2) Fungsi: apakah rapor periode ini sudah terbit (waktu terbit <= sekarang)?
-- ---------------------------------------------------------
create or replace function public.rapor_sudah_terbit(p_tahun_ajaran uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.rapor_terbit rt
    where rt.tahun_ajaran_id = p_tahun_ajaran
      and rt.terbit_pada <= now()
  );
$$;
revoke all on function public.rapor_sudah_terbit(uuid) from public, anon;
grant execute on function public.rapor_sudah_terbit(uuid) to authenticated;

-- ---------------------------------------------------------
-- 3) Policy siswa: data rapor hanya terbaca jika sudah diterbitkan
-- ---------------------------------------------------------
drop policy if exists "Siswa baca nilai rapornya" on public.nilai;
create policy "Siswa baca nilai rapornya" on public.nilai
  for select using (
    siswa_id = public.siswa_id_saya()
    and jenis = 'rapor'
    and public.rapor_sudah_terbit(tahun_ajaran_id)
  );

do $$
declare
  t text;
begin
  foreach t in array array['nilai_kokurikuler', 'nilai_ekstrakurikuler']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', 'Siswa baca ' || t || ' miliknya', t);
      execute format(
        'create policy %I on public.%I for select using (siswa_id = public.siswa_id_saya() and public.rapor_sudah_terbit(tahun_ajaran_id))',
        'Siswa baca ' || t || ' miliknya', t
      );
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------
-- 4) Nama wali kelas di rapor: hanya untuk periode yang sudah terbit
-- ---------------------------------------------------------
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
    and public.rapor_sudah_terbit(p_tahun_ajaran)
  limit 1;
$$;
revoke all on function public.nama_wali_kelas_siswa(uuid) from public, anon;
grant execute on function public.nama_wali_kelas_siswa(uuid) to authenticated;

-- =========================================================
-- PEMERIKSAAN (manual)
--   select ta.nama, ta.semester, rt.terbit_pada
--     from public.tahun_ajaran ta
--     left join public.rapor_terbit rt on rt.tahun_ajaran_id = ta.id
--    order by ta.nama, ta.semester;
-- =========================================================
