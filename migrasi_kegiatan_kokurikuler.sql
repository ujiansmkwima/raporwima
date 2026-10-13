-- =========================================================
-- MIGRASI: Data Kegiatan Kokurikuler (disusun Admin)
--
--   Tabel baru kegiatan_kokurikuler — daftar kegiatan
--   kokurikuler per tahun ajaran yang disusun & disimpan Admin
--   di menu Admin → Kokurikuler (langkah 1). Setelah kegiatan
--   tersimpan, Admin menentukan Penanggung Jawab (PJ) tiap
--   kegiatan (langkah 2, boleh lebih dari satu guru) — PJ tetap
--   disimpan di pj_kokurikuler seperti sebelumnya.
--
--   Tabel pj_kokurikuler & nilai_kokurikuler TIDAK diubah:
--   keduanya tetap memakai kolom teks nama_kegiatan, jadi
--   dashboard guru dan RLS yang sudah ada tetap jalan apa adanya.
--   Nama di kegiatan_kokurikuler.nama dipakai sebagai nilai
--   nama_kegiatan tersebut.
--
--   Data lama: kegiatan yang sudah pernah dipakai di
--   pj_kokurikuler otomatis disalin ke tabel baru ini (bagian 3).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

-- 1) Tabel
create table if not exists public.kegiatan_kokurikuler (
  id uuid primary key default gen_random_uuid(),
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  nama text not null,
  keterangan text,
  created_at timestamptz default now(),
  unique (tahun_ajaran_id, nama)
);

-- 2) RLS: semua user login boleh baca, hanya Admin yang kelola
alter table public.kegiatan_kokurikuler enable row level security;

drop policy if exists "Semua user login boleh baca kegiatan_kokurikuler" on public.kegiatan_kokurikuler;
create policy "Semua user login boleh baca kegiatan_kokurikuler" on public.kegiatan_kokurikuler for select
using (auth.uid() is not null);

drop policy if exists "Admin kelola kegiatan_kokurikuler" on public.kegiatan_kokurikuler;
create policy "Admin kelola kegiatan_kokurikuler" on public.kegiatan_kokurikuler for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 3) Salin kegiatan yang sudah ada di PJ kokurikuler lama
insert into public.kegiatan_kokurikuler (tahun_ajaran_id, nama)
select distinct pk.tahun_ajaran_id, pk.nama_kegiatan
from public.pj_kokurikuler pk
where pk.nama_kegiatan is not null and btrim(pk.nama_kegiatan) <> ''
on conflict (tahun_ajaran_id, nama) do nothing;

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → Kokurikuler:
--   1. "Data Kegiatan Kokurikuler" — isi Nama Kegiatan (+
--      keterangan opsional) lalu "Simpan Kegiatan". Bisa juga
--      import dari Excel. Mengganti nama kegiatan otomatis ikut
--      memperbarui PJ & deskripsi yang sudah terisi.
--   2. "Penanggung Jawab (PJ) Kokurikuler" — pilih kegiatan,
--      centang satu atau beberapa guru, pilih lingkup (Semua
--      Kelas / kelas tertentu), lalu "Tetapkan PJ".
-- =========================================================
