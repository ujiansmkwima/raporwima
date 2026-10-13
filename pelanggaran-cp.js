// =========================================================
// PELANGGARAN-CP  —  membaca catatan pelanggaran dari aplikasi CP
//
// Aplikasi CP (Catatan Pelanggaran) menyimpan data di project Supabase
// TERPISAH dari raporwima (tabel pv_siswa, pv_catatan). Modul ini hanya
// MEMBACA (GET) tabel itu lewat REST + anon key, lalu mencocokkannya
// ke siswa raporwima:
//   1) NIS   (kalau pv_siswa.nis terisi), atau
//   2) nama  (huruf besar/kecil & spasi ganda diabaikan).
//
// Dipakai oleh: bukuinduk-core.js (Buku Induk admin & wali kelas),
// guru.html (menu Wali Kelas) dan siswa.html (menu Catatan Pelanggaran).
//
// Ganti dua nilai di bawah bila project CP berpindah.
// =========================================================
(function (g) {
  'use strict';

  var CP_URL = 'https://nrwexyezcbmsokelgkmp.supabase.co';
  var CP_KEY = 'sb_publishable_eKH7VdAJy17PjYuTL-3X9w_pKViejAd';

  var KOLOM = 'id,tanggal,tahun_ajaran,siswa_id,siswa_nama,kelas,kategori,pelanggaran,poin,keterangan,pelapor';
  var cache = {};

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function tgl(d) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || ''));
    if (!m) return String(d || '');
    var B = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return Number(m[3]) + ' ' + B[Number(m[2]) - 1] + ' ' + m[1];
  }
  // nilai untuk operator in.(...) PostgREST: dibungkus tanda kutip agar koma/kurung aman
  function q(v) { return '"' + String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"'; }

  async function get(path) {
    var semua = [], dari = 0;
    for (;;) {
      var r = await fetch(CP_URL + '/rest/v1/' + path, {
        headers: { apikey: CP_KEY, Authorization: 'Bearer ' + CP_KEY, Range: dari + '-' + (dari + 999) }
      });
      if (!r.ok) throw new Error('Database CP: ' + (await r.text()).slice(0, 200));
      var d = await r.json();
      semua = semua.concat(d);
      if (d.length < 1000) break;
      dari += 1000;
    }
    return semua;
  }
  function potong(arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  // list: [{ id, nis, nama }]  ->  { [siswa.id]: [catatan, ...] } (terbaru dulu)
  // Siswa tanpa catatan tetap ada di hasil dengan array kosong.
  async function ambil(list, opsi) {
    opsi = opsi || {};
    var hasil = {};
    list.forEach(function (s) { hasil[s.id] = []; });
    if (!list.length) return hasil;

    var kunci = 'v1|' + list.map(function (s) { return s.id; }).sort().join(',');
    if (!opsi.segar && cache[kunci]) return cache[kunci];

    var perNama = {}, perNis = {};
    list.forEach(function (s) {
      var n = norm(s.nama);
      (perNama[n] = perNama[n] || []).push(s);
      if (s.nis && String(s.nis).trim()) perNis[String(s.nis).trim()] = s;
    });

    // 1) catatan berdasarkan nama siswa (kolom siswa_nama sudah ada di pv_catatan)
    var namaAsli = {};
    list.forEach(function (s) { namaAsli[String(s.nama || '').trim()] = 1; });
    var cat = {};
    var tugas = potong(Object.keys(namaAsli), 40).map(function (p) {
      return get('pv_catatan?select=' + KOLOM + '&siswa_nama=in.(' + p.map(q).join(',') + ')&order=tanggal.desc,id.desc')
        .then(function (rows) { rows.forEach(function (r) { cat[r.id] = r; }); });
    });

    // 2) catatan berdasarkan NIS lewat pv_siswa (bila NIS terisi di CP)
    var pvNis = {};
    var nisList = Object.keys(perNis);
    if (nisList.length) {
      tugas = tugas.concat(potong(nisList, 60).map(function (p) {
        return get('pv_siswa?select=id,nis&nis=in.(' + p.map(q).join(',') + ')').then(async function (ps) {
          ps.forEach(function (x) { pvNis[x.id] = String(x.nis).trim(); });
          var ids = ps.map(function (x) { return x.id; });
          for (var c of potong(ids, 80)) {
            var rows = await get('pv_catatan?select=' + KOLOM + '&siswa_id=in.(' + c.join(',') + ')&order=tanggal.desc,id.desc');
            rows.forEach(function (r) { cat[r.id] = r; });
          }
        });
      }));
    }
    await Promise.all(tugas);

    Object.keys(cat).forEach(function (id) {
      var r = cat[id], s = null;
      var nis = pvNis[r.siswa_id];
      if (nis && perNis[nis]) s = perNis[nis];
      else {
        var kand = perNama[norm(r.siswa_nama)] || [];
        if (kand.length === 1) s = kand[0];
        else if (kand.length > 1) {
          // nama kembar: pakai kelas kalau ada yang cocok, kalau tidak lewati (hindari salah orang)
          var cocok = kand.filter(function (x) { return x.kelasNama && norm(x.kelasNama) === norm(r.kelas); });
          if (cocok.length === 1) s = cocok[0];
        }
      }
      if (s) hasil[s.id].push(r);
    });
    Object.keys(hasil).forEach(function (id) {
      hasil[id].sort(function (a, b) { return String(b.tanggal).localeCompare(String(a.tanggal)) || (b.id - a.id); });
    });
    cache[kunci] = hasil;
    return hasil;
  }

  function totalPoin(rows) { return rows.reduce(function (t, r) { return t + (Number(r.poin) || 0); }, 0); }

  // Tabel catatan dikelompokkan per tahun ajaran (terbaru di atas).
  // opsi.pelapor: tampilkan kolom "Dicatat oleh" (untuk guru/admin saja)
  function tabelHtml(rows, opsi) {
    opsi = opsi || {};
    if (!rows.length) return '<div class="panel-note">Tidak ada catatan pelanggaran.</div>';
    var grup = {}, urut = [];
    rows.forEach(function (r) {
      var k = r.tahun_ajaran || '-';
      if (!grup[k]) { grup[k] = []; urut.push(k); }
      grup[k].push(r);
    });
    urut.sort().reverse();
    return urut.map(function (k) {
      var a = grup[k];
      return '<div class="section-title" style="margin-top:14px;">Tahun Ajaran ' + esc(k) +
        ' <span class="chip chip--danger" style="margin-left:6px;">' + a.length + ' catatan · ' + totalPoin(a) + ' poin</span></div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Pelanggaran</th><th>Poin</th><th>Keterangan</th>' +
        (opsi.pelapor ? '<th>Dicatat oleh</th>' : '') + '</tr></thead><tbody>' +
        a.map(function (r) {
          return '<tr><td>' + esc(tgl(r.tanggal)) + '</td><td>' + esc(r.kategori || '—') + '</td><td>' + esc(r.pelanggaran) + '</td><td>' + esc(r.poin) + '</td><td>' + esc(r.keterangan || '—') + '</td>' +
            (opsi.pelapor ? '<td>' + esc(r.pelapor || '—') + '</td>' : '') + '</tr>';
        }).join('') + '</tbody></table></div>';
    }).join('');
  }

  // Versi cetak (kelas .g dipakai tabel di cetak Buku Induk)
  function tabelCetak(rows) {
    if (!rows.length) return '<div class="kosongnote">Tidak ada catatan pelanggaran.</div>';
    return '<table class="g"><thead><tr><th style="width:15%;">Tanggal</th><th style="width:16%;">Kategori</th><th>Pelanggaran</th><th style="width:8%;">Poin</th><th style="width:22%;">Keterangan</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(tgl(r.tanggal)) + '</td><td>' + esc(r.kategori || '') + '</td><td>' + esc(r.pelanggaran) + '</td><td style="text-align:center;">' + esc(r.poin) + '</td><td>' + esc(r.keterangan || '') + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div style="margin-top:3px;font-size:8.5pt;">Total: <b>' + rows.length + '</b> catatan, <b>' + totalPoin(rows) + '</b> poin.</div>';
  }

  g.PelanggaranCP = { ambil: ambil, totalPoin: totalPoin, tabelHtml: tabelHtml, tabelCetak: tabelCetak, tgl: tgl };
})(window);
