-- =========================================================
-- TABEL PROFILES (role user) + RLS
-- Jalankan ini di Supabase Dashboard → SQL Editor
-- =========================================================

-- 1. Buat tabel profiles, 1 baris per user, terhubung ke auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nama text,
  role text not null check (role in ('admin', 'guru')),
  created_at timestamp with time zone default now()
);

-- 2. Aktifkan Row Level Security
alter table public.profiles enable row level security;

-- 3. Policy: setiap user boleh membaca baris profil miliknya sendiri
create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

-- 4. Policy: admin boleh membaca semua profil
--    (berguna nanti untuk halaman kelola user di panel admin)
create policy "Admin can read all profiles"
on public.profiles
for select
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  )
);

-- =========================================================
-- CARA ISI AKUN ADMIN PERTAMA:
-- 1. Authentication → Users → Add User (isi email & password)
-- 2. Copy User UID dari user tersebut
-- 3. Jalankan query berikut (ganti UID dan nama):
--
-- insert into public.profiles (id, nama, role)
-- values ('tempel-user-uid-di-sini', 'Nama Admin', 'admin');
-- =========================================================
