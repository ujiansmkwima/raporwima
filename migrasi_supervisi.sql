-- =========================================================
-- MODUL SUPERVISI (Pra-Supervisi Akademik & Supervisi)
-- Jalankan di Supabase Dashboard -> SQL Editor
-- =========================================================

-- Salinan data guru & mapel dari E-Rapor (diisi tombol "Muat Ulang dari E-Rapor"
-- di halaman Admin Supervisi). Disalin supaya supervisor bisa membaca nama guru
-- yang disupervisi tanpa perlu akses ke tabel profiles milik orang lain.
create table if not exists public.supervisi_guru (
  id uuid primary key references public.profiles(id) on delete cascade,
  nama text not null
);
create table if not exists public.supervisi_mapel (
  id uuid primary key references public.mata_pelajaran(id) on delete cascade,
  kode text,
  nama text not null
);

-- Form buatan admin. pertanyaan = array JSON:
-- [{"id":"q1","teks":"...","tipe":"skala|ya_tidak|teks"}]
create table if not exists public.supervisi_form (
  id uuid primary key default gen_random_uuid(),
  jenis text not null check (jenis in ('pra', 'supervisi')),
  judul text not null,
  pertanyaan jsonb not null default '[]'::jsonb,
  created_at timestamptz default now()
);

-- Jadwal + hasil isian supervisi
create table if not exists public.supervisi_jadwal (
  id uuid primary key default gen_random_uuid(),
  jenis text not null check (jenis in ('pra', 'supervisi')),
  guru_id uuid not null references public.supervisi_guru(id) on delete cascade,
  supervisor_id uuid not null references public.supervisi_guru(id) on delete cascade,
  mapel_id uuid references public.supervisi_mapel(id) on delete set null,
  form_id uuid references public.supervisi_form(id) on delete set null,
  tanggal date not null,
  status text not null default 'terjadwal' check (status in ('terjadwal', 'selesai')),
  jawaban jsonb,
  catatan text,
  selesai_at timestamptz,
  created_at timestamptz default now()
);

alter table public.supervisi_guru enable row level security;
alter table public.supervisi_mapel enable row level security;
alter table public.supervisi_form enable row level security;
alter table public.supervisi_jadwal enable row level security;

create policy "baca supervisi_guru" on public.supervisi_guru for select using (auth.uid() is not null);
create policy "baca supervisi_mapel" on public.supervisi_mapel for select using (auth.uid() is not null);
create policy "baca supervisi_form" on public.supervisi_form for select using (auth.uid() is not null);

create policy "admin kelola supervisi_guru" on public.supervisi_guru for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admin kelola supervisi_mapel" on public.supervisi_mapel for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admin kelola supervisi_form" on public.supervisi_form for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));
create policy "admin kelola supervisi_jadwal" on public.supervisi_jadwal for all
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Supervisor hanya melihat & mengisi jadwal miliknya sendiri
create policy "supervisor baca jadwalnya" on public.supervisi_jadwal for select
  using (supervisor_id = auth.uid());
create policy "supervisor isi jadwalnya" on public.supervisi_jadwal for update
  using (supervisor_id = auth.uid()) with check (supervisor_id = auth.uid());
