-- =========================================================
-- MIGRASI: Tujuan Pembelajaran (TP) + Pilihan TP per Siswa
--
--   Modul "Capaian Pembelajaran" TIDAK dipakai lagi — sekarang
--   guru hanya menyusun & memakai "Tujuan Pembelajaran" (TP).
--
--   1) tabel tujuan_pembelajaran — bank kalimat TP yang disusun
--      guru, per mapel yang diajarnya, pada tahun ajaran tertentu,
--      ditandai untuk Semester 1–6 dan status Aktif/Tidak Aktif.
--      TIDAK terikat kelas tertentu (kelas_id dilepas) — satu bank
--      TP dipakai bersama untuk semua kelas di semester yang sama.
--      Sama pola dengan capaian_pembelajaran sebelumnya (RLS lewat
--      penugasan_guru), tapi berdiri sendiri, tidak lagi terkait ke
--      tabel capaian_pembelajaran.
--
--   2) tabel tujuan_pembelajaran_siswa — pilihan guru: TP mana
--      yang dipakai untuk tiap siswa, ditandai kategori
--      'baik' (capaian baik) atau 'kurang' (capaian kurang).
--      Satu siswa boleh punya beberapa TP tercentang (baik
--      dan/atau kurang), tapi minimal satu wajib dicentang —
--      validasi minimal-satu ini dijaga di sisi aplikasi
--      (guru.html), bukan di database.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

-- ---------- 1) Bank Tujuan Pembelajaran ----------
-- CATATAN (revisi): TP TIDAK lagi terikat ke kelas tertentu — guru
-- menyusun TP per mapel saja, lalu menandai TP itu untuk Semester
-- keberapa (1–6, memakai penomoran yang sama dengan Leger Nilai:
-- Tingkat 10 Gasal=1, Genap=2, Tingkat 11 Gasal=3, Genap=4,
-- Tingkat 12 Gasal=5, Genap=6) dan status Aktif/Tidak Aktif (TP
-- yang tidak aktif tetap tersimpan tapi disembunyikan dari daftar
-- pilihan "Pilih Tujuan Pembelajaran" per siswa).
create table if not exists public.tujuan_pembelajaran (
  id uuid primary key default gen_random_uuid(),
  guru_id uuid not null references public.profiles(id) on delete cascade,
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  kode text,
  deskripsi text not null,
  urutan integer not null default 0,
  semester integer not null default 1 check (semester between 1 and 6),
  is_aktif boolean not null default true,
  created_at timestamptz default now()
);

-- Kalau tabel ini sebelumnya sempat dibuat dengan kolom capaian_id
-- (versi lama yang masih terkait ke capaian_pembelajaran), kolom
-- itu dilepas di sini supaya TP benar-benar berdiri sendiri.
alter table public.tujuan_pembelajaran drop column if exists capaian_id;

-- Policy lama (kalau ada) mengacu ke kolom kelas_id, jadi HARUS
-- dilepas dulu sebelum kolomnya di-drop — kalau tidak, Postgres
-- menolak drop column karena masih dipakai policy (error 2BP01).
drop policy if exists "Guru kelola tujuan pembelajaran miliknya" on public.tujuan_pembelajaran;
drop policy if exists "Admin kelola tujuan_pembelajaran" on public.tujuan_pembelajaran;

-- Revisi: kelas_id dilepas — TP sekarang cuma terikat mapel + tahun
-- ajaran, dan dibedakan lewat kolom semester (1–6), bukan lewat kelas.
alter table public.tujuan_pembelajaran drop column if exists kelas_id;
alter table public.tujuan_pembelajaran add column if not exists semester integer not null default 1 check (semester between 1 and 6);
alter table public.tujuan_pembelajaran add column if not exists is_aktif boolean not null default true;

alter table public.tujuan_pembelajaran enable row level security;

create policy "Guru kelola tujuan pembelajaran miliknya" on public.tujuan_pembelajaran for all
using (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = tujuan_pembelajaran.mapel_id
      and pg.tahun_ajaran_id = tujuan_pembelajaran.tahun_ajaran_id
  )
)
with check (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = tujuan_pembelajaran.mapel_id
      and pg.tahun_ajaran_id = tujuan_pembelajaran.tahun_ajaran_id
  )
);

