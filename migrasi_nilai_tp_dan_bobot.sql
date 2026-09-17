-- =========================================================
-- MIGRASI: Nilai per Tujuan Pembelajaran (TP) + Pembobotan
--
--   Menu Guru → "Input Nilai" dirombak. Guru TIDAK lagi mengetik
--   satu angka "Nilai Rapor". Sekarang yang diisi:
--
--     1) Nilai tiap TP   — jumlah kolomnya otomatis sebanyak TP
--                          berstatus Aktif pada semester berjalan
--                          (disimpan di tabel baru nilai_tp),
--     2) Nilai Tengah Semester (PTS),
--     3) Nilai Akhir Semester (PAS).
--
--   Nilai Rapor dihitung OTOMATIS dari ketiganya memakai BOBOT yang
--   diatur sendiri oleh guru (mis. TP 1, PTS 2, PAS 3), disimpan di
--   tabel baru pengaturan_penilaian. Hasil hitungannya tetap ditulis
--   ke kolom nilai.nilai yang lama, jadi Leger Nilai, Rekap, dan
--   Cetak Rapor TIDAK perlu diubah.
--
--   Capaian Pembelajaran juga disusun otomatis dari nilai TP:
--     - TP "baik"   = TP dengan nilai tertinggi (kalau seri, diambil
--                     salah satu yang urutannya paling awal),
--     - TP "kurang" = TP yang nilainya di bawah KKM.
--   Guru bisa memilih menampilkan hanya capaian terbaik, atau baik
--   dan kurang sekaligus (kolom mode_capaian). Kalau dipilih
--   baik+kurang tapi tidak ada nilai di bawah KKM, bagian kurang
--   otomatis tidak muncul — ini logika aplikasi di guru.html.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor, SETELAH migrasi_tujuan_pembelajaran.sql dan
-- migrasi_nilai_rapor.sql.
-- =========================================================


-- ---------- 1) Kolom tambahan di tabel nilai ----------
-- nilai.nilai tetap dipakai sebagai NILAI RAPOR akhir (hasil
-- pembobotan), sedangkan tiga kolom di bawah menyimpan komponen
-- pembentuknya supaya bisa ditampilkan ulang saat guru membuka
-- kembali halaman Input Nilai.
alter table public.nilai add column if not exists nilai_pts numeric(5,2);
alter table public.nilai add column if not exists nilai_pas numeric(5,2);
alter table public.nilai add column if not exists rata_tp  numeric(5,2);

comment on column public.nilai.nilai     is 'Nilai Rapor akhir, hasil pembobotan rata_tp + nilai_pts + nilai_pas';
comment on column public.nilai.nilai_pts is 'Nilai Tengah Semester';
comment on column public.nilai.nilai_pas is 'Nilai Akhir Semester';
comment on column public.nilai.rata_tp   is 'Rata-rata nilai seluruh TP yang terisi';


-- ---------- 2) Nilai per Tujuan Pembelajaran ----------
-- Satu baris = nilai satu siswa untuk satu TP. Jumlah baris per
-- siswa otomatis mengikuti berapa TP yang dibuat guru di semester
-- tersebut.
create table if not exists public.nilai_tp (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  tp_id uuid not null references public.tujuan_pembelajaran(id) on delete cascade,
  guru_id uuid not null references public.profiles(id) on delete cascade,
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  nilai numeric(5,2),
  updated_at timestamptz default now(),
  unique (siswa_id, tp_id, tahun_ajaran_id)
);

alter table public.nilai_tp enable row level security;

