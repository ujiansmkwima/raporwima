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
  semester text not null check (semester in ('Gasal', 'Genap')),
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
  kkm integer not null default 75,      -- kriteria ketuntasan minimal
  urutan_rapor integer,                 -- urutan tampil mapel ini di rapor
  urutan_leger integer,                 -- urutan baris mapel di Leger 6 Semester (seragam semua kelas); lihat migrasi_urutan_leger.sql
  berlaku_untuk text not null default 'semua' check (berlaku_untuk in ('semua', 'tertentu')),
  -- Semester berlakunya mapel ini: 'semua' = Semester 1 s.d. 6,
  -- 'tertentu' = hanya semester yang dicentang (lihat mapel_semester).
  -- Penomoran 1-6 sama dengan Leger Nilai 6 Semester: 1-2 kelas X,
  -- 3-4 kelas XI, 5-6 kelas XII.
  berlaku_semester text not null default 'semua' check (berlaku_semester in ('semua', 'tertentu')),
  jenis_mapel text not null default 'umum' check (jenis_mapel in ('umum', 'kejuruan')),  -- A. Mata Pelajaran Umum / B. Mata Pelajaran Kejuruan
  -- Diisi HANYA untuk mapel Pendidikan Agama (mis. "Pendidikan Agama
  -- Islam dan Budi Pekerti"): menandai mapel ini khusus untuk siswa
  -- agama apa. NULL berarti bukan mapel agama / berlaku untuk semua
  -- siswa apapun agamanya. Dipakai untuk menyaring siswa yang muncul
  -- ke guru mapel ini, dan menyaring baris mapel yang tampil di rapor
  -- tiap siswa (siswa cuma lihat mapel agama yang cocok agamanya).
  agama_spesifik text check (agama_spesifik is null or agama_spesifik in ('Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'))
);

-- Kelas mana saja yang memakai mapel ini, KALAU berlaku_untuk = 'tertentu'
-- (mapel produktif/kejuruan). Kalau berlaku_untuk = 'semua', tabel ini
-- tidak perlu diisi untuk mapel tersebut.
create table if not exists public.mapel_kelas (
  id uuid primary key default gen_random_uuid(),
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  unique (mapel_id, kelas_id)
);

-- Semester (1-6) mana saja yang memakai mapel ini, KALAU
-- berlaku_semester = 'tertentu'.
create table if not exists public.mapel_semester (
  id uuid primary key default gen_random_uuid(),
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  semester_ke integer not null check (semester_ke between 1 and 6),
  unique (mapel_id, semester_ke)
);

create table if not exists public.kelas (
  id uuid primary key default gen_random_uuid(),
  nama text not null,                  -- contoh: 'XI ANM 1'
  tingkat integer not null,             -- 10, 11, 12
  program_keahlian text,               -- contoh: 'Agribisnis Ternak'
  konsentrasi_keahlian text            -- contoh: 'Agribisnis Ternak Ruminansia'
);

create table if not exists public.siswa (
  id uuid primary key default gen_random_uuid(),

  -- Data peserta didik
  nis text unique,
  nisn text unique,
  nama text not null,
  tempat_lahir text,
  tanggal_lahir date,
  jenis_kelamin text check (jenis_kelamin in ('L', 'P')),
  agama text,
  status_keluarga text,          -- contoh: Anak Kandung / Anak Tiri / Anak Angkat
  anak_ke integer,
  alamat_siswa text,
  no_telp_siswa text,

  -- Data sekolah asal & masuk
  sekolah_asal text,
  kelas_masuk text,              -- kelas saat pertama masuk (riwayat, bukan kelas berjalan)
  tanggal_masuk date,

  -- Data orang tua
  nama_ayah text,
  nama_ibu text,
  alamat_ortu text,
  no_telp_ortu text,
  pekerjaan_ayah text,
  pekerjaan_ibu text,

  -- Data wali
  nama_wali text,
  alamat_wali text,
  no_telp_wali text,
  pekerjaan_wali text,

  status text not null default 'aktif' check (status in ('aktif', 'lulus', 'pindah', 'keluar'))
);

alter table public.mata_pelajaran enable row level security;
alter table public.mapel_kelas enable row level security;
alter table public.mapel_semester enable row level security;
alter table public.kelas enable row level security;
alter table public.siswa enable row level security;

create policy "Semua user login boleh baca mata_pelajaran" on public.mata_pelajaran for select using (auth.uid() is not null);
create policy "Admin kelola mata_pelajaran" on public.mata_pelajaran for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Semua user login boleh baca mapel_kelas" on public.mapel_kelas for select using (auth.uid() is not null);
create policy "Admin kelola mapel_kelas" on public.mapel_kelas for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create policy "Semua user login boleh baca mapel_semester" on public.mapel_semester for select using (auth.uid() is not null);
create policy "Admin kelola mapel_semester" on public.mapel_semester for all
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
-- 5b. PJ_KOKURIKULER — penanggung jawab kokurikuler per kegiatan,
--    per tahun ajaran. Sama seperti wali_kelas (penugasan
--    tambahan di atas akun guru), TAPI satu kegiatan boleh
--    punya LEBIH DARI SATU penanggung jawab (tidak dibatasi 1:1
--    seperti wali kelas), dan satu guru boleh jadi PJ di lebih
--    dari satu kegiatan/kelas. Tiap penugasan terikat ke SATU
--    nama kegiatan kokurikuler (mis. "P5 - Kearifan Lokal"), dan
--    lingkupnya bisa kelas tertentu (kelas_id diisi) atau Semua
--    Kelas (kelas_id NULL — PJ menilai siswa lintas semua kelas).
-- =========================================================
create table if not exists public.pj_kokurikuler (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  nama_kegiatan text not null,
  kelas_id uuid references public.kelas(id) on delete cascade, -- null = Semua Kelas
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade
);

-- Dua unique index terpisah (bukan satu "unique(...)" biasa) karena NULL
-- tidak dianggap bentrok dengan NULL lain di batasan unik standar SQL.
create unique index if not exists ux_pj_koku_kelas_tertentu
  on public.pj_kokurikuler (guru_id, nama_kegiatan, kelas_id, tahun_ajaran_id)
  where kelas_id is not null;
create unique index if not exists ux_pj_koku_semua_kelas
  on public.pj_kokurikuler (guru_id, nama_kegiatan, tahun_ajaran_id)
  where kelas_id is null;

alter table public.pj_kokurikuler enable row level security;

create policy "Guru baca status pj kokurikuler miliknya" on public.pj_kokurikuler for select
using (guru_id = auth.uid());

create policy "Semua user login boleh baca pj_kokurikuler" on public.pj_kokurikuler for select
using (auth.uid() is not null);

create policy "Admin kelola pj_kokurikuler" on public.pj_kokurikuler for all
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
