/* bukuinduk-core.js
 * -----------------------------------------------------------------
 * Logika bersama Buku Induk (dipakai bukuinduk-guru.html untuk wali
 * kelas dan bukuinduk-admin.html untuk admin).
 *
 * Alur data:
 *   E-Rapor -> Buku Induk : nilai, presensi, ekskul, kokurikuler per semester (PKL = mapel di semester 6)
 *                           DITARIK lalu diarsipkan (bi_riwayat_semester).
 *   Buku Induk <-> E-Rapor: biodata dasar memakai tabel `siswa` yang sama,
 *                           jadi perubahan di mana pun langsung terlihat
 *                           di aplikasi satunya.
 *
 * Dimuat SETELAH: supabase-client.js, bukuinduk-fields.js, xlsx
 * (SheetJS) dan xlsx-autofit.js.
 *
 * Konteks diisi halaman: BI.ctx = { admin, userId, nama, ta, kelasWali }
 * -----------------------------------------------------------------
 */
(function (g) {
  'use strict';

  var F = g.BI_FIELDS;
  var BI = { ctx: { admin: false, userId: null, nama: '', ta: null, kelasWali: null } };
  g.BI = BI;

  // ================= Helper umum =================
  function sb() { return g.supabaseClient; }
  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  BI.esc = esc;

  var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  function fmtTgl(d) {
    if (!d) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
    if (!m) return String(d);
    return Number(m[3]) + ' ' + BULAN[Number(m[2]) - 1] + ' ' + m[1];
  }
  BI.fmtTgl = fmtTgl;

  function kosong(v) { return v === null || v === undefined || String(v).trim() === ''; }

  function hitungSemesterKe(tingkat, semesterTA) {
    if (!tingkat || !semesterTA) return null;
    var basis = (Number(tingkat) - 10) * 2;
    if (semesterTA === 'Gasal') return basis + 1;
    if (semesterTA === 'Genap') return basis + 2;
    return null;
  }

  // PKL = mata pelajaran tersendiri (diinput lewat modul PKL). Nilai akhirnya
  // ditaruh di semester 6 sebagai satu baris mapel.
  var PKL_NAMA = 'Praktik Kerja Lapangan (PKL)';
  function adalahPkl(nama) { return /\bpkl\b|praktik kerja lapangan|praktek kerja lapangan/i.test(String(nama || '')); }
  // Nilai mapel efektif suatu baris semester. Baris lama yang menyimpan nilai PKL
  // di kolom nilai_pkl (cara lama) ditampilkan juga sebagai mapel PKL di semester 6.
  function nilaiEfektif(r) {
    var n = (r.nilai || []).slice();
    if (r.semester_ke === 6 && r.nilai_pkl !== null && r.nilai_pkl !== undefined && !n.some(function (x) { return adalahPkl(x.mapel); })) {
      n.push({ mapel: PKL_NAMA, kode: 'PKL', nilai: Number(r.nilai_pkl), kkm: null, urut: 9998 });
    }
    return n;
  }

  function namaMapelUntukSiswa(namaMapel, agama) {
    if (!/pendidikan\s+agama/i.test(namaMapel || '') || !agama) return namaMapel;
    var pakaiBudiPekerti = /dan budi pekerti/i.test(namaMapel);
    return 'Pendidikan Agama ' + agama + (pakaiBudiPekerti ? ' dan Budi Pekerti' : '');
  }

  function chunk(arr, n) {
    var out = [];
    for (var i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out;
  }

  // Ambil SEMUA baris (Supabase membatasi 1000 baris per permintaan).
  async function pageAll(build) {
    var out = [], from = 0, step = 1000;
    for (;;) {
      var r = await build(from, from + step - 1);
      if (r.error) throw r.error;
      var d = r.data || [];
      out = out.concat(d);
      if (d.length < step) break;
      from += step;
    }
    return out;
  }

  // Ambil baris dengan filter `in` yang daftarnya panjang (dipecah supaya URL tidak kepanjangan).
  async function inChunks(ids, build, ukuran) {
    var out = [];
    var potong = chunk(ids, ukuran || 80);
    for (var i = 0; i < potong.length; i++) {
      var rows = await pageAll(function (a, b) { return build(potong[i], a, b); });
      out = out.concat(rows);
    }
    return out;
  }

  function pesanError(err) {
    var m = (err && err.message) ? err.message : String(err);
    if (err && err.code === '23505') return 'Data bentrok: NIS/NISN sudah dipakai siswa lain.';
    if (/kokurikuler/i.test(m) && /column|schema cache/i.test(m)) return 'Kolom kokurikuler belum ada di arsip Buku Induk. Jalankan ulang migrasi_buku_induk.sql di Supabase SQL Editor (aman diulang), lalu muat ulang halaman.';
    if (/foto_lulus/i.test(m)) return 'Kolom foto lulus belum ada. Jalankan ulang migrasi_buku_induk.sql di Supabase SQL Editor (aman diulang), lalu muat ulang halaman.';
    if (/bi_dekripsi/i.test(m) && /does not exist|schema cache|could not find/i.test(m)) return 'Fungsi dekripsi NIK/KK belum ada. Jalankan migrasi_enkripsi_nik_kk.sql di Supabase SQL Editor, lalu muat ulang halaman.';
    if (/tidak berizin/i.test(m)) return 'Kamu tidak punya izin membaca NIK / No. KK.';
    if (/row-level security|permission denied/i.test(m)) return 'Kamu tidak punya izin untuk mengubah data ini. (Pastikan migrasi_buku_induk.sql sudah dijalankan.)';
    if (/relation .* does not exist|bi_siswa_detail|bi_riwayat|bi_catatan/i.test(m) && /does not exist|schema cache/i.test(m)) return 'Tabel Buku Induk belum ada. Jalankan migrasi_buku_induk.sql di Supabase SQL Editor dulu.';
    return m;
  }
  BI.pesanError = pesanError;

  var KOLOM_DETAIL = F.SEMUA.filter(function (f) { return f.t === 'detail'; }).map(function (f) { return f.k; });

  // ================= Enkripsi NIK & No. KK =================
  // Di database kolom nik & no_kk tersimpan terenkripsi ("enc:...").
  // Menulis: tetap kirim teks biasa — trigger di database yang mengenkripsi.
  // Membaca: nilai "enc:..." didekripsi lewat fungsi rpc bi_dekripsi
  // (hanya admin & wali kelas yang diizinkan). Lihat migrasi_enkripsi_nik_kk.sql.
  var KOLOM_ENKRIP = ['nik', 'no_kk'];
  BI.dekripsiBaris = async function (rows) {
    var perlu = [], ada = {};
    rows.forEach(function (r) {
      KOLOM_ENKRIP.forEach(function (k) {
        var v = r[k];
        if (typeof v === 'string' && v.indexOf('enc:') === 0 && !ada[v]) { ada[v] = true; perlu.push(v); }
      });
    });
    if (!perlu.length) return rows;
    var peta = {};
    for (var i = 0; i < perlu.length; i += 300) {
      var potong = perlu.slice(i, i + 300);
      var r = await sb().rpc('bi_dekripsi', { p_vals: potong });
      if (r.error) throw r.error;
      potong.forEach(function (v, j) { peta[v] = (r.data && r.data[j]) || null; });
    }
    rows.forEach(function (r) {
      KOLOM_ENKRIP.forEach(function (k) { if (typeof r[k] === 'string' && r[k].indexOf('enc:') === 0) r[k] = peta[r[k]]; });
    });
    return rows;
  };

  // ================= Muat data siswa =================
  // Hasil: daftar siswa (biodata + isian tambahan digabung datar) beserta
  // kelas pada tahun ajaran aktif. Foto TIDAK ikut (berat) — lihat muatFoto.
  BI.muatSiswa = async function (opts) {
    opts = opts || {};
    var ta = BI.ctx.ta;
    var skRows = [];
    if (ta) {
      skRows = await pageAll(function (a, b) {
        var q = sb().from('siswa_kelas')
          .select('id, siswa_id, no_absen, kelas:kelas_id(id, nama, tingkat, program_keahlian)')
          .eq('tahun_ajaran_id', ta.id);
        if (opts.kelasId) q = q.eq('kelas_id', opts.kelasId);
        return q.order('id').range(a, b);
      });
    }
    var skMap = {};
    skRows.forEach(function (r) { skMap[r.siswa_id] = r; });

    var siswa;
    if (opts.kelasId) {
      var ids = Object.keys(skMap);
      siswa = await inChunks(ids, function (potong, a, b) {
        return sb().from('siswa').select('*').in('id', potong).order('id').range(a, b);
      });
    } else {
      siswa = await pageAll(function (a, b) {
        return sb().from('siswa').select('*').order('nama').order('id').range(a, b);
      });
    }

    var detail;
    var kolomDetail = 'siswa_id,' + KOLOM_DETAIL.join(',');
    if (opts.kelasId) {
      detail = await inChunks(siswa.map(function (s) { return s.id; }), function (potong, a, b) {
        return sb().from('bi_siswa_detail').select(kolomDetail).in('siswa_id', potong).order('siswa_id').range(a, b);
      });
    } else {
      detail = await pageAll(function (a, b) {
        return sb().from('bi_siswa_detail').select(kolomDetail).order('siswa_id').range(a, b);
      });
    }
    await BI.dekripsiBaris(detail);
    var dMap = {};
    detail.forEach(function (d) { dMap[d.siswa_id] = d; });

    var list = siswa.map(function (s) {
      var d = dMap[s.id] || {};
      var o = Object.assign({}, s);
      KOLOM_DETAIL.forEach(function (k) { o[k] = d[k] === undefined ? null : d[k]; });
      var sk = skMap[s.id];
      o.kelas = sk ? sk.kelas : null;
      o.no_absen = sk ? sk.no_absen : null;
      return o;
    });
    list.sort(function (a, b) {
      var ka = a.kelas ? a.kelas.nama : '￿', kb = b.kelas ? b.kelas.nama : '￿';
      if (ka !== kb) return ka.localeCompare(kb);
      return (a.nama || '').localeCompare(b.nama || '');
    });
    return list;
  };

  // ================= Foto di Supabase Storage =================
  // File foto disimpan di bucket Storage (privat), BUKAN di database.
  // Kolom `foto` / `foto_lulus` di bi_siswa_detail hanya menyimpan PATH file
  // (mis. "<siswa_id>/masuk-1730000000000.jpg"). Nilai lama berupa data URL
  // (base64) tetap bisa tampil sampai dimigrasi (BI.migrasiFotoKeStorage).
  var BUCKET_FOTO = 'buku-induk-foto';
  var FOTO_MAKS_BYTE = 50 * 1024; // target kompres: maksimal 50 KB
  var cacheUrlFoto = {};          // path -> { url, exp }

  function adaDataUrl(v) { return typeof v === 'string' && v.indexOf('data:') === 0; }

  // Path / data URL -> URL yang bisa dipasang di <img>.
  BI.urlFoto = async function (v) {
    if (!v) return null;
    if (adaDataUrl(v)) return v;
    var c = cacheUrlFoto[v];
    if (c && c.exp > Date.now()) return c.url;
    var r = await sb().storage.from(BUCKET_FOTO).createSignedUrl(v, 3600);
    if (r.error || !r.data) return null;
    cacheUrlFoto[v] = { url: r.data.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
    return r.data.signedUrl;
  };

  // Banyak sekaligus (untuk cetak). Hasil: { nilaiAsli: url }
  async function urlFotoBanyak(vals) {
    var out = {}, perlu = [];
    vals.forEach(function (v) {
      if (!v || out[v] !== undefined) return;
      if (adaDataUrl(v)) { out[v] = v; return; }
      var c = cacheUrlFoto[v];
      if (c && c.exp > Date.now()) { out[v] = c.url; return; }
      out[v] = null; perlu.push(v);
    });
    for (var i = 0; i < perlu.length; i += 100) {
      var part = perlu.slice(i, i + 100);
      var r = await sb().storage.from(BUCKET_FOTO).createSignedUrls(part, 3600);
      if (r.error || !r.data) continue;
      r.data.forEach(function (d) {
        if (d && d.path && d.signedUrl) {
          out[d.path] = d.signedUrl;
          cacheUrlFoto[d.path] = { url: d.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
        }
      });
    }
    return out;
  }

  BI.muatFoto = async function (siswaId) {
    var r = await sb().from('bi_siswa_detail').select('foto').eq('siswa_id', siswaId).maybeSingle();
    return r.data ? await BI.urlFoto(r.data.foto) : null;
  };

  // Foto saat masuk (kolom foto) + foto saat lulus (kolom foto_lulus).
  // Hasil: { masuk: url, lulus: url, path: { masuk, lulus } } — path = nilai asli di kolom.
  // Bila kolom foto_lulus belum ada (migrasi belum diulang), foto lulus dianggap kosong.
  BI.muatFotoSemua = async function (siswaId) {
    var r = await sb().from('bi_siswa_detail').select('foto, foto_lulus').eq('siswa_id', siswaId).maybeSingle();
    if (r.error) r = await sb().from('bi_siswa_detail').select('foto').eq('siswa_id', siswaId).maybeSingle();
    if (r.error) throw r.error;
    var pm = r.data ? (r.data.foto || null) : null;
    var pl = r.data ? (r.data.foto_lulus || null) : null;
    return { masuk: await BI.urlFoto(pm), lulus: await BI.urlFoto(pl), path: { masuk: pm, lulus: pl } };
  };

  async function muatFotoBanyak(ids) {
    var rows;
    try {
      rows = await inChunks(ids, function (p, a, b) { return sb().from('bi_siswa_detail').select('siswa_id, foto, foto_lulus').in('siswa_id', p).order('siswa_id').range(a, b); }, 20);
    } catch (e) {
      rows = await inChunks(ids, function (p, a, b) { return sb().from('bi_siswa_detail').select('siswa_id, foto').in('siswa_id', p).order('siswa_id').range(a, b); }, 20);
    }
    var semua = [];
    rows.forEach(function (r) { semua.push(r.foto, r.foto_lulus); });
    var url = await urlFotoBanyak(semua);
    var m = {};
    rows.forEach(function (r) { m[r.siswa_id] = { masuk: r.foto ? (url[r.foto] || null) : null, lulus: r.foto_lulus ? (url[r.foto_lulus] || null) : null }; });
    return m;
  }

  // Unggah blob JPEG ke Storage. Nama file unik supaya tidak kena cache.
  BI.unggahFoto = async function (siswaId, key, blob) {
    var path = siswaId + '/' + key + '-' + Date.now() + '.jpg';
    var r = await sb().storage.from(BUCKET_FOTO).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
    if (r.error) throw r.error;
    return path;
  };

  // Hapus file di Storage (abaikan nilai kosong / data URL lama). Gagal hapus tidak fatal.
  BI.hapusFoto = async function (path) {
    if (!path || adaDataUrl(path)) return;
    try { await sb().storage.from(BUCKET_FOTO).remove([path]); } catch (e) { /* abaikan */ }
    delete cacheUrlFoto[path];
  };

  BI.muatKelas = async function () {
    var r = await sb().from('kelas').select('id, nama, tingkat, program_keahlian').order('nama');
    return r.data || [];
  };

  BI.kelengkapan = function (s) {
    var wajib = F.SEMUA.filter(function (f) { return f.wajib; });
    var kurang = [];
    wajib.forEach(function (f) { if (kosong(s[f.k])) kurang.push(f.l); });
    return { persen: Math.round((wajib.length - kurang.length) / wajib.length * 100), kurang: kurang, total: wajib.length };
  };

  function chipKelengkapan(p) {
    var cls = p >= 90 ? 'chip--aktif' : (p >= 60 ? 'chip--muted' : 'chip--danger');
    return '<span class="chip ' + cls + '">' + p + '%</span>';
  }
  BI.chipKelengkapan = chipKelengkapan;

  function chipStatus(st) {
    var cls = st === 'aktif' ? 'chip--aktif' : (st === 'lulus' ? 'chip--muted' : 'chip--danger');
    return '<span class="chip ' + cls + '">' + esc(st || '—') + '</span>';
  }
  BI.chipStatus = chipStatus;

  // ================= Form isian =================
  var LABEL_OPSI = { L: 'Laki-laki', P: 'Perempuan', aktif: 'Aktif', lulus: 'Lulus', pindah: 'Pindah', keluar: 'Keluar / Putus' };

  function inputHtml(f, val, disabled) {
    var id = 'bi_' + f.k;
    var v = (val === null || val === undefined) ? '' : String(val);
    var dis = disabled ? ' disabled' : '';
    if (f.tipe === 'select') {
      var ada = f.opsi.indexOf(v) !== -1;
      return '<select id="' + id + '"' + dis + '><option value="">— pilih —</option>' +
        f.opsi.map(function (o) { return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(LABEL_OPSI[o] || o) + '</option>'; }).join('') +
        (v && !ada ? '<option value="' + esc(v) + '" selected>' + esc(v) + '</option>' : '') + '</select>';
    }
    if (f.tipe === 'textarea') {
      return '<textarea id="' + id + '" rows="2"' + dis + ' style="width:100%;padding:9px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13px;resize:vertical;">' + esc(v) + '</textarea>';
    }
    var type = f.tipe === 'date' ? 'date' : (f.tipe === 'number' ? 'number' : 'text');
    return '<input type="' + type + '" id="' + id + '"' + (type === 'number' ? ' step="any"' : '') + ' value="' + esc(v) + '"' + dis + '>';
  }

  function formTabHtml(tab, s, bolehUbah) {
    return tab.bagian.map(function (bg) {
      return '<div class="form-section-title">' + esc(bg.judul) + '</div><div class="form-grid">' +
        bg.fields.map(function (f) {
          var dis = !bolehUbah || (f.adminSaja && !BI.ctx.admin);
          return '<div class="field' + (f.full ? ' field--full' : '') + '"><label for="bi_' + f.k + '">' + esc(f.l) +
            (f.adminSaja && !BI.ctx.admin ? ' <span style="font-weight:400;color:var(--ink-faint);">(admin)</span>' : '') + '</label>' +
            inputHtml(f, s[f.k], dis) + '</div>';
        }).join('') + '</div>';
    }).join('');
  }

  function bacaNilaiForm(root) {
    var si = {}, de = {};
    F.SEMUA.forEach(function (f) {
      var el = root.querySelector('#bi_' + f.k);
      if (!el || el.disabled) return;
      var v = el.value;
      v = (v === null || v === undefined) ? '' : String(v).trim();
      var out = null;
      if (v !== '') out = (f.tipe === 'number') ? Number(v) : v;
      if (f.t === 'siswa') si[f.k] = out; else de[f.k] = out;
    });
    return { siswa: si, detail: de };
  }

  // Foto: dikompres otomatis di browser menjadi JPEG <= 50 KB.
  // Mulai dari maks 360x480 px (rasio 3x4), kualitas dicari dengan pencarian biner;
  // bila masih > 50 KB, dimensi diperkecil 15% lalu diulang.
  function canvasKeBlob(c, q) { return new Promise(function (res) { c.toBlob(res, 'image/jpeg', q); }); }

  BI.fotoDariFile = async function (file) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('File bukan gambar. Pilih file JPG, PNG, atau WEBP.');
    var url = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (resolve, reject) {
        var im = new Image();
        im.onload = function () { resolve(im); };
        im.onerror = function () { reject(new Error('File bukan gambar yang valid / format tidak didukung browser.')); };
        im.src = url;
      });
      var skala = Math.min(1, 480 / img.naturalHeight, 360 / img.naturalWidth);
      var w = Math.max(1, Math.round(img.naturalWidth * skala));
      var h = Math.max(1, Math.round(img.naturalHeight * skala));
      for (var tahap = 0; tahap < 10; tahap++) {
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h); // PNG transparan -> latar putih
        ctx.drawImage(img, 0, 0, w, h);
        var b = await canvasKeBlob(c, 0.92);
        if (b && b.size <= FOTO_MAKS_BYTE) return b;
        var lo = 0.3, hi = 0.92, terbaik = null;
        for (var i = 0; i < 7; i++) {
          var mid = (lo + hi) / 2;
          b = await canvasKeBlob(c, mid);
          if (b && b.size <= FOTO_MAKS_BYTE) { terbaik = b; lo = mid; } else { hi = mid; }
        }
        if (terbaik) return terbaik;
        w = Math.max(1, Math.round(w * 0.85)); h = Math.max(1, Math.round(h * 0.85));
      }
      throw new Error('Foto tidak bisa dikompres sampai 50 KB. Coba foto lain.');
    } finally { URL.revokeObjectURL(url); }
  };

  // Pindahkan foto lama (data URL base64 di database) ke Storage. Khusus admin.
  // Hasil: { dipindah, gagal, pesan[] }
  BI.migrasiFotoKeStorage = async function (onProgress) {
    var rows = [];
    var r = await sb().from('bi_siswa_detail').select('siswa_id').or('foto.like.data:%,foto_lulus.like.data:%').limit(1000);
    if (r.error) throw r.error;
    rows = r.data || [];
    var hasil = { dipindah: 0, gagal: 0, pesan: [] };
    for (var i = 0; i < rows.length; i++) {
      var id = rows[i].siswa_id;
      if (onProgress) onProgress(i + 1, rows.length);
      try {
        var d = await sb().from('bi_siswa_detail').select('foto, foto_lulus').eq('siswa_id', id).maybeSingle();
        if (d.error) throw d.error;
        var upd = {};
        var kunci = [['foto', 'masuk'], ['foto_lulus', 'lulus']];
        for (var k = 0; k < kunci.length; k++) {
          var v = d.data[kunci[k][0]];
          if (!adaDataUrl(v)) continue;
          var blob = await (await fetch(v)).blob();
          var file = new File([blob], 'x.jpg', { type: blob.type || 'image/jpeg' });
          var kecil = await BI.fotoDariFile(file);
          upd[kunci[k][0]] = await BI.unggahFoto(id, kunci[k][1], kecil);
        }
        if (Object.keys(upd).length) {
          var u = await sb().from('bi_siswa_detail').update(upd).eq('siswa_id', id);
          if (u.error) throw u.error;
          hasil.dipindah++;
        }
      } catch (e) { hasil.gagal++; hasil.pesan.push(id + ': ' + pesanError(e)); }
    }
    return hasil;
  };

  // ================= Buka satu siswa =================
  // opts: { root, bolehUbah, onKembali, labelKembali }
  BI.bukaSiswa = async function (s, opts) {
    var root = opts.root;
    var bolehUbah = opts.bolehUbah !== false;
    var FOTO = [
      { key: 'masuk', kolom: 'foto', judul: 'Foto Saat Masuk', ket: 'Foto 3×4 saat diterima di sekolah.' },
      { key: 'lulus', kolom: 'foto_lulus', judul: 'Foto Saat Lulus', ket: 'Foto 3×4 saat lulus / meninggalkan sekolah.' }
    ];
    var fotoBaru = {}; // per key: tidak ada = tidak diubah, null = dihapus, { blob, preview } = foto baru (belum diunggah)
    var foto = { masuk: null, lulus: null, path: { masuk: null, lulus: null } };
    try { foto = await BI.muatFotoSemua(s.id); } catch (e) { /* tabel belum ada: ditangani saat simpan */ }

    var kel = BI.kelengkapan(s);
    var tabs = F.TAB.map(function (t) { return { id: t.id, judul: t.judul, tab: t }; })
      .concat([{ id: 'perkembangan', judul: 'Perkembangan Belajar (E-Rapor)' }, { id: 'catatan', judul: 'Prestasi & Catatan' }, { id: 'pelanggaran', judul: 'Pelanggaran (CP)' }]);

    root.innerHTML =
      '<div class="panel-head"><div><div class="panel-head__title">' + esc(s.nama) + '</div>' +
      '<div class="panel-head__desc">' + (s.kelas ? esc(s.kelas.nama) + ' · ' : '') + 'NIS ' + esc(s.nis || '—') + ' · NISN ' + esc(s.nisn || '—') + ' · ' + chipStatus(s.status) +
      ' · Kelengkapan data ' + chipKelengkapan(kel.persen) + '</div></div></div>' +
      '<div class="toolbar">' +
      '<button class="btn-small" id="biKembali">← ' + esc(opts.labelKembali || 'Kembali') + '</button>' +
      (bolehUbah ? '<button class="btn-small btn-small--primary" id="biSimpan">💾 Simpan Perubahan</button>' : '') +
      '<button class="btn-small" id="biCetak">🖨 Cetak Biodata</button> <button class="btn-small" id="biCetakNilai">🖨 Cetak Nilai</button>' +
      '</div>' +
      '<div class="subtab-nav" id="biTabNav">' + tabs.map(function (t, i) {
        return '<button type="button" class="subtab-btn' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '">' + esc(t.judul) + '</button>';
      }).join('') + '</div>' +
      tabs.map(function (t, i) {
        var isi;
        if (t.tab) {
          isi = (t.id === 'identitas' ?
            '<div style="display:flex;gap:28px;align-items:flex-start;margin:6px 0 10px;flex-wrap:wrap;">' +
            FOTO.map(function (f) {
              return '<div style="display:flex;gap:14px;align-items:flex-start;">' +
                '<div id="biFotoBox_' + f.key + '" class="ident-photo-box" style="width:90px;height:120px;overflow:hidden;"></div>' +
                '<div style="font-size:12.5px;color:var(--ink-soft);"><b style="color:var(--ink);">' + f.judul + '</b><br>' + f.ket +
                (bolehUbah ? '<br><label class="btn-small" style="display:inline-block;margin-top:8px;cursor:pointer;">Pilih Foto<input type="file" data-foto-file="' + f.key + '" accept="image/*" style="display:none;"></label> ' +
                  '<button type="button" class="btn-small" data-foto-hapus="' + f.key + '">Hapus</button>' : '') + '</div></div>';
            }).join('') +
            '</div>' : '') + formTabHtml(t.tab, s, bolehUbah);
        } else {
          isi = '<div id="biPanel_' + t.id + '"><div class="panel-note">Memuat...</div></div>';
        }
        return '<div class="subtab-panel" data-panel="' + t.id + '"' + (i === 0 ? '' : ' hidden') + '>' + isi + '</div>';
      }).join('');

    function tampilFoto() {
      FOTO.forEach(function (f) {
        var box = root.querySelector('#biFotoBox_' + f.key);
        if (!box) return;
        var src = fotoBaru[f.key] !== undefined ? (fotoBaru[f.key] ? fotoBaru[f.key].preview : null) : foto[f.key];
        box.innerHTML = src ? '<img src="' + src + '" style="width:100%;height:100%;object-fit:cover;" alt="' + f.judul + '">' : 'Foto<br>3 × 4';
      });
    }
    tampilFoto();

    var sudahMuat = {};
    function pilihTab(id) {
      root.querySelectorAll('#biTabNav .subtab-btn').forEach(function (b) { b.classList.toggle('active', b.dataset.tab === id); });
      root.querySelectorAll('.subtab-panel').forEach(function (p) { p.hidden = p.dataset.panel !== id; });
      if (id === 'perkembangan' && !sudahMuat.perkembangan) { sudahMuat.perkembangan = true; renderPerkembangan(root.querySelector('#biPanel_perkembangan'), s, bolehUbah); }
      if (id === 'catatan' && !sudahMuat.catatan) { sudahMuat.catatan = true; renderCatatan(root.querySelector('#biPanel_catatan'), s, bolehUbah); }
      if (id === 'pelanggaran' && !sudahMuat.pelanggaran) { sudahMuat.pelanggaran = true; renderPelanggaranCP(root.querySelector('#biPanel_pelanggaran'), s); }
    }
    root.querySelectorAll('#biTabNav .subtab-btn').forEach(function (b) { b.addEventListener('click', function () { pilihTab(b.dataset.tab); }); });

    // Ringkasan pelanggaran (CP) langsung tampil di kepala halaman & label tab, tanpa perlu membuka tab.
    if (g.PelanggaranCP) {
      g.PelanggaranCP.ambil([pelItem(s)]).then(function (m) {
        var rows = m[s.id] || [];
        var poin = g.PelanggaranCP.totalPoin(rows);
        var btn = root.querySelector('#biTabNav [data-tab="pelanggaran"]');
        if (btn && rows.length) btn.textContent = 'Pelanggaran (CP) · ' + rows.length;
        var desc = root.querySelector('.panel-head__desc');
        if (desc) desc.insertAdjacentHTML('beforeend', ' · <span class="chip ' + (rows.length ? 'chip--danger' : 'chip--aktif') + '" style="cursor:pointer;" id="biChipPel">' +
          (rows.length ? 'Pelanggaran ' + rows.length + ' catatan · ' + poin + ' poin' : 'Tidak ada pelanggaran') + '</span>');
        var chip = root.querySelector('#biChipPel');
        if (chip) chip.addEventListener('click', function () { pilihTab('pelanggaran'); });
      }).catch(function () { /* CP tidak terjangkau: tab tetap bisa dibuka & menampilkan pesan */ });
    }

    root.querySelector('#biKembali').addEventListener('click', function () { if (opts.onKembali) opts.onKembali(); });
    root.querySelector('#biCetak').addEventListener('click', function () { BI.cetak([s], 'biodata'); });
    root.querySelector('#biCetakNilai').addEventListener('click', function () { BI.cetak([s], 'nilai'); });

    root.querySelectorAll('[data-foto-file]').forEach(function (fileEl) {
      fileEl.addEventListener('change', async function () {
        if (!fileEl.files[0]) return;
        try {
          var key = fileEl.dataset.fotoFile;
          var blob = await BI.fotoDariFile(fileEl.files[0]);
          if (fotoBaru[key] && fotoBaru[key].preview) URL.revokeObjectURL(fotoBaru[key].preview);
          fotoBaru[key] = { blob: blob, preview: URL.createObjectURL(blob) };
          tampilFoto();
        } catch (e) { alert(e.message); }
        fileEl.value = '';
      });
    });
    root.querySelectorAll('[data-foto-hapus]').forEach(function (b) {
      b.addEventListener('click', function () { fotoBaru[b.dataset.fotoHapus] = null; tampilFoto(); });
    });

    var btnSimpan = root.querySelector('#biSimpan');
    if (btnSimpan) btnSimpan.addEventListener('click', async function () {
      btnSimpan.disabled = true; var teks = btnSimpan.textContent; btnSimpan.textContent = 'Menyimpan...';
      try {
        var v = bacaNilaiForm(root);
        if (v.siswa.nama !== undefined && !v.siswa.nama) throw new Error('Nama lengkap tidak boleh kosong.');
        if (Object.keys(v.siswa).length) {
          var r1 = await sb().from('siswa').update(v.siswa).eq('id', s.id);
          if (r1.error) throw r1.error;
        }
        var d = Object.assign({ siswa_id: s.id, updated_by: BI.ctx.userId, updated_at: new Date().toISOString() }, v.detail);
        // Foto: unggah dulu ke Storage, kolom DB hanya menyimpan path-nya.
        var terunggah = [], lamaDihapus = [];
        try {
          for (var i = 0; i < FOTO.length; i++) {
            var f = FOTO[i];
            if (fotoBaru[f.key] === undefined) continue;
            if (fotoBaru[f.key] === null) { d[f.kolom] = null; }
            else { var pth = await BI.unggahFoto(s.id, f.key, fotoBaru[f.key].blob); terunggah.push(pth); d[f.kolom] = pth; }
            if (foto.path[f.key]) lamaDihapus.push(foto.path[f.key]);
          }
          var r2 = await sb().from('bi_siswa_detail').upsert(d, { onConflict: 'siswa_id' });
          if (r2.error) throw r2.error;
        } catch (eFoto) {
          for (var j = 0; j < terunggah.length; j++) await BI.hapusFoto(terunggah[j]); // batalkan unggahan yatim
          throw eFoto;
        }
        for (var k = 0; k < lamaDihapus.length; k++) await BI.hapusFoto(lamaDihapus[k]);
        Object.assign(s, v.siswa, v.detail);
        fotoBaru = {};
        alert('Tersimpan. Biodata dasar juga langsung berlaku di E-Rapor.');
        if (opts.onSimpan) opts.onSimpan(s); else BI.bukaSiswa(s, opts);
      } catch (err) {
        alert('Gagal menyimpan: ' + pesanError(err));
        btnSimpan.disabled = false; btnSimpan.textContent = teks;
      }
    });
  };

  // ================= Detail siswa (popup baca-saja) =================
  // Menampilkan data Buku Induk yang SUDAH TERSIMPAN dalam popup. opts: { bolehUbah, onBuka }
  var CSS_DETAIL =
    '.bi-dt-overlay{align-items:stretch;padding:0 !important;overflow:hidden;animation:biDtFade .18s ease-out;}' +
    '@keyframes biDtFade{from{opacity:0}to{opacity:1}}@keyframes biDtUp{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}' +
    '.bi-dt{max-width:none !important;width:100%;height:100vh;height:100dvh;padding:0 !important;border-radius:0 !important;overflow:hidden;display:flex;flex-direction:column;animation:biDtUp .22s ease-out;}' +
    '.bi-dt__hero{position:relative;display:flex;gap:18px;align-items:center;padding:26px max(30px,calc((100% - 1100px) / 2 + 30px)) 22px;flex-shrink:0;color:#fff;background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 55%,#7c3aed 120%);}' +
    '.bi-dt__hero::after{content:"";position:absolute;right:-60px;top:-70px;width:220px;height:220px;border-radius:50%;background:rgba(255,255,255,.08);pointer-events:none;}' +
    '.bi-dt__x{position:absolute;right:14px;top:12px;border:none;background:rgba(255,255,255,.16);color:#fff;width:32px;height:32px;border-radius:50%;font-size:20px;line-height:1;cursor:pointer;z-index:2;}' +
    '.bi-dt__x:hover{background:rgba(255,255,255,.3);}' +
    '.bi-dt__fotos{display:flex;gap:10px;flex-shrink:0;}' +
    '.bi-dt__foto{width:84px;height:112px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.55);display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;color:rgba(255,255,255,.8);position:relative;box-shadow:0 8px 18px -6px rgba(0,0,0,.4);}' +
    '.bi-dt__foto[hidden]{display:none;}' +
    '.bi-dt__foto img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.bi-dt__foto small{position:absolute;left:0;right:0;bottom:0;background:rgba(15,23,42,.62);font-size:9.5px;padding:2px 0;letter-spacing:.3px;}' +
    '.bi-dt__who{min-width:0;position:relative;z-index:1;}' +
    '.bi-dt__nama{font-size:21px;font-weight:800;letter-spacing:-.01em;line-height:1.25;margin:0 0 6px;word-break:break-word;}' +
    '.bi-dt__meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}' +
    '.bi-dt__pill{background:rgba(255,255,255,.17);border:1px solid rgba(255,255,255,.28);padding:3px 10px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap;}' +
    '.bi-dt__prog{max-width:320px;}' +
    '.bi-dt__prog-top{display:flex;justify-content:space-between;font-size:11.5px;font-weight:600;margin-bottom:5px;opacity:.95;}' +
    '.bi-dt__bar{height:7px;background:rgba(255,255,255,.22);border-radius:99px;overflow:hidden;}' +
    '.bi-dt__bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#6ee7b7,#34d399);}' +
    '.bi-dt__tabs{display:flex;flex-wrap:wrap;gap:8px;padding:14px max(24px,calc((100% - 1100px) / 2 + 30px));border-bottom:1px solid var(--border-strong);background:var(--surface-tint-strong);flex-shrink:0;}' +
    '.bi-dt__tab{border:1.5px solid var(--border-strong);background:#fff;font-family:var(--font-body);font-size:13.5px;font-weight:700;color:var(--ink);padding:9px 16px;cursor:pointer;border-radius:999px;white-space:nowrap;display:flex;gap:8px;align-items:center;box-shadow:0 1px 2px rgba(15,23,42,.08);transition:all .15s;}' +
    '.bi-dt__tab:hover{border-color:var(--primary);color:var(--primary-dim);background:var(--primary-tint);}' +
    '.bi-dt__tab.on{background:linear-gradient(135deg,var(--primary),var(--primary-dim));border-color:var(--primary-dim);color:#fff;box-shadow:0 8px 16px -8px rgba(37,99,235,.75);}' +
    '.bi-dt__cnt{font-size:11px;font-weight:800;padding:1px 8px;border-radius:99px;background:var(--surface-tint-strong);color:var(--ink-soft);}' +
    '.bi-dt__tab.on .bi-dt__cnt{background:rgba(255,255,255,.26);color:#fff;}' +
    '.bi-dt__scroll{flex:1;min-height:0;overflow-y:auto;}' +
    '.bi-dt__body{padding:8px 30px 24px;width:100%;max-width:1100px;margin:0 auto;}' +
    '.bi-dt__sec{margin-top:20px;}' +
    '.bi-dt__sec-t{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--primary-dim);display:flex;align-items:center;gap:8px;margin-bottom:10px;}' +
    '.bi-dt__sec-t::after{content:"";flex:1;height:1px;background:var(--border);}' +
    '.bi-dt__grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}' +
    '.bi-dt__it{background:var(--surface-tint);border:1px solid var(--border);border-radius:10px;padding:10px 13px;min-width:0;}' +
    '.bi-dt__it--full{grid-column:1/-1;}' +
    '.bi-dt__l{font-size:10.5px;font-weight:700;letter-spacing:.3px;color:var(--ink-faint);text-transform:uppercase;margin-bottom:3px;}' +
    '.bi-dt__v{font-size:13.5px;font-weight:600;color:var(--ink);word-break:break-word;white-space:pre-wrap;}' +
    '.bi-dt__v--kosong{font-weight:500;font-style:italic;color:var(--ink-faint);font-size:12.5px;}' +
    '.bi-dt__foot{display:flex;justify-content:flex-end;gap:10px;padding:14px max(24px,calc((100% - 1100px) / 2 + 30px));border-top:1px solid var(--border);background:var(--surface);flex-shrink:0;}' +
    '@media(min-width:900px){.bi-dt__grid{grid-template-columns:1fr 1fr 1fr;}.bi-dt__it--full{grid-column:1/-1;}}' +
    '@media(max-width:640px){.bi-dt__hero{flex-direction:column;align-items:flex-start;padding:22px 18px 18px !important;}.bi-dt__nama{font-size:18px;padding-right:30px;}' +
    '.bi-dt__body{padding:4px 16px 20px;}.bi-dt__tabs{flex-wrap:nowrap;overflow-x:auto;padding:10px 10px !important;}.bi-dt__grid{grid-template-columns:1fr;}.bi-dt__foot{padding:12px 14px !important;flex-wrap:wrap;}.bi-dt__foot .btn-small{flex:1 1 auto;}}';

  function pasangCssDetail() {
    if (document.getElementById('biDtCss')) return;
    var st = document.createElement('style');
    st.id = 'biDtCss'; st.textContent = CSS_DETAIL;
    document.head.appendChild(st);
  }

  function nilaiTampil(f, v) {
    if (kosong(v)) return '';
    if (f.tipe === 'date') return fmtTgl(v);
    if (f.tipe === 'select') return LABEL_OPSI[v] || v;
    if (f.k === 'jarak_sekolah' && /^[\d.,]+$/.test(String(v).trim())) return v + ' km';
    if (f.k === 'tinggi_badan') return v + ' cm';
    if (f.k === 'berat_badan') return v + ' kg';
    return v;
  }

  BI.detailSiswa = async function (s, opts) {
    opts = opts || {};
    pasangCssDetail();
    var foto = { masuk: null, lulus: null };
    var kel = BI.kelengkapan(s);

    var o = document.createElement('div');
    o.className = 'modal-overlay bi-dt-overlay';
    var tabs = F.TAB;

    var sembunyi = opts.sembunyi || {};
    function fieldTampil(bg) { return bg.fields.filter(function (f) { return !sembunyi[f.k]; }); }
    function panelHtml(tb) {
      return tb.bagian.filter(function (bg) { return fieldTampil(bg).length; }).map(function (bg) {
        return '<div class="bi-dt__sec"><div class="bi-dt__sec-t">' + esc(bg.judul) + '</div><div class="bi-dt__grid">' +
          fieldTampil(bg).map(function (f) {
            var v = nilaiTampil(f, s[f.k]);
            var penuh = f.full || f.tipe === 'textarea';
            return '<div class="bi-dt__it' + (penuh ? ' bi-dt__it--full' : '') + '"><div class="bi-dt__l">' + esc(f.l) + '</div>' +
              (v === '' ? '<div class="bi-dt__v bi-dt__v--kosong">Belum diisi</div>' : '<div class="bi-dt__v">' + esc(v) + '</div>') + '</div>';
          }).join('') + '</div></div>';
      }).join('');
    }
    function hitungTab(tb) {
      var n = 0, t = 0;
      tb.bagian.forEach(function (bg) { fieldTampil(bg).forEach(function (f) { t++; if (!kosong(s[f.k])) n++; }); });
      return n + '/' + t;
    }
    var warna = kel.persen >= 90 ? '' : (kel.persen >= 60 ? 'background:linear-gradient(90deg,#fde68a,#fbbf24)' : 'background:linear-gradient(90deg,#fecaca,#f87171)');

    o.innerHTML =
      '<div class="modal-box bi-dt" role="dialog" aria-modal="true" aria-label="Detail data siswa">' +
      '<div class="bi-dt__hero"><button type="button" class="bi-dt__x" data-x aria-label="Tutup">×</button>' +
      '<div class="bi-dt__fotos"><div class="bi-dt__foto" id="biDtFotoMasuk">Foto<br>3 × 4</div><div class="bi-dt__foto" id="biDtFotoLulus" hidden></div></div>' +
      '<div class="bi-dt__who"><h2 class="bi-dt__nama">' + esc(s.nama) + '</h2><div class="bi-dt__meta">' +
      (s.kelas ? '<span class="bi-dt__pill">' + esc(s.kelas.nama) + '</span>' : '') +
      '<span class="bi-dt__pill">NIS ' + esc(s.nis || '—') + '</span><span class="bi-dt__pill">NISN ' + esc(s.nisn || '—') + '</span>' +
      '<span class="bi-dt__pill">Status: ' + esc(LABEL_OPSI[s.status] || s.status || '—') + '</span></div>' +
      '<div class="bi-dt__prog"><div class="bi-dt__prog-top"><span>Kelengkapan data</span><span>' + kel.persen + '%</span></div>' +
      '<div class="bi-dt__bar"><i style="width:' + kel.persen + '%;' + warna + '"></i></div></div></div></div>' +
      '<div class="bi-dt__tabs" role="tablist">' + tabs.map(function (tb, i) {
        return '<button type="button" role="tab" class="bi-dt__tab' + (i === 0 ? ' on' : '') + '" data-t="' + tb.id + '">' + esc(tb.judul) + '<span class="bi-dt__cnt">' + hitungTab(tb) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="bi-dt__scroll"><div class="bi-dt__body">' + tabs.map(function (tb, i) {
        return '<div data-p="' + tb.id + '"' + (i === 0 ? '' : ' hidden') + '>' + panelHtml(tb) + '</div>';
      }).join('') + '</div></div>' +
      '<div class="bi-dt__foot"><button type="button" class="btn-small" id="biDtCetak">🖨 Cetak Biodata</button> ' + (opts.tanpaNilai ? '' : '<button type="button" class="btn-small" id="biDtCetakNilai">🖨 Cetak Nilai</button>') + '' +
      (opts.bolehUbah ? '<button type="button" class="btn-small btn-small--primary" id="biDtBuka">✏️ Buka & Ubah Data</button>' : '') +
      '<button type="button" class="btn-small" data-x>Tutup</button></div></div>';

    document.body.appendChild(o);
    var overflowLama = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function tutup() { document.body.style.overflow = overflowLama; document.removeEventListener('keydown', onKey); o.remove(); if (opts.onTutup) opts.onTutup(); }
    function onKey(e) { if (e.key === 'Escape') tutup(); }
    document.addEventListener('keydown', onKey);
    o.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', tutup); });
    o.querySelectorAll('.bi-dt__tab').forEach(function (b) {
      b.addEventListener('click', function () {
        o.querySelectorAll('.bi-dt__tab').forEach(function (x) { x.classList.toggle('on', x === b); });
        o.querySelectorAll('[data-p]').forEach(function (p) { p.hidden = p.dataset.p !== b.dataset.t; });
        o.querySelector('.bi-dt__scroll').scrollTop = 0;
      });
    });
    o.querySelector('#biDtCetak').addEventListener('click', function () { BI.cetak([s], 'biodata', opts.opsiCetak); });
    var bNilai = o.querySelector('#biDtCetakNilai');
    if (bNilai) bNilai.addEventListener('click', function () { BI.cetak([s], 'nilai', opts.opsiCetak); });
    var bBuka = o.querySelector('#biDtBuka');
    if (bBuka) bBuka.addEventListener('click', function () { tutup(); if (opts.onBuka) opts.onBuka(); });

    // Foto dimuat belakangan supaya popup langsung muncul.
    try {
      foto = await BI.muatFotoSemua(s.id);
      function isiFoto(id, src, ket) {
        var el = o.querySelector(id); if (!el || !src) return;
        el.hidden = false; el.innerHTML = '<img src="' + src + '" alt="' + ket + '"><small>' + ket + '</small>';
      }
      isiFoto('#biDtFotoMasuk', foto.masuk, 'SAAT MASUK');
      isiFoto('#biDtFotoLulus', foto.lulus, 'SAAT LULUS');
    } catch (e) { /* foto tidak wajib */ }
  };

  // ================= Dashboard siswa (satu per satu, navigasi + cari + edit + cetak) =================
  var CSS_DASH =
    '.bi-ds-nav{position:sticky;top:0;z-index:20;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 12px;margin:-4px 0 14px;background:rgba(255,255,255,.92);backdrop-filter:blur(8px);border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 6px 18px -12px rgba(15,23,42,.35);}' +
    '.bi-ds-navbtn{border:1px solid var(--border-strong);background:var(--surface);color:var(--ink);font-family:var(--font-body);font-size:13px;font-weight:700;padding:9px 14px;border-radius:var(--radius-sm);cursor:pointer;white-space:nowrap;transition:all .15s;}' +
    '.bi-ds-navbtn:hover:not(:disabled){background:var(--primary);border-color:var(--primary);color:#fff;}' +
    '.bi-ds-navbtn:disabled{opacity:.4;cursor:not-allowed;}' +
    '.bi-ds-search{position:relative;flex:1 1 240px;min-width:200px;}' +
    '.bi-ds-search input{width:100%;padding:10px 12px 10px 36px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13.5px;background:var(--surface-tint);}' +
    '.bi-ds-search input:focus{outline:none;border-color:var(--primary);background:#fff;box-shadow:0 0 0 3px var(--primary-tint-strong);}' +
    '.bi-ds-search::before{content:"\\1F50D";position:absolute;left:12px;top:50%;transform:translateY(-50%);font-size:13px;opacity:.6;pointer-events:none;}' +
    '.bi-ds-sug{position:absolute;left:0;right:0;top:calc(100% + 6px);max-height:340px;overflow-y:auto;background:#fff;border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 18px 40px -12px rgba(15,23,42,.35);z-index:30;padding:6px;}' +
    '.bi-ds-sug[hidden]{display:none;}' +
    '.bi-ds-sug button{display:flex;width:100%;justify-content:space-between;align-items:center;gap:10px;text-align:left;border:none;background:none;font-family:var(--font-body);font-size:13px;padding:8px 10px;border-radius:8px;cursor:pointer;color:var(--ink);}' +
    '.bi-ds-sug button:hover,.bi-ds-sug button.on{background:var(--primary-tint);}' +
    '.bi-ds-sug button b{font-weight:700;}' +
    '.bi-ds-sug button small{color:var(--ink-faint);font-size:11.5px;white-space:nowrap;}' +
    '.bi-ds-sug .bi-ds-none{padding:12px;font-size:12.5px;color:var(--ink-soft);}' +
    '.bi-ds-pos{font-size:12.5px;font-weight:700;color:var(--ink-soft);white-space:nowrap;min-width:56px;text-align:center;}' +
    '.bi-ds-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;box-shadow:0 10px 30px -18px rgba(15,23,42,.35);animation:biDsIn .22s ease-out;}' +
    '@keyframes biDsIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
    '.bi-ds-hero{position:relative;display:flex;gap:22px;align-items:center;padding:24px 28px;color:#fff;background:radial-gradient(circle at 1px 1px,rgba(147,197,253,.13) 1.2px,transparent 1.6px) 0 0/20px 20px,linear-gradient(135deg,#071633 0%,#0d2557 52%,#17397f 125%);overflow:hidden;}' +
    '.bi-ds-hero::before{content:"";position:absolute;right:-70px;top:-90px;width:280px;height:280px;border-radius:50%;background:rgba(96,165,250,.10);border:1px solid rgba(147,197,253,.14);}' +
    '.bi-ds-hero::after{content:"";position:absolute;right:120px;bottom:-110px;width:200px;height:200px;border-radius:50%;background:rgba(96,165,250,.07);border:1px solid rgba(147,197,253,.10);}' +
    '.bi-ds-fotos{display:flex;gap:10px;flex-shrink:0;position:relative;z-index:1;}' +
    '.bi-ds-foto{width:92px;height:123px;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.6);display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;color:rgba(255,255,255,.85);position:relative;box-shadow:0 10px 22px -8px rgba(0,0,0,.45);}' +
    '.bi-ds-foto[hidden]{display:none;}' +
    '.bi-ds-foto img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.bi-ds-foto small{position:absolute;left:0;right:0;bottom:0;background:rgba(15,23,42,.62);font-size:9.5px;padding:2px 0;letter-spacing:.3px;}' +
    '.bi-ds-who{min-width:0;flex:1;position:relative;z-index:1;}' +
    '.bi-ds-nama{font-size:24px;font-weight:800;letter-spacing:-.015em;line-height:1.2;margin:0 0 8px;word-break:break-word;}' +
    '.bi-ds-meta{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;}' +
    '.bi-ds-pill{background:rgba(255,255,255,.17);border:1px solid rgba(255,255,255,.28);padding:3px 11px;border-radius:999px;font-size:11.5px;font-weight:600;white-space:nowrap;}' +
    '.bi-ds-pill--warn{background:rgba(254,202,202,.28);border-color:rgba(254,202,202,.6);cursor:pointer;}' +
    '.bi-ds-prog{max-width:340px;margin-bottom:14px;}' +
    '.bi-ds-prog-top{display:flex;justify-content:space-between;font-size:11.5px;font-weight:600;margin-bottom:5px;}' +
    '.bi-ds-bar{height:7px;background:rgba(255,255,255,.22);border-radius:99px;overflow:hidden;}' +
    '.bi-ds-bar>i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#6ee7b7,#34d399);}' +
    '.bi-ds-act{display:flex;gap:8px;flex-wrap:wrap;}' +
    '.bi-ds-act button{border:1px solid rgba(255,255,255,.4);background:rgba(255,255,255,.16);color:#fff;font-family:var(--font-body);font-size:12.5px;font-weight:700;padding:8px 14px;border-radius:var(--radius-sm);cursor:pointer;transition:all .15s;}' +
    '.bi-ds-act button:hover{background:rgba(255,255,255,.3);}' +
    '.bi-ds-act button.utama{background:#fff;color:var(--primary-dim);border-color:#fff;}' +
    '.bi-ds-act button.utama:hover{background:#eff6ff;}' +
    '.bi-ds-rata{position:relative;z-index:1;flex:0 0 auto;margin-left:auto;align-self:center;display:flex;flex-direction:column;justify-content:center;background:rgba(255,255,255,.07);border:1px solid rgba(147,197,253,.25);border-radius:16px;padding:12px 14px;}' +
    '.bi-ds-rata-t{font-size:10.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:rgba(191,219,254,.85);margin-bottom:10px;}' +
    '.bi-ds-rata-g{display:flex;flex-direction:row;gap:8px;}' +
    '.bi-ds-rt{width:70px;aspect-ratio:1/1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:rgba(255,255,255,.08);border:1px solid rgba(147,197,253,.2);border-radius:14px;padding:6px 4px;min-width:0;text-align:center;}' +
    '.bi-ds-rt--ada{background:rgba(255,255,255,.14);border-color:rgba(147,197,253,.45);}' +
    '.bi-ds-rt-s{font-size:10px;font-weight:700;letter-spacing:.5px;color:rgba(191,219,254,.95);}' +
    '.bi-ds-rt-n{font-size:20px;font-weight:800;line-height:1.1;}' +
    '.bi-ds-rt-k{max-width:100%;font-size:9.5px;color:rgba(191,219,254,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:1.2em;}' +
    '.bi-ds-rt--kosong .bi-ds-rt-n{font-weight:600;color:rgba(255,255,255,.4);}' +
    '.bi-ds-tabs{display:flex;flex-wrap:wrap;gap:8px;padding:14px 20px;border-bottom:1px solid var(--border-strong);background:var(--surface-tint-strong);}' +
    '.bi-ds-tab{border:1.5px solid var(--border-strong);background:#fff;font-family:var(--font-body);font-size:13.5px;font-weight:700;color:var(--ink);padding:9px 16px;cursor:pointer;border-radius:999px;white-space:nowrap;display:flex;gap:8px;align-items:center;box-shadow:0 1px 2px rgba(15,23,42,.08);transition:all .15s;}' +
    '.bi-ds-tab:hover{border-color:var(--primary);color:var(--primary-dim);background:var(--primary-tint);transform:translateY(-1px);}' +
    '.bi-ds-tab.on{background:linear-gradient(135deg,var(--primary),var(--primary-dim));border-color:var(--primary-dim);color:#fff;box-shadow:0 8px 16px -8px rgba(37,99,235,.75);}' +
    '.bi-ds-cnt{font-size:11px;font-weight:800;padding:1px 8px;border-radius:99px;background:var(--surface-tint-strong);color:var(--ink-soft);}' +
    '.bi-ds-tab.on .bi-ds-cnt{background:rgba(255,255,255,.26);color:#fff;}' +
    '.bi-ds-body{padding:6px 26px 26px;}' +
    '.bi-ds-sec{margin-top:20px;}' +
    '.bi-ds-sec-t{font-size:11px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;color:var(--primary-dim);display:flex;align-items:center;gap:8px;margin-bottom:10px;}' +
    '.bi-ds-sec-t::after{content:"";flex:1;height:1px;background:var(--border);}' +
    '.bi-ds-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}' +
    '.bi-ds-it{background:var(--surface-tint);border:1px solid var(--border);border-radius:10px;padding:10px 13px;min-width:0;}' +
    '.bi-ds-it--full{grid-column:1/-1;}' +
    '.bi-ds-l{font-size:10.5px;font-weight:700;letter-spacing:.3px;color:var(--ink-faint);text-transform:uppercase;margin-bottom:3px;}' +
    '.bi-ds-v{font-size:13.5px;font-weight:600;color:var(--ink);word-break:break-word;white-space:pre-wrap;}' +
    '.bi-ds-v--kosong{font-weight:500;font-style:italic;color:var(--ink-faint);font-size:12.5px;}' +
    '.bi-ds-card--edit{border-color:var(--primary);box-shadow:0 0 0 3px var(--primary-tint-strong),0 10px 30px -18px rgba(15,23,42,.35);}' +
    '.bi-ds-editbar{display:none;align-items:center;gap:10px;padding:10px 26px;background:#fffbeb;border-bottom:1px solid #fde68a;color:#92400e;font-size:12.5px;font-weight:600;}' +
    '.bi-ds-card--edit .bi-ds-editbar{display:flex;}' +
    '.bi-ds-form .form-section-title{margin-top:20px;}' +
    '.bi-ds-form .form-grid{grid-template-columns:1fr 1fr;}' +
    '@media(min-width:1000px){.bi-ds-form .form-grid{grid-template-columns:1fr 1fr 1fr;}}' +
    '@media(max-width:700px){.bi-ds-form .form-grid{grid-template-columns:1fr;}}' +
    '.bi-ds-act button:disabled{opacity:.55;cursor:not-allowed;}' +
    '.bi-ds-act button.simpan{background:#34d399;border-color:#34d399;color:#053b2a;}' +
    '.bi-ds-act button.simpan:hover{background:#6ee7b7;}' +
    '.bi-ds-upl{position:relative;display:inline-block;}' +
    '.bi-ds-uplmenu{position:absolute;left:0;bottom:calc(100% + 6px);min-width:200px;background:#fff;border:1px solid var(--border);border-radius:var(--radius);box-shadow:0 18px 40px -12px rgba(15,23,42,.45);padding:6px;z-index:40;}' +
    '.bi-ds-uplmenu[hidden]{display:none;}' +
    '.bi-ds-act .bi-ds-uplmenu button{display:flex;width:100%;gap:8px;align-items:center;text-align:left;border:none;background:none;color:var(--ink);font-size:13px;font-weight:600;padding:9px 10px;border-radius:8px;}' +
    '.bi-ds-act .bi-ds-uplmenu button:hover{background:var(--primary-tint);}' +
    '.bi-ds-act .bi-ds-uplmenu small{display:block;font-weight:500;font-size:11px;color:var(--ink-faint);}' +
    '.bi-ds-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:9999;background:#0f172a;color:#fff;padding:11px 18px;border-radius:12px;font-size:13px;font-weight:600;box-shadow:0 14px 34px -10px rgba(0,0,0,.5);max-width:90vw;}' +
    '.bi-ds-toast--err{background:#b91c1c;}' +
    '@media(min-width:1000px){.bi-ds-grid{grid-template-columns:1fr 1fr 1fr;}}' +
    '@media(max-width:700px){.bi-ds-hero{flex-direction:column;align-items:flex-start;padding:20px 16px;}.bi-ds-who{width:100%;flex:none;}.bi-ds-rata{flex:none;width:100%;margin-left:0;align-self:auto;padding:8px 10px;border-radius:12px;}.bi-ds-rata-t{font-size:9.5px;margin-bottom:6px;}.bi-ds-rata-g{gap:5px;}.bi-ds-rt{flex:1;width:auto;border-radius:11px;padding:4px 2px;}.bi-ds-rt-s{font-size:9px;}.bi-ds-rt-n{font-size:15px;}.bi-ds-rt-k{display:none;}.bi-ds-nama{font-size:19px;}.bi-ds-body{padding:4px 14px 20px;}.bi-ds-grid{grid-template-columns:1fr;}.bi-ds-tabs{flex-wrap:nowrap;overflow-x:auto;padding:10px 10px;}' +
    '.bi-ds-nav{gap:8px;}.bi-ds-search{order:-1;flex-basis:100%;}.bi-ds-navbtn{flex:1;}.bi-ds-act button{flex:1 1 auto;}}' +
    '@media print{.bi-ds-nav{display:none;}}';

  function pasangCssDash() {
    if (document.getElementById('biDsCss')) return;
    var st = document.createElement('style');
    st.id = 'biDsCss'; st.textContent = CSS_DASH;
    document.head.appendChild(st);
  }

  // Pilihan cetak (Biodata / Nilai) untuk satu siswa.
  BI.pilihCetak = function (s, opsi) {
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-box" style="max-width:380px;"><div class="modal-box__head"><div class="modal-box__title">Cetak — ' + esc(s.nama) + '</div>' +
      '<button class="modal-box__close" type="button" data-x>×</button></div>' +
      '<div class="modal-box__desc">Pilih dokumen yang akan dicetak.</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:6px;">' +
      '<button type="button" class="btn-small btn-small--primary" data-j="biodata" style="padding:11px;">🖨 Cetak Biodata</button>' +
      '<button type="button" class="btn-small" data-j="nilai" style="padding:11px;">🖨 Cetak Nilai</button>' +
      '<button type="button" class="btn-small" data-x style="padding:11px;">Batal</button></div></div>';
    document.body.appendChild(o);
    function tutup() { document.removeEventListener('keydown', onKey); o.remove(); }
    function onKey(e) { if (e.key === 'Escape') tutup(); }
    document.addEventListener('keydown', onKey);
    o.addEventListener('click', function (e) { if (e.target === o) tutup(); });
    o.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', tutup); });
    o.querySelectorAll('[data-j]').forEach(function (b) {
      b.addEventListener('click', function () { var j = b.dataset.j; tutup(); BI.cetak([s], j, opsi); });
    });
  };

  // opts: { root, kelasId, bolehUbah, siswaId (awal), tabAwal, daftar (opsional: daftar siswa yang sudah dimuat) }
  BI.dashboardSiswa = async function (opts) {
    var root = opts.root;
    var bolehUbah = opts.bolehUbah !== false;
    pasangCssDash();
    root.innerHTML = '<div class="panel-note">Memuat data siswa...</div>';
    var list = opts.daftar;
    if (!list) {
      try { list = await BI.muatSiswa({ kelasId: opts.kelasId || null }); }
      catch (e) { root.innerHTML = '<div class="panel-note">' + esc(pesanError(e)) + '</div>'; return; }
    }
    if (!list.length) {
      root.innerHTML = '<div class="empty-state"><div class="empty-state__mark">！</div><div class="empty-state__title">Belum ada siswa</div><div class="empty-state__desc">Belum ada siswa terdaftar di kelas ini pada tahun ajaran aktif.</div></div>';
      return;
    }

    var idx = 0;
    if (opts.siswaId) { var f0 = list.findIndex(function (x) { return x.id === opts.siswaId; }); if (f0 >= 0) idx = f0; }
    var tabAktif = opts.tabAwal || 'identitas';
    var token = 0;
    var editMode = false, snapAwal = '', jenisFoto = null;
    var tabs = F.TAB.map(function (t) { return { id: t.id, judul: t.judul, tab: t }; })
      .concat([{ id: 'perkembangan', judul: 'Perkembangan Belajar' }, { id: 'catatan', judul: 'Prestasi & Catatan' }, { id: 'pelanggaran', judul: 'Pelanggaran (CP)' }]);
    if (!tabs.some(function (t) { return t.id === tabAktif; })) tabAktif = 'identitas';

    root.innerHTML =
      '<div class="bi-ds-nav">' +
      '<button type="button" class="bi-ds-navbtn" id="biDsPrev">‹ Sebelumnya</button>' +
      '<div class="bi-ds-search"><input type="text" id="biDsQ" placeholder="Cari nama / NIS / NISN siswa..." autocomplete="off"><div class="bi-ds-sug" id="biDsSug" hidden></div></div>' +
      '<span class="bi-ds-pos" id="biDsPos"></span>' +
      '<button type="button" class="bi-ds-navbtn" id="biDsNext">Berikutnya ›</button></div>' +
      '<div id="biDsKartu"></div>';

    var elKartu = root.querySelector('#biDsKartu');
    var elQ = root.querySelector('#biDsQ');
    var elSug = root.querySelector('#biDsSug');
    var btnPrev = root.querySelector('#biDsPrev');
    var btnNext = root.querySelector('#biDsNext');

    function nilaiPanel(tb, s) {
      return tb.bagian.map(function (bg) {
        return '<div class="bi-ds-sec"><div class="bi-ds-sec-t">' + esc(bg.judul) + '</div><div class="bi-ds-grid">' +
          bg.fields.map(function (f) {
            var v = nilaiTampil(f, s[f.k]);
            var penuh = f.full || f.tipe === 'textarea';
            return '<div class="bi-ds-it' + (penuh ? ' bi-ds-it--full' : '') + '"><div class="bi-ds-l">' + esc(f.l) + '</div>' +
              (v === '' ? '<div class="bi-ds-v bi-ds-v--kosong">Belum diisi</div>' : '<div class="bi-ds-v">' + esc(v) + '</div>') + '</div>';
          }).join('') + '</div></div>';
      }).join('');
    }
    function hitungTab(tb, s) {
      var n = 0, t = 0;
      tb.bagian.forEach(function (bg) { bg.fields.forEach(function (f) { t++; if (!kosong(s[f.k])) n++; }); });
      return n + '/' + t;
    }
    // Mode edit: isian tab yang sama berubah jadi form (tanpa pindah halaman).
    function formPanel(tb, s) { return '<div class="bi-ds-form">' + formTabHtml(tb, s, true) + '</div>'; }
    function toast(msg, err) {
      var t = document.createElement('div');
      t.className = 'bi-ds-toast' + (err ? ' bi-ds-toast--err' : '');
      t.textContent = msg;
      document.body.appendChild(t);
      setTimeout(function () { t.remove(); }, err ? 6000 : 3200);
    }
    function adaPerubahan() { return editMode && JSON.stringify(bacaNilaiForm(elKartu)) !== snapAwal; }

    // Unggah foto (masuk / lulus): dikompres <= 50 KB, langsung disimpan.
    async function unggahFotoSiswa(s, key, file) {
      var kolom = key === 'masuk' ? 'foto' : 'foto_lulus';
      var blob = await BI.fotoDariFile(file);
      var cur = { path: {} };
      try { cur = await BI.muatFotoSemua(s.id); } catch (e) { /* abaikan */ }
      var pth = await BI.unggahFoto(s.id, key, blob);
      var d = { siswa_id: s.id, updated_by: BI.ctx.userId, updated_at: new Date().toISOString() };
      d[kolom] = pth;
      var r = await sb().from('bi_siswa_detail').upsert(d, { onConflict: 'siswa_id' });
      if (r.error) { await BI.hapusFoto(pth); throw r.error; }
      if (cur.path && cur.path[key]) await BI.hapusFoto(cur.path[key]);
    }

    function muatLazy(id, s, el) {
      if (id === 'perkembangan') renderPerkembangan(el, s, bolehUbah);
      else if (id === 'catatan') renderCatatan(el, s, bolehUbah);
      else if (id === 'pelanggaran') renderPelanggaranCP(el, s);
    }

    // ----- Rata-rata nilai per semester (semester 1-5), dari arsip E-Rapor di Buku Induk -----
    var rataCache = {};
    function hitungRata(rows) {
      var out = {};
      (rows || []).forEach(function (r) {
        if (r.semester_ke >= 1 && r.semester_ke <= 5) {
          var x = rataNilai(nilaiEfektif(r));
          if (x !== null) out[r.semester_ke] = { nilai: x, kelas: r.kelas_nama || '' };
        }
      });
      return out;
    }
    function htmlRata(data) {
      var h = '';
      for (var k = 1; k <= 5; k++) {
        var d = data && data[k];
        h += '<div class="bi-ds-rt ' + (d ? 'bi-ds-rt--ada' : 'bi-ds-rt--kosong') + '"><div class="bi-ds-rt-s">SMT ' + k + '</div>' +
          '<div class="bi-ds-rt-n">' + (d ? d.nilai.toFixed(1) : (data ? '—' : '…')) + '</div>' +
          '<div class="bi-ds-rt-k">' + (d ? esc(d.kelas) : '') + '</div></div>';
      }
      return h;
    }

    function tampilSiswa() {
      var s = list[idx];
      var my = ++token;
      var kel = BI.kelengkapan(s);
      var warna = kel.persen >= 90 ? '' : (kel.persen >= 60 ? 'background:linear-gradient(90deg,#fde68a,#fbbf24)' : 'background:linear-gradient(90deg,#fecaca,#f87171)');
      root.querySelector('#biDsPos').textContent = (idx + 1) + ' / ' + list.length;
      btnPrev.disabled = idx === 0;
      btnNext.disabled = idx === list.length - 1;

      elKartu.innerHTML =
        '<div class="bi-ds-card' + (editMode ? ' bi-ds-card--edit' : '') + '">' +
        '<div class="bi-ds-hero">' +
        '<div class="bi-ds-fotos"><div class="bi-ds-foto" id="biDsFotoMasuk">Foto<br>3 × 4</div><div class="bi-ds-foto" id="biDsFotoLulus"' + (bolehUbah ? '' : ' hidden') + '>' + (bolehUbah ? 'Foto<br>Lulus' : '') + '</div></div>' +
        '<div class="bi-ds-who"><h2 class="bi-ds-nama">' + esc(s.nama) + '</h2><div class="bi-ds-meta">' +
        (s.kelas ? '<span class="bi-ds-pill">' + esc(s.kelas.nama) + '</span>' : '') +
        (s.no_absen ? '<span class="bi-ds-pill">Absen ' + esc(s.no_absen) + '</span>' : '') +
        '<span class="bi-ds-pill">NIS ' + esc(s.nis || '—') + '</span><span class="bi-ds-pill">NISN ' + esc(s.nisn || '—') + '</span>' +
        '<span class="bi-ds-pill">Status: ' + esc(LABEL_OPSI[s.status] || s.status || '—') + '</span><span id="biDsPel"></span></div>' +
        '<div class="bi-ds-prog"><div class="bi-ds-prog-top"><span>Kelengkapan data</span><span>' + kel.persen + '%</span></div>' +
        '<div class="bi-ds-bar"><i style="width:' + kel.persen + '%;' + warna + '"></i></div></div>' +
        '<div class="bi-ds-act">' +
        (bolehUbah ? (editMode ?
          '<button type="button" class="simpan" id="biDsSimpan">💾 Simpan Perubahan</button><button type="button" id="biDsBatal">✕ Batal</button>' :
          '<button type="button" class="utama" id="biDsEdit">✏️ Edit Data</button>') +
          '<span class="bi-ds-upl"><button type="button" id="biDsUpl">📷 Upload Foto ▾</button><div class="bi-ds-uplmenu" id="biDsUplMenu" hidden>' +
          '<button type="button" data-j="masuk">🎓 Foto Saat Masuk<small>Foto 3×4 saat diterima di sekolah</small></button>' +
          '<button type="button" data-j="lulus">🏅 Foto Saat Lulus<small>Foto 3×4 saat lulus / keluar</small></button></div></span>' +
          '<input type="file" id="biDsFile" accept="image/*" hidden>' : '') +
        '<button type="button" id="biDsCetak">🖨 Cetak Biodata</button><button type="button" id="biDsCetakNilai">🖨 Cetak Nilai</button>' +
        '</div></div>' +
        '<div class="bi-ds-rata"><div class="bi-ds-rata-t">Rata-rata nilai per semester</div><div class="bi-ds-rata-g" id="biDsRata">' + htmlRata(rataCache[s.id]) + '</div></div>' +
        '</div>' +
        '<div class="bi-ds-editbar">✏️ Mode edit aktif — ubah isian pada tab di bawah, lalu klik “Simpan Perubahan”. Data dasar juga berlaku di E-Rapor.</div>' +
        '<div class="bi-ds-tabs" role="tablist">' + tabs.map(function (tb) {
          return '<button type="button" role="tab" class="bi-ds-tab' + (tb.id === tabAktif ? ' on' : '') + '" data-t="' + tb.id + '">' + esc(tb.judul) +
            (tb.tab ? '<span class="bi-ds-cnt">' + hitungTab(tb.tab, s) + '</span>' : '') + '</button>';
        }).join('') + '</div>' +
        '<div class="bi-ds-body">' + tabs.map(function (tb) {
          return '<div data-p="' + tb.id + '"' + (tb.id === tabAktif ? '' : ' hidden') + '>' + (tb.tab ? (editMode ? formPanel(tb.tab, s) : nilaiPanel(tb.tab, s)) : '<div class="panel-note">Memuat...</div>') + '</div>';
        }).join('') + '</div></div>';

      var dimuat = {};
      function pilihTab(id) {
        tabAktif = id;
        elKartu.querySelectorAll('.bi-ds-tab').forEach(function (b) { b.classList.toggle('on', b.dataset.t === id); });
        elKartu.querySelectorAll('[data-p]').forEach(function (p) { p.hidden = p.dataset.p !== id; });
        var tb = tabs.find(function (x) { return x.id === id; });
        if (tb && !tb.tab && !dimuat[id]) { dimuat[id] = true; muatLazy(id, s, elKartu.querySelector('[data-p="' + id + '"]')); }
      }
      elKartu.querySelectorAll('.bi-ds-tab').forEach(function (b) { b.addEventListener('click', function () { pilihTab(b.dataset.t); }); });
      pilihTab(tabAktif);

      var bEdit = elKartu.querySelector('#biDsEdit');
      if (bEdit) bEdit.addEventListener('click', function () {
        editMode = true; tampilSiswa();
        snapAwal = JSON.stringify(bacaNilaiForm(elKartu));
        var nv = root.querySelector('.bi-ds-nav'); if (nv && nv.getBoundingClientRect().top < 0) nv.scrollIntoView({ block: 'start' });
      });
      var bBatal = elKartu.querySelector('#biDsBatal');
      if (bBatal) bBatal.addEventListener('click', function () {
        if (adaPerubahan() && !confirm('Perubahan yang belum disimpan akan dibuang. Lanjutkan?')) return;
        editMode = false; snapAwal = ''; tampilSiswa();
      });
      var bSimpan = elKartu.querySelector('#biDsSimpan');
      if (bSimpan) bSimpan.addEventListener('click', async function () {
        bSimpan.disabled = true; var teks = bSimpan.textContent; bSimpan.textContent = 'Menyimpan...';
        try {
          var v = bacaNilaiForm(elKartu);
          if (v.siswa.nama !== undefined && !v.siswa.nama) throw new Error('Nama lengkap tidak boleh kosong.');
          if (Object.keys(v.siswa).length) {
            var r1 = await sb().from('siswa').update(v.siswa).eq('id', s.id);
            if (r1.error) throw r1.error;
          }
          var d = Object.assign({ siswa_id: s.id, updated_by: BI.ctx.userId, updated_at: new Date().toISOString() }, v.detail);
          var r2 = await sb().from('bi_siswa_detail').upsert(d, { onConflict: 'siswa_id' });
          if (r2.error) throw r2.error;
          Object.assign(s, v.siswa, v.detail);
          editMode = false; snapAwal = '';
          tampilSiswa();
          toast('Tersimpan. Biodata dasar juga langsung berlaku di E-Rapor.');
        } catch (err) {
          toast('Gagal menyimpan: ' + pesanError(err), true);
          bSimpan.disabled = false; bSimpan.textContent = teks;
        }
      });

      // Upload foto: pilih jenis (saat masuk / saat lulus) lalu pilih file.
      var bUpl = elKartu.querySelector('#biDsUpl'), menuUpl = elKartu.querySelector('#biDsUplMenu'), inpFile = elKartu.querySelector('#biDsFile');
      if (bUpl && menuUpl && inpFile) {
        bUpl.addEventListener('click', function () { menuUpl.hidden = !menuUpl.hidden; });
        menuUpl.querySelectorAll('[data-j]').forEach(function (b) {
          b.addEventListener('click', function () { jenisFoto = b.dataset.j; menuUpl.hidden = true; inpFile.value = ''; inpFile.click(); });
        });
        inpFile.addEventListener('change', async function () {
          var file = inpFile.files[0]; var key = jenisFoto;
          if (!file || !key) return;
          var ket = key === 'masuk' ? 'saat masuk' : 'saat lulus';
          bUpl.disabled = true; var teksU = bUpl.textContent; bUpl.textContent = 'Mengunggah...';
          try {
            await unggahFotoSiswa(s, key, file);
            toast('Foto ' + ket + ' berhasil disimpan.');
            if (my === token) muatFotoKartu();
          } catch (err) { toast('Gagal mengunggah foto: ' + pesanError(err), true); }
          bUpl.disabled = false; bUpl.textContent = teksU; inpFile.value = '';
        });
      }
      elKartu.querySelector('#biDsCetak').addEventListener('click', function () { BI.cetak([s], 'biodata'); });
      elKartu.querySelector('#biDsCetakNilai').addEventListener('click', function () { BI.cetak([s], 'nilai'); });

      // Rata-rata semester dimuat belakangan (di-cache per siswa).
      (function () {
        var sid = s.id;
        function isiRata() { var el = elKartu.querySelector('#biDsRata'); if (el && my === token) el.innerHTML = htmlRata(rataCache[sid]); }
        if (rataCache[sid]) { isiRata(); return; }
        BI.muatRiwayat(sid).then(function (rows) { rataCache[sid] = hitungRata(rows); isiRata(); })
          .catch(function () { rataCache[sid] = {}; isiRata(); });
      })();
      // Foto & ringkasan pelanggaran dimuat belakangan supaya kartu langsung muncul.
      function muatFotoKartu() {
      BI.muatFotoSemua(s.id).then(function (foto) {
        if (my !== token) return;
        function isi(id, src, ket) {
          var el = elKartu.querySelector(id); if (!el || !src) return;
          el.hidden = false; el.innerHTML = '<img src="' + src + '" alt="' + ket + '"><small>' + ket + '</small>';
        }
        isi('#biDsFotoMasuk', foto.masuk, 'SAAT MASUK');
        isi('#biDsFotoLulus', foto.lulus, 'SAAT LULUS');
      }).catch(function () { /* foto tidak wajib */ });
      }
      muatFotoKartu();
      if (g.PelanggaranCP) {
        g.PelanggaranCP.ambil([pelItem(s)]).then(function (m) {
          if (my !== token) return;
          var rows = m[s.id] || [];
          var el = elKartu.querySelector('#biDsPel'); if (!el) return;
          if (rows.length) {
            el.innerHTML = '<span class="bi-ds-pill bi-ds-pill--warn" id="biDsPelChip">Pelanggaran ' + rows.length + ' catatan · ' + g.PelanggaranCP.totalPoin(rows) + ' poin</span>';
            var chip = elKartu.querySelector('#biDsPelChip');
            if (chip) chip.addEventListener('click', function () { pilihTab('pelanggaran'); });
            var tbtn = elKartu.querySelector('.bi-ds-tab[data-t="pelanggaran"]');
            if (tbtn) tbtn.innerHTML = 'Pelanggaran (CP)<span class="bi-ds-cnt">' + rows.length + '</span>';
          }
        }).catch(function () { /* CP tidak terjangkau */ });
      }
    }

    function ke(i) {
      if (i < 0 || i >= list.length) return;
      if (editMode) {
        if (adaPerubahan() && !confirm('Ada perubahan yang belum disimpan. Pindah siswa dan buang perubahan?')) return;
        editMode = false; snapAwal = '';
      }
      idx = i;
      tampilSiswa();
      var top = root.querySelector('.bi-ds-nav');
      if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: 'start' });
    }
    btnPrev.addEventListener('click', function () { ke(idx - 1); });
    btnNext.addEventListener('click', function () { ke(idx + 1); });

    // ----- Pencarian -----
    var sugIdx = -1, sugList = [];
    function cocok() {
      var q = elQ.value.trim().toLowerCase();
      var hasil = [];
      list.forEach(function (s, i) {
        if (!q || (s.nama || '').toLowerCase().indexOf(q) !== -1 || String(s.nis || '').toLowerCase().indexOf(q) !== -1 || String(s.nisn || '').toLowerCase().indexOf(q) !== -1) hasil.push(i);
      });
      return hasil;
    }
    function tampilSug() {
      sugList = cocok(); sugIdx = sugList.length ? 0 : -1;
      elSug.innerHTML = sugList.length ? sugList.map(function (i, n) {
        var s = list[i];
        return '<button type="button" data-i="' + i + '" class="' + (n === 0 ? 'on' : '') + '"><b>' + (i + 1) + '. ' + esc(s.nama) + '</b><small>NIS ' + esc(s.nis || '—') + '</small></button>';
      }).join('') : '<div class="bi-ds-none">Tidak ada siswa yang cocok.</div>';
      elSug.hidden = false;
      elSug.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('mousedown', function (e) { e.preventDefault(); pilih(Number(b.dataset.i)); });
      });
    }
    function pilih(i) { elSug.hidden = true; elQ.value = ''; elQ.blur(); ke(i); }
    function geserSug(d) {
      if (!sugList.length) return;
      sugIdx = (sugIdx + d + sugList.length) % sugList.length;
      var bs = elSug.querySelectorAll('button');
      bs.forEach(function (b, n) { b.classList.toggle('on', n === sugIdx); });
      if (bs[sugIdx]) bs[sugIdx].scrollIntoView({ block: 'nearest' });
    }
    elQ.addEventListener('focus', tampilSug);
    elQ.addEventListener('input', tampilSug);
    elQ.addEventListener('blur', function () { setTimeout(function () { elSug.hidden = true; }, 120); });
    elQ.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); geserSug(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); geserSug(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (sugIdx >= 0) pilih(sugList[sugIdx]); }
      else if (e.key === 'Escape') { elSug.hidden = true; elQ.blur(); }
    });

    // Panah kiri/kanan di keyboard = siswa sebelumnya/berikutnya (kecuali sedang mengetik).
    function onKey(e) {
      if (!document.body.contains(elKartu)) { detach(); return; }
      var tg = (e.target && e.target.tagName || '').toLowerCase();
      if (tg === 'input' || tg === 'textarea' || tg === 'select' || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-overlay') || editMode) return;
      if (e.key === 'ArrowLeft') { ke(idx - 1); }
      else if (e.key === 'ArrowRight') { ke(idx + 1); }
    }
    function onDocClick(e) {
      if (!document.body.contains(elKartu)) { detach(); return; }
      var m = elKartu.querySelector('#biDsUplMenu');
      if (m && !m.hidden && !(e.target.closest && e.target.closest('.bi-ds-upl'))) m.hidden = true;
    }
    function detach() { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onDocClick); }
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onDocClick);

    tampilSiswa();
  };

  // ================= Perkembangan belajar (ditarik dari E-Rapor) =================
  var cacheMapel = null;
  async function ambilMapel() {
    if (cacheMapel) return cacheMapel;
    var rows = await pageAll(function (a, b) {
      return sb().from('mata_pelajaran').select('id, nama, kode, kkm, urutan_rapor, urutan_leger, agama_spesifik').order('id').range(a, b);
    });
    cacheMapel = {};
    rows.forEach(function (m) { cacheMapel[m.id] = m; });
    return cacheMapel;
  }

  // Tarik nilai, presensi, ekskul, PKL & kokurikuler dari E-Rapor untuk daftar siswa,
  // lalu simpan sebagai arsip per semester. Baris yang "dikunci" (diisi
  // manual) tidak ditimpa.
  // Hasil: { siswa, diperbarui, dilewatiKunci, tanpaData }
  BI.tarikDariRapor = async function (siswaList, onProgress) {
    var hasil = { siswa: siswaList.length, diperbarui: 0, dilewatiKunci: 0, tanpaData: 0, pklBelumSemester6: 0 };
    var mapelMap = await ambilMapel();
    var ekskulRows = await pageAll(function (a, b) { return sb().from('ekstrakurikuler').select('id, nama').order('id').range(a, b); });
    var ekskulNama = {};
    ekskulRows.forEach(function (e) { ekskulNama[e.id] = e.nama; });

    var agamaById = {};
    siswaList.forEach(function (s) { agamaById[s.id] = s.agama; });

    var potong = chunk(siswaList.map(function (s) { return s.id; }), 40);
    for (var i = 0; i < potong.length; i++) {
      var ids = potong[i];
      var sk = await inChunks(ids, function (p, a, b) {
        return sb().from('siswa_kelas').select('id, siswa_id, tahun_ajaran_id, kelas:kelas_id(id, nama, tingkat), ta:tahun_ajaran_id(nama, semester)').in('siswa_id', p).order('id').range(a, b);
      });
      var nilaiRows = await inChunks(ids, function (p, a, b) {
        return sb().from('nilai').select('id, siswa_id, mapel_id, tahun_ajaran_id, nilai').in('siswa_id', p).eq('jenis', 'rapor').order('id').range(a, b);
      });
      var presRows = await inChunks(ids, function (p, a, b) {
        return sb().from('rekap_presensi').select('id, siswa_id, tahun_ajaran_id, jumlah_sakit, jumlah_izin, jumlah_alpha, catatan_wali_kelas').in('siswa_id', p).order('id').range(a, b);
      });
      var ekRows = [], nekRows = [], pklRows = [], kokuRows = [];
      try { ekRows = await inChunks(ids, function (p, a, b) { return sb().from('ekstrakurikuler_siswa').select('id, siswa_id, tahun_ajaran_id, ekstrakurikuler_id').in('siswa_id', p).order('id').range(a, b); }); } catch (e) { /* abaikan */ }
      try { nekRows = await inChunks(ids, function (p, a, b) { return sb().from('nilai_ekstrakurikuler').select('id, siswa_id, tahun_ajaran_id, ekstrakurikuler_id, predikat').in('siswa_id', p).order('id').range(a, b); }); } catch (e) { /* abaikan */ }
      try { pklRows = await inChunks(ids, function (p, a, b) { return sb().from('nilai_pkl').select('id, siswa_id, tahun_ajaran_id, sumber, nilai_akhir').in('siswa_id', p).order('id').range(a, b); }); } catch (e) { /* abaikan */ }
      try { kokuRows = await inChunks(ids, function (p, a, b) { return sb().from('nilai_kokurikuler').select('id, siswa_id, tahun_ajaran_id, nama_kegiatan, deskripsi').in('siswa_id', p).order('id').range(a, b); }); } catch (e) { /* abaikan */ }
      var lama = await inChunks(ids, function (p, a, b) {
        return sb().from('bi_riwayat_semester').select('id, siswa_id, ta_nama, ta_semester, dikunci').in('siswa_id', p).order('id').range(a, b);
      });

      function kelompok(rows) {
        var m = {};
        rows.forEach(function (r) { var k = r.siswa_id + '|' + r.tahun_ajaran_id; (m[k] = m[k] || []).push(r); });
        return m;
      }
      var nilaiBy = kelompok(nilaiRows), presBy = kelompok(presRows), ekBy = kelompok(ekRows), nekBy = kelompok(nekRows), pklBy = kelompok(pklRows), kokuBy = kelompok(kokuRows);
      var kunciSet = {};
      lama.forEach(function (r) { if (r.dikunci) kunciSet[r.siswa_id + '|' + r.ta_nama + '|' + r.ta_semester] = true; });

      // Nilai akhir PKL per siswa = rata-rata nilai akhir DUDI & penguji (sama seperti di E-Rapor;
      // kosong bila salah satunya belum diisi). Bila ada beberapa tahun ajaran, dipakai yang terbaru.
      var taUrut = {};
      sk.forEach(function (r) { if (r.ta) taUrut[r.tahun_ajaran_id] = r.ta.nama + (r.ta.semester === 'Genap' ? '2' : '1'); });
      var pklAkhir = {};
      Object.keys(pklBy).forEach(function (k) {
        var rs = pklBy[k], sid = k.split('|')[0], taId = k.split('|')[1];
        var du = rs.filter(function (x) { return x.sumber === 'dudi'; })[0];
        var pg = rs.filter(function (x) { return x.sumber === 'penguji' || x.sumber === 'guru_pendamping'; })[0];
        if (!du || !pg || du.nilai_akhir === null || du.nilai_akhir === undefined || pg.nilai_akhir === null || pg.nilai_akhir === undefined) return;
        var v = Math.round((Number(du.nilai_akhir) + Number(pg.nilai_akhir)) / 2 * 100) / 100;
        var u = taUrut[taId] || '';
        if (!pklAkhir[sid] || u > pklAkhir[sid].u) pklAkhir[sid] = { v: v, u: u };
      });
      var punyaSem6 = {};

      var upserts = [];
      sk.forEach(function (r) {
        if (!r.kelas || !r.ta) return;
        var key = r.siswa_id + '|' + r.tahun_ajaran_id;
        var agama = agamaById[r.siswa_id];
        var nilai = [];
        (nilaiBy[key] || []).forEach(function (n) {
          if (n.nilai === null || n.nilai === undefined) return;
          var m = mapelMap[n.mapel_id];
          if (!m) return;
          if (m.agama_spesifik && agama && m.agama_spesifik !== agama) return;
          nilai.push({
            mapel: namaMapelUntukSiswa(m.nama, agama), kode: m.kode || null, nilai: Number(n.nilai), kkm: m.kkm,
            urut: (m.urutan_leger != null ? m.urutan_leger : (m.urutan_rapor != null ? m.urutan_rapor : 9999))
          });
        });
        if (hitungSemesterKe(r.kelas.tingkat, r.ta.semester) === 6) {
          punyaSem6[r.siswa_id] = true;
          if (pklAkhir[r.siswa_id] && !nilai.some(function (x) { return adalahPkl(x.mapel); })) {
            nilai.push({ mapel: PKL_NAMA, kode: 'PKL', nilai: pklAkhir[r.siswa_id].v, kkm: null, urut: 9998 });
          }
        }
        nilai.sort(function (a, b) { return (a.urut - b.urut) || a.mapel.localeCompare(b.mapel); });
        var pres = (presBy[key] || [])[0];
        var koku = (kokuBy[key] || []).filter(function (k) { return (k.nama_kegiatan || '').trim() || (k.deskripsi || '').trim(); })
          .map(function (k) { return { nama: (k.nama_kegiatan || '').trim(), deskripsi: (k.deskripsi || '').trim() }; })
          .sort(function (a, b) { return a.nama.localeCompare(b.nama); });
        if (!nilai.length && !pres && !koku.length) { hasil.tanpaData++; return; }
        if (kunciSet[r.siswa_id + '|' + r.ta.nama + '|' + r.ta.semester]) { hasil.dilewatiKunci++; return; }

        var eks = (ekBy[key] || []).map(function (e) {
          var nk = (nekBy[key] || []).find(function (x) { return x.ekstrakurikuler_id === e.ekstrakurikuler_id; });
          return { nama: ekskulNama[e.ekstrakurikuler_id] || '—', predikat: nk ? nk.predikat : null };
        });

        upserts.push({
          siswa_id: r.siswa_id, ta_nama: r.ta.nama, ta_semester: r.ta.semester,
          semester_ke: hitungSemesterKe(r.kelas.tingkat, r.ta.semester), kelas_nama: r.kelas.nama,
          nilai: nilai,
          jumlah_sakit: pres ? pres.jumlah_sakit : 0, jumlah_izin: pres ? pres.jumlah_izin : 0, jumlah_alpha: pres ? pres.jumlah_alpha : 0,
          catatan_wali: pres ? (pres.catatan_wali_kelas || null) : null,
          ekskul: eks, nilai_pkl: null, kokurikuler: koku, sumber: 'rapor', dikunci: false,
          updated_by: BI.ctx.userId, updated_at: new Date().toISOString()
        });
      });

      Object.keys(pklAkhir).forEach(function (sid) { if (!punyaSem6[sid]) hasil.pklBelumSemester6++; });

      var batches = chunk(upserts, 100);
      for (var j = 0; j < batches.length; j++) {
        var up = await sb().from('bi_riwayat_semester').upsert(batches[j], { onConflict: 'siswa_id,ta_nama,ta_semester' });
        if (up.error) throw up.error;
        hasil.diperbarui += batches[j].length;
      }
      if (onProgress) onProgress(Math.min((i + 1) * 40, siswaList.length), siswaList.length);
    }
    return hasil;
  };

  BI.muatRiwayat = async function (siswaId) {
    var r = await sb().from('bi_riwayat_semester').select('*').eq('siswa_id', siswaId);
    if (r.error) throw r.error;
    var rows = r.data || [];
    rows.sort(function (a, b) {
      var sa = a.semester_ke || 99, sb2 = b.semester_ke || 99;
      if (sa !== sb2) return sa - sb2;
      return (a.ta_nama + a.ta_semester).localeCompare(b.ta_nama + b.ta_semester);
    });
    return rows;
  };

  function rataNilai(nilai) {
    var arr = (nilai || []).map(function (n) { return Number(n.nilai); }).filter(function (x) { return !isNaN(x); });
    if (!arr.length) return null;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  }

  // Tabel leger: baris = mapel, kolom = semester 1-6
  function legerHtml(rows, kecil) {
    var bySem = {};
    rows.forEach(function (r) { if (r.semester_ke) bySem[r.semester_ke] = r; });
    var mapel = {};
    rows.forEach(function (r) {
      nilaiEfektif(r).forEach(function (n) {
        var k = n.mapel;
        if (!mapel[k]) mapel[k] = { nama: n.mapel, urut: n.urut == null ? 9999 : n.urut };
        else if ((n.urut == null ? 9999 : n.urut) < mapel[k].urut) mapel[k].urut = n.urut;
      });
    });
    var daftar = Object.keys(mapel).map(function (k) { return mapel[k]; }).sort(function (a, b) { return (a.urut - b.urut) || a.nama.localeCompare(b.nama); });
    if (!daftar.length) return '';
    var head = '<tr><th>Mata Pelajaran</th>' + [1, 2, 3, 4, 5, 6].map(function (k) {
      var r = bySem[k];
      return '<th style="text-align:center;">Smt ' + k + (r ? '<div style="font-weight:400;font-size:' + (kecil ? '8' : '10.5') + 'px;">' + esc(r.kelas_nama || '') + '</div>' : '') + '</th>';
    }).join('') + '</tr>';
    var body = daftar.map(function (m) {
      return '<tr><td>' + esc(m.nama) + '</td>' + [1, 2, 3, 4, 5, 6].map(function (k) {
        var r = bySem[k], v = '';
        if (r) { var n = nilaiEfektif(r).find(function (x) { return x.mapel === m.nama; }); if (n) v = Math.round(Number(n.nilai)); }
        return '<td style="text-align:center;">' + v + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var rata = '<tr style="font-weight:700;"><td>Rata-rata</td>' + [1, 2, 3, 4, 5, 6].map(function (k) {
      var r = bySem[k], x = r ? rataNilai(nilaiEfektif(r)) : null;
      return '<td style="text-align:center;">' + (x === null ? '' : x.toFixed(1)) + '</td>';
    }).join('') + '</tr>';
    return { head: head, body: body + rata };
  }

  // Daftar kokurikuler per semester: [{ta, sem, ke, nama, deskripsi}] urut semester
  function kokuDaftar(rows) {
    var out = [];
    rows.forEach(function (r) {
      (r.kokurikuler || []).forEach(function (k) { out.push({ ta: r.ta_nama, sem: r.ta_semester, ke: r.semester_ke, nama: k.nama || '', deskripsi: k.deskripsi || '' }); });
    });
    return out;
  }

  function kokuLayarHtml(rows) {
    var d = kokuDaftar(rows);
    return '<div class="section-title" style="margin-top:20px;">Kokurikuler</div>' + (d.length ?
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tahun Ajaran</th><th>Semester</th><th>Nama Kegiatan</th><th>Deskripsi (Capaian)</th></tr></thead><tbody>' +
      d.map(function (k) { return '<tr><td>' + esc(k.ta) + '</td><td>' + esc(k.sem) + '</td><td>' + esc(k.nama || '—') + '</td><td style="white-space:pre-wrap;">' + esc(k.deskripsi || '—') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="panel-note">Belum ada data kokurikuler. Klik "Tarik Ulang dari E-Rapor" bila nilai kokurikuler sudah diisi di E-Rapor.</div>');
  }

  async function renderPerkembangan(el, s, bolehUbah) {
    var rows;
    try { rows = await BI.muatRiwayat(s.id); } catch (e) { el.innerHTML = '<div class="panel-note">' + esc(pesanError(e)) + '</div>'; return; }

    if (!rows.length && bolehUbah) {
      el.innerHTML = '<div class="panel-note">Mengambil data semester dari E-Rapor...</div>';
      try { await BI.tarikDariRapor([s]); rows = await BI.muatRiwayat(s.id); } catch (e) { el.innerHTML = '<div class="panel-note">' + esc(pesanError(e)) + '</div>'; return; }
    }

    var lg = legerHtml(rows);
    el.innerHTML =
      '<div class="toolbar" style="margin-top:6px;">' +
      (bolehUbah ? '<button class="btn-small btn-small--primary" id="biTarik">⟳ Tarik Ulang dari E-Rapor</button>' +
        '<button class="btn-small" id="biTambahManual">+ Tambah Semester Manual</button>' : '') + '</div>' +
      '<div class="panel-note">Data nilai, kehadiran, ekstrakurikuler & kokurikuler di bawah diambil dari E-Rapor dan diarsipkan di Buku Induk. Nilai akhir PKL (rata-rata nilai DUDI & penguji) masuk sebagai mata pelajaran pada semester 6. ' +
      'Semester yang diisi/diubah manual dikunci dan tidak ditimpa saat tarik ulang.</div>' +
      (rows.length ? (lg ? '<div class="section-title">Nilai Rapor per Semester</div><div class="table-wrap"><table class="data-table"><thead>' + lg.head + '</thead><tbody>' + lg.body + '</tbody></table></div>' : '') +
        '<div class="section-title" style="margin-top:20px;">Kehadiran, Ekstrakurikuler & Catatan</div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Smt</th><th>Kelas</th><th>Tahun Ajaran</th><th>S</th><th>I</th><th>A</th><th>Ekstrakurikuler</th><th>Sumber</th><th></th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + (r.semester_ke || '—') + '</td><td>' + esc(r.kelas_nama || '—') + '</td><td>' + esc(r.ta_nama) + ' ' + esc(r.ta_semester) + '</td>' +
            '<td>' + (r.jumlah_sakit || 0) + '</td><td>' + (r.jumlah_izin || 0) + '</td><td>' + (r.jumlah_alpha || 0) + '</td>' +
            '<td>' + esc((r.ekskul || []).map(function (e) { return e.nama + (e.predikat ? ' (' + e.predikat + ')' : ''); }).join(', ') || '—') + '</td>' +
            '<td><span class="chip ' + (r.sumber === 'manual' ? 'chip--muted' : 'chip--aktif') + '">' + (r.sumber === 'manual' ? 'manual' : 'E-Rapor') + '</span></td>' +
            '<td style="white-space:nowrap;">' + (bolehUbah ? '<button class="btn-small" data-ubah="' + r.id + '">Ubah</button> <button class="btn-small btn-small--danger" data-hapus="' + r.id + '">Hapus</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>' + kokuLayarHtml(rows)
        : '<div class="empty-state"><div class="empty-state__mark">！</div><div class="empty-state__title">Belum ada data semester</div>' +
        '<div class="empty-state__desc">Belum ada nilai atau presensi di E-Rapor untuk siswa ini. Isi dulu di E-Rapor, atau tambahkan semester secara manual.</div></div>');

    var btnTarik = el.querySelector('#biTarik');
    if (btnTarik) btnTarik.addEventListener('click', async function () {
      btnTarik.disabled = true; btnTarik.textContent = 'Menarik...';
      try {
        var h = await BI.tarikDariRapor([s]);
        alert('Selesai. ' + h.diperbarui + ' semester diperbarui' + (h.dilewatiKunci ? ', ' + h.dilewatiKunci + ' dilewati karena dikunci (manual)' : '') + '.' + (h.pklBelumSemester6 ? '\nNilai PKL sudah ada, tetapi semester 6 siswa ini belum ada di E-Rapor, jadi belum bisa ditaruh di semester 6.' : ''));
      } catch (e) { alert('Gagal menarik data: ' + pesanError(e)); }
      renderPerkembangan(el, s, bolehUbah);
    });
    var btnManual = el.querySelector('#biTambahManual');
    if (btnManual) btnManual.addEventListener('click', function () { modalSemester(s, null, function () { renderPerkembangan(el, s, bolehUbah); }); });
    el.querySelectorAll('[data-ubah]').forEach(function (b) {
      b.addEventListener('click', function () {
        var r = rows.find(function (x) { return x.id === b.dataset.ubah; });
        modalSemester(s, r, function () { renderPerkembangan(el, s, bolehUbah); });
      });
    });
    el.querySelectorAll('[data-hapus]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Hapus arsip semester ini dari Buku Induk? (Data di E-Rapor tidak terhapus.)')) return;
        var r = await sb().from('bi_riwayat_semester').delete().eq('id', b.dataset.hapus);
        if (r.error) { alert('Gagal menghapus: ' + pesanError(r.error)); return; }
        renderPerkembangan(el, s, bolehUbah);
      });
    });
  }

  function modalSemester(s, r, selesai) {
    var o = document.createElement('div');
    o.className = 'modal-overlay';
    var nilaiTeks = r ? nilaiEfektif(r).map(function (n) { return n.mapel + ' | ' + n.nilai; }).join('\n') : '';
    var ekTeks = r ? (r.ekskul || []).map(function (e) { return e.nama + (e.predikat ? ' | ' + e.predikat : ''); }).join('\n') : '';
    var kokuTeks = r ? (r.kokurikuler || []).map(function (k) { return (k.nama || '') + ' | ' + (k.deskripsi || '').replace(/\n/g, ' '); }).join('\n') : '';
    var taBawaan = BI.ctx.ta ? BI.ctx.ta.nama : '';
    o.innerHTML = '<div class="modal-box"><div class="modal-box__head"><div class="modal-box__title">' + (r ? 'Ubah' : 'Tambah') + ' Semester Manual</div>' +
      '<button class="modal-box__close" type="button" data-x>×</button></div>' +
      '<div class="modal-box__desc">Dipakai untuk data yang tidak ada di E-Rapor (tahun lama, siswa pindahan). Baris yang disimpan di sini dikunci dan tidak ditimpa saat tarik dari E-Rapor.</div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Tahun Ajaran</label><input type="text" id="msTa" placeholder="2023/2024" value="' + esc(r ? r.ta_nama : taBawaan) + '"' + (r ? ' disabled' : '') + '></div>' +
      '<div class="field"><label>Semester</label><select id="msSem"' + (r ? ' disabled' : '') + '><option>Gasal</option><option' + (r && r.ta_semester === 'Genap' ? ' selected' : '') + '>Genap</option></select></div>' +
      '<div class="field"><label>Semester ke- (1–6)</label><input type="number" id="msKe" min="1" max="6" value="' + esc(r ? r.semester_ke : '') + '"></div>' +
      '<div class="field"><label>Kelas</label><input type="text" id="msKelas" value="' + esc(r ? r.kelas_nama : '') + '"></div>' +
      '<div class="field"><label>Sakit</label><input type="number" id="msS" min="0" value="' + esc(r ? r.jumlah_sakit : 0) + '"></div>' +
      '<div class="field"><label>Izin</label><input type="number" id="msI" min="0" value="' + esc(r ? r.jumlah_izin : 0) + '"></div>' +
      '<div class="field"><label>Tanpa Keterangan</label><input type="number" id="msA" min="0" value="' + esc(r ? r.jumlah_alpha : 0) + '"></div>' +
      '<div class="field field--full"><label>Nilai Mapel — satu baris satu mapel, format: Nama Mapel | Nilai (nilai akhir PKL ditulis di semester 6, mis. Praktik Kerja Lapangan (PKL) | 85)</label>' +
      '<textarea id="msNilai" rows="7" style="width:100%;padding:9px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13px;" placeholder="Matematika | 82">' + esc(nilaiTeks) + '</textarea></div>' +
      '<div class="field field--full"><label>Ekstrakurikuler — format: Nama | Predikat (opsional)</label>' +
      '<textarea id="msEks" rows="2" style="width:100%;padding:9px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13px;">' + esc(ekTeks) + '</textarea></div>' +
      '<div class="field field--full"><label>Kokurikuler — satu baris satu kegiatan, format: Nama Kegiatan | Deskripsi capaian</label>' +
      '<textarea id="msKoku" rows="3" style="width:100%;padding:9px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13px;">' + esc(kokuTeks) + '</textarea></div>' +
      '<div class="field field--full"><label>Catatan Wali Kelas</label>' +
      '<textarea id="msCat" rows="2" style="width:100%;padding:9px 10px;border:1px solid var(--border-strong);border-radius:var(--radius-sm);font-family:var(--font-body);font-size:13px;">' + esc(r ? r.catatan_wali : '') + '</textarea></div>' +
      '</div><div class="modal-box__actions"><button class="btn-small" data-x type="button">Batal</button><button class="btn-small btn-small--primary" id="msSimpan" type="button">Simpan</button></div></div>';
    document.body.appendChild(o);
    o.querySelectorAll('[data-x]').forEach(function (b) { b.addEventListener('click', function () { o.remove(); }); });
    o.querySelector('#msSimpan').addEventListener('click', async function () {
      var ta = o.querySelector('#msTa').value.trim();
      if (!/^\d{4}\/\d{4}$/.test(ta)) { alert('Tahun ajaran harus berformat 2023/2024.'); return; }
      var ke = o.querySelector('#msKe').value ? Number(o.querySelector('#msKe').value) : null;
      if (ke !== null && (ke < 1 || ke > 6)) { alert('Semester ke- harus 1 sampai 6.'); return; }
      var nilai = [];
      o.querySelector('#msNilai').value.split('\n').forEach(function (ln, idx) {
        var p = ln.split('|');
        if (p.length < 2 || !p[0].trim()) return;
        var n = Number(String(p[1]).trim().replace(',', '.'));
        if (!isNaN(n)) nilai.push({ mapel: p[0].trim(), kode: null, nilai: n, kkm: null, urut: idx + 1 });
      });
      var ekskul = [];
      o.querySelector('#msEks').value.split('\n').forEach(function (ln) {
        var p = ln.split('|');
        if (!p[0].trim()) return;
        ekskul.push({ nama: p[0].trim(), predikat: p[1] ? p[1].trim() : null });
      });
      var kokurikuler = [];
      o.querySelector('#msKoku').value.split('\n').forEach(function (ln) {
        var i = ln.indexOf('|');
        var nm = (i < 0 ? ln : ln.slice(0, i)).trim(), ds = i < 0 ? '' : ln.slice(i + 1).trim();
        if (nm || ds) kokurikuler.push({ nama: nm, deskripsi: ds });
      });
      var row = {
        siswa_id: s.id, ta_nama: ta, ta_semester: o.querySelector('#msSem').value, semester_ke: ke,
        kelas_nama: o.querySelector('#msKelas').value.trim() || null, nilai: nilai,
        jumlah_sakit: Number(o.querySelector('#msS').value) || 0, jumlah_izin: Number(o.querySelector('#msI').value) || 0, jumlah_alpha: Number(o.querySelector('#msA').value) || 0,
        catatan_wali: o.querySelector('#msCat').value.trim() || null, ekskul: ekskul, kokurikuler: kokurikuler, nilai_pkl: null,
        sumber: 'manual', dikunci: true, updated_by: BI.ctx.userId, updated_at: new Date().toISOString()
      };
      var res = await sb().from('bi_riwayat_semester').upsert(row, { onConflict: 'siswa_id,ta_nama,ta_semester' });
      if (res.error) { alert('Gagal menyimpan: ' + pesanError(res.error)); return; }
      o.remove();
      selesai();
    });
  }

  // ================= Prestasi & catatan =================
  async function renderCatatan(el, s, bolehUbah) {
    var r = await sb().from('bi_catatan').select('*').eq('siswa_id', s.id).order('tanggal', { ascending: false, nullsFirst: false });
    if (r.error) { el.innerHTML = '<div class="panel-note">' + esc(pesanError(r.error)) + '</div>'; return; }
    var rows = r.data || [];
    el.innerHTML =
      (bolehUbah ? '<div class="form-section-title">Tambah Catatan</div><div class="form-grid">' +
        '<div class="field"><label>Kategori</label><select id="ctKat">' + F.KATEGORI_CATATAN.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label>Tanggal</label><input type="date" id="ctTgl"></div>' +
        '<div class="field"><label>Tingkat (sekolah / kecamatan / kabupaten / provinsi / nasional)</label><input type="text" id="ctTingkat"></div>' +
        '<div class="field field--full"><label>Uraian</label><input type="text" id="ctUraian" placeholder="Contoh: Juara 2 Lomba Kompetensi Siswa bidang Agribisnis Ternak"></div></div>' +
        '<div class="toolbar" style="margin-top:12px;"><button class="btn-small btn-small--primary" id="ctTambah">+ Tambah</button></div>' : '') +
      '<div class="form-section-title">Daftar Catatan</div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tanggal</th><th>Kategori</th><th>Tingkat</th><th>Uraian</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (c) {
        return '<tr><td>' + esc(fmtTgl(c.tanggal) || '—') + '</td><td>' + esc(c.kategori) + '</td><td>' + esc(c.tingkat || '—') + '</td><td>' + esc(c.uraian) + '</td>' +
          '<td>' + (bolehUbah ? '<button class="btn-small btn-small--danger" data-del="' + c.id + '">Hapus</button>' : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="5">Belum ada catatan.</td></tr>') + '</tbody></table></div>';

    var tambah = el.querySelector('#ctTambah');
    if (tambah) tambah.addEventListener('click', async function () {
      var uraian = el.querySelector('#ctUraian').value.trim();
      if (!uraian) { alert('Uraian wajib diisi.'); return; }
      var res = await sb().from('bi_catatan').insert({
        siswa_id: s.id, kategori: el.querySelector('#ctKat').value, tanggal: el.querySelector('#ctTgl').value || null,
        tingkat: el.querySelector('#ctTingkat').value.trim() || null, uraian: uraian, dicatat_oleh: BI.ctx.userId
      });
      if (res.error) { alert('Gagal menyimpan: ' + pesanError(res.error)); return; }
      renderCatatan(el, s, bolehUbah);
    });
    el.querySelectorAll('[data-del]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!confirm('Hapus catatan ini?')) return;
        var res = await sb().from('bi_catatan').delete().eq('id', b.dataset.del);
        if (res.error) { alert('Gagal menghapus: ' + pesanError(res.error)); return; }
        renderCatatan(el, s, bolehUbah);
      });
    });
  }

  // ================= Pelanggaran (dibaca dari aplikasi CP, hanya-baca) =================
  function pelItem(s) { return { id: s.id, nis: s.nis, nama: s.nama, kelasNama: s.kelas ? s.kelas.nama : '' }; }
  async function renderPelanggaranCP(el, s) {
    if (!g.PelanggaranCP) { el.innerHTML = '<div class="panel-note">Modul pelanggaran-cp.js belum dimuat.</div>'; return; }
    try {
      var m = await g.PelanggaranCP.ambil([pelItem(s)], { segar: true });
      var rows = m[s.id] || [];
      el.innerHTML = '<div class="panel-note" style="margin-bottom:8px;">Data dibaca langsung dari aplikasi CP (hanya baca). Untuk menambah atau mengubah catatan, gunakan aplikasi CP.</div>' +
        g.PelanggaranCP.tabelHtml(rows, { pelapor: true });
    } catch (e) {
      el.innerHTML = '<div class="panel-note">Gagal memuat data pelanggaran dari CP: ' + esc(e.message || e) + '</div>';
    }
  }

  // ================= Cetak Buku Induk =================
  // jenis: 'biodata' | 'nilai' | 'lengkap' (bawaan: lengkap)
  // opsi (opsional): { sembunyi: {kolom:true}, tanpaCatatan: true }
  //   dipakai Portal Siswa: isian internal & catatan wali kelas tidak ikut tercetak.
  var opsiCetak = {};
  BI.cetak = async function (list, jenis, opsi) {
    jenis = jenis || 'lengkap';
    opsiCetak = opsi || {};
    if (!list.length) { alert('Tidak ada siswa untuk dicetak.'); return; }
    var w = window.open('', '_blank');
    if (!w) { alert('Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.'); return; }
    w.document.write('<p style="font-family:sans-serif;">Menyiapkan cetak...</p>');
    try {
      var ids = list.map(function (s) { return s.id; });
      var fotoMap = await muatFotoBanyak(ids);
      var rwRows = await inChunks(ids, function (p, a, b) { return sb().from('bi_riwayat_semester').select('*').in('siswa_id', p).order('id').range(a, b); });
      var ctRows = await inChunks(ids, function (p, a, b) { return sb().from('bi_catatan').select('*').in('siswa_id', p).order('id').range(a, b); });
      var pelMap = null;
      if (jenis !== 'nilai' && g.PelanggaranCP) { try { pelMap = await g.PelanggaranCP.ambil(list.map(pelItem)); } catch (e) { pelMap = null; } }
      var pr = await sb().from('profil_sekolah').select('*').maybeSingle();
      var profil = pr.data || {};
      var logo = new URL('assets/logo.png', g.location.href).href;

      var halaman = list.map(function (s) {
        var rw = rwRows.filter(function (r) { return r.siswa_id === s.id; }).sort(function (a, b) { return (a.semester_ke || 99) - (b.semester_ke || 99); });
        var ct = ctRows.filter(function (r) { return r.siswa_id === s.id; });
        return halamanSiswa(s, fotoMap[s.id] || {}, rw, ct, profil, logo, jenis, pelMap ? (pelMap[s.id] || []) : null);
      }).join('');

      var css = cssCetak();
      w.document.open();
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + (jenis === 'nilai' ? 'Nilai' : jenis === 'biodata' ? 'Biodata' : 'Buku Induk') + '</title><style>' + css + '</style></head><body>' + halaman + '</body></html>');
      w.document.close();
      w.focus();
      // Tunggu semua foto (dari Storage) selesai dimuat sebelum dialog cetak dibuka (maks 10 dtk).
      var imgs = Array.prototype.slice.call(w.document.images);
      var tunggu = Promise.all(imgs.map(function (im) {
        return im.complete ? Promise.resolve() : new Promise(function (ok) { im.onload = im.onerror = ok; });
      }));
      await Promise.race([tunggu, new Promise(function (ok) { setTimeout(ok, 10000); })]);
      setTimeout(function () { w.print(); }, 300);
    } catch (e) {
      w.document.body.innerHTML = '<p style="font-family:sans-serif;color:#b91c1c;">Gagal menyiapkan cetak: ' + esc(pesanError(e)) + '</p>';
    }
  };


  // Keterangan penerimaan: Baru / Pindahan
  function keteranganMasuk(s) {
    var d = String(s.diterima_sebagai || '').toLowerCase();
    if (d.indexOf('pindah') !== -1) return 'Pindahan';
    if (d) return 'Baru';
    return kosong(s.pindahan_dari) ? 'Baru' : 'Pindahan';
  }

  // ---- Cover Buku Induk (gaya modern: biru-navy, kartu info, gedung sekolah) ----
  var SVG_GEDUNG = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 560 320\" style=\"width:100%;height:auto;display:block\"><defs><linearGradient id=\"gl\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0\" stop-color=\"#a9c9ef\"/><stop offset=\"1\" stop-color=\"#4f86cf\"/></linearGradient><linearGradient id=\"wl\" x1=\"0\" y1=\"0\" x2=\"0\" y2=\"1\"><stop offset=\"0\" stop-color=\"#ffffff\"/><stop offset=\"1\" stop-color=\"#e6eef9\"/></linearGradient></defs><polygon points=\"12,142.0 289,82.0 289,96.0 12,152.0\" fill=\"#8fb6e8\"/><polygon points=\"12,142.0 289,82.0 289,87.0 12,147.0\" fill=\"#3f78c4\"/><polygon points=\"20,150.0 285,96.0 285,274.0 20,252.0\" fill=\"url(#wl)\"/><polygon points=\"20,198.0 285,182.0 285,188.0 20,204.0\" fill=\"#dbe8f8\"/><polygon points=\"27.0,161.1 66.0,154.4 66.0,190.2 27.0,193.3\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"40.0\" y1=\"158.9\" x2=\"40.0\" y2=\"192.3\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"53.0\" y1=\"156.7\" x2=\"53.0\" y2=\"191.2\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"27.0\" y1=\"177.2\" x2=\"66.0\" y2=\"172.3\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"27.0,208.9 66.0,207.4 66.0,244.3 27.0,242.2\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"40.0\" y1=\"208.4\" x2=\"40.0\" y2=\"242.9\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"53.0\" y1=\"207.9\" x2=\"53.0\" y2=\"243.6\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"27.0\" y1=\"225.5\" x2=\"66.0\" y2=\"225.9\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"80.0,152.1 119.0,145.5 119.0,185.9 80.0,189.0\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"93.0\" y1=\"149.9\" x2=\"93.0\" y2=\"188.0\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"106.0\" y1=\"147.7\" x2=\"106.0\" y2=\"186.9\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"80.0\" y1=\"170.6\" x2=\"119.0\" y2=\"165.7\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"80.0,206.9 119.0,205.5 119.0,247.2 80.0,245.1\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"93.0\" y1=\"206.4\" x2=\"93.0\" y2=\"245.8\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"106.0\" y1=\"205.9\" x2=\"106.0\" y2=\"246.5\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"80.0\" y1=\"226.0\" x2=\"119.0\" y2=\"226.3\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"133.0,143.1 172.0,136.5 172.0,181.6 133.0,184.8\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"146.0\" y1=\"140.9\" x2=\"146.0\" y2=\"183.7\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"159.0\" y1=\"138.7\" x2=\"159.0\" y2=\"182.7\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"133.0\" y1=\"163.9\" x2=\"172.0\" y2=\"159.1\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"133.0,204.9 172.0,203.5 172.0,250.1 133.0,247.9\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"146.0\" y1=\"204.4\" x2=\"146.0\" y2=\"248.6\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"159.0\" y1=\"204.0\" x2=\"159.0\" y2=\"249.4\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"133.0\" y1=\"226.4\" x2=\"172.0\" y2=\"226.8\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"186.0,134.1 225.0,127.5 225.0,177.4 186.0,180.5\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"199.0\" y1=\"131.9\" x2=\"199.0\" y2=\"179.5\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"212.0\" y1=\"129.7\" x2=\"212.0\" y2=\"178.4\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"186.0\" y1=\"157.3\" x2=\"225.0\" y2=\"152.4\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"186.0,202.9 225.0,201.5 225.0,252.9 186.0,250.8\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"199.0\" y1=\"202.5\" x2=\"199.0\" y2=\"251.5\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"212.0\" y1=\"202.0\" x2=\"212.0\" y2=\"252.2\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"186.0\" y1=\"226.9\" x2=\"225.0\" y2=\"227.2\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"239.0,125.2 278.0,118.5 278.0,173.1 239.0,176.2\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"252.0\" y1=\"122.9\" x2=\"252.0\" y2=\"175.2\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"265.0\" y1=\"120.7\" x2=\"265.0\" y2=\"174.1\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"239.0\" y1=\"150.7\" x2=\"278.0\" y2=\"145.8\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"239.0,201.0 278.0,199.5 278.0,255.8 239.0,253.7\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\" stroke-width=\"1\"/><line x1=\"252.0\" y1=\"200.5\" x2=\"252.0\" y2=\"254.4\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"265.0\" y1=\"200.0\" x2=\"265.0\" y2=\"255.1\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"239.0\" y1=\"227.3\" x2=\"278.0\" y2=\"227.7\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><polygon points=\"17.0,150.6 23.0,149.4 23.0,252.2 17.0,251.8\" fill=\"#3f78c4\" /><polygon points=\"70.0,139.8 76.0,138.6 76.0,256.6 70.0,256.2\" fill=\"#3f78c4\" /><polygon points=\"123.0,129.0 129.0,127.8 129.0,261.0 123.0,260.6\" fill=\"#3f78c4\" /><polygon points=\"176.0,118.2 182.0,117.0 182.0,265.4 176.0,265.0\" fill=\"#3f78c4\" /><polygon points=\"229.0,107.4 235.0,106.2 235.0,269.8 229.0,269.4\" fill=\"#3f78c4\" /><polygon points=\"282.0,96.6 288.0,95.4 288.0,274.2 282.0,273.8\" fill=\"#3f78c4\" /><polygon points=\"275,62 542,62 542,75 281,75\" fill=\"#8fb6e8\"/><rect x=\"275\" y=\"56\" width=\"267\" height=\"7\" fill=\"#3f78c4\"/><rect x=\"285\" y=\"75\" width=\"235\" height=\"199\" fill=\"url(#wl)\"/><rect x=\"281\" y=\"75\" width=\"10\" height=\"199\" fill=\"#3f78c4\"/><rect x=\"288\" y=\"75\" width=\"3\" height=\"199\" fill=\"#12306b\" fill-opacity=\".25\"/><rect x=\"363\" y=\"75\" width=\"10\" height=\"199\" fill=\"#3f78c4\"/><rect x=\"370\" y=\"75\" width=\"3\" height=\"199\" fill=\"#12306b\" fill-opacity=\".25\"/><rect x=\"442\" y=\"75\" width=\"10\" height=\"199\" fill=\"#3f78c4\"/><rect x=\"449\" y=\"75\" width=\"3\" height=\"199\" fill=\"#12306b\" fill-opacity=\".25\"/><rect x=\"514\" y=\"75\" width=\"10\" height=\"199\" fill=\"#3f78c4\"/><rect x=\"521\" y=\"75\" width=\"3\" height=\"199\" fill=\"#12306b\" fill-opacity=\".25\"/><rect x=\"297\" y=\"140\" width=\"60\" height=\"52\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\"/><line x1=\"317.0\" y1=\"140\" x2=\"317.0\" y2=\"192\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"337.0\" y1=\"140\" x2=\"337.0\" y2=\"192\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"297\" y1=\"166\" x2=\"357\" y2=\"166\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><rect x=\"379\" y=\"140\" width=\"57\" height=\"52\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\"/><line x1=\"398.0\" y1=\"140\" x2=\"398.0\" y2=\"192\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"417.0\" y1=\"140\" x2=\"417.0\" y2=\"192\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"379\" y1=\"166\" x2=\"436\" y2=\"166\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><rect x=\"458\" y=\"140\" width=\"50\" height=\"52\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\"/><line x1=\"474.7\" y1=\"140\" x2=\"474.7\" y2=\"192\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"491.3\" y1=\"140\" x2=\"491.3\" y2=\"192\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><line x1=\"458\" y1=\"166\" x2=\"508\" y2=\"166\" stroke=\"#fff\" stroke-width=\"1.6\" stroke-opacity=\".85\"/><rect x=\"279\" y=\"198\" width=\"263\" height=\"8\" fill=\"#8fb6e8\"/><rect x=\"279\" y=\"198\" width=\"263\" height=\"3\" fill=\"#3f78c4\"/><rect x=\"458\" y=\"216\" width=\"50\" height=\"52\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\"/><line x1=\"483.0\" y1=\"216\" x2=\"483.0\" y2=\"268\" stroke=\"#fff\" stroke-width=\"1.6\"/><rect x=\"377\" y=\"212\" width=\"61\" height=\"62\" fill=\"#12306b\"/><rect x=\"381\" y=\"216\" width=\"53\" height=\"58\" fill=\"url(#gl)\"/><line x1=\"407.5\" y1=\"216\" x2=\"407.5\" y2=\"274\" stroke=\"#12306b\" stroke-width=\"3\"/><line x1=\"381\" y1=\"236\" x2=\"434\" y2=\"236\" stroke=\"#fff\" stroke-width=\"1.6\"/><rect x=\"458\" y=\"216\" width=\"50\" height=\"52\" fill=\"url(#gl)\" stroke=\"#12306b\" stroke-opacity=\".35\"/><line x1=\"483.0\" y1=\"216\" x2=\"483.0\" y2=\"268\" stroke=\"#fff\" stroke-width=\"1.6\"/><rect x=\"305\" y=\"82\" width=\"195\" height=\"46\" rx=\"4\" fill=\"#fff\" stroke=\"#8fb6e8\" stroke-width=\"2\"/><text x=\"402.5\" y=\"114\" text-anchor=\"middle\" font-family=\"Arial Black,Arial,Helvetica,sans-serif\" font-weight=\"900\" font-size=\"25\" letter-spacing=\"1\" fill=\"#12306b\">SMK WIMATA</text><rect x=\"271\" y=\"274\" width=\"281\" height=\"8\" fill=\"#e6edf7\"/><rect x=\"259\" y=\"282\" width=\"305\" height=\"8\" fill=\"#d5dfee\"/><rect x=\"187\" y=\"244\" width=\"6\" height=\"38\" fill=\"#7a5a3a\"/><circle cx=\"190.0\" cy=\"244.0\" r=\"22.0\" fill=\"#4f9b52\"/><circle cx=\"174.6\" cy=\"255.0\" r=\"16.5\" fill=\"#6db36b\"/><circle cx=\"205.4\" cy=\"253.9\" r=\"17.6\" fill=\"#3f8a4a\"/><circle cx=\"190.0\" cy=\"230.8\" r=\"15.4\" fill=\"#79bd75\"/><ellipse cx=\"60\" cy=\"283\" rx=\"18.0\" ry=\"12\" fill=\"#5aa05a\"/><ellipse cx=\"66.0\" cy=\"278.8\" rx=\"12\" ry=\"9.0\" fill=\"#3f8a4a\"/><ellipse cx=\"120\" cy=\"285\" rx=\"15.0\" ry=\"10\" fill=\"#6db36b\"/><ellipse cx=\"125.0\" cy=\"281.5\" rx=\"10\" ry=\"7.5\" fill=\"#4f9b52\"/><ellipse cx=\"250\" cy=\"286\" rx=\"15.0\" ry=\"10\" fill=\"#5aa05a\"/><ellipse cx=\"255.0\" cy=\"282.5\" rx=\"10\" ry=\"7.5\" fill=\"#3f8a4a\"/><rect x=\"545\" y=\"218\" width=\"6\" height=\"70\" fill=\"#7a5a3a\"/><circle cx=\"548.0\" cy=\"218.0\" r=\"30.0\" fill=\"#4f9b52\"/><circle cx=\"527.0\" cy=\"233.0\" r=\"22.5\" fill=\"#6db36b\"/><circle cx=\"569.0\" cy=\"231.5\" r=\"24.0\" fill=\"#3f8a4a\"/><circle cx=\"548.0\" cy=\"200.0\" r=\"21.0\" fill=\"#79bd75\"/><ellipse cx=\"540\" cy=\"288\" rx=\"18.0\" ry=\"12\" fill=\"#6db36b\"/><ellipse cx=\"546.0\" cy=\"283.8\" rx=\"12\" ry=\"9.0\" fill=\"#4f9b52\"/><ellipse cx=\"300\" cy=\"290\" rx=\"9.0\" ry=\"6\" fill=\"#5aa05a\"/><ellipse cx=\"303.0\" cy=\"287.9\" rx=\"6\" ry=\"4.5\" fill=\"#3f8a4a\"/></svg>";
  var IKON_COVER = {
    kelas: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6.5 12 3l9 3.5-9 3.5z"/><path d="M7 9v5c0 1.4 2.2 2.6 5 2.6s5-1.2 5-2.6V9"/><path d="M21 7v6"/></svg>',
    program: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/></svg>',
    ta: '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>'
  };
  BI.htmlCover = function (kelas, profil, logo, taTeks) {
    profil = profil || {};
    var kemdik = new URL('assets/logo-kemdikdasmen.png', g.location.href).href;
    var nmSekolah = String(profil.nama_sekolah || 'SMK Widya Mandala Tambak').toUpperCase();
    var taNama = String(taTeks || '').replace(/^Tahun Ajaran\s*/i, '');
    function baris(ikon, label, nilai) {
      return '<div class="cv-row"><div class="cv-ic">' + IKON_COVER[ikon] + '</div><div><div class="cv-lb">' + label + '</div><div class="cv-vl2">' + esc(nilai) + '</div></div></div>';
    }
    var rows = baris('kelas', 'KELAS', kelas.nama || '-');
    if (kelas.program_keahlian) rows += '<div class="cv-sep"></div>' + baris('program', 'PROGRAM KEAHLIAN', kelas.program_keahlian);
    if (taNama) rows += '<div class="cv-sep"></div>' + baris('ta', 'TAHUN AJARAN', taNama);
    return '<div class="hal"><div class="cv">' +
      '<div class="cv-dk1"></div><div class="cv-dk2"></div><div class="cv-dk3"></div>' +
      '<div class="cv-head"><img src="' + esc(logo) + '" alt=""><div class="cv-sk">' + esc(nmSekolah) + '</div></div>' +
      '<div class="cv-t1">BUKU INDUK</div><div class="cv-t2">PESERTA DIDIK</div>' +
      '<div class="cv-line"></div><div class="cv-pill">SEKOLAH MENENGAH KEJURUAN (SMK)</div>' +
      '<div class="cv-card">' + rows + '</div>' +
      '<div class="cv-arc"></div><div class="cv-gd">' + SVG_GEDUNG + '</div>' +
      '<div class="cv-foot"><img src="' + esc(kemdik) + '" alt=""><span class="cv-vb"></span><div>KEMENTERIAN PENDIDIKAN<br>DASAR DAN MENENGAH<br>REPUBLIK INDONESIA</div></div>' +
      '<div class="cv-bars"><i></i><i></i></div>' +
      '</div></div>';
  };

  // Cetak Cover + Daftar Siswa sekaligus (satu kali cetak per kelas)
  // list: siswa kelas tsb (urut nama). kelas: {id, nama, tingkat, program_keahlian}
  BI.cetakCoverDaftar = async function (list, kelas) {
    if (!kelas) { alert('Pilih kelas dulu.'); return; }
    if (!list.length) { alert('Tidak ada siswa di kelas ini.'); return; }
    var w = window.open('', '_blank');
    if (!w) { alert('Pop-up diblokir browser. Izinkan pop-up untuk situs ini lalu coba lagi.'); return; }
    w.document.write('<p style="font-family:sans-serif;">Menyiapkan cover & daftar siswa...</p>');
    try {
      var pr = await sb().from('profil_sekolah').select('*').maybeSingle();
      var profil = pr.data || {};
      var logo = new URL('assets/logo.png', g.location.href).href;
      var ta = BI.ctx.ta;
      var urut = list.slice().sort(function (a, b) { return (a.nama || '').localeCompare(b.nama || ''); });
      var taTeks = ta ? 'Tahun Ajaran ' + ta.nama : '';
      var cover = BI.htmlCover(kelas, profil, logo, taTeks);

      var tgl = new Date();
      var tglCetak = tgl.getDate() + ' ' + BULAN[tgl.getMonth()] + ' ' + tgl.getFullYear();
      // Tanggal TTD = tanggal diterima siswa baru (yang paling umum; seri -> paling awal)
      var hitungTgl = {};
      urut.forEach(function (x) {
        if (keteranganMasuk(x) === 'Baru' && !kosong(x.tanggal_masuk)) { var t = String(x.tanggal_masuk).slice(0, 10); hitungTgl[t] = (hitungTgl[t] || 0) + 1; }
      });
      var tglTtd = Object.keys(hitungTgl).sort(function (a, b) { return (hitungTgl[b] - hitungTgl[a]) || a.localeCompare(b); })[0] || '';
      var tglTtdTeks = tglTtd ? fmtTgl(tglTtd) : tglCetak;
      var ttdKepsek = '<div class="ttd" style="justify-content:flex-end;"><div>' + esc(profil.kota_ttd || 'Tambak') + ', ' + tglTtdTeks + '<br>Kepala Sekolah,<div class="sp"></div><b><u>' + esc(profil.kepala_sekolah || '...............................') + '</u></b>' +
        (profil.nip_kepala_sekolah ? '<br>NIP. ' + esc(profil.nip_kepala_sekolah) : '') + '</div></div>';
      var baris = urut.map(function (s, i) {
        return '<tr><td class="c">' + (i + 1) + '</td><td>' + esc(s.nama) + '</td><td class="c">' + esc(s.nis || '') + '</td><td class="c">' + esc(s.nisn || '') + '</td><td class="c">' + keteranganMasuk(s) + '</td></tr>';
      }).join('');
      var daftar = '<div class="hal">' + kopHtml(profil, logo) +
        '<div class="judul"><div class="t">DAFTAR SISWA</div><div class="n">Kelas <b>' + esc(kelas.nama) + '</b>' + (taTeks ? ' &nbsp;|&nbsp; ' + esc(taTeks) : '') + ' &nbsp;|&nbsp; Jumlah <b>' + urut.length + '</b> siswa</div></div>' +
        '<table class="ds"><thead><tr><th style="width:8%;">No</th><th>Nama</th><th style="width:17%;">NIS</th><th style="width:20%;">NISN</th><th style="width:15%;">Keterangan</th></tr></thead><tbody>' + baris + '</tbody></table>' + ttdKepsek +
        '<div class="ft"><span>Daftar Siswa Kelas ' + esc(kelas.nama) + '</span><span>Dicetak ' + tglCetak + '</span></div></div>';

      w.document.open();
      w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Cover & Daftar Siswa ' + esc(kelas.nama) + '</title><style>' + cssCetak() + '</style></head><body>' + cover + daftar + '</body></html>');
      w.document.close();
      w.focus();
      var imgs = Array.prototype.slice.call(w.document.images);
      await Promise.race([Promise.all(imgs.map(function (im) { return im.complete ? Promise.resolve() : new Promise(function (ok) { im.onload = im.onerror = ok; }); })), new Promise(function (ok) { setTimeout(ok, 10000); })]);
      setTimeout(function () { w.print(); }, 300);
    } catch (e) {
      w.document.body.innerHTML = '<p style="font-family:sans-serif;color:#b91c1c;">Gagal menyiapkan cetak: ' + esc(pesanError(e)) + '</p>';
    }
  };

  function nilaiCetak(f, s) {
    var v = s[f.k];
    if (kosong(v)) return '';
    if (f.tipe === 'date') return fmtTgl(v);
    if (f.k === 'jenis_kelamin') return LABEL_OPSI[v] || v;
    if (f.k === 'status') return LABEL_OPSI[v] || v;
    return String(v);
  }

  function halamanSiswa(s, foto, rw, ct, profil, logo, jenis, pel) {
    foto = foto || {};
    jenis = jenis || 'lengkap';

    // Isian: grid 2 kolom; isian "full" / textarea selebar baris
    var bagianTab = F.TAB.map(function (tab) {
      return tab.bagian.map(function (bg) {
        return '<div class="sec"><h4>' + esc(bg.judul) + '</h4><div class="kv">' + bg.fields.map(function (f) {
          var v = nilaiCetak(f, s);
          var full = f.full || f.tipe === 'textarea';
          return '<div class="r' + (full ? ' full' + (String(f.l).length <= 20 ? ' sj' : '') : '') + '"><span class="l">' + esc(f.l) + '</span><span class="v' + (v === '' ? ' kosong' : '') + '">' + (v === '' ? '—' : esc(v)) + '</span></div>';
        }).join('') + '</div></div>';
      }).join('');
    });
    var bagianHtml = bagianTab.join('');
    // Biodata 2 halaman: bagian A-E (sampai Ibu Kandung) di halaman 1, sisanya di halaman 2
    var bagianFlat = [];
    var sembunyiCetak = opsiCetak.sembunyi || {};
    F.TAB.forEach(function (tab) { tab.bagian.forEach(function (bg) {
      var fieldCetak = bg.fields.filter(function (f) { return !sembunyiCetak[f.k]; });
      if (!fieldCetak.length) return;
      bagianFlat.push('<div class="sec"><h4>' + esc(bg.judul) + '</h4><div class="kv">' + fieldCetak.map(function (f) {
        var v = nilaiCetak(f, s);
        var full = f.full || f.tipe === 'textarea';
        return '<div class="r' + (full ? ' full' + (String(f.l).length <= 20 ? ' sj' : '') : '') + '"><span class="l">' + esc(f.l) + '</span><span class="v' + (v === '' ? ' kosong' : '') + '">' + (v === '' ? '—' : esc(v)) + '</span></div>';
      }).join('') + '</div></div>');
    }); });
    var BATAS_HAL1 = 5; // jumlah bagian di halaman 1 (A, B, C, D, E)

    var lg = legerHtml(rw, true);
    var perkembangan = '<div class="sec" style="page-break-inside:auto;"><h4>K. Perkembangan Belajar (dari E-Rapor)</h4>' +
      (lg ? '<table class="g"><thead>' + lg.head + '</thead><tbody>' + lg.body + '</tbody></table>' : '<div class="kosongnote">Belum ada data nilai.</div>') +
      (rw.length ? '<table class="g" style="margin-top:8px;"><thead><tr><th>Smt</th><th>Kelas</th><th>Tahun Ajaran</th><th>Sakit</th><th>Izin</th><th>Alpha</th><th>Ekstrakurikuler</th></tr></thead><tbody>' +
        rw.map(function (r) {
          return '<tr><td style="text-align:center;">' + (r.semester_ke || '') + '</td><td>' + esc(r.kelas_nama || '') + '</td><td>' + esc(r.ta_nama + ' ' + r.ta_semester) + '</td>' +
            '<td style="text-align:center;">' + (r.jumlah_sakit || 0) + '</td><td style="text-align:center;">' + (r.jumlah_izin || 0) + '</td><td style="text-align:center;">' + (r.jumlah_alpha || 0) + '</td>' +
            '<td>' + esc((r.ekskul || []).map(function (e) { return e.nama + (e.predikat ? ' (' + e.predikat + ')' : ''); }).join(', ')) + '</td></tr>';
        }).join('') + '</tbody></table>' : '') + '</div>';

    var kd = kokuDaftar(rw);
    var koku = '<div class="sec" style="page-break-inside:auto;"><h4>L. Kokurikuler</h4>' + (kd.length ?
      '<table class="g"><thead><tr><th style="width:15%;">Tahun Ajaran</th><th style="width:11%;">Semester</th><th style="width:26%;">Nama Kegiatan</th><th>Deskripsi (Capaian)</th></tr></thead><tbody>' +
      kd.map(function (k) { return '<tr><td style="text-align:center;">' + esc(k.ta) + '</td><td style="text-align:center;">' + esc(k.sem) + '</td><td>' + esc(k.nama) + '</td><td style="white-space:pre-wrap;">' + esc(k.deskripsi) + '</td></tr>'; }).join('') +
      '</tbody></table>' : '<div class="kosongnote">Belum ada data kokurikuler.</div>') + '</div>';

    var catatan = opsiCetak.tanpaCatatan ? '' : '<div class="sec" style="page-break-inside:auto;"><h4>M. Prestasi, Beasiswa &amp; Catatan</h4>' + (ct.length ?
      '<table class="g"><thead><tr><th style="width:17%;">Tanggal</th><th style="width:20%;">Kategori</th><th style="width:15%;">Tingkat</th><th>Uraian</th></tr></thead><tbody>' +
      ct.map(function (c) { return '<tr><td>' + esc(fmtTgl(c.tanggal)) + '</td><td>' + esc(c.kategori) + '</td><td>' + esc(c.tingkat || '') + '</td><td>' + esc(c.uraian) + '</td></tr>'; }).join('') +
      '</tbody></table>' : '<div class="kosongnote">Belum ada catatan.</div>') + '</div>';

    var pelanggaran = (jenis === 'nilai' || !g.PelanggaranCP) ? '' :
      '<div class="sec" style="page-break-inside:auto;"><h4>N. Catatan Pelanggaran</h4>' +
      (pel === null ? '<div class="kosongnote">Data pelanggaran tidak dapat dimuat saat dicetak.</div>' : g.PelanggaranCP.tabelCetak(pel)) + '</div>';

    var tgl = new Date();
    var tglCetak = tgl.getDate() + ' ' + BULAN[tgl.getMonth()] + ' ' + tgl.getFullYear();
    var kota = profil.kota_ttd || 'Tambak';
    var ttd = '<div class="ttd"><div><br>Wali Kelas,<div class="sp"></div>' + (BI.ctx.kelasWali && !BI.ctx.admin ? '<b><u>' + esc(BI.ctx.nama) + '</u></b>' : '(...............................)') + '</div>' +
      '<div>' + esc(kota) + ', ' + tglCetak + '<br>Kepala Sekolah,<div class="sp"></div><b><u>' + esc(profil.kepala_sekolah || '...............................') + '</u></b>' +
      (profil.nip_kepala_sekolah ? '<br>NIP. ' + esc(profil.nip_kepala_sekolah) : '') + '</div></div>';

    // Foto saat masuk (kiri) & saat lulus (kanan)
    function kotakFoto(src, judul, tanggal) {
      return '<div class="fw"><div class="foto' + (src ? '' : ' kosong') + '">' + (src ? '<img src="' + src + '" alt="">' : 'Tempel foto<br>3 × 4') + '</div>' +
        '<div class="cap">' + judul + '</div><div class="tg">' + esc(tanggal ? fmtTgl(tanggal) : '') + '</div></div>';
    }
    var kartu = '<div class="kartu">' + kotakFoto(foto.masuk, 'Saat Masuk', s.tanggal_masuk) +
      '<div class="ringkas"><div class="nama">' + esc(s.nama) + '</div><table>' +
      '<tr><td class="l">Tempat, Tgl. Lahir</td><td class="c">:</td><td class="v">' + esc([s.tempat_lahir, s.tanggal_lahir ? fmtTgl(s.tanggal_lahir) : ''].filter(Boolean).join(', ')) + '</td></tr>' +
      '<tr><td class="l">Jenis Kelamin</td><td class="c">:</td><td class="v">' + esc(LABEL_OPSI[s.jenis_kelamin] || s.jenis_kelamin || '') + '</td></tr>' +
      '<tr><td class="l">Kelas Saat Ini</td><td class="c">:</td><td class="v">' + esc(s.kelas ? s.kelas.nama : '') + '</td></tr>' +
      '<tr><td class="l">Status</td><td class="c">:</td><td class="v"><span class="lencana">' + esc(LABEL_OPSI[s.status] || s.status || '') + '</span></td></tr>' +
      '</table></div>' + kotakFoto(foto.lulus, 'Saat Lulus', s.status === 'aktif' ? '' : s.tanggal_keluar) + '</div>';

    var judulDok = jenis === 'nilai' ? 'NILAI PESERTA DIDIK' : jenis === 'biodata' ? 'BIODATA PESERTA DIDIK' : 'BUKU INDUK PESERTA DIDIK';
    var isi = jenis === 'nilai' ? (kartuNilai() + perkembangan + koku) : jenis === 'biodata' ? (kartu + bagianFlat.slice(0, BATAS_HAL1).join('') + '<div class="pb"></div>' + bagianFlat.slice(BATAS_HAL1).join('') + catatan + pelanggaran) : (kartu + bagianHtml + perkembangan + koku + catatan + pelanggaran);
    // Ringkasan identitas singkat (tanpa foto) untuk halaman Nilai
    function kartuNilai() {
      return '<div class=\"kartu\"><div class=\"ringkas\"><div class=\"nama\">' + esc(s.nama) + '</div><table>' +
        '<tr><td class=\"l\">Tempat, Tgl. Lahir</td><td class=\"c\">:</td><td class=\"v\">' + esc([s.tempat_lahir, s.tanggal_lahir ? fmtTgl(s.tanggal_lahir) : ''].filter(Boolean).join(', ')) + '</td></tr>' +
        '<tr><td class=\"l\">Kelas Saat Ini</td><td class=\"c\">:</td><td class=\"v\">' + esc(s.kelas ? s.kelas.nama : '') + '</td></tr>' +
        '<tr><td class=\"l\">Status</td><td class=\"c\">:</td><td class=\"v\"><span class=\"lencana\">' + esc(LABEL_OPSI[s.status] || s.status || '') + '</span></td></tr>' +
        '</table></div></div>';
    }

    return '<div class=\"hal' + (jenis === 'biodata' ? ' bio' : '') + '\">' + kopHtml(profil, logo) +
      '<div class=\"judul\"><div class=\"t\">' + judulDok + '</div><div class=\"n\">NIS <b>' + esc(s.nis || '—') + '</b> &nbsp;|&nbsp; NISN <b>' + esc(s.nisn || '—') + '</b></div></div>' +
      isi +
      '<div class=\"ft\"><span>' + (jenis === 'nilai' ? 'Nilai' : jenis === 'biodata' ? 'Biodata' : 'Buku Induk') + ' Peserta Didik · ' + esc(s.nama) + '</span><span>Dicetak ' + tglCetak + '</span></div></div>';
  }

  function kopHtml(profil, logo) {
    return '<div class=\"kop\"><img src=\"' + esc(logo) + '\" alt=\"\"><div class=\"tx\"><div class=\"nm\">' + esc((profil.nama_sekolah || 'SMK Widya Mandala Tambak').toUpperCase()) + '</div>' +
      '<div class=\"al\">' + esc(profil.alamat_sekolah || '') + '</div></div><span class=\"sp\"></span></div>';
  }

  // CSS cetak bersama (biodata, nilai, cover, daftar siswa)
  function cssCetak() {
    var NAVY = '#12306b';
    return [
        '@page{size:A4;margin:12mm 13mm 14mm}',
        '*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
        'body{font-family:"Segoe UI",Calibri,Arial,Helvetica,sans-serif;font-size:10pt;color:#000;margin:0;line-height:1.35}',
        '.hal{page-break-after:always}.hal:last-child{page-break-after:auto}',
        /* kop surat */
        '.kop{display:flex;align-items:center;gap:14px;padding-bottom:9px;border-bottom:2.5px solid ' + NAVY + ';position:relative;margin-bottom:10px}',
        '.kop:after{content:"";position:absolute;left:0;right:0;bottom:-6px;border-bottom:.8px solid ' + NAVY + '}',
        '.kop img,.kop .sp{width:64px;height:64px;flex:0 0 64px}.kop img{object-fit:contain}',
        '.kop .tx{flex:1;text-align:center}.kop .nm{font-size:15pt;font-weight:800;letter-spacing:.5px;color:' + NAVY + '}.kop .al{font-size:8.5pt;color:#000;margin-top:2px}',
        /* judul */
        '.judul{text-align:center;margin:16px 0 12px}.judul .t{display:inline-block;background:' + NAVY + ';color:#fff;font-weight:800;font-size:12pt;letter-spacing:2.5px;padding:5px 28px;border-radius:3px}',
        '.judul .n{margin-top:6px;font-size:9pt;color:#000}.judul .n b{color:#000}',
        /* kartu identitas + 2 foto */
        '.kartu{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #c7d0e4;border-radius:6px;padding:10px 12px;background:#f6f8fd;margin-bottom:4px}',
        '.fw{width:32mm;flex:0 0 32mm;text-align:center}',
        '.foto{width:30mm;height:40mm;margin:0 auto;border:1px solid #6b7280;background:#fff;display:flex;align-items:center;justify-content:center;font-size:7.5pt;line-height:1.3;color:#000;text-align:center;overflow:hidden}',
        '.foto.kosong{border:1px dashed #9ca3af}.foto img{width:100%;height:100%;object-fit:cover}',
        '.fw .cap{font-size:8pt;font-weight:700;color:' + NAVY + ';margin-top:5px;text-transform:uppercase;letter-spacing:.4px}.fw .tg{font-size:7.5pt;color:#000;min-height:1em}',
        '.ringkas{flex:1;min-width:0}.ringkas .nama{font-size:14pt;font-weight:800;color:' + NAVY + ';line-height:1.2;text-align:center;margin-bottom:7px}',
        '.ringkas table{width:100%;border-collapse:collapse}.ringkas td{padding:2px 3px;font-size:9.5pt;vertical-align:top}.ringkas td.l{color:#000;width:36%}.ringkas td.c{width:3%}.ringkas td.v{font-weight:600}',
        '.lencana{display:inline-block;padding:0 8px;border-radius:9px;font-size:8.5pt;font-weight:700;border:1px solid ' + NAVY + ';color:' + NAVY + ';background:#fff}',
        /* bagian isian */
        '.sec{margin-top:10px;page-break-inside:avoid}',
        '.sec h4{margin:0 0 4px;font-size:10pt;font-weight:800;letter-spacing:.2px;color:' + NAVY + ';border-left:4px solid ' + NAVY + ';border-bottom:1.5px solid ' + NAVY + ';padding:1px 0 2px 7px;page-break-after:avoid}',
        '.kv{display:grid;grid-template-columns:1fr 1fr;column-gap:20px}',
        '.kv .r{display:flex;gap:4px;padding:2.4px 0;border-bottom:.5px dotted #9ca3af;page-break-inside:avoid}.kv .r.full{grid-column:1/-1}',
        '.kv .l{flex:0 0 41%;color:#000;font-size:9pt}.kv .r.full .l{flex-basis:20.5%}.kv .r.full.sj .l{flex-basis:calc(20.5% - 4.1px)}',
        '.kv .v{flex:1;min-width:0;font-weight:600;word-break:break-word;white-space:pre-wrap;min-height:1.1em}',
        '.kv .v:before{content:": ";color:#000;font-weight:400}.kv .v.kosong{color:#000;font-weight:400}',
        /* tabel nilai & catatan */
        'table.g{width:100%;border-collapse:collapse;font-size:8.5pt;margin-top:4px}',
        'table.g th{background:' + NAVY + ';color:#fff;font-weight:700;padding:3px 4px;border:1px solid ' + NAVY + ';text-align:center}',
        'table.g td{border:1px solid #c3cad9;padding:2.5px 4px}table.g tbody tr:nth-child(even) td{background:#f3f6fb}',
        'table.g tr{page-break-inside:avoid}.kosongnote{font-size:9pt;color:#000;font-style:italic;padding:3px 0}',
        /* tanda tangan & footer */
        '.ttd{display:flex;justify-content:space-between;margin-top:20px;page-break-inside:avoid;font-size:9.5pt}.ttd>div{text-align:center;width:44%}.ttd .sp{height:58px}',
        '.ft{margin-top:14px;padding-top:4px;border-top:.5px solid #cbd5e1;font-size:7.5pt;color:#000;display:flex;justify-content:space-between}',
      /* biodata: padat, 2 halaman */
      '.pb{page-break-before:always;height:0}',
      '.bio{line-height:1.25}.bio .judul{margin:10px 0 8px}.bio .kartu{padding:7px 10px}',
      '.bio .sec{margin-top:8px}.bio .sec h4{margin-bottom:3px}',
      '.bio .kv .r{padding:1.7px 0}.bio .kv .r.full .l{flex-basis:31%}.bio .kv .r.full.sj .l{flex-basis:calc(20.5% - 4.1px)}.bio .kv .l,.bio .kv .v{font-size:9pt}',
      '.bio .ringkas .nama{margin-bottom:4px}.bio .ringkas td{padding:1px 3px}',
      '.bio table.g td{padding:2px 4px}.bio .ft{margin-top:8px}',
      /* cover (modern) */
      '.cv{position:relative;width:100%;height:268mm;overflow:hidden;background:#fff;padding:15mm 14mm 0 18mm;font-family:"Segoe UI","Plus Jakarta Sans",Calibri,Arial,sans-serif;color:' + NAVY + '}',
      '.cv-dk1,.cv-dk2,.cv-dk3{position:absolute;border-radius:99px;transform:rotate(-45deg)}',
      '.cv-dk1{width:46mm;height:9mm;background:' + NAVY + ';right:-12mm;top:5mm}',
      '.cv-dk2{width:46mm;height:9mm;background:#c9dcf4;right:-1mm;top:14mm}',
      '.cv-dk3{width:40mm;height:2.6mm;background:#c9dcf4;right:20mm;top:6mm}',
      '.cv-head{display:flex;align-items:center;gap:6mm;position:relative}',
      '.cv-head img{width:25mm;height:25mm;object-fit:contain;flex:0 0 25mm}',
      '.cv-sk{font-size:17pt;font-weight:800;line-height:1.2;letter-spacing:.3px;max-width:100mm}',
      '.cv-t1{margin-top:15mm;font-family:"Arial Black","Segoe UI Black","Segoe UI",Arial,sans-serif;font-size:56pt;font-weight:900;line-height:1;letter-spacing:-1px;white-space:nowrap}',
      '.cv-t2{margin-top:3mm;font-family:"Arial Black","Segoe UI Black","Segoe UI",Arial,sans-serif;font-size:31pt;font-weight:900;line-height:1.1;letter-spacing:.5px;white-space:nowrap}',
      '.cv-line{margin-top:7mm;width:128mm;height:.7mm;background:' + NAVY + '}',
      '.cv-pill{margin-top:5mm;width:150mm;text-align:center;background:#cfe0f6;border-radius:99px;padding:3.2mm 0;font-size:13.5pt;font-weight:700;letter-spacing:1.6px}',
      '.cv-card{margin-top:11mm;z-index:2;width:112mm;background:#eaf2fc;border-radius:6mm;padding:6mm 7mm;position:relative}',
      '.cv-row{display:flex;align-items:center;gap:6mm}',
      '.cv-ic{width:15mm;height:15mm;flex:0 0 15mm;border-radius:50%;background:' + NAVY + ';display:flex;align-items:center;justify-content:center}',
      '.cv-ic svg{width:8mm;height:8mm}',
      '.cv-lb{font-size:9.5pt;letter-spacing:1.6px;color:#4a5a7a}',
      '.cv-vl2{font-size:17pt;font-weight:800;line-height:1.2;color:#0f2a5c;margin-top:.6mm}',
      '.cv-sep{height:.3mm;background:#b7cbe6;margin:4mm 0 4mm 21mm}',
      '.cv-arc{position:absolute;right:-34mm;bottom:-40mm;width:128mm;height:128mm;border-radius:50%;background:linear-gradient(180deg,#eef4fc 35%,#fff 92%)}',
      '.cv-gd{position:absolute;right:-4mm;bottom:22mm;width:100mm}',
      '.cv-foot{position:absolute;left:14mm;bottom:12mm;display:flex;align-items:center;gap:4mm;font-size:7.6pt;letter-spacing:.8px;line-height:1.5;color:#1b3566}',
      '.cv-foot img{width:19mm;height:19mm;object-fit:contain}',
      '.cv-vb{width:.3mm;height:12mm;background:#8aa2c8}',
      '.cv-bars{position:absolute;left:0;bottom:4mm;display:flex;gap:3mm;align-items:center}',
      '.cv-bars i{display:block;height:2.4mm;border-radius:0 99px 99px 0}',
      '.cv-bars i:first-child{width:40mm;background:' + NAVY + '}',
      '.cv-bars i:last-child{width:30mm;background:#c9dcf4}',
      /* daftar siswa */
      'table.ds{width:100%;border-collapse:collapse;font-size:10pt;margin-top:6px}',
      'table.ds th{background:' + NAVY + ';color:#fff;padding:5px 6px;border:1px solid ' + NAVY + ';text-align:center}',
      'table.ds td{border:1px solid #94a3b8;padding:4px 6px}table.ds tr{page-break-inside:avoid}',
      'table.ds td.c{text-align:center}'
    ].join('');
  }

  // ================= Excel =================
  function headerExcel() {
    // Label bisa kembar (mis. "Pekerjaan" untuk ayah/ibu/wali) -> tambahkan nama bagian.
    var hitung = {};
    F.SEMUA.forEach(function (f) { hitung[f.l] = (hitung[f.l] || 0) + 1; });
    var out = [];
    F.TAB.forEach(function (tb) { tb.bagian.forEach(function (bg) { bg.fields.forEach(function (f) {
      out.push({ f: f, hdr: hitung[f.l] > 1 ? bg.judul.replace(/^[A-Z]\.\s*/, '') + ' - ' + f.l : f.l });
    }); }); });
    return out;
  }

  // ---- Excel berformat (ExcelJS): judul, pita bagian, header berwarna, garis tabel, dropdown ----
  var WARNA = { garis: 'FF94A3B8', header: 'FF1D4ED8', wajib: 'FFEA580C', grup: 'FFDBEAFE', kunci: 'FFF1F5F9', judul: 'FF0F172A' };
  var BORDER = { top: { style: 'thin', color: { argb: WARNA.garis } }, left: { style: 'thin', color: { argb: WARNA.garis } }, bottom: { style: 'thin', color: { argb: WARNA.garis } }, right: { style: 'thin', color: { argb: WARNA.garis } } };

  function lebarKolom(f) {
    if (f.tipe === 'textarea') return 38;
    if (f.tipe === 'date') return 14;
    if (f.tipe === 'number') return 11;
    if (f.tipe === 'select') return 20;
    if (f.k === 'nama') return 30;
    if (f.full) return 30;
    return 22;
  }

  function dateExcel(v) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  }

  // list: siswa yang diisi di baris data; o.kosong: jumlah baris kosong tambahan; o.judul/o.subjudul
  BI.buatExcel = async function (list, o) {
    if (!g.ExcelJS) throw new Error('Pustaka ExcelJS belum termuat. Muat ulang halaman lalu coba lagi.');
    o = o || {};
    var H = headerExcel();
    var KOL0 = 2; // kolom No & Kelas
    var total = KOL0 + H.length;
    var BARIS_HEADER = 5, BARIS_DATA = 6;
    var jmlBaris = list.length + (o.kosong || 0);
    var lastRow = BARIS_DATA + Math.max(jmlBaris, 1) - 1;

    var wb = new ExcelJS.Workbook();
    wb.creator = 'Buku Induk — SMK Widya Mandala Tambak';
    wb.created = new Date();

    // ===== Sheet Petunjuk =====
    var wp = wb.addWorksheet('Petunjuk');
    wp.columns = [{ width: 30 }, { width: 70 }, { width: 50 }];
    wp.mergeCells('A1:C1');
    wp.getCell('A1').value = 'PETUNJUK PENGISIAN BUKU INDUK PESERTA DIDIK';
    wp.getCell('A1').font = { bold: true, size: 14, color: { argb: WARNA.judul } };
    var petunjuk = [
      '1. Isi data pada sheet "Data Siswa". Jangan mengubah, menghapus, atau menambah kolom, dan jangan mengubah tulisan pada baris judul kolom.',
      '2. Siswa dicocokkan lewat NIS (cadangan NISN). NIS tidak bisa diubah lewat impor. NISN hanya bisa diperbarui oleh admin (siswa dicocokkan lewat NIS; bila NISN lama sudah ada, centang "Timpa data yang sudah ada").',
      '3. Kolom berjudul ORANYE = isian pokok yang dihitung dalam "Kelengkapan Data". Kolom biru = isian tambahan.',
      '4. Tanggal ditulis dd/mm/yyyy (contoh 17/05/2008). Isian berdropdown dipilih dari daftar yang tersedia.',
      '5. Sel yang dibiarkan kosong TIDAK menghapus data yang sudah ada di sistem.',
      '5a. Saat impor, isian yang di sistem sudah terisi TIDAK ditimpa (hanya mengisi yang masih kosong). Centang "Timpa data yang sudah ada" di halaman Impor bila isian di Excel ingin menggantikan data lama.',
      '5b. Kolom Kelas (khusus admin): siswa baru, atau siswa yang belum punya kelas di tahun ajaran aktif, akan otomatis ditempatkan ke kelas yang dipilih. Siswa yang sudah punya kelas tidak dipindahkan.',
      '6. Setelah selesai, simpan file, lalu di aplikasi pilih menu Excel → Impor Excel dan periksa ringkasannya sebelum menekan "Terapkan".'
    ];
    petunjuk.forEach(function (t, i) { wp.mergeCells(3 + i, 1, 3 + i, 3); var c = wp.getCell(3 + i, 1); c.value = t; c.alignment = { wrapText: true, vertical: 'top' }; wp.getRow(3 + i).height = 32; });
    var rp = 3 + petunjuk.length + 1;
    ['Kolom', 'Format / Keterangan', 'Pilihan'].forEach(function (t, i) {
      var c = wp.getCell(rp, i + 1); c.value = t; c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.header } }; c.border = BORDER; c.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    H.forEach(function (h, i) {
      var f = h.f, r = rp + 1 + i;
      var ket = f.tipe === 'date' ? 'Tanggal dd/mm/yyyy' : (f.tipe === 'number' ? 'Angka' : (f.tipe === 'select' ? 'Pilih dari daftar' : 'Teks')) + (f.wajib ? ' · isian pokok' : '');
      [h.hdr, ket, f.tipe === 'select' ? f.opsi.join(', ') : ''].forEach(function (t, j) {
        var c = wp.getCell(r, j + 1); c.value = t; c.border = BORDER; c.alignment = { wrapText: true, vertical: 'top' };
      });
    });

    // Daftar kelas untuk dropdown kolom Kelas (sheet tersembunyi, supaya tidak terbatas 255 karakter)
    var kelasNama = (o.kelasNama || []).slice();
    if (kelasNama.length) {
      var wd = wb.addWorksheet('Daftar', { state: 'hidden' });
      kelasNama.forEach(function (n, i) { wd.getCell(i + 1, 1).value = n; });
    }

    // ===== Sheet Data Siswa =====
    var ws = wb.addWorksheet('Data Siswa', {
      views: [{ state: 'frozen', xSplit: 3, ySplit: BARIS_HEADER }],
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
    });
    ws.getColumn(1).width = 5; ws.getColumn(2).width = 14;
    H.forEach(function (h, i) { ws.getColumn(KOL0 + 1 + i).width = lebarKolom(h.f); });
    var kolEnd = Math.min(total, 10);
    ws.mergeCells(1, 1, 1, kolEnd);
    ws.getCell(1, 1).value = o.judul || 'BUKU INDUK PESERTA DIDIK';
    ws.getCell(1, 1).font = { bold: true, size: 15, color: { argb: WARNA.judul } };
    ws.getRow(1).height = 24;
    ws.mergeCells(2, 1, 2, kolEnd);
    ws.getCell(2, 1).value = o.subjudul || 'SMK Widya Mandala Tambak';
    ws.getCell(2, 1).font = { size: 11, color: { argb: 'FF475569' } };
    ws.mergeCells(3, 1, 3, kolEnd);
    ws.getCell(3, 1).value = 'Kolom ORANYE = isian pokok. Jangan ubah judul kolom. Siswa dicocokkan lewat NIS. Lihat sheet "Petunjuk".';
    ws.getCell(3, 1).font = { italic: true, size: 10, color: { argb: 'FF64748B' } };

    // pita nama bagian (baris 4)
    var kol = KOL0 + 1;
    ['No', 'Kelas'].forEach(function (_, i) { var c = ws.getCell(4, i + 1); c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.grup } }; c.border = BORDER; });
    F.TAB.forEach(function (tb) {
      tb.bagian.forEach(function (bg) {
        var n = bg.fields.length;
        if (n > 1) ws.mergeCells(4, kol, 4, kol + n - 1);
        for (var q = 0; q < n; q++) { var cc = ws.getCell(4, kol + q); cc.border = BORDER; cc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.grup } }; }
        var c = ws.getCell(4, kol);
        c.value = bg.judul; c.font = { bold: true, color: { argb: 'FF1E3A8A' } };
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        kol += n;
      });
    });

    // header kolom (baris 5)
    var judulKolom = ['No', 'Kelas'].concat(H.map(function (h) { return h.hdr; }));
    judulKolom.forEach(function (t, i) {
      var c = ws.getCell(BARIS_HEADER, i + 1);
      var wajib = i >= KOL0 && H[i - KOL0].f.wajib;
      c.value = t;
      c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: wajib ? WARNA.wajib : WARNA.header } };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = BORDER;
    });
    ws.getRow(BARIS_HEADER).height = 34;

    // baris data
    for (var i = 0; i < jmlBaris; i++) {
      var r = BARIS_DATA + i, s = list[i] || null;
      var c0 = ws.getCell(r, 1); c0.value = i + 1; c0.alignment = { horizontal: 'center', vertical: 'top' }; c0.border = BORDER;
      var c1 = ws.getCell(r, 2); c1.value = s && s.kelas ? s.kelas.nama : null; c1.border = BORDER; c1.alignment = { vertical: 'top' };
      c0.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.kunci } };
      if (s) c1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.kunci } };
      if (kelasNama.length && !(s && s.kelas)) {
        c1.dataValidation = { type: 'list', allowBlank: true, formulae: ['Daftar!$A$1:$A$' + kelasNama.length], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Kelas', error: 'Pilih kelas dari daftar.' };
      }
      H.forEach(function (h, j) {
        var f = h.f, c = ws.getCell(r, KOL0 + 1 + j), v = s ? s[f.k] : null;
        c.border = BORDER;
        c.alignment = { vertical: 'top', wrapText: f.tipe === 'textarea' || f.full || f.tipe === 'text' };
        if (f.tipe === 'date') { c.numFmt = 'dd/mm/yyyy'; c.value = dateExcel(v); }
        else if (f.tipe === 'number') { c.value = (v === null || v === undefined || v === '') ? null : Number(v); }
        else { c.numFmt = '@'; c.value = (v === null || v === undefined || v === '') ? null : String(v); }
        if (f.tipe === 'select') {
          c.dataValidation = { type: 'list', allowBlank: true, formulae: ['"' + f.opsi.join(',') + '"'], showErrorMessage: true, errorStyle: 'warning', errorTitle: 'Pilihan', error: 'Pilih salah satu dari daftar.' };
        }
        if (s && (f.k === 'nis' || f.k === 'nisn' || f.k === 'nama')) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: WARNA.kunci } };
      });
    }
    if (!jmlBaris) { for (var cc2 = 1; cc2 <= total; cc2++) ws.getCell(BARIS_DATA, cc2).border = BORDER; }
    ws.autoFilter = { from: { row: BARIS_HEADER, column: 1 }, to: { row: BARIS_HEADER, column: total } };
    ws.pageSetup.printTitlesRow = BARIS_HEADER + ':' + BARIS_HEADER;

    wb.views = [{ activeTab: 1 }];
    return wb;
  };

  async function simpanWorkbook(wb, namaFile) {
    var buf = await wb.xlsx.writeBuffer();
    var blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = namaFile;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // Unduh data yang sudah ada (berformat tabel bergaris).
  BI.unduhExcel = async function (list, namaFile, o) {
    var wb = await BI.buatExcel(list, o);
    await simpanWorkbook(wb, namaFile || 'buku_induk.xlsx');
  };

  // Template isian: berisi daftar siswa (kolom identitas terisi), atau kosong (list = []) dengan n baris.
  BI.unduhTemplate = async function (list, namaFile, o) {
    var wb = await BI.buatExcel(list, o);
    await simpanWorkbook(wb, namaFile || 'template_buku_induk.xlsx');
  };

  function tglDariExcel(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') {
      var d = XLSX.SSF.parse_date_code(v);
      return d ? d.y + '-' + String(d.m).padStart(2, '0') + '-' + String(d.d).padStart(2, '0') : null;
    }
    var t = String(v).trim();
    var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
    if (m) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(t);
    if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
    m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(t);
    if (m) {
      var idx = BULAN.findIndex(function (b) { return b.toLowerCase() === m[2].toLowerCase(); });
      if (idx >= 0) return m[3] + '-' + String(idx + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0');
    }
    return null;
  }

  // Baca file Excel (template/unduhan) dan cocokkan ke siswa lewat NIS (cadangan NISN).
  // Baris judul kolom dicari otomatis (baris yang memuat "NIS" dan "Nama Lengkap").
  BI.bacaExcel = async function (file, semuaSiswa, o) {
    o = o || {};
    var buf = await file.arrayBuffer();
    var wb = XLSX.read(buf, { type: 'array' });
    var nmSheet = wb.SheetNames.indexOf('Data Siswa') !== -1 ? 'Data Siswa' : wb.SheetNames[0];
    var ws = wb.Sheets[nmSheet];
    var aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    var idxHeader = -1;
    for (var i = 0; i < Math.min(aoa.length, 30); i++) {
      var teks = aoa[i].map(function (x) { return String(x).trim(); });
      if (teks.indexOf('NIS') !== -1 && teks.indexOf('Nama Lengkap') !== -1) { idxHeader = i; break; }
    }
    if (idxHeader === -1) throw new Error('Baris judul kolom tidak ditemukan. Gunakan file template/unduhan dari menu ini dan jangan ubah judul kolom.');
    var judul = aoa[idxHeader].map(function (x) { return String(x).trim(); });
    var baris = [];
    for (var j = idxHeader + 1; j < aoa.length; j++) {
      var obj = {}, ada = false;
      judul.forEach(function (t, c) {
        if (!t) return;
        var v = aoa[j][c];
        obj[t] = v === undefined ? '' : v;
        if (t !== 'No' && t !== 'Kelas' && v !== '' && v !== null && v !== undefined && String(v).trim() !== '') ada = true;
      });
      if (ada) { obj.__baris = j + 1; baris.push(obj); }
    }

    var H = headerExcel();
    var byNis = {}, byNisn = {};
    semuaSiswa.forEach(function (s) { if (s.nis) byNis[String(s.nis).trim()] = s; if (s.nisn) byNisn[String(s.nisn).trim()] = s; });
    var hasil = { cocok: [], tidakDitemukan: [], baru: [], penempatan: [], totalBaris: baris.length, tambahBaru: !!o.tambahBaru, timpa: !!o.timpa, dilewatiTerisi: 0, menimpa: 0, peringatan: [] };
    var kelasByNama = {};
    (o.kelasList || []).forEach(function (k) { kelasByNama[String(k.nama).trim().toLowerCase()] = k; });
    // Cari kelas dari kolom Kelas; mengembalikan objek kelas atau null (dan memberi peringatan bila tak dikenal)
    function kelasDariBaris(r) {
      if (!o.tempatkan) return null;
      var t = String(r['Kelas'] === undefined ? '' : r['Kelas']).trim();
      if (!t) return null;
      var k = kelasByNama[t.toLowerCase()];
      if (!k) hasil.peringatan.push('Baris ' + r.__baris + ': kelas "' + t + '" tidak ditemukan di data Kelas E-Rapor (penempatan dilewati).');
      return k || null;
    }

    function ambil(r, h) {
      var f = h.f, v = r[h.hdr];
      if (v === undefined || v === null || String(v).trim() === '') return undefined;
      var out;
      if (f.tipe === 'date') { out = tglDariExcel(v); if (!out) { hasil.peringatan.push('Baris ' + r.__baris + ': tanggal "' + v + '" pada kolom ' + h.hdr + ' tidak dikenali (diabaikan).'); return undefined; } }
      else if (f.tipe === 'number') { out = Number(String(v).replace(',', '.')); if (isNaN(out)) { hasil.peringatan.push('Baris ' + r.__baris + ': "' + v + '" pada kolom ' + h.hdr + ' bukan angka (diabaikan).'); return undefined; } }
      else out = String(v).trim();
      if (f.tipe === 'select' && f.opsi.indexOf(out) === -1) {
        var cocok = f.opsi.find(function (x) { return x.toLowerCase() === out.toLowerCase(); });
        if (!cocok) { hasil.peringatan.push('Baris ' + r.__baris + ': "' + out + '" bukan pilihan sah untuk ' + h.hdr + ' (diabaikan).'); return undefined; }
        out = cocok;
      }
      return out;
    }

    baris.forEach(function (r) {
      var nis = String(r['NIS'] === undefined ? '' : r['NIS']).trim();
      var nisn = String(r['NISN'] === undefined ? '' : r['NISN']).trim();
      var nama = String(r['Nama Lengkap'] === undefined ? '' : r['Nama Lengkap']).trim();
      var s = (nis && byNis[nis]) || (nisn && byNisn[nisn]);
      var si = {}, de = {}, n = 0;
      var cocokLewatNis = !!(nis && byNis[nis]);
      H.forEach(function (h) {
        var f = h.f;
        // NIS (kunci pencocokan) & status tidak diubah lewat impor. NISN boleh diperbarui
        // oleh admin bila siswa dicocokkan lewat NIS (mengikuti aturan timpa seperti isian lain).
        if (s && (f.k === 'nis' || f.k === 'status')) return;
        if (s && f.k === 'nisn' && !(o.tempatkan && cocokLewatNis)) return;
        if (!s && f.k === 'status') return;
        var out = ambil(r, h);
        if (out === undefined) return;
        if (s) {
          var lama = (s[f.k] === null || s[f.k] === undefined) ? '' : String(s[f.k]);
          if (lama === String(out)) return; // sama
          if (lama.trim() !== '') {
            // Sudah terisi di sistem: hanya ditimpa bila "Timpa data yang sudah ada" dicentang.
            if (!o.timpa) { hasil.dilewatiTerisi++; return; }
            hasil.menimpa++;
          }
        }
        (f.t === 'siswa' ? si : de)[f.k] = out; n++;
      });
      if (s) {
        if (n) hasil.cocok.push({ siswa: s, si: si, de: de, jumlah: n, baris: r.__baris });
        var ks = kelasDariBaris(r);
        if (ks) {
          if (!s.kelas) hasil.penempatan.push({ siswaId: s.id, nama: s.nama, kelasId: ks.id, kelasNama: ks.nama });
          else if (s.kelas.id !== ks.id) hasil.peringatan.push('Baris ' + r.__baris + ': ' + s.nama + ' sudah berada di kelas ' + s.kelas.nama + ' — tidak dipindah ke ' + ks.nama + '.');
        }
        return;
      }
      if (!nis && !nisn && !nama) return;
      if (o.tambahBaru && nama && (nis || nisn)) { si.status = 'aktif'; var kb = kelasDariBaris(r); hasil.baru.push({ si: si, de: de, nama: nama, baris: r.__baris, kelasId: kb ? kb.id : null, kelasNama: kb ? kb.nama : null }); return; }
      hasil.tidakDitemukan.push('Baris ' + r.__baris + ': ' + (nama || '(tanpa nama)') + ' — NIS ' + (nis || '—'));
    });
    return hasil;
  };

  BI.terapkanImpor = async function (hasil, onProgress) {
    var ok = 0, baru = 0, ditempatkan = 0, gagal = [];
    var taId = BI.ctx.ta ? BI.ctx.ta.id : null;
    var total = hasil.cocok.length + hasil.baru.length + (hasil.penempatan || []).length, done = 0;
    async function tempatkan(siswaId, kelasId, nama) {
      if (!taId) { gagal.push(nama + ': belum ada tahun ajaran aktif, penempatan kelas dilewati.'); return; }
      var rk = await sb().from('siswa_kelas').insert({ siswa_id: siswaId, kelas_id: kelasId, tahun_ajaran_id: taId });
      if (rk.error) throw rk.error;
      ditempatkan++;
    }
    for (var i = 0; i < hasil.cocok.length; i++) {
      var c = hasil.cocok[i];
      try {
        if (Object.keys(c.si).length) { var r1 = await sb().from('siswa').update(c.si).eq('id', c.siswa.id); if (r1.error) throw r1.error; }
        if (Object.keys(c.de).length) {
          var r2 = await sb().from('bi_siswa_detail').upsert(Object.assign({ siswa_id: c.siswa.id, updated_by: BI.ctx.userId, updated_at: new Date().toISOString() }, c.de), { onConflict: 'siswa_id' });
          if (r2.error) throw r2.error;
        }
        ok++;
      } catch (e) { gagal.push(c.siswa.nama + ': ' + pesanError(e)); }
      if (onProgress) onProgress(++done, total);
    }
    for (var k = 0; k < hasil.baru.length; k++) {
      var b = hasil.baru[k];
      try {
        var ins = await sb().from('siswa').insert(b.si).select('id').single();
        if (ins.error) throw ins.error;
        if (Object.keys(b.de).length) {
          var r3 = await sb().from('bi_siswa_detail').upsert(Object.assign({ siswa_id: ins.data.id, updated_by: BI.ctx.userId, updated_at: new Date().toISOString() }, b.de), { onConflict: 'siswa_id' });
          if (r3.error) throw r3.error;
        }
        baru++;
        if (b.kelasId) await tempatkan(ins.data.id, b.kelasId, b.nama);
      } catch (e) { gagal.push(b.nama + ' (baru): ' + pesanError(e)); }
      if (onProgress) onProgress(++done, total);
    }
    var pen = hasil.penempatan || [];
    for (var q = 0; q < pen.length; q++) {
      try { await tempatkan(pen[q].siswaId, pen[q].kelasId, pen[q].nama); } catch (e) { gagal.push(pen[q].nama + ' (kelas): ' + pesanError(e)); }
      if (onProgress) onProgress(++done, total);
    }
    return { ok: ok, baru: baru, ditempatkan: ditempatkan, gagal: gagal };
  };

  // ================= Tampilan bersama =================
  // Daftar siswa + pencarian, klik "Buka" untuk melihat/mengubah Buku Induk siswa.
  // opts: { root, kelasId (tetap, untuk wali), admin, judul, desc, bolehUbah }
  BI.renderDaftar = async function (opts) {
    var root = opts.root;
    root.innerHTML = '<div class="panel-head"><div><div class="panel-head__title">' + esc(opts.judul) + '</div><div class="panel-head__desc">Memuat data siswa...</div></div></div>';
    var list, kelasList = [];
    try {
      list = await BI.muatSiswa({ kelasId: opts.kelasId || null });
      if (!opts.kelasId) kelasList = await BI.muatKelas();
    } catch (e) { root.innerHTML = '<div class="empty-state"><div class="empty-state__title">Gagal memuat</div><div class="empty-state__desc">' + esc(pesanError(e)) + '</div></div>'; return; }

    var filter = opts.filterAwal || { q: '', kelas: '', status: opts.admin ? 'aktif' : '' };
    function tampil() {
      var q = filter.q.trim().toLowerCase();
      var f = list.filter(function (s) {
        if (filter.status && s.status !== filter.status) return false;
        if (filter.kelas === '__none') { if (s.kelas) return false; }
        else if (filter.kelas && (!s.kelas || s.kelas.id !== filter.kelas)) return false;
        if (q && (s.nama || '').toLowerCase().indexOf(q) === -1 && (s.nis || '').toLowerCase().indexOf(q) === -1 && (s.nisn || '').toLowerCase().indexOf(q) === -1) return false;
        return true;
      });
      root.querySelector('#biCount').textContent = f.length + ' siswa';
      root.querySelector('#biTbody').innerHTML = f.length ? f.map(function (s) {
        var k = BI.kelengkapan(s);
        return '<tr><td data-label="Nama">' + esc(s.nama) + '</td><td data-label="NIS">' + esc(s.nis || '—') + '</td><td data-label="NISN">' + esc(s.nisn || '—') + '</td>' +
          '<td data-label="Kelas">' + esc(s.kelas ? s.kelas.nama : '—') + '</td><td data-label="Status">' + chipStatus(s.status) + '</td><td data-label="Kelengkapan">' + chipKelengkapan(k.persen) + '</td>' +
          '<td style="white-space:nowrap;">' + (opts.aksi === 'editcetak' ?
          '<button class="btn-small btn-small--primary" data-buka="' + s.id + '">✏️ Edit</button> <button class="btn-small" data-cetak="' + s.id + '">🖨 Cetak</button>' :
          '<button class="btn-small" data-detail="' + s.id + '">👁 Detail</button> <button class="btn-small btn-small--primary" data-buka="' + s.id + '">Buka</button>') + '</td></tr>';
      }).join('') : '<tr><td colspan="7">Tidak ada siswa yang cocok.</td></tr>';
      function bukaForm(s) {
        BI.bukaSiswa(s, { root: root, bolehUbah: opts.bolehUbah !== false, labelKembali: 'Kembali ke Daftar', onKembali: function () { BI.renderDaftar(Object.assign({}, opts, { filterAwal: filter })); } });
      }
      root.querySelectorAll('[data-buka]').forEach(function (b) {
        b.addEventListener('click', function () { bukaForm(list.find(function (x) { return x.id === b.dataset.buka; })); });
      });
      root.querySelectorAll('[data-cetak]').forEach(function (b) {
        b.addEventListener('click', function () { BI.pilihCetak(list.find(function (x) { return x.id === b.dataset.cetak; })); });
      });
      root.querySelectorAll('[data-detail]').forEach(function (b) {
        b.addEventListener('click', function () {
          var s = list.find(function (x) { return x.id === b.dataset.detail; });
          BI.detailSiswa(s, { bolehUbah: opts.bolehUbah !== false, onBuka: function () { bukaForm(s); } });
        });
      });
      root._biTersaring = f;
    }

    root.innerHTML =
      '<div class="panel-head"><div><div class="panel-head__title">' + esc(opts.judul) + '</div><div class="panel-head__desc">' + esc(opts.desc || '') + '</div></div></div>' +
      '<div class="toolbar" style="align-items:flex-end;">' +
      '<div class="field" style="min-width:220px;margin-bottom:0;"><label>Cari nama / NIS / NISN</label><input type="text" id="biQ" value="' + esc(filter.q) + '" placeholder="Ketik untuk mencari..."></div>' +
      (!opts.kelasId ? '<div class="field" style="margin-bottom:0;"><label>Kelas (tahun ajaran aktif)</label><select id="biKelas"><option value="">Semua</option><option value="__none">Tanpa kelas aktif (alumni dll)</option>' +
        kelasList.map(function (k) { return '<option value="' + k.id + '"' + (filter.kelas === k.id ? ' selected' : '') + '>' + esc(k.nama) + '</option>'; }).join('') + '</select></div>' : '') +
      (opts.admin ? '<div class="field" style="margin-bottom:0;"><label>Status</label><select id="biStatus"><option value="">Semua</option>' +
        ['aktif', 'lulus', 'pindah', 'keluar'].map(function (st) { return '<option value="' + st + '"' + (filter.status === st ? ' selected' : '') + '>' + esc(LABEL_OPSI[st]) + '</option>'; }).join('') + '</select></div>' : '') +
      '<span id="biCount" style="font-size:12.5px;color:var(--ink-soft);padding-bottom:10px;"></span></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Nama</th><th>NIS</th><th>NISN</th><th>Kelas</th><th>Status</th><th>Kelengkapan</th><th></th></tr></thead><tbody id="biTbody"></tbody></table></div>';

    root.querySelector('#biQ').addEventListener('input', function (e) { filter.q = e.target.value; tampil(); });
    var selK = root.querySelector('#biKelas'); if (selK) selK.addEventListener('change', function (e) { filter.kelas = e.target.value; tampil(); });
    var selS = root.querySelector('#biStatus'); if (selS) selS.addEventListener('change', function (e) { filter.status = e.target.value; tampil(); });
    tampil();
  };

  // Kelengkapan data: per kelas (admin) atau per siswa (wali) + daftar isian yang masih kosong.
  BI.renderKelengkapan = async function (opts) {
    var root = opts.root;
    root.innerHTML = '<div class="panel-head"><div><div class="panel-head__title">Kelengkapan Data</div><div class="panel-head__desc">Memuat...</div></div></div>';
    var list;
    try { list = await BI.muatSiswa({ kelasId: opts.kelasId || null }); } catch (e) { root.innerHTML = '<div class="panel-note">' + esc(pesanError(e)) + '</div>'; return; }
    if (opts.admin) list = list.filter(function (s) { return s.status === 'aktif'; });
    var hitung = list.map(function (s) { return { s: s, k: BI.kelengkapan(s) }; });
    var rata = hitung.length ? Math.round(hitung.reduce(function (t, x) { return t + x.k.persen; }, 0) / hitung.length) : 0;
    var lengkap = hitung.filter(function (x) { return x.k.persen === 100; }).length;

    var perKelas = '';
    if (opts.admin) {
      var grup = {};
      hitung.forEach(function (x) {
        var nama = x.s.kelas ? x.s.kelas.nama : '(tanpa kelas)';
        var g1 = grup[nama] || (grup[nama] = { n: 0, t: 0 }); g1.n++; g1.t += x.k.persen;
      });
      perKelas = '<div class="section-title">Per Kelas</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Kelas</th><th>Jumlah Siswa</th><th>Rata-rata Kelengkapan</th></tr></thead><tbody>' +
        Object.keys(grup).sort().map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + grup[k].n + '</td><td>' + chipKelengkapan(Math.round(grup[k].t / grup[k].n)) + '</td></tr>'; }).join('') + '</tbody></table></div>';
    }

    var urut = hitung.slice().sort(function (a, b) { return a.k.persen - b.k.persen; });
    root.innerHTML =
      '<div class="panel-head"><div><div class="panel-head__title">Kelengkapan Data</div><div class="panel-head__desc">Dihitung dari ' + F.SEMUA.filter(function (f) { return f.wajib; }).length + ' isian pokok per siswa. Urut dari yang paling kurang lengkap.</div></div></div>' +
      '<div class="stat-grid"><div class="stat-card"><div class="stat-card__label">Siswa</div><div class="stat-card__value">' + hitung.length + '</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Rata-rata kelengkapan</div><div class="stat-card__value">' + rata + '%</div></div>' +
      '<div class="stat-card"><div class="stat-card__label">Data 100% lengkap</div><div class="stat-card__value">' + lengkap + '</div></div></div>' + perKelas +
      '<div class="section-title" style="margin-top:22px;">Per Siswa</div><div class="table-wrap"><table class="data-table"><thead><tr><th>Nama</th><th>Kelas</th><th>Kelengkapan</th><th>Isian yang masih kosong</th></tr></thead><tbody>' +
      urut.map(function (x) {
        return '<tr><td>' + esc(x.s.nama) + '</td><td>' + esc(x.s.kelas ? x.s.kelas.nama : '—') + '</td><td>' + chipKelengkapan(x.k.persen) + '</td><td style="font-size:12px;color:var(--ink-soft);">' + (x.k.kurang.length ? esc(x.k.kurang.join(', ')) : '—') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  };

  // Sinkron massal dari E-Rapor (admin: pilih kelas/semua; wali: kelasnya).
  BI.renderSinkron = async function (opts) {
    var root = opts.root;
    var kelasList = opts.kelasId ? [] : await BI.muatKelas();
    root.innerHTML =
      '<div class="panel-head"><div><div class="panel-head__title">Sinkron dari E-Rapor</div><div class="panel-head__desc">Tarik nilai rapor, kehadiran, ekstrakurikuler dan kokurikuler tiap semester (nilai akhir PKL masuk sebagai mapel di semester 6) dari E-Rapor ke arsip Buku Induk. Aman diulang; semester yang diisi manual (dikunci) tidak ditimpa.</div></div></div>' +
      '<div class="panel-note">Biodata siswa (nama, NIS, TTL, alamat, orang tua, dll) tidak perlu disinkronkan: Buku Induk dan E-Rapor memakai tabel siswa yang sama, jadi otomatis sama.</div>' +
      '<div class="toolbar" style="align-items:flex-end;">' +
      (!opts.kelasId ? '<div class="field" style="margin-bottom:0;"><label>Cakupan</label><select id="sinCakupan"><option value="aktif">Semua siswa aktif</option><option value="semua">Semua siswa (termasuk lulus/pindah)</option>' +
        kelasList.map(function (k) { return '<option value="' + k.id + '">Kelas ' + esc(k.nama) + '</option>'; }).join('') + '</select></div>' : '') +
      '<button class="btn-small btn-small--primary" id="sinMulai">⟳ Tarik dari E-Rapor</button></div>' +
      '<div id="sinHasil"></div>';
    root.querySelector('#sinMulai').addEventListener('click', async function () {
      var btn = this, out = root.querySelector('#sinHasil');
      btn.disabled = true;
      try {
        var cak = opts.kelasId ? 'kelas' : root.querySelector('#sinCakupan').value;
        out.innerHTML = '<div class="panel-note">Menyiapkan daftar siswa...</div>';
        var list;
        if (opts.kelasId) list = await BI.muatSiswa({ kelasId: opts.kelasId });
        else if (cak === 'aktif') list = (await BI.muatSiswa({})).filter(function (s) { return s.status === 'aktif'; });
        else if (cak === 'semua') list = await BI.muatSiswa({});
        else list = await BI.muatSiswa({ kelasId: cak });
        if (!list.length) { out.innerHTML = '<div class="panel-note">Tidak ada siswa pada cakupan ini.</div>'; btn.disabled = false; return; }
        var h = await BI.tarikDariRapor(list, function (n, t) { out.innerHTML = '<div class="panel-note">Memproses ' + n + ' dari ' + t + ' siswa...</div>'; });
        out.innerHTML = '<div class="import-summary">Selesai.\n' + h.siswa + ' siswa diproses\n' + h.diperbarui + ' semester diperbarui/ditambahkan\n' +
          h.dilewatiKunci + ' semester dilewati (dikunci/manual)\n' + h.tanpaData + ' semester dilewati (belum ada nilai/presensi di E-Rapor)' +
          (h.pklBelumSemester6 ? '\n' + h.pklBelumSemester6 + ' siswa punya nilai PKL tetapi belum punya semester 6 di E-Rapor (PKL belum ditaruh)' : '') + '</div>';
      } catch (e) { out.innerHTML = '<div class="import-summary" style="color:var(--danger);">Gagal: ' + esc(pesanError(e)) + '</div>'; }
      btn.disabled = false;
    });
  };

  // Cetak Buku Induk: 4 bagian -> Cover, Daftar Siswa, Biodata, Nilai.
  // Cover + Daftar Siswa dicetak sekaligus (1 kali per kelas); Biodata & Nilai masing-masing punya tombol cetak sendiri.
  BI.renderCetak = async function (opts) {
    var root = opts.root;
    root.innerHTML = '<div class="panel-head"><div><div class="panel-head__title">Cetak Buku Induk</div><div class="panel-head__desc">Memuat...</div></div></div>';
    var list, kelasList = [];
    try { list = await BI.muatSiswa({ kelasId: opts.kelasId || null }); if (!opts.kelasId) kelasList = await BI.muatKelas(); } catch (e) { root.innerHTML = '<div class="panel-note">' + esc(pesanError(e)) + '</div>'; return; }
    var kelasPilih = opts.kelasId || '';
    var kelasWali = opts.kelasId ? BI.ctx.kelasWali : null;

    function kelasAktif() {
      if (opts.kelasId) return kelasWali;
      return kelasList.find(function (k) { return k.id === kelasPilih; }) || null;
    }
    function siswaKelas() {
      return list.filter(function (s) { return s.status === 'aktif' && s.kelas && s.kelas.id === (kelasAktif() || {}).id; });
    }
    function tampil() {
      var f = list.filter(function (s) {
        if (opts.admin && s.status !== 'aktif' && !root.querySelector('#cetAlumni').checked) return false;
        if (kelasPilih && (!s.kelas || s.kelas.id !== kelasPilih)) return false;
        return true;
      });
      root.querySelector('#cetTbody').innerHTML = f.map(function (s) {
        return '<tr><td><input type="checkbox" class="cetChk" value="' + s.id + '" checked></td><td>' + esc(s.nama) + '</td><td>' + esc(s.nis || '—') + '</td><td>' + esc(s.kelas ? s.kelas.nama : '—') + '</td><td>' + chipStatus(s.status) + '</td></tr>';
      }).join('') || '<tr><td colspan="5">Tidak ada siswa.</td></tr>';
      root.querySelector('#cetAll').checked = true;
    }
    function terpilih() {
      var ids = Array.prototype.filter.call(root.querySelectorAll('.cetChk'), function (c) { return c.checked; }).map(function (c) { return c.value; });
      if (!ids.length) { alert('Centang minimal satu siswa.'); return null; }
      if (ids.length > 60 && !confirm('Mencetak ' + ids.length + ' siswa sekaligus bisa berat. Lanjutkan?')) return null;
      return list.filter(function (s) { return ids.indexOf(s.id) !== -1; });
    }

    root.innerHTML =
      '<div class="panel-head"><div><div class="panel-head__title">Cetak Buku Induk</div><div class="panel-head__desc">Buku Induk terdiri dari 4 bagian: <b>Cover</b>, <b>Daftar Siswa</b>, <b>Biodata</b>, dan <b>Nilai</b>. Cover dan Daftar Siswa dicetak sekaligus (cukup satu per kelas); Biodata dan Nilai dicetak sendiri-sendiri per siswa. Di jendela cetak, pilih "Simpan sebagai PDF" bila perlu file.</div></div></div>' +

      '<div class="section-title">1 & 2. Cover + Daftar Siswa <span style="font-weight:400;font-size:12px;color:var(--ink-soft);">(satu kali cetak per kelas)</span></div>' +
      '<div class="toolbar" style="align-items:flex-end;">' +
      (!opts.kelasId ? '<div class="field" style="margin-bottom:0;"><label>Kelas</label><select id="cetKelas"><option value="">— pilih kelas —</option>' + kelasList.map(function (k) { return '<option value="' + k.id + '">' + esc(k.nama) + '</option>'; }).join('') + '</select></div>' :
        '<div class="field" style="margin-bottom:0;"><label>Kelas</label><div style="padding:8px 0;font-weight:600;">' + esc(kelasWali ? kelasWali.nama : '—') + '</div></div>') +
      '<button class="btn-small btn-small--primary" id="cetCover">🖨 Cetak Cover + Daftar Siswa</button></div>' +
      '<div class="panel-note" style="margin-top:-4px;">Cover: judul, kelas, program keahlian, tahun ajaran. Daftar Siswa: No, Nama, NIS, NISN, Keterangan (Baru / Pindahan, dari isian "Diterima Sebagai"). Hanya siswa aktif di kelas tersebut. Tanda tangan hanya Kepala Sekolah, tanggalnya mengikuti tanggal diterima siswa baru.</div>' +

      '<div class="section-title" style="margin-top:22px;">3 & 4. Biodata dan Nilai <span style="font-weight:400;font-size:12px;color:var(--ink-soft);">(centang siswa yang ingin dicetak)</span></div>' +
      '<div class="toolbar" style="align-items:flex-end;">' +
      (opts.admin ? '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;padding-bottom:10px;"><input type="checkbox" id="cetAlumni"> sertakan lulus/pindah/keluar</label>' : '<input type="checkbox" id="cetAlumni" checked style="display:none;">') +
      '<button class="btn-small btn-small--primary" id="cetBiodata">🖨 Cetak Biodata</button>' +
      '<button class="btn-small btn-small--primary" id="cetNilai">🖨 Cetak Nilai</button></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th style="width:36px;"><input type="checkbox" id="cetAll" checked></th><th>Nama</th><th>NIS</th><th>Kelas</th><th>Status</th></tr></thead><tbody id="cetTbody"></tbody></table></div>';
    tampil();
    var k = root.querySelector('#cetKelas'); if (k) k.addEventListener('change', function (e) { kelasPilih = e.target.value; tampil(); });
    root.querySelector('#cetAlumni').addEventListener('change', tampil);
    root.querySelector('#cetAll').addEventListener('change', function (e) { root.querySelectorAll('.cetChk').forEach(function (c) { c.checked = e.target.checked; }); });
    root.querySelector('#cetCover').addEventListener('click', function () {
      var kl = kelasAktif();
      if (!kl) { alert('Pilih kelas dulu.'); return; }
      BI.cetakCoverDaftar(siswaKelas(), kl);
    });
    root.querySelector('#cetBiodata').addEventListener('click', function () { var l = terpilih(); if (l) BI.cetak(l, 'biodata'); });
    root.querySelector('#cetNilai').addEventListener('click', function () { var l = terpilih(); if (l) BI.cetak(l, 'nilai'); });
  };

  // Unduh/Impor Excel.
  BI.renderExcel = async function (opts) {
    var root = opts.root;
    var namaKelas = (opts.kelasId && BI.ctx.kelasWali) ? BI.ctx.kelasWali.nama : '';
    var sufiks = namaKelas ? '_' + namaKelas.replace(/\s+/g, '_') : '';
    var taTeks = BI.ctx.ta ? 'Tahun Ajaran ' + BI.ctx.ta.nama + ' ' + BI.ctx.ta.semester : '';
    root.innerHTML =
      '<div class="panel-head"><div><div class="panel-head__title">Excel Buku Induk</div><div class="panel-head__desc">' +
      'Isi data siswa lewat Excel: unduh template, isi di Excel, lalu impor kembali. Siswa dicocokkan lewat NIS (cadangan NISN). Sel kosong tidak menghapus data yang sudah ada.</div></div></div>' +
      '<div class="section-title">1. Unduh</div>' +
      '<div class="toolbar">' +
      '<button class="btn-small btn-small--primary" id="exTemplate">⬇ Template Isian (berisi daftar siswa)</button>' +
      (opts.admin ? '<button class="btn-small" id="exKosong">⬇ Template Kosong (siswa baru)</button>' : '') +
      '<button class="btn-small" id="exUnduh">⬇ Data Saat Ini</button>' +
      (opts.admin ? '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;"><input type="checkbox" id="exAlumni"> sertakan lulus/pindah/keluar</label>' : '') + '</div>' +
      '<div class="section-title">2. Impor</div>' +
      '<div class="toolbar" style="align-items:center;">' +
      '<label class="btn-small" style="cursor:pointer;">⬆ Pilih File Excel untuk Diimpor<input type="file" id="exFile" accept=".xlsx,.xls" style="display:none;"></label>' +
      (opts.admin ? '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;"><input type="checkbox" id="exBaru"> tambahkan siswa baru bila NIS belum ada</label>' : '') +
      '<label style="display:flex;gap:6px;align-items:center;font-size:12.5px;"><input type="checkbox" id="exTimpa"> timpa data yang sudah ada</label></div>' +
      '<div class="panel-note" style="margin-top:-4px;">Tanpa dicentang, impor hanya mengisi isian yang masih kosong; data yang sudah terisi dibiarkan. Centang "timpa data yang sudah ada" bila isian di Excel harus menggantikan data lama (sel Excel yang kosong tetap tidak menghapus apa pun).</div>' +
      '<div id="exHasil"></div>';
    var hasil = root.querySelector('#exHasil');

    async function ambilList() {
      var list = await BI.muatSiswa({ kelasId: opts.kelasId || null });
      if (opts.admin && !(root.querySelector('#exAlumni') || {}).checked) list = list.filter(function (s) { return s.status === 'aktif'; });
      return list;
    }
    function jalankan(btnId, fn) {
      root.querySelector(btnId).addEventListener('click', async function () {
        var btn = this, teks = btn.textContent; btn.disabled = true; btn.textContent = 'Menyiapkan...';
        try { await fn(); } catch (e) { alert('Gagal: ' + pesanError(e)); }
        btn.disabled = false; btn.textContent = teks;
      });
    }
    async function namaKelasAdmin() { return opts.admin ? (await BI.muatKelas()).map(function (k) { return k.nama; }) : []; }
    jalankan('#exTemplate', async function () {
      var list = await ambilList();
      await BI.unduhTemplate(list, 'template_buku_induk' + sufiks + '.xlsx', { kelasNama: await namaKelasAdmin(), judul: 'TEMPLATE ISIAN BUKU INDUK PESERTA DIDIK', subjudul: (namaKelas ? 'Kelas ' + namaKelas + ' · ' : '') + taTeks + ' · SMK Widya Mandala Tambak' });
    });
    if (opts.admin) jalankan('#exKosong', async function () {
      await BI.unduhTemplate([], 'template_buku_induk_kosong.xlsx', { kosong: 50, kelasNama: await namaKelasAdmin(), judul: 'TEMPLATE ISIAN BUKU INDUK PESERTA DIDIK', subjudul: 'Siswa baru · SMK Widya Mandala Tambak' });
    });
    jalankan('#exUnduh', async function () {
      var list = await ambilList();
      await BI.unduhExcel(list, 'buku_induk' + sufiks + '.xlsx', { judul: 'BUKU INDUK PESERTA DIDIK', subjudul: (namaKelas ? 'Kelas ' + namaKelas + ' · ' : '') + taTeks + ' · SMK Widya Mandala Tambak' });
    });

    var fileEl = root.querySelector('#exFile');
    var fileTerpilih = null;
    async function prosesFile() {
      if (!fileTerpilih) return;
      hasil.innerHTML = '<div class="panel-note">Membaca file...</div>';
      try {
        var semua = await BI.muatSiswa({ kelasId: opts.kelasId || null });
        var tambahBaru = !!(root.querySelector('#exBaru') || {}).checked;
        var timpa = !!(root.querySelector('#exTimpa') || {}).checked;
        var h = await BI.bacaExcel(fileTerpilih, semua, { tambahBaru: tambahBaru, timpa: timpa, tempatkan: !!opts.admin, kelasList: opts.admin ? await BI.muatKelas() : [] });
        var isian = h.cocok.reduce(function (t, c) { return t + c.jumlah; }, 0);
        hasil.innerHTML = '<div class="import-summary">' + h.totalBaris + ' baris berisi data dibaca\n' + h.cocok.length + ' siswa punya perubahan (' + isian + ' isian)\n' +
          (h.timpa ? (h.menimpa ? h.menimpa + ' isian akan MENIMPA data yang sudah ada\n' : '') : (h.dilewatiTerisi ? h.dilewatiTerisi + ' isian dilewati karena data sudah terisi (centang "timpa data yang sudah ada" bila ingin menggantinya)\n' : '')) +
          (h.baru.length ? h.baru.length + ' siswa baru akan ditambahkan\n' : '') +
          (h.penempatan.length || h.baru.some(function (x) { return x.kelasId; }) ? (h.penempatan.length + h.baru.filter(function (x) { return x.kelasId; }).length) + ' siswa akan ditempatkan ke kelas (tahun ajaran aktif)\n' : '') +
          (h.tidakDitemukan.length ? h.tidakDitemukan.length + ' baris tidak cocok dengan siswa manapun (periksa NIS' + (opts.admin ? ', atau centang "tambahkan siswa baru"' : '') + '):\n' + esc(h.tidakDitemukan.slice(0, 15).join('\n')) + (h.tidakDitemukan.length > 15 ? '\n...' : '') : 'Semua baris dikenali.') +
          (h.peringatan.length ? '\n\nPeringatan (isian ini dilewati):\n' + esc(h.peringatan.slice(0, 15).join('\n')) + (h.peringatan.length > 15 ? '\n... dan ' + (h.peringatan.length - 15) + ' lagi' : '') : '') + '</div>' +
          ((h.cocok.length || h.baru.length || h.penempatan.length) ? '<div class="toolbar"><button class="btn-small btn-small--primary" id="exTerapkan">Terapkan Perubahan</button></div>' : '');
        var t = hasil.querySelector('#exTerapkan');
        if (t) t.addEventListener('click', async function () {
          t.disabled = true;
          fileTerpilih = null;
          var r = await BI.terapkanImpor(h, function (n, tot) { t.textContent = 'Menyimpan ' + n + '/' + tot + '...'; });
          hasil.innerHTML = '<div class="import-summary">Selesai: ' + r.ok + ' siswa diperbarui' + (r.baru ? ', ' + r.baru + ' siswa baru ditambahkan' : '') + (r.ditempatkan ? ', ' + r.ditempatkan + ' siswa ditempatkan ke kelas' : '') + '.' + (r.gagal.length ? '\nGagal ' + r.gagal.length + ':\n' + esc(r.gagal.slice(0, 10).join('\n')) : '') + '</div>';
        });
      } catch (e) { hasil.innerHTML = '<div class="import-summary" style="color:var(--danger);">Gagal membaca file: ' + esc(pesanError(e)) + '</div>'; }
    }
    fileEl.addEventListener('change', function () {
      if (!fileEl.files[0]) return;
      fileTerpilih = fileEl.files[0];
      fileEl.value = '';
      prosesFile();
    });
    // Ubah centang -> pratinjau dihitung ulang dari file yang sama (tanpa pilih file lagi).
    ['#exTimpa', '#exBaru'].forEach(function (id) {
      var el = root.querySelector(id);
      if (el) el.addEventListener('change', prosesFile);
    });
  };

  // Tombol bantu: logout seragam
  BI.pasangLogout = function (id) {
    var el = document.getElementById(id || 'logoutBtn');
    if (el) el.addEventListener('click', async function (e) { e.preventDefault(); if (typeof g.catatAktivitas === 'function') await g.catatAktivitas('logout', 'Akun', 'Keluar dari aplikasi'); await sb().auth.signOut(); g.location.href = 'index.html'; });
  };

  // Cek sesi, ambil profil + tahun ajaran aktif. Mengembalikan konteks atau mengalihkan ke login.
  BI.mulaiSesi = async function () {
    var ses = await sb().auth.getSession();
    if (!ses.data.session) { g.location.href = 'index.html'; return null; }
    var user = ses.data.session.user;
    var pr = await sb().from('profiles').select('nama, role').eq('id', user.id).single();
    var nama = (pr.data && pr.data.nama) ? pr.data.nama : user.email;
    var ta = (await sb().from('tahun_ajaran').select('id, nama, semester').eq('is_aktif', true).maybeSingle()).data;
    BI.ctx.userId = user.id;
    BI.ctx.nama = nama;
    BI.ctx.admin = !!(pr.data && pr.data.role === 'admin');
    BI.ctx.ta = ta || null;
    return { user: user, nama: nama, role: pr.data ? pr.data.role : null, ta: ta };
  };
})(window);
