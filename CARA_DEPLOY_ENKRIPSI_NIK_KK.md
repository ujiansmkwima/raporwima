# Enkripsi NIK & No. KK — cara pasang

NIK dan No. KK di tabel `bi_siswa_detail` disimpan terenkripsi (`enc:...`). Aplikasi tetap menampilkan angka asli.

## Urutan pasang (penting: SQL dulu, baru upload)
1. (Opsional tapi disarankan) buka `migrasi_enkripsi_nik_kk.sql`, aktifkan langkah 0 (cadangan) lalu jalankan.
2. Supabase → SQL Editor → jalankan **migrasi_enkripsi_nik_kk.sql** seluruhnya (aman diulang).
3. Jalankan query langkah 7 untuk melihat kunci `bi_key`, **simpan di password manager**. Kunci hilang = NIK/KK tidak bisa dipulihkan.
4. Jalankan pemeriksaan langkah 8a (harus 0). Lalu `drop table zz_backup_nik_kk` bila cadangan dibuat.
5. Upload ke GitHub Pages: `bukuinduk-core.js`, `bukuinduk-admin.html`, `bukuinduk-guru.html`, `guru.html`.
6. Muat ulang aplikasi (Ctrl+F5), buka satu siswa: NIK harus tampil angka asli; di Table Editor tampil `enc:...`.

## Cara kerja
- Simpan: aplikasi mengirim angka biasa → trigger `bi_enkripsi_nik_kk` mengenkripsi (pgcrypto, kunci di Supabase Vault).
- Baca: aplikasi mengambil `enc:...` lalu memanggil `rpc('bi_dekripsi')` — hanya admin & wali kelas.
- Impor/ekspor Excel, cetak biodata, dan form Buku Induk otomatis ikut (membaca lewat `BI.muatSiswa`).

## Catatan
- NIK/KK tidak bisa dicari atau dicek unik langsung di SQL (hasil enkripsi acak tiap simpan). Pencarian di aplikasi memakai nama/NIS/NISN, tidak terpengaruh.
- Pemilik proyek Supabase tetap bisa mendekripsi lewat SQL Editor; enkripsi ini melindungi dari orang yang hanya melihat tabel/ekspor data, bukan dari pemilik akun.
- Urutan SQL dulu baru upload: bila aplikasi baru diupload sebelum SQL, aplikasi tetap jalan (belum ada data `enc:`).
  Bila SQL dijalankan tapi aplikasi lama belum diganti, NIK akan tampil `enc:...` — jangan simpan formulir sebelum upload.
- Rollback: lihat bagian bawah file SQL.
