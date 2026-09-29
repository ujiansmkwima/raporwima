-- =========================================================
-- MIGRASI: NIP + tanda tangan (gambar) supervisor untuk PDF hasil supervisi
--
--   Dipakai di blok tanda tangan PDF "Hasil Supervisi". Tanda tangan Kepala
--   Sekolah tetap diambil dari Profil Sekolah (profil_sekolah.ttd_kepala_sekolah).
--
--   Disimpan di tabel terpisah (bukan di supervisi_guru) karena supervisi_guru
--   bisa dibaca semua user login; tanda tangan hanya boleh dibaca pemiliknya
--   dan admin. Gambar disimpan sebagai data URL base64 (sudah dikecilkan di browser).
--
-- Jalankan di Supabase Dashboard -> SQL Editor, SETELAH migrasi_supervisi.sql.
-- Aman dijalankan berkali-kali.
-- =========================================================

create table if not exists public.supervisi_ttd (
  guru_id uuid primary key references public.supervisi_guru(id) on delete cascade,
  nip text,
  ttd text,
  updated_at timestamptz default now()
);

alter table public.supervisi_ttd enable row level security;

drop policy if exists "admin kelola supervisi_ttd" on public.supervisi_ttd;
create policy "admin kelola supervisi_ttd" on public.supervisi_ttd for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

drop policy if exists "pemilik baca supervisi_ttd" on public.supervisi_ttd;
create policy "pemilik baca supervisi_ttd" on public.supervisi_ttd for select
  using (guru_id = auth.uid());

drop policy if exists "pemilik tambah supervisi_ttd" on public.supervisi_ttd;
create policy "pemilik tambah supervisi_ttd" on public.supervisi_ttd for insert
  with check (guru_id = auth.uid());

drop policy if exists "pemilik ubah supervisi_ttd" on public.supervisi_ttd;
create policy "pemilik ubah supervisi_ttd" on public.supervisi_ttd for update
  using (guru_id = auth.uid()) with check (guru_id = auth.uid());

-- CATATAN PEMAKAIAN:
--   Supervisor : menu "Tanda Tangan Saya" di halaman Supervisi -> isi NIP + unggah / coret tanda tangan.
--   Admin      : menu "Data Guru & Mapel" -> tabel "NIP & Tanda Tangan" (bisa mengatur untuk siapa saja).
--   Kepala Sekolah : tetap dari Admin -> Profil Sekolah (nama, NIP, gambar tanda tangan, kota).
