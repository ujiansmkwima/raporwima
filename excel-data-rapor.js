/* -----------------------------------------------------------------
 * Unduh SELURUH DATA RAPOR (Admin): SEMUA KELAS sekaligus -> 1 file ZIP
 * berisi 1 file Excel per kelas (format & kop sama seperti Rekap Nilai/Leger).
 * Tiap file Excel berisi sheet "Rekap Nilai", "Rekap Rapor", lalu 1 sheet
 * per siswa (isi kartu rapor lengkap termasuk capaian kompetensi).
 * Penyusunan file Excel ada di excel-rekap.js (buatBlobDataRaporKelas).
 *
 * Dipakai: DataRaporExcel.unduh({ tahunAjaran, kelasList, onProgress })
 * ----------------------------------------------------------------- */
(function (global) {
  'use strict';

  var GARIS = { style: 'thin', color: { argb: 'FF999999' } };
  var BORDER = { top: GARIS, left: GARIS, bottom: GARIS, right: GARIS };
  var ISI_HEADER = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };

  function sb() { return global.supabaseClient; }

  function hitungSemesterKe(tingkat, semester) {
    if (!tingkat || !semester) return null;
    var basis = (Number(tingkat) - 10) * 2;
    if (semester === 'Gasal') return basis + 1;
    if (semester === 'Genap') return basis + 2;
    return null;
  }

  function isPendidikanAgama(nama) { return /pendidikan\s+agama/i.test(nama || ''); }
  function namaMapelUntukSiswa(nama, agama) {
    if (!isPendidikanAgama(nama) || !agama) return nama;
    return 'Pendidikan Agama ' + agama + (/dan budi pekerti/i.test(nama) ? ' dan Budi Pekerti' : '');
  }

  function namaFileAman(s) {
    return String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').slice(0, 60);
  }

  function faseDariTingkat(t) { t = Number(t); return t === 10 ? 'E' : ((t === 11 || t === 12) ? 'F' : '—'); }

  // Supabase membatasi 1000 baris per permintaan -> ambil bertahap.
  async function ambilSemua(buatQuery) {
    var hasil = [];
    for (var dari = 0; ; dari += 1000) {
      var r = await buatQuery().range(dari, dari + 999);
      if (r.error) throw r.error;
      var data = r.data || [];
      hasil = hasil.concat(data);
      if (data.length < 1000) break;
    }
    return hasil;
  }

  async function ambilPerPotong(ids, buat) {
    var hasil = [];
    for (var i = 0; i < ids.length; i += 60) {
      hasil = hasil.concat(await ambilSemua(function () { return buat(ids.slice(i, i + 60)); }));
    }
    return hasil;
  }

  async function unduh(opts) {
    var ta = opts.tahunAjaran;
    var kelasList = opts.kelasList || [];
    var onProgress = opts.onProgress || function () {};
    if (!ta) throw new Error('Tahun ajaran belum dipilih.');
    if (!kelasList.length) throw new Error('Belum ada kelas.');
    if (!global.RekapExcel || !global.RekapExcel.buatBlobDataRaporKelas) throw new Error('excel-rekap.js belum termuat. Muat ulang halaman (Ctrl+F5).');

    var profilRes = await sb().from('profil_sekolah').select('*').maybeSingle();
    var profil = profilRes.data || {};

    var mapelSemua = await ambilSemua(function () {
      return sb().from('mata_pelajaran')
        .select('id, nama, jenis_mapel, urutan_rapor, berlaku_untuk, berlaku_semester, agama_spesifik').order('id');
    });
    var msRows = await ambilSemua(function () { return sb().from('mapel_semester').select('mapel_id, semester_ke').order('mapel_id'); });
    var mapelSemesterSet = {};
    msRows.forEach(function (r) { (mapelSemesterSet[r.mapel_id] = mapelSemesterSet[r.mapel_id] || []).push(r.semester_ke); });

    var berkas = [], totalSiswa = 0, dipakai = {};

    for (var ki = 0; ki < kelasList.length; ki++) {
      var kelas = kelasList[ki];
      onProgress('Kelas ' + kelas.nama + ' (' + (ki + 1) + '/' + kelasList.length + ')...');

      var sk = await ambilSemua(function () {
        return sb().from('siswa_kelas')
          .select('siswa:siswa_id(id, nis, nisn, nama, agama)')
          .eq('kelas_id', kelas.id).eq('tahun_ajaran_id', ta.id).order('id');
      });
      var siswaList = sk.map(function (r) { return r.siswa; }).filter(Boolean);
      siswaList.sort(function (a, b) { return (a.nama || '').localeCompare(b.nama || ''); });
      if (!siswaList.length) continue; // kelas kosong dilewati
      totalSiswa += siswaList.length;
      var ids = siswaList.map(function (s) { return s.id; });

      var waliRes = await sb().from('wali_kelas').select('guru:guru_id(nama)')
        .eq('kelas_id', kelas.id).eq('tahun_ajaran_id', ta.id).maybeSingle();
      var waliNama = (waliRes.data && waliRes.data.guru && waliRes.data.guru.nama) || null;

      // Mapel yang berlaku untuk kelas ini (aturan sama dengan Cetak Rapor).
      var mkRes = await sb().from('mapel_kelas').select('mapel_id').eq('kelas_id', kelas.id);
      var mkSet = {}; (mkRes.data || []).forEach(function (r) { mkSet[r.mapel_id] = true; });
      var muRes = await sb().from('mapel_urutan_kelas').select('mapel_id, urutan_rapor').eq('kelas_id', kelas.id);
      var urutanKelas = {}; (muRes.data || []).forEach(function (r) { urutanKelas[r.mapel_id] = r.urutan_rapor; });
      var semesterKe = hitungSemesterKe(kelas.tingkat, ta.semester);
      var urutan = function (m) {
        if (urutanKelas[m.id] !== undefined && urutanKelas[m.id] !== null) return urutanKelas[m.id];
        return (m.urutan_rapor === null || m.urutan_rapor === undefined) ? 9999 : m.urutan_rapor;
      };
      var urutkan = function (a, b) { var d = urutan(a) - urutan(b); return d !== 0 ? d : a.nama.localeCompare(b.nama); };
      var mapelKelas = mapelSemua.filter(function (m) {
        if (m.berlaku_untuk === 'tertentu' && !mkSet[m.id]) return false;
        if (m.berlaku_semester === 'tertentu' && semesterKe && (mapelSemesterSet[m.id] || []).indexOf(semesterKe) === -1) return false;
        return true;
      });
      var mapelUmum = mapelKelas.filter(function (m) { return m.jenis_mapel !== 'kejuruan'; }).sort(urutkan);
      var mapelKejuruan = mapelKelas.filter(function (m) { return m.jenis_mapel === 'kejuruan'; }).sort(urutkan);

      var nilai = await ambilPerPotong(ids, function (p) {
        return sb().from('nilai').select('siswa_id, mapel_id, nilai, capaian_pembelajaran')
          .in('siswa_id', p).eq('tahun_ajaran_id', ta.id).eq('jenis', 'rapor').order('id');
      });
      var nilaiMap = {};
      nilai.forEach(function (r) { (nilaiMap[r.siswa_id] = nilaiMap[r.siswa_id] || {})[r.mapel_id] = r; });

      var ekSiswa = await ambilPerPotong(ids, function (p) {
        return sb().from('ekstrakurikuler_siswa').select('siswa_id, ekstrakurikuler:ekstrakurikuler_id(id, nama)')
          .in('siswa_id', p).eq('tahun_ajaran_id', ta.id).order('id');
      });
      var ekNilai = await ambilPerPotong(ids, function (p) {
        return sb().from('nilai_ekstrakurikuler').select('siswa_id, ekstrakurikuler_id, predikat, deskripsi')
          .in('siswa_id', p).eq('tahun_ajaran_id', ta.id).order('id');
      });
      var ekNilaiMap = {}; ekNilai.forEach(function (r) { ekNilaiMap[r.siswa_id + '|' + r.ekstrakurikuler_id] = r; });
      var ekskulMap = {};
      ekSiswa.forEach(function (r) {
        if (!r.ekstrakurikuler) return;
        var n = ekNilaiMap[r.siswa_id + '|' + r.ekstrakurikuler.id] || {};
        (ekskulMap[r.siswa_id] = ekskulMap[r.siswa_id] || []).push({ nama: r.ekstrakurikuler.nama, predikat: n.predikat || '', deskripsi: n.deskripsi || '' });
      });

      var koku = await ambilPerPotong(ids, function (p) {
        return sb().from('nilai_kokurikuler').select('siswa_id, nama_kegiatan, deskripsi')
          .in('siswa_id', p).eq('kelas_id', kelas.id).eq('tahun_ajaran_id', ta.id).order('id');
      });
      var kokuMap = {};
      koku.forEach(function (r) { (kokuMap[r.siswa_id] = kokuMap[r.siswa_id] || []).push(r); });

      var presensi = await ambilPerPotong(ids, function (p) {
        return sb().from('rekap_presensi').select('siswa_id, jumlah_sakit, jumlah_izin, jumlah_alpha, catatan_wali_kelas')
          .in('siswa_id', p).eq('kelas_id', kelas.id).eq('tahun_ajaran_id', ta.id).order('id');
      });
      var presMap = {}; presensi.forEach(function (r) { presMap[r.siswa_id] = r; });

      var blob = await global.RekapExcel.buatBlobDataRaporKelas({
        profilSekolah: profil, tahunAjaran: ta, kelas: kelas, waliKelasNama: waliNama,
        fase: faseDariTingkat(kelas.tingkat), semesterKe: semesterKe,
        siswaList: siswaList, mapelUmum: mapelUmum, mapelKejuruan: mapelKejuruan,
        namaMapelFn: namaMapelUntukSiswa,
        nilaiMap: nilaiMap, ekskulMap: ekskulMap, kokuMap: kokuMap, presMap: presMap
      });
      var nama = 'data_rapor_' + namaFileAman(kelas.nama) + '.xlsx';
      if (dipakai[nama]) nama = nama.replace(/\.xlsx$/, '') + '_' + (++dipakai[nama]) + '.xlsx'; else dipakai[nama] = 1;
      berkas.push({ nama: nama, blob: blob });
    }

    if (!berkas.length) throw new Error('Tidak ada siswa di semua kelas pada tahun ajaran ini.');

    onProgress('Membuat file ZIP...');
    var namaZip = 'data_rapor_semua_kelas_' + namaFileAman(ta.nama) + '_' + namaFileAman(ta.semester) + '.zip';
    await global.RekapExcel.unduhZipBerkas(berkas, namaZip);
    return { siswa: totalSiswa, kelas: berkas.length, namaFile: namaZip };
  }

  global.DataRaporExcel = { unduh: unduh };
})(window);
