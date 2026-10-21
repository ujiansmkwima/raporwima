-- =========================================================
-- MIGRASI: GURU YANG DISUPERVISI MENGISI SENDIRI JAWABAN WAWANCARA
--   Pertanyaan wawancara (bagian berjudul "Wawancara ..." atau berketerangan
--   "Isi dengan jawaban/tanggapan guru") kini bisa dijawab langsung oleh guru
--   yang disupervisi lewat menu "Wawancara Saya" di halaman Supervisi.
--   Jawaban tampil otomatis di formulir supervisor (boleh diedit) dan di PDF/hasil.
--
--   - supervisi_jadwal.jawaban_guru    : { "<id_form>": { "<id_pertanyaan>": "jawaban" } }
--   - supervisi_jadwal.jawaban_guru_at : waktu terakhir guru menyimpan
--   - supervisi_jadwal_guru()          : daftar jadwal milik guru yang login (kolom terbatas;
--                                        hasil penilaian supervisor TIDAK ikut terbaca)
--   - supervisi_isi_wawancara(...)     : guru hanya bisa menulis kolom jawaban_guru miliknya,
--                                        dan hanya selama jadwal belum berstatus 'selesai'
-- Jalankan di Supabase SQL Editor SETELAH migrasi_supervisi.sql. Aman diulang.
-- =========================================================
alter table public.supervisi_jadwal add column if not exists jawaban_guru jsonb not null default '{}'::jsonb;
alter table public.supervisi_jadwal add column if not exists jawaban_guru_at timestamptz;

drop function if exists public.supervisi_jadwal_guru();
create function public.supervisi_jadwal_guru()
returns table (
  id uuid, jenis text, tanggal date, status text,
  guru_id uuid, supervisor_id uuid, mapel_id uuid, form_id uuid,
  kelas text, jenjang text, unit_kerja text,
  jawaban_guru jsonb, jawaban_guru_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select j.id, j.jenis, j.tanggal, j.status,
         j.guru_id, j.supervisor_id, j.mapel_id, j.form_id,
         j.kelas, j.jenjang, j.unit_kerja,
         j.jawaban_guru, j.jawaban_guru_at
  from public.supervisi_jadwal j
  where j.guru_id = auth.uid()
  order by j.tanggal;
$$;
revoke all on function public.supervisi_jadwal_guru() from public;
grant execute on function public.supervisi_jadwal_guru() to authenticated;

create or replace function public.supervisi_isi_wawancara(p_jadwal uuid, p_jawaban jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'Belum login.'; end if;
  if p_jawaban is null or jsonb_typeof(p_jawaban) <> 'object' then
    raise exception 'Format jawaban tidak valid.';
  end if;
  if length(p_jawaban::text) > 60000 then raise exception 'Jawaban terlalu panjang.'; end if;

  select status into v_status from public.supervisi_jadwal
  where id = p_jadwal and guru_id = auth.uid();
  if not found then raise exception 'Jadwal tidak ditemukan atau bukan jadwal Anda.'; end if;
  if v_status = 'selesai' then
    raise exception 'Supervisi sudah selesai, wawancara tidak dapat diubah lagi.';
  end if;

  update public.supervisi_jadwal
  set jawaban_guru = coalesce(jawaban_guru, '{}'::jsonb) || p_jawaban,
      jawaban_guru_at = now()
  where id = p_jadwal;
end;
$$;
revoke all on function public.supervisi_isi_wawancara(uuid, jsonb) from public;
grant execute on function public.supervisi_isi_wawancara(uuid, jsonb) to authenticated;
