-- =========================================================
-- MIGRASI: PERBAIKI INDUK PAKET SUPERVISI (paket tertukar)
--   Aturan: bila Pra-Supervisi dipaketkan dengan Supervisi, INDUK = form Supervisi.
--   Yang dijadwalkan = Supervisi; Pra-Supervisi ikut (boleh diisi walau belum tanggal jadwal).
--   Data lama yang terbalik (form Pra memuat paket_ids berisi form Supervisi) dibetulkan:
--   1) Jadwal berjenis 'pra' yang form-nya induk-terbalik diubah jadi jadwal 'supervisi'
--      (form_id = form Supervisi; isian Pra dipindah ke jawaban_paket; isian Supervisi jadi jawaban utama).
--      Bila isian Supervisi belum ada, status kembali 'terjadwal' (isian Pra tetap tersimpan).
--   2) supervisi_form: Pra dipindah ke paket_ids milik form Supervisi, dan dihapus dari milik Pra.
-- Jalankan di Supabase SQL Editor SETELAH migrasi_supervisi_paket.sql. Aman diulang.
-- =========================================================
do $$
declare
  j record; s_id uuid; p_id uuid; anak jsonb; jp jsonb;
begin
  -- 1) jadwal
  for j in
    select jd.*
    from public.supervisi_jadwal jd
    join public.supervisi_form pf on pf.id = jd.form_id and pf.jenis = 'pra'
    where jd.jenis = 'pra'
      and exists (
        select 1 from unnest(pf.paket_ids) x
        join public.supervisi_form sf on sf.id = x and sf.jenis = 'supervisi')
  loop
    p_id := j.form_id;
    select t.x into s_id
    from public.supervisi_form pf
    cross join lateral unnest(pf.paket_ids) with ordinality as t(x, n)
    join public.supervisi_form sf on sf.id = t.x and sf.jenis = 'supervisi'
    where pf.id = p_id
    order by t.n limit 1;

    anak := j.jawaban_paket -> s_id::text;
    jp := (j.jawaban_paket - s_id::text) || jsonb_build_object(
            p_id::text,
            jsonb_build_object('jawaban', coalesce(j.jawaban, '{}'::jsonb), 'catatan', coalesce(j.catatan, '')));

    update public.supervisi_jadwal set
      jenis = 'supervisi',
      form_id = s_id,
      jawaban = anak -> 'jawaban',
      catatan = anak ->> 'catatan',
      jawaban_paket = jp,
      status = case when anak is null then 'terjadwal' else status end,
      selesai_at = case when anak is null then null else selesai_at end
    where id = j.id;
  end loop;

  -- 2a) form Supervisi menjadi induk: tambahkan Pra yang tadinya memuatnya
  update public.supervisi_form s
  set paket_ids = s.paket_ids || (
    select coalesce(array_agg(p.id), '{}'::uuid[])
    from public.supervisi_form p
    where p.jenis = 'pra' and s.id = any(p.paket_ids) and not (p.id = any(s.paket_ids)))
  where s.jenis = 'supervisi'
    and exists (select 1 from public.supervisi_form p
                where p.jenis = 'pra' and s.id = any(p.paket_ids) and not (p.id = any(s.paket_ids)));

  -- 2b) form Pra tidak lagi memuat form Supervisi
  update public.supervisi_form p
  set paket_ids = coalesce((
    select array_agg(x) from unnest(p.paket_ids) x
    join public.supervisi_form sf on sf.id = x and sf.jenis <> 'supervisi'), '{}'::uuid[])
  where p.jenis = 'pra'
    and exists (select 1 from unnest(p.paket_ids) x
                join public.supervisi_form sf on sf.id = x and sf.jenis = 'supervisi');
end $$;