drop policy if exists "Guru kelola nilai tp miliknya" on public.nilai_tp;
create policy "Guru kelola nilai tp miliknya" on public.nilai_tp for all
using (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = nilai_tp.mapel_id
      and pg.kelas_id = nilai_tp.kelas_id
      and pg.tahun_ajaran_id = nilai_tp.tahun_ajaran_id
  )
)
with check (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = nilai_tp.mapel_id
      and pg.kelas_id = nilai_tp.kelas_id
      and pg.tahun_ajaran_id = nilai_tp.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola nilai_tp" on public.nilai_tp;
create policy "Admin kelola nilai_tp" on public.nilai_tp for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_nilai_tp_scope
  on public.nilai_tp (guru_id, mapel_id, kelas_id, tahun_ajaran_id);
create index if not exists idx_nilai_tp_siswa
  on public.nilai_tp (siswa_id, tahun_ajaran_id);


-- ---------- 3) Pengaturan pembobotan & mode capaian ----------
-- Diisi guru lewat panel "Pembobotan & Capaian" di halaman Input
-- Nilai. Disimpan per kombinasi guru + mapel + kelas + tahun ajaran,
-- jadi tiap kelas boleh punya bobot berbeda.
--
--   bobot_tp / bobot_pts / bobot_pas
--     Angka bebas (boleh desimal). Yang dipakai perbandingannya,
--     bukan jumlahnya — 1:2:3 sama saja dengan 10:20:30.
--     Bobot 0 berarti komponen itu diabaikan.
--
--   kkm
--     Batas tuntas yang dipakai untuk menentukan TP "kurang".
--     Kalau dibiarkan null, aplikasi memakai mata_pelajaran.kkm.
--
--   mode_capaian
--     'terbaik'     -> hanya kalimat capaian terbaik yang dimunculkan
--     'baik_kurang' -> capaian terbaik + capaian kurang (kalimat
--                      kurang hanya muncul kalau memang ada nilai TP
--                      di bawah KKM)
create table if not exists public.pengaturan_penilaian (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  bobot_tp  numeric(6,2) not null default 1,
  bobot_pts numeric(6,2) not null default 2,
  bobot_pas numeric(6,2) not null default 3,
  kkm integer,
  mode_capaian text not null default 'baik_kurang'
    check (mode_capaian in ('terbaik', 'baik_kurang')),
  updated_at timestamptz default now(),
  unique (guru_id, mapel_id, kelas_id, tahun_ajaran_id)
);

alter table public.pengaturan_penilaian enable row level security;

drop policy if exists "Guru kelola pengaturan penilaian miliknya" on public.pengaturan_penilaian;
create policy "Guru kelola pengaturan penilaian miliknya" on public.pengaturan_penilaian for all
using (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = pengaturan_penilaian.mapel_id
      and pg.kelas_id = pengaturan_penilaian.kelas_id
      and pg.tahun_ajaran_id = pengaturan_penilaian.tahun_ajaran_id
  )
)
with check (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = pengaturan_penilaian.mapel_id
      and pg.kelas_id = pengaturan_penilaian.kelas_id
      and pg.tahun_ajaran_id = pengaturan_penilaian.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola pengaturan_penilaian" on public.pengaturan_penilaian;
create policy "Admin kelola pengaturan_penilaian" on public.pengaturan_penilaian for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_pengaturan_penilaian_scope
  on public.pengaturan_penilaian (guru_id, mapel_id, kelas_id, tahun_ajaran_id);


-- =========================================================
-- CATATAN PEMAKAIAN
--
-- 1. Guru menyusun TP dulu di menu "Buat Tujuan Pembelajaran"
--    (tandai Semester 1–6 + status Aktif). Jumlah TP Aktif di
--    semester berjalan inilah yang menentukan berapa kolom nilai
--    TP yang muncul di Input Nilai.
--
-- 2. Menu "Input Nilai" → pilih mapel & kelas. Di atas tabel ada
--    panel "Pembobotan & Capaian": isi Bobot Nilai TP, Bobot
--    Tengah Semester, Bobot Akhir Semester, KKM, dan pilihan
--    capaian yang dimunculkan. Klik "Simpan Pengaturan" supaya
--    dipakai lagi saat halaman dibuka berikutnya.
--
-- 3. Isi nilai tiap TP, Tengah Semester, dan Akhir Semester.
--    Kolom "Rata TP", "Nilai Rapor", dan "Capaian Pembelajaran"
--    terisi sendiri seketika. Teks capaian tetap boleh disunting
--    manual; suntingan manual tidak akan tertimpa kecuali tombol
--    "↺ Susun Ulang" ditekan.
--
-- 4. Klik "Simpan Semua Nilai". Selain menyimpan nilai TP/PTS/PAS
--    dan nilai rapor, sistem sekaligus menulis ulang centang TP
--    baik/kurang di tabel tujuan_pembelajaran_siswa sesuai hasil
--    hitungan otomatis.
-- =========================================================
