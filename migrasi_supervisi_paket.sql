-- =========================================================
-- MIGRASI: FORM SEPAKET (paket form pada Supervisi)
--   Satu form "induk" bisa dipaketkan dengan form lain. Saat induk dipilih di jadwal,
--   form sepaketnya otomatis ikut muncul di halaman supervisor (tanpa dijadwalkan sendiri).
--   - supervisi_form.paket_ids     : daftar id form yang sepaket dengan form induk ini
--   - supervisi_jadwal.jawaban_paket: jawaban + catatan form sepaket, bentuk
--                                     {"<id_form>": {"jawaban": {...}, "catatan": "..."}}
--   (jawaban & catatan form induk tetap di kolom jawaban & catatan yang lama)
-- Jalankan di Supabase SQL Editor SETELAH migrasi_supervisi.sql. Aman diulang.
-- =========================================================
alter table public.supervisi_form add column if not exists paket_ids uuid[] not null default '{}';
alter table public.supervisi_jadwal add column if not exists jawaban_paket jsonb not null default '{}'::jsonb;
