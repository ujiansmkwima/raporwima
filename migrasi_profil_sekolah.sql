-- =========================================================
-- MIGRASI: Profil Sekolah
--
--   Tabel singleton (SELALU cuma 1 baris) untuk data sekolah yang
--   dipakai di Cetak Rapor: Nama Sekolah, Kepala Sekolah, dan Kota
--   untuk baris tanda tangan ("Tambak, ....... 2026"). Sebelumnya
--   nilai-nilai ini hardcode di kode guru.html — sekarang admin bisa
--   mengubahnya sendiri lewat menu Admin → "Profil Sekolah", dan
--   Cetak Rapor otomatis memakai nilai terbaru dari sini.
--
--   Trik "singleton": kolom `singleton` selalu bernilai true dan
--   diberi UNIQUE constraint, jadi baris kedua tidak akan pernah bisa
--   disisipkan (upsert dari Admin selalu pakai onConflict=singleton,
--   otomatis meng-update baris yang sama, bukan menambah baris baru).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

create table if not exists public.profil_sekolah (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique,
  nama_sekolah text not null default 'SMK Widya Mandala Tambak',
  alamat_sekolah text,
  kepala_sekolah text,
  nip_kepala_sekolah text,
  kota_ttd text not null default 'Tambak',
  updated_at timestamptz default now()
);

alter table public.profil_sekolah enable row level security;

drop policy if exists "Semua user login boleh baca profil_sekolah" on public.profil_sekolah;
create policy "Semua user login boleh baca profil_sekolah" on public.profil_sekolah for select
using (auth.uid() is not null);

drop policy if exists "Admin kelola profil_sekolah" on public.profil_sekolah;
create policy "Admin kelola profil_sekolah" on public.profil_sekolah for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Isi baris default sekali saja, supaya Cetak Rapor tetap punya nilai
-- yang masuk akal walau menu "Profil Sekolah" belum sempat dibuka
-- admin. Kalau admin menyimpan lewat menu Admin, baris ini yang
-- ter-update (bukan baris baru).
insert into public.profil_sekolah (nama_sekolah, kepala_sekolah, kota_ttd)
values ('SMK Widya Mandala Tambak', 'Agung Pambudi, S.E., S. Kom., M.M.', 'Tambak')
on conflict (singleton) do nothing;

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Admin → "Profil Sekolah": isi/ubah Nama Sekolah, Alamat
-- Sekolah, Nama Kepala Sekolah, NIP Kepala Sekolah (opsional), dan
-- Kota untuk baris tanda tangan, lalu Simpan.
--
-- Menu Guru → "Cetak Rapor" (wali kelas): baris "Sekolah" di kepala
-- rapor, nama & tanda tangan Kepala Sekolah, dan kota pada baris
-- tanggal tanda tangan otomatis mengambil dari sini.
-- =========================================================
