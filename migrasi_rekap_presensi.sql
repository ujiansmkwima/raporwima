-- =========================================================
-- MIGRASI: Rekap Presensi (input jumlah langsung)
--
--   Menyederhanakan Presensi: wali kelas TIDAK lagi mencatat
--   kehadiran harian satu-satu, cukup input JUMLAH akhir per
--   siswa untuk satu tahun ajaran — Sakit, Izin, Tanpa
--   Keterangan (Alpha). Angka ini yang langsung dipakai di
--   Cetak Rapor.
--
--   Tabel presensi (harian) yang lama TETAP ada di database
--   (tidak dihapus, supaya tidak mengganggu data lama), tapi
--   sudah tidak dipakai lagi oleh menu Presensi guru — diganti
--   tabel rekap_presensi ini.
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

create table if not exists public.rekap_presensi (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  jumlah_sakit integer not null default 0 check (jumlah_sakit >= 0),
  jumlah_izin integer not null default 0 check (jumlah_izin >= 0),
  jumlah_alpha integer not null default 0 check (jumlah_alpha >= 0),
  dicatat_oleh uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique (siswa_id, kelas_id, tahun_ajaran_id)
);

alter table public.rekap_presensi enable row level security;

-- Wali kelas: kelola (baca+tulis) rekap presensi penuh untuk kelas
-- yang diampunya.
drop policy if exists "Wali kelas kelola rekap presensi kelasnya" on public.rekap_presensi;
create policy "Wali kelas kelola rekap presensi kelasnya" on public.rekap_presensi for all
using (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = rekap_presensi.kelas_id
      and wk.tahun_ajaran_id = rekap_presensi.tahun_ajaran_id
  )
)
with check (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = rekap_presensi.kelas_id
      and wk.tahun_ajaran_id = rekap_presensi.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola rekap_presensi" on public.rekap_presensi;
create policy "Admin kelola rekap_presensi" on public.rekap_presensi for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_rekap_presensi_scope
  on public.rekap_presensi (kelas_id, tahun_ajaran_id);

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Guru → "Presensi Kelas" (wali kelas): untuk tiap siswa,
-- isi langsung 3 angka — Sakit, Izin, Tanpa Keterangan (Alpha) —
-- lalu Simpan. Angka ini yang tampil di Cetak Rapor bagian
-- Presensi.
-- =========================================================
