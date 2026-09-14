-- =========================================================
-- SKEMA INTI E-RAPOR SMK
-- Jalankan SETELAH profiles.sql, di Supabase Dashboard → SQL Editor
--
-- Prinsip utama: SEMUA data yang berubah tiap tahun (penempatan
-- kelas siswa, penugasan guru, wali kelas, nilai, presensi) diberi
-- kolom tahun_ajaran_id. Data induk (siswa, guru, kelas, mapel)
-- TIDAK punya tahun_ajaran_id karena identitasnya permanen.
-- =========================================================


-- =========================================================
-- 1. TAHUN AJARAN
--    Cuma boleh ada SATU baris dengan is_aktif = true.
--    Ini "saklar" yang menentukan data mana yang termuat saat
--    guru/admin login.
-- =========================================================
create table if not exists public.tahun_ajaran (
  id uuid primary key default gen_random_uuid(),
  nama text not null,                 -- contoh: '2025/2026'
  semester text not null check (semester in ('Ganjil', 'Genap')),
  is_aktif boolean not null default false,
  created_at timestamptz default now(),
  unique (nama, semester)
);

alter table public.tahun_ajaran enable row level security;

-- Semua user yang sudah login boleh membaca daftar tahun ajaran
-- (guru perlu tahu tahun ajaran aktif saat ini).
create policy "Semua user login boleh baca tahun_ajaran"
on public.tahun_ajaran for select
using (auth.uid() is not null);

-- Hanya admin yang boleh menambah/mengubah/mengaktifkan tahun ajaran.
create policy "Admin kelola tahun_ajaran"
on public.tahun_ajaran for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Trigger: begitu satu baris di-set is_aktif = true, baris lain
-- otomatis dipaksa jadi false. Jadi TIDAK PERNAH ada 2 tahun ajaran
-- aktif bersamaan.
create or replace function public.fn_satu_tahun_ajaran_aktif()
returns trigger as $$
begin
  update public.tahun_ajaran
  set is_aktif = false
  where id <> new.id and is_aktif = true;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_satu_tahun_ajaran_aktif on public.tahun_ajaran;
create trigger trg_satu_tahun_ajaran_aktif
after insert or update of is_aktif on public.tahun_ajaran
for each row
when (new.is_aktif = true)
execute function public.fn_satu_tahun_ajaran_aktif();


-- =========================================================
-- 2. DATA INDUK: mata_pelajaran, kelas, siswa
--    Tidak terikat tahun ajaran — identitasnya permanen.
-- =========================================================
create table if not exists public.mata_pelajaran (
  id uuid primary key default gen_random_uuid(),
  kode text unique,
  nama text not null,
  kkm integer not null default 75      -- kriteria ketuntasan minimal
);

create table if not exists public.kelas (
  id uuid primary key default gen_random_uuid(),
  nama text not null,                  -- contoh: 'X TKJ 1'
  tingkat integer not null,             -- 10, 11, 12
  jurusan text
);

create table if not exists public.siswa (
  id uuid primary key default gen_random_uuid(),
  nis text unique,
  nisn text unique,
  nama text not null,
  jenis_kelamin text check (jenis_kelamin in ('L', 'P')),
  tanggal_lahir date,
  status text not null default 'aktif' check (status in ('aktif', 'lulus', 'pindah', 'keluar'))
);

alter table public.mata_pelajaran enable row level security;
alter table public.kelas enable row level security;
alter table public.siswa enable row level security;

create policy "Semua user login boleh baca mata_pelajaran" on public.mata_pelajaran for select using (auth.uid() is not null);
create policy "Admin kelola mata_pelajaran" on public.mata_pelajaran for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Semua user login boleh baca kelas" on public.kelas for select using (auth.uid() is not null);
create policy "Admin kelola kelas" on public.kelas for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Semua user login boleh baca siswa" on public.siswa for select using (auth.uid() is not null);
create policy "Admin kelola siswa" on public.siswa for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Catatan: policy select "semua user login" di atas sengaja dibuat luas
-- dulu supaya guru bisa baca nama mapel/kelas/siswa. Kalau nanti perlu
-- lebih ketat (guru tidak boleh lihat siswa kelas lain), bisa dipersempit
-- belakangan berdasarkan siswa_kelas + penugasan_guru.


-- =========================================================
-- 3. SISWA_KELAS — penempatan siswa di kelas PER TAHUN AJARAN
--    Ini kunci "naik kelas": tahun ajaran baru = baris baru,
--    baris tahun lama tidak diubah/dihapus (riwayat tetap ada).
-- =========================================================
create table if not exists public.siswa_kelas (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  no_absen integer,
  unique (siswa_id, tahun_ajaran_id)   -- satu siswa hanya 1 kelas per tahun ajaran
);

alter table public.siswa_kelas enable row level security;

create policy "Semua user login boleh baca siswa_kelas" on public.siswa_kelas for select using (auth.uid() is not null);
create policy "Admin kelola siswa_kelas" on public.siswa_kelas for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- =========================================================
-- 4. PENUGASAN_GURU — guru mengajar mapel apa, di kelas mana,
--    tahun ajaran berapa. Ini yang menentukan menu & data apa
--    yang muncul saat seorang guru login.
-- =========================================================
create table if not exists public.penugasan_guru (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  unique (guru_id, mapel_id, kelas_id, tahun_ajaran_id)
);

alter table public.penugasan_guru enable row level security;

create policy "Guru baca penugasan miliknya sendiri" on public.penugasan_guru for select
using (guru_id = auth.uid());

