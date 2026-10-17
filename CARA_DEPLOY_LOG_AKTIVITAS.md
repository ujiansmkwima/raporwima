# Log Aktivitas — cara pasang

1. Supabase Dashboard → SQL Editor → jalankan **migrasi_log_aktivitas.sql** (aman diulang).
2. Upload file yang berubah ke hosting: `admin.html`, `guru.html`, `siswa.html`, `portal.html`, `pkl.html`,
   `pelanggaran.html`, `supervisi.html`, `supervisi-admin.html`, `index.html`, `supabase-client.js`,
   `bukuinduk-core.js`, `pdf-cetak.js`.
3. Buka **Admin → Lainnya → Log Aktivitas**.

## Yang dicatat
- **Otomatis (trigger database):** tambah / ubah / hapus pada nilai rapor, nilai TP, nilai tengah semester,
  kokurikuler, ekskul, PKL, presensi & catatan wali, tujuan pembelajaran, data siswa, penempatan kelas,
  kelas, mapel, penugasan, wali kelas, PJ kokurikuler, tahun ajaran, profil sekolah, terbit rapor, akun guru/admin.
  Simpan ulang tanpa perubahan nilai tidak dicatat. Perubahan beruntun oleh pengguna sama dalam 2 menit digabung.
- **Dari aplikasi:** login, logout, cetak (rapor, identitas, PKL, cover, data sekolah, NTS, analisis), unduh PDF.

## Catatan
- Hanya admin yang bisa melihat log. Tidak ada yang bisa mengubah/menghapus log lewat API
  (kecuali admin lewat tombol **Bersihkan log lama**, minimal 7 hari).
- NIK/No. KK, kata sandi, dan kolom ID tidak ikut tercatat di rincian.
- Login yang GAGAL tidak tercatat (belum ada sesi, jadi database tidak bisa menerima catatannya).
- Perubahan yang dilakukan langsung dari SQL Editor tercatat sebagai pengguna "Sistem / SQL Editor".
- Menambah tabel lain ke log: tambahkan barisnya di daftar bagian 5 pada migrasi, lalu jalankan ulang.
