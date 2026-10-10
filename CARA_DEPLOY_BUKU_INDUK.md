# Buku Induk — cara pasang

## Alur pakai
Login (index.html) → **Menu Utama** (portal.html): Buku Induk · E-Rapor · Supervisi.
- Admin  → bukuinduk-admin.html
- Guru   → bukuinduk-guru.html (khusus **wali kelas**; guru biasa melihat pesan "khusus wali kelas")

## Pasang
1. Supabase → SQL Editor → jalankan **migrasi_buku_induk.sql** (aman diulang).
2. Upload ke GitHub Pages file baru/diubah:
   - baru: portal.html, bukuinduk-admin.html, bukuinduk-guru.html, bukuinduk-core.js, bukuinduk-fields.js, migrasi_buku_induk.sql
   - diubah: index.html, guru.html, admin.html, supervisi.html, supervisi-admin.html

## Foto Saat Masuk & Saat Lulus
Tab Identitas Siswa punya dua foto 3×4: **Foto Saat Masuk** (kolom `foto`) dan **Foto Saat Lulus** (kolom `foto_lulus`). Keduanya tampil di kartu identitas pada hasil cetak; bila belum ada foto, cetak menampilkan kotak putus-putus "Tempel foto 3 × 4".
Pasang: jalankan ulang **migrasi_buku_induk.sql** (menambah kolom `foto_lulus`, aman diulang), lalu upload bukuinduk-core.js, bukuinduk-admin.html, bukuinduk-guru.html.

## PKL di Buku Induk
PKL diperlakukan sebagai **mata pelajaran**: nilai akhirnya (rata-rata nilai DUDI & penguji, sama dengan E-Rapor; kosong bila salah satu belum diisi) masuk sebagai baris "Praktik Kerja Lapangan (PKL)" pada **semester 6** di tabel nilai, ikut dihitung dalam rata-rata semester 6. Tidak ada lagi kolom PKL terpisah. Klik **Tarik Ulang dari E-Rapor** agar nilai PKL muncul. Untuk semester manual, tulis di kolom Nilai Mapel semester 6: `Praktik Kerja Lapangan (PKL) | 85`.

## Kokurikuler di Buku Induk
Nilai kokurikuler dari E-Rapor (tabel `nilai_kokurikuler`: nama kegiatan + deskripsi capaian) ikut diarsipkan per semester di kolom `kokurikuler` pada `bi_riwayat_semester`. Tampil di tab Perkembangan Belajar dan di cetak sebagai bagian "L. Kokurikuler" (Tahun Ajaran, Semester, Nama Kegiatan, Deskripsi). Untuk semester yang sudah terarsip, klik **Tarik Ulang dari E-Rapor** (atau menu Sinkron dari E-Rapor) supaya kokurikuler terisi. Semester manual bisa mengisi kokurikuler lewat kolom "Kokurikuler" (format `Nama Kegiatan | Deskripsi`).
Pasang: jalankan ulang migrasi_buku_induk.sql, lalu upload bukuinduk-core.js.

## Sinkron dengan E-Rapor
- Biodata dasar (nama, NIS/NISN, TTL, alamat, orang tua, wali, asal sekolah, tanggal masuk, status) memakai tabel `siswa` yang SAMA dengan E-Rapor → diubah di mana pun, langsung sama di aplikasi satunya.
- Isian tambahan Buku Induk (NIK, kesehatan, pendidikan/penghasilan orang tua, data lulus/keluar, foto, catatan khusus) → tabel `bi_siswa_detail`.
- Nilai rapor, kehadiran, ekskul, PKL tiap semester ditarik dari E-Rapor → arsip `bi_riwayat_semester` (menu "Sinkron dari E-Rapor", atau otomatis saat tab Perkembangan Belajar siswa dibuka). Semester yang diisi manual dikunci dan tidak ditimpa.

## Hak akses
- Admin: semua siswa. Wali kelas: hanya siswa kelasnya pada tahun ajaran aktif (NIS/NISN & status hanya bisa diubah admin di layar).
- Guru lain tidak bisa membaca data Buku Induk.

## Excel (template & impor)
Menu **Excel** (admin & wali kelas): Template Isian (berisi daftar siswa), Template Kosong (admin, siswa baru), Data Saat Ini, lalu Impor.
File Excel berformat tabel bergaris: judul, pita bagian, header (oranye = isian pokok), dropdown pilihan, filter, baris beku, sheet Petunjuk.
Impor mencocokkan lewat NIS (cadangan NISN), menampilkan ringkasan + peringatan sebelum "Terapkan". Admin bisa mencentang "tambahkan siswa baru bila NIS belum ada".

Opsi **"timpa data yang sudah ada"**: bila TIDAK dicentang (bawaan), impor hanya mengisi isian yang masih kosong dan isian yang sudah terisi di sistem dibiarkan (ringkasan menampilkan jumlah yang dilewati). Bila dicentang, isian di Excel menggantikan data lama. Sel Excel yang kosong tidak pernah menghapus data. Mengubah centang langsung menghitung ulang pratinjau dari file yang sama.
Butuh library ExcelJS dari cdnjs (sudah ditambahkan di bukuinduk-admin.html & bukuinduk-guru.html).

## Admin E-Rapor: Tarik dari Buku Induk
admin.html → menu **Tarik dari Buku Induk**: menarik nilai & kehadiran semester yang diisi MANUAL di Buku Induk (tahun lama / pindahan) ke tabel E-Rapor (nilai, rekap_presensi). Biodata tidak perlu ditarik (tabel siswa sama). Mapel dicocokkan lewat nama, tahun ajaran harus sudah ada di E-Rapor; nilai yang sudah ada tidak ditimpa kecuali dicentang.

## Penempatan kelas lewat impor Excel (admin)
Kolom **Kelas** di template dibaca saat impor: siswa baru, atau siswa yang belum punya kelas di tahun ajaran aktif, otomatis ditempatkan (tabel siswa_kelas). Siswa yang sudah punya kelas tidak dipindah (muncul peringatan). Nama kelas harus sama dengan data Kelas E-Rapor; di template kolom ini berupa dropdown.


Catatan NISN: NIS tidak bisa diubah lewat impor (dipakai sebagai kunci pencocokan). NISN bisa diperbarui oleh admin bila siswa dicocokkan lewat NIS; jika NISN lama sudah terisi, centang "timpa data yang sudah ada". Wali kelas tidak bisa mengubah NISN lewat impor.