create policy "Admin kelola penugasan_guru" on public.penugasan_guru for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- =========================================================
-- 5. WALI_KELAS — guru yang menjadi wali kelas sebuah kelas,
--    pada tahun ajaran tertentu.
--
--    PENTING: wali kelas BUKAN role baru. Role tetap 'guru' di
--    tabel profiles. Ini cuma tabel "penugasan tambahan" yang
--    menempel di atas guru mapel biasa — jadi satu akun guru bisa
--    sekaligus: mengajar mapel (lewat penugasan_guru) DAN menjadi
--    wali kelas (lewat tabel ini).
-- =========================================================
create table if not exists public.wali_kelas (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  unique (kelas_id, tahun_ajaran_id),   -- 1 kelas hanya 1 wali kelas per tahun
  unique (guru_id, tahun_ajaran_id)     -- 1 guru hanya wali 1 kelas per tahun
);

alter table public.wali_kelas enable row level security;

create policy "Guru baca status wali kelas miliknya" on public.wali_kelas for select
using (guru_id = auth.uid());

create policy "Admin kelola wali_kelas" on public.wali_kelas for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- =========================================================
-- 6. NILAI — nilai siswa per mapel, per tahun ajaran.
--    jenis: pengetahuan / keterampilan / sikap (standar rapor SMK).
-- =========================================================
create table if not exists public.nilai (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  jenis text not null check (jenis in ('pengetahuan', 'keterampilan', 'sikap')),
  nilai numeric(5,2),
  guru_id uuid references public.profiles(id),   -- guru yang input
  updated_at timestamptz default now(),
  unique (siswa_id, mapel_id, tahun_ajaran_id, jenis)
);

alter table public.nilai enable row level security;

-- Guru mapel: boleh baca & tulis nilai HANYA untuk kombinasi
-- mapel+kelas yang benar-benar diajarnya di tahun ajaran tersebut.
create policy "Guru mapel akses nilai sesuai penugasannya" on public.nilai for all
using (
  exists (
    select 1 from public.penugasan_guru pg
    join public.siswa_kelas sk on sk.kelas_id = pg.kelas_id and sk.tahun_ajaran_id = pg.tahun_ajaran_id
    where pg.guru_id = auth.uid()
      and pg.mapel_id = nilai.mapel_id
      and pg.tahun_ajaran_id = nilai.tahun_ajaran_id
      and sk.siswa_id = nilai.siswa_id
  )
)
with check (
  exists (
    select 1 from public.penugasan_guru pg
    join public.siswa_kelas sk on sk.kelas_id = pg.kelas_id and sk.tahun_ajaran_id = pg.tahun_ajaran_id
    where pg.guru_id = auth.uid()
      and pg.mapel_id = nilai.mapel_id
      and pg.tahun_ajaran_id = nilai.tahun_ajaran_id
      and sk.siswa_id = nilai.siswa_id
  )
);

-- Wali kelas: boleh BACA (tidak menulis) semua nilai siswa di
-- kelas yang diampunya — untuk kebutuhan rekap rapor.
create policy "Wali kelas baca semua nilai kelasnya" on public.nilai for select
using (
  exists (
    select 1 from public.wali_kelas wk
    join public.siswa_kelas sk on sk.kelas_id = wk.kelas_id and sk.tahun_ajaran_id = wk.tahun_ajaran_id
    where wk.guru_id = auth.uid()
      and sk.siswa_id = nilai.siswa_id
      and wk.tahun_ajaran_id = nilai.tahun_ajaran_id
  )
);

create policy "Admin kelola nilai" on public.nilai for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- =========================================================
-- 7. PRESENSI — kehadiran siswa harian per kelas, per tahun ajaran.
--    Yang mencatat biasanya wali kelas (bisa diperluas ke guru mapel
--    per jam pelajaran nanti kalau dibutuhkan).
-- =========================================================
create table if not exists public.presensi (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  tanggal date not null,
  status text not null check (status in ('hadir', 'sakit', 'izin', 'alpha')),
  dicatat_oleh uuid references public.profiles(id),
  unique (siswa_id, tanggal)
);

alter table public.presensi enable row level security;

-- Wali kelas: kelola presensi penuh untuk kelas yang diampunya.
create policy "Wali kelas kelola presensi kelasnya" on public.presensi for all
using (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = presensi.kelas_id
      and wk.tahun_ajaran_id = presensi.tahun_ajaran_id
  )
)
with check (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = presensi.kelas_id
      and wk.tahun_ajaran_id = presensi.tahun_ajaran_id
  )
);

create policy "Admin kelola presensi" on public.presensi for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));


-- =========================================================
-- CARA PAKAI SETELAH INI:
-- 1. Admin bikin 1 baris tahun_ajaran, set is_aktif = true.
-- 2. Admin isi data induk: mata_pelajaran, kelas, siswa.
-- 3. Admin isi siswa_kelas (siswa masuk ke kelas apa, tahun ajaran mana).
-- 4. Admin isi penugasan_guru (guru mengajar mapel apa, di kelas mana).
-- 5. Admin isi wali_kelas (kalau guru itu juga wali kelas).
-- 6. Saat guru login, aplikasi tinggal:
--      a. ambil id tahun_ajaran WHERE is_aktif = true
--      b. select * from penugasan_guru where guru_id = <user> and tahun_ajaran_id = <id aktif>
--      c. select * from wali_kelas where guru_id = <user> and tahun_ajaran_id = <id aktif>
--    Kalau (c) ada isinya → tampilkan menu tambahan "Wali Kelas".
-- =========================================================
