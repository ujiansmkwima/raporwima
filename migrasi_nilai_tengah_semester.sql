-- =========================================================
-- MIGRASI: Nilai Tengah Semester & Catatan KBM (per guru mapel)
--
--   Menu Guru baru: "Nilai Tengah Semester & Catatan KBM".
--   Terpisah dari menu "Input Nilai" (yang mengisi TP / PTS / PAS
--   untuk Nilai Rapor akhir) — menu ini khusus untuk laporan
--   perkembangan siswa DI TENGAH SEMESTER, yang biasanya dibagikan
--   ke orang tua sebelum rapor akhir semester terbit.
--
--   Alurnya sama seperti menu Input Nilai: guru pilih Mapel, lalu
--   pilih Kelas, lalu untuk tiap siswa mengisi:
--     1) Nilai (angka 0–100, opsional — boleh dikosongkan kalau
--        mapel ini hanya melaporkan catatan naratif saja),
--     2) Catatan Selama KBM (teks bebas — perkembangan/ perilaku/
--        keaktifan siswa selama kegiatan belajar mengajar berjalan).
--
--   Bisa diunduh sebagai Template Excel (kosong, untuk diisi offline)
--   dan diimpor kembali dari Excel, satu baris per siswa (dicocokkan
--   lewat kolom NIS).
--
-- Aman dijalankan berkali-kali. Jalankan di Supabase Dashboard
-- → SQL Editor.
-- =========================================================

create table if not exists public.nilai_tengah_semester (
  id uuid primary key default gen_random_uuid(),
  siswa_id uuid not null references public.siswa(id) on delete cascade,
  guru_id uuid not null references public.profiles(id) on delete cascade,
  mapel_id uuid not null references public.mata_pelajaran(id) on delete cascade,
  kelas_id uuid not null references public.kelas(id) on delete cascade,
  tahun_ajaran_id uuid not null references public.tahun_ajaran(id) on delete cascade,
  nilai numeric(5,2),
  catatan_kbm text,
  updated_at timestamptz default now(),
  unique (siswa_id, mapel_id, kelas_id, tahun_ajaran_id)
);

comment on table public.nilai_tengah_semester is
  'Nilai & catatan perkembangan siswa selama KBM di tengah semester, diisi guru mapel. Terpisah dari nilai rapor akhir (tabel nilai).';
comment on column public.nilai_tengah_semester.nilai is 'Nilai Tengah Semester (0-100), opsional.';
comment on column public.nilai_tengah_semester.catatan_kbm is 'Catatan naratif perkembangan siswa selama Kegiatan Belajar Mengajar (KBM).';

alter table public.nilai_tengah_semester enable row level security;

-- Guru mapel: boleh baca & tulis HANYA untuk kombinasi mapel+kelas
-- yang benar-benar diajarnya di tahun ajaran tersebut (sama seperti
-- kebijakan pada tabel nilai_tp / pengaturan_penilaian).
drop policy if exists "Guru kelola nilai tengah semester miliknya" on public.nilai_tengah_semester;
create policy "Guru kelola nilai tengah semester miliknya" on public.nilai_tengah_semester for all
using (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = nilai_tengah_semester.mapel_id
      and pg.kelas_id = nilai_tengah_semester.kelas_id
      and pg.tahun_ajaran_id = nilai_tengah_semester.tahun_ajaran_id
  )
)
with check (
  guru_id = auth.uid()
  and exists (
    select 1 from public.penugasan_guru pg
    where pg.guru_id = auth.uid()
      and pg.mapel_id = nilai_tengah_semester.mapel_id
      and pg.kelas_id = nilai_tengah_semester.kelas_id
      and pg.tahun_ajaran_id = nilai_tengah_semester.tahun_ajaran_id
  )
);

-- Wali kelas: boleh BACA (tidak menulis) nilai tengah semester semua
-- siswa di kelas yang diampunya — untuk kebutuhan rekap/laporan.
drop policy if exists "Wali kelas baca nilai tengah semester kelasnya" on public.nilai_tengah_semester;
create policy "Wali kelas baca nilai tengah semester kelasnya" on public.nilai_tengah_semester for select
using (
  exists (
    select 1 from public.wali_kelas wk
    where wk.guru_id = auth.uid()
      and wk.kelas_id = nilai_tengah_semester.kelas_id
      and wk.tahun_ajaran_id = nilai_tengah_semester.tahun_ajaran_id
  )
);

drop policy if exists "Admin kelola nilai_tengah_semester" on public.nilai_tengah_semester;
create policy "Admin kelola nilai_tengah_semester" on public.nilai_tengah_semester for all
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

create index if not exists idx_nilai_tengah_semester_scope
  on public.nilai_tengah_semester (guru_id, mapel_id, kelas_id, tahun_ajaran_id);
create index if not exists idx_nilai_tengah_semester_siswa
  on public.nilai_tengah_semester (siswa_id, tahun_ajaran_id);

-- =========================================================
-- CATATAN PEMAKAIAN:
-- Menu Guru → "Nilai Tengah Semester & Catatan KBM" → pilih mapel,
-- lalu pilih kelas → isi Nilai (opsional) dan Catatan Selama KBM
-- untuk tiap siswa → "Simpan Semua". Tombol "Unduh Template Excel"
-- menghasilkan file kosong (kolom NIS, Nama, Nilai, Catatan Selama
-- KBM) untuk diisi offline lalu diimpor lewat "Import dari Excel"
-- (dicocokkan berdasarkan NIS — baris dengan NIS yang tidak dikenal
-- di kelas tsb akan dilewati).
-- =========================================================
