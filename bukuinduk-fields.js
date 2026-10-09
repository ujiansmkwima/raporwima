/* bukuinduk-fields.js
 * -----------------------------------------------------------------
 * Daftar isian Buku Induk Siswa. SATU-SATUNYA sumber kebenaran untuk:
 *   - form isian (Identitas, Orang Tua & Wali, Pendidikan, Keluar Sekolah)
 *   - kolom Excel (unduh & impor)
 *   - cetak Buku Induk
 *   - perhitungan kelengkapan data
 *
 * Tiap isian punya:
 *   k    : nama kolom di database
 *   l    : label yang tampil
 *   t    : tabel penyimpanan
 *            'siswa'  -> tabel siswa (DIPAKAI BERSAMA E-Rapor: ubah di sini
 *                        = ubah juga di E-Rapor & sebaliknya)
 *            'detail' -> tabel bi_siswa_detail (isian tambahan Buku Induk)
 *   tipe : text | date | number | select | textarea   (default text)
 *   opsi : pilihan untuk tipe select
 *   wajib: dihitung dalam "Kelengkapan Data"
 *   full : isian selebar penuh
 *   db   : tipe kolom SQL (khusus 'detail', dipakai pembuat migrasi)
 *
 * File ini juga bisa dibaca Node (module.exports) supaya
 * migrasi_buku_induk.sql dibuat dari daftar yang sama.
 * -----------------------------------------------------------------
 */