create policy "Admin kelola tujuan_pembelajaran" on public.tujuan_pembelajaran for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop index if exists idx_tujuan_pembelajaran_scope;
create index if not exists idx_tujuan_pembelajaran_scope
  on public.tujuan_pembelajaran (guru_id, mapel_id, tahun_ajaran_id, semester);

-- ---------- 2) Pilihan TP per siswa (baik / kurang) ----------
create table if not exists public.tujuan_pembelajaran_siswa (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  tp_id uuid not null references public.tujuan_pembelajaran(id) on delete cascade,
  guru_id uuid not null references public.profiles(id) on delete cascade,
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  kategori text not null check (kategori in ('baik', 'kurang')),
  created_at timestamptz default now(),
  unique (siswa_id, tp_id, kategori, tahun_ajaran_id)
);

alter table public.tujuan_pembelajaran_siswa enable row level security;

drop policy if exists "Guru kelola pilihan tp siswa miliknya" on public.tujuan_pembelajaran_siswa;
create policy "Guru kelola pilihan tp siswa miliknya" on public.tujuan_pembelajaran_siswa for all
using (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = tujuan_pembelajaran_siswa.mapel_id
      and pg.kelas_id = tujuan_pembelajaran_siswa.kelas_id
      and pg.tahun_ajaran_id = tujuan_pembelajaran_siswa.tahun_ajaran_id
  )
)
with check (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = tujuan_pembelajaran_siswa.mapel_id
      and pg.kelas_id = tujuan_pembelajaran_siswa.kelas_id
      and pg.tahun_ajaran_id = tujuan_pembelajaran_siswa.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola tujuan_pembelajaran_siswa" on public.tujuan_pembelajaran_siswa;
create policy "Admin kelola tujuan_pembelajaran_siswa" on public.tujuan_pembelajaran_siswa for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_tp_siswa_scope
  on public.tujuan_pembelajaran_siswa (guru_id, mapel_id, kelas_id, tahun_ajaran_id);
create index if not exists idx_tp_siswa_siswa
  on public.tujuan_pembelajaran_siswa (siswa_id, tahun_ajaran_id);

-- =========================================================
-- OPSIONAL — hapus modul Capaian Pembelajaran yang lama:
-- Hanya jalankan baris di bawah ini kalau kamu YAKIN tabel
-- capaian_pembelajaran tidak dipakai lagi sama sekali (termasuk
-- oleh dokumen/rapor lain), karena ini akan menghapus SEMUA data
-- CP yang pernah diisi guru. Baris ini dikomentari supaya tidak
-- tidak sengaja terhapus saat migrasi ini dijalankan ulang.
--
-- drop table if exists public.capaian_pembelajaran cascade;
-- =========================================================

-- =========================================================
-- CATATAN PEMAKAIAN (revisi):
-- Menu Guru → "Tujuan Pembelajaran" → pilih MAPEL saja (tidak perlu
-- pilih kelas lagi) → susun daftar Tujuan Pembelajaran (kode +
-- deskripsi + urutan + Semester [dropdown 1–6] + status Aktif/
-- Tidak Aktif). Bisa diisi manual satu-satu, atau lewat "Import
-- dari Excel". TP yang dinonaktifkan tetap tersimpan tapi tidak
-- muncul lagi di daftar pilihan per siswa.
--
-- Menu Guru → "Pilih Tujuan Pembelajaran" → pilih mapel & kelas →
-- tampil daftar siswa di kelas tsb, dengan 2 kolom checklist:
-- "TP — Capaian Baik" dan "TP — Capaian Kurang". Pilihan TP yang
-- muncul otomatis disaring ke TP berstatus Aktif pada Semester yang
-- sesuai dengan Tingkat kelas tsb + Semester tahun ajaran aktif
-- (Tingkat 10 Gasal=1, Genap=2, Tingkat 11 Gasal=3, Genap=4,
-- Tingkat 12 Gasal=5, Genap=6). Guru mencentang TP yang sesuai
-- untuk tiap siswa (boleh lebih dari satu, di kolom baik dan/atau
-- kurang), minimal satu tercentang.
-- =========================================================