(function (global) {
  'use strict';

  var AGAMA = ['Islam', 'Kristen', 'Katolik', 'Hindu', 'Buddha', 'Konghucu'];
  var PENDIDIKAN = ['Tidak sekolah', 'SD/sederajat', 'SMP/sederajat', 'SMA/SMK/sederajat', 'D1/D2/D3', 'S1/D4', 'S2', 'S3'];
  var PENGHASILAN = ['< Rp 1.000.000', 'Rp 1.000.000 - 2.000.000', 'Rp 2.000.000 - 5.000.000', 'Rp 5.000.000 - 10.000.000', '> Rp 10.000.000', 'Tidak berpenghasilan'];

  var TAB = [
    {
      id: 'identitas', judul: 'Identitas Siswa', bagian: [
        {
          judul: 'A. Keterangan Pribadi', fields: [
            { k: 'nama', l: 'Nama Lengkap', t: 'siswa', wajib: true, full: true },
            { k: 'nis', l: 'NIS', t: 'siswa', wajib: true, adminSaja: true },
            { k: 'nisn', l: 'NISN', t: 'siswa', wajib: true, adminSaja: true },
            { k: 'nik', l: 'NIK', t: 'detail', wajib: true },
            { k: 'no_kk', l: 'No. Kartu Keluarga', t: 'detail' },
            { k: 'tempat_lahir', l: 'Tempat Lahir', t: 'siswa', wajib: true },
            { k: 'tanggal_lahir', l: 'Tanggal Lahir', t: 'siswa', tipe: 'date', wajib: true },
            { k: 'jenis_kelamin', l: 'Jenis Kelamin', t: 'siswa', tipe: 'select', opsi: ['L', 'P'], wajib: true },
            { k: 'agama', l: 'Agama', t: 'siswa', tipe: 'select', opsi: AGAMA, wajib: true },
            { k: 'kewarganegaraan', l: 'Kewarganegaraan', t: 'detail', tipe: 'select', opsi: ['WNI', 'WNA'] },
            { k: 'status_keluarga', l: 'Status dalam Keluarga', t: 'siswa', tipe: 'select', opsi: ['Anak Kandung', 'Anak Tiri', 'Anak Angkat'] },
            { k: 'anak_ke', l: 'Anak ke-', t: 'siswa', tipe: 'number' },
            { k: 'jumlah_saudara', l: 'Jumlah Saudara', t: 'detail', tipe: 'number', db: 'integer' },
            { k: 'bahasa_sehari', l: 'Bahasa Sehari-hari', t: 'detail' },
            { k: 'hobi', l: 'Hobi / Kesenian / Olahraga', t: 'detail' },
            { k: 'email_siswa', l: 'Email Siswa', t: 'detail' }
          ]
        },
        {
          judul: 'B. Tempat Tinggal', fields: [
            { k: 'alamat_siswa', l: 'Alamat (Jalan / Dusun / RT RW)', t: 'siswa', tipe: 'textarea', wajib: true, full: true },
            { k: 'kelurahan', l: 'Desa / Kelurahan', t: 'detail' },
            { k: 'kecamatan', l: 'Kecamatan', t: 'detail' },
            { k: 'kab_kota', l: 'Kabupaten / Kota', t: 'detail' },
            { k: 'provinsi', l: 'Provinsi', t: 'detail' },
            { k: 'kode_pos', l: 'Kode Pos', t: 'detail' },
            { k: 'no_telp_siswa', l: 'No. Telepon / HP Siswa', t: 'siswa' },
            { k: 'tinggal_dengan', l: 'Tinggal Bersama', t: 'detail', tipe: 'select', opsi: ['Orang Tua', 'Wali', 'Kos', 'Asrama', 'Panti Asuhan', 'Lainnya'] },
            { k: 'jarak_sekolah', l: 'Jarak ke Sekolah (km)', t: 'detail' },
            { k: 'transportasi', l: 'Transportasi ke Sekolah', t: 'detail', tipe: 'select', opsi: ['Jalan kaki', 'Sepeda', 'Sepeda motor', 'Mobil pribadi', 'Angkutan umum', 'Antar jemput', 'Lainnya'] }
          ]
        },
        {
          judul: 'C. Kesehatan', fields: [
            { k: 'golongan_darah', l: 'Golongan Darah', t: 'detail', tipe: 'select', opsi: ['A', 'B', 'AB', 'O', 'Tidak tahu'] },
            { k: 'tinggi_badan', l: 'Tinggi Badan (cm)', t: 'detail', tipe: 'number', db: 'numeric(5,1)' },
            { k: 'berat_badan', l: 'Berat Badan (kg)', t: 'detail', tipe: 'number', db: 'numeric(5,1)' },
            { k: 'riwayat_penyakit', l: 'Riwayat Penyakit / Kelainan', t: 'detail', tipe: 'textarea', full: true }
          ]
        }
      ]
    },
    {
      id: 'ortu', judul: 'Orang Tua & Wali', bagian: [
        {
          judul: 'D. Ayah Kandung', fields: [
            { k: 'nama_ayah', l: 'Nama Ayah', t: 'siswa', wajib: true },
            { k: 'ayah_tahun_lahir', l: 'Tahun Lahir', t: 'detail' },
            { k: 'ayah_pendidikan', l: 'Pendidikan Terakhir', t: 'detail', tipe: 'select', opsi: PENDIDIKAN },
            { k: 'pekerjaan_ayah', l: 'Pekerjaan', t: 'siswa' },
            { k: 'ayah_penghasilan', l: 'Penghasilan per Bulan', t: 'detail', tipe: 'select', opsi: PENGHASILAN }
          ]
        },
        {
          judul: 'E. Ibu Kandung', fields: [
            { k: 'nama_ibu', l: 'Nama Ibu', t: 'siswa', wajib: true },
            { k: 'ibu_tahun_lahir', l: 'Tahun Lahir', t: 'detail' },
            { k: 'ibu_pendidikan', l: 'Pendidikan Terakhir', t: 'detail', tipe: 'select', opsi: PENDIDIKAN },
            { k: 'pekerjaan_ibu', l: 'Pekerjaan', t: 'siswa' },
            { k: 'ibu_penghasilan', l: 'Penghasilan per Bulan', t: 'detail', tipe: 'select', opsi: PENGHASILAN }
          ]
        },
        {
          judul: 'Alamat & Kontak Orang Tua', fields: [
            { k: 'alamat_ortu', l: 'Alamat Orang Tua', t: 'siswa', tipe: 'textarea', full: true },
            { k: 'no_telp_ortu', l: 'No. Telepon / HP Orang Tua', t: 'siswa', wajib: true }
          ]
        },
        {
          judul: 'F. Wali (jika ada)', fields: [
            { k: 'nama_wali', l: 'Nama Wali', t: 'siswa' },
            { k: 'wali_hubungan', l: 'Hubungan dengan Siswa', t: 'detail' },
            { k: 'wali_pendidikan', l: 'Pendidikan Terakhir', t: 'detail', tipe: 'select', opsi: PENDIDIKAN },
            { k: 'pekerjaan_wali', l: 'Pekerjaan', t: 'siswa' },
            { k: 'wali_penghasilan', l: 'Penghasilan per Bulan', t: 'detail', tipe: 'select', opsi: PENGHASILAN },
            { k: 'no_telp_wali', l: 'No. Telepon / HP Wali', t: 'siswa' },
            { k: 'alamat_wali', l: 'Alamat Wali', t: 'siswa', tipe: 'textarea', full: true }
          ]
        }
      ]
    },
    {
      id: 'pendidikan', judul: 'Pendidikan & Penerimaan', bagian: [
        {
          judul: 'G. Pendidikan Sebelumnya', fields: [
            { k: 'sekolah_asal', l: 'Asal Sekolah (SMP/MTs)', t: 'siswa', wajib: true, full: true },
            { k: 'tahun_lulus_smp', l: 'Tahun Lulus', t: 'detail' },
            { k: 'no_ijazah_smp', l: 'No. Ijazah SMP/MTs', t: 'detail' }
          ]
        },
        {
          judul: 'H. Diterima di Sekolah Ini', fields: [
            { k: 'diterima_sebagai', l: 'Diterima Sebagai', t: 'detail', tipe: 'select', opsi: ['Peserta didik baru', 'Pindahan'] },
            { k: 'no_pendaftaran', l: 'No. Pendaftaran', t: 'detail' },
            { k: 'tanggal_masuk', l: 'Tanggal Diterima', t: 'siswa', tipe: 'date', wajib: true },
            { k: 'kelas_masuk', l: 'Diterima di Kelas', t: 'siswa', wajib: true },
            { k: 'program_keahlian_masuk', l: 'Program / Konsentrasi Keahlian', t: 'detail', full: true },
            { k: 'pindahan_dari', l: 'Pindahan dari Sekolah (jika pindahan)', t: 'detail', full: true },
            { k: 'pindahan_alasan', l: 'Alasan Pindah ke Sekolah Ini', t: 'detail', full: true }
          ]
        }
      ]
    },
    {
      id: 'keluar', judul: 'Keluar Sekolah', bagian: [
        {
          judul: 'I. Meninggalkan Sekolah', fields: [
            { k: 'status', l: 'Status Siswa', t: 'siswa', tipe: 'select', opsi: ['aktif', 'lulus', 'pindah', 'keluar'], adminSaja: true },
            { k: 'alasan_keluar', l: 'Alasan Meninggalkan Sekolah', t: 'detail', tipe: 'select', opsi: ['Tamat belajar', 'Pindah sekolah', 'Putus sekolah', 'Dikeluarkan', 'Meninggal dunia', 'Lainnya'] },
            { k: 'tanggal_keluar', l: 'Tanggal Keluar / Lulus', t: 'detail', tipe: 'date', db: 'date' },
            { k: 'tujuan_pindah', l: 'Pindah ke Sekolah (jika pindah)', t: 'detail', full: true },
            { k: 'no_ijazah', l: 'No. Ijazah SMK', t: 'detail' },
            { k: 'tanggal_ijazah', l: 'Tanggal Ijazah', t: 'detail', tipe: 'date', db: 'date' },
            { k: 'melanjutkan_ke', l: 'Setelah Lulus: Melanjutkan / Bekerja di', t: 'detail', full: true },
            { k: 'keterangan_keluar', l: 'Keterangan Lain', t: 'detail', tipe: 'textarea', full: true }
          ]
        },
        {
          judul: 'J. Catatan Khusus', fields: [
            { k: 'catatan_khusus', l: 'Catatan Khusus tentang Siswa', t: 'detail', tipe: 'textarea', full: true }
          ]
        }
      ]
    }
  ];

  var KATEGORI_CATATAN = ['Prestasi', 'Beasiswa', 'Pelanggaran / Pembinaan', 'Catatan Wali Kelas', 'Lainnya'];

  var semua = [];
  TAB.forEach(function (tb) { tb.bagian.forEach(function (bg) { bg.fields.forEach(function (f) { f.tipe = f.tipe || 'text'; semua.push(f); }); }); });

  var api = { TAB: TAB, SEMUA: semua, KATEGORI_CATATAN: KATEGORI_CATATAN, AGAMA: AGAMA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.BI_FIELDS = api;
})(typeof window !== 'undefined' ? window : this);
