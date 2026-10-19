/* foto-profil.js
 * -----------------------------------------------------------------
 * Foto profil guru/admin untuk SEMUA aplikasi (E-Rapor, Buku Induk,
 * PKL, Supervisi, Pelanggaran, Menu Utama).
 *
 *  - Foto tampil di bulatan avatar pojok kanan atas (#userAvatar atau
 *    .user-chip / .portal__user). Kalau belum ada foto: huruf pertama nama.
 *  - Klik avatar -> jendela "Foto Profil" untuk ganti / hapus foto sendiri.
 *    Tidak perlu menu di sidebar.
 *  - Admin juga bisa mengatur foto guru lain: admin.html -> menu Guru
 *    (memakai FotoProfil.bukaModal / FotoProfil.isiAvatar).
 *  - File disimpan di bucket privat "foto-guru" (migrasi_foto_guru.sql),
 *    dikompres otomatis ke JPEG persegi 320x320 px, maksimal ±50 KB.
 *  - Sebelum disimpan, foto bisa diatur di editor: geser, zoom (slider /
 *    scroll / cubit), putar 90° & miringkan, cermin, crop persegi.
 *
 * Aman dipasang di halaman mana pun: kalau tidak login / akun siswa /
 * migrasi belum dijalankan, skrip ini diam saja.
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  var BUCKET = 'foto-guru';
  var MAKS_BYTE = 50 * 1024;
  var UKURAN = 320;
  var cacheUrl = {}; // path -> { url, exp }

  function sb() { return window.supabaseClient; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function inisial(nama) { return String(nama || '?').trim().charAt(0).toUpperCase() || '?'; }

  // ---------- URL foto (signed URL, di-cache) ----------
  async function urlFoto(path) {
    if (!path) return null;
    var c = cacheUrl[path];
    if (c && c.exp > Date.now()) return c.url;
    var r = await sb().storage.from(BUCKET).createSignedUrl(path, 3600);
    if (r.error || !r.data) return null;
    cacheUrl[path] = { url: r.data.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
    return r.data.signedUrl;
  }

  async function urlBanyak(paths) {
    var out = {}, perlu = [];
    paths.forEach(function (p) {
      if (!p || out[p] !== undefined) return;
      var c = cacheUrl[p];
      if (c && c.exp > Date.now()) { out[p] = c.url; return; }
      out[p] = null; perlu.push(p);
    });
    for (var i = 0; i < perlu.length; i += 100) {
      var r = await sb().storage.from(BUCKET).createSignedUrls(perlu.slice(i, i + 100), 3600);
      if (r.error || !r.data) continue;
      r.data.forEach(function (d) {
        if (d && d.path && d.signedUrl) {
          out[d.path] = d.signedUrl;
          cacheUrl[d.path] = { url: d.signedUrl, exp: Date.now() + 50 * 60 * 1000 };
        }
      });
    }
    return out;
  }

  // ---------- kompres: potong persegi (tengah, sedikit ke atas), JPEG <= 50 KB ----------
  function canvasKeBlob(c, q) { return new Promise(function (res) { c.toBlob(res, 'image/jpeg', q); }); }

  async function kompres(file) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('File bukan gambar. Pilih file JPG, PNG, atau WEBP.');
    var u = URL.createObjectURL(file);
    try {
      var img = await new Promise(function (ok, gagal) {
        var im = new Image();
        im.onload = function () { ok(im); };
        im.onerror = function () { gagal(new Error('Gambar tidak bisa dibuka / format tidak didukung browser.')); };
        im.src = u;
      });
      var w0 = img.naturalWidth, h0 = img.naturalHeight;
      var sisi = Math.min(w0, h0);
      var sx = Math.round((w0 - sisi) / 2);
      var sy = h0 > w0 ? Math.round((h0 - sisi) * 0.25) : 0; // foto potret: ambil agak ke atas (wajah)
      var ukuran = Math.min(UKURAN, sisi);
      for (var tahap = 0; tahap < 8; tahap++) {
        var c = document.createElement('canvas');
        c.width = ukuran; c.height = ukuran;
        var ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, ukuran, ukuran);
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, sx, sy, sisi, sisi, 0, 0, ukuran, ukuran);
        var b = await canvasKeBlob(c, 0.9);
        if (b && b.size <= MAKS_BYTE) return b;
        var lo = 0.3, hi = 0.9, terbaik = null;
        for (var i = 0; i < 7; i++) {
          var mid = (lo + hi) / 2;
          b = await canvasKeBlob(c, mid);
          if (b && b.size <= MAKS_BYTE) { terbaik = b; lo = mid; } else { hi = mid; }
        }
        if (terbaik) return terbaik;
        ukuran = Math.max(64, Math.round(ukuran * 0.85));
      }
      throw new Error('Foto tidak bisa dikompres sampai 50 KB. Coba foto lain.');
    } finally { URL.revokeObjectURL(u); }
  }

  // ---------- EDITOR FOTO: geser, zoom, putar, cermin, potong ----------
  function muatSumber(file) {
    if (!file || !/^image\//.test(file.type || '')) return Promise.reject(new Error('File bukan gambar. Pilih file JPG, PNG, atau WEBP.'));
    var u = URL.createObjectURL(file);
    return new Promise(function (ok, gagal) {
      var im = new Image();
      im.onload = function () {
        // perkecil dulu (maks 1600 px) supaya editor tetap ringan di HP.
        var k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.naturalWidth * k));
        c.height = Math.max(1, Math.round(im.naturalHeight * k));
        var x = c.getContext('2d');
        x.imageSmoothingQuality = 'high';
        x.drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(u);
        ok(c);
      };
      im.onerror = function () { URL.revokeObjectURL(u); gagal(new Error('Gambar tidak bisa dibuka / format tidak didukung browser.')); };
      im.src = u;
    });
  }

  // state: rot (0/90/180/270), fine (-45..45 derajat), flip, zoom (1 = pas menutupi kotak),
  // ox/oy = geseran sebagai pecahan dari lebar kotak.
  function stateAwal(src) {
    var w = src.width, h = src.height;
    // foto potret: mulai agak ke atas (wajah), sama seperti perilaku lama
    return { rot: 0, fine: 0, flip: false, zoom: 1, ox: 0, oy: h > w ? 0.25 * (h / w - 1) : 0 };
  }
  function dimRot(src, st) { return (st.rot % 180) !== 0 ? { w: src.height, h: src.width } : { w: src.width, h: src.height }; }
  function klemState(src, st) {
    var d = dimRot(src, st), base = Math.max(1 / d.w, 1 / d.h);
    var lx = Math.abs(d.w * base * st.zoom / 2 - 0.5), ly = Math.abs(d.h * base * st.zoom / 2 - 0.5);
    st.ox = Math.max(-lx, Math.min(lx, st.ox));
    st.oy = Math.max(-ly, Math.min(ly, st.oy));
  }
  function gambarKe(ctx, src, S, st) {
    var d = dimRot(src, st);
    var skala = Math.max(S / d.w, S / d.h) * st.zoom;
    ctx.save();
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, S, S);
    ctx.imageSmoothingQuality = 'high';
    ctx.translate(S / 2 + st.ox * S, S / 2 + st.oy * S);
    ctx.rotate((st.rot + st.fine) * Math.PI / 180);
    ctx.scale(st.flip ? -skala : skala, skala);
    ctx.drawImage(src, -src.width / 2, -src.height / 2);
    ctx.restore();
  }

  // hasil akhir: JPEG persegi <= 50 KB
  async function renderBlob(src, st) {
    var ukuran = UKURAN;
    for (var tahap = 0; tahap < 8; tahap++) {
      var c = document.createElement('canvas');
      c.width = ukuran; c.height = ukuran;
      gambarKe(c.getContext('2d'), src, ukuran, st);
      var b = await canvasKeBlob(c, 0.9);
      if (b && b.size <= MAKS_BYTE) return b;
      var lo = 0.3, hi = 0.9, terbaik = null;
      for (var i = 0; i < 7; i++) {
        var mid = (lo + hi) / 2;
        b = await canvasKeBlob(c, mid);
        if (b && b.size <= MAKS_BYTE) { terbaik = b; lo = mid; } else { hi = mid; }
      }
      if (terbaik) return terbaik;
      ukuran = Math.max(64, Math.round(ukuran * 0.85));
    }
    throw new Error('Foto tidak bisa dikompres sampai 50 KB. Coba foto lain.');
  }

  // Buka editor. Resolve { blob, state } kalau "Terapkan", atau null kalau dibatalkan.
  function bukaEditor(src, stAwal) {
    pasangGaya();
    return new Promise(function (selesai) {
      var V = Math.max(200, Math.min(300, window.innerWidth - 90));
      var st = stAwal ? Object.assign({}, stAwal) : stateAwal(src);

      var ov = document.createElement('div');
      ov.className = 'fp-ov fp-ed';
      ov.style.zIndex = '1200';
      ov.innerHTML =
        '<div class="fp-box fp-edbox" role="dialog" aria-modal="true">' +
        '<h3>Atur Foto</h3>' +
        '<p>Geser foto dengan jari/mouse. Cubit atau scroll untuk zoom.</p>' +
        '<div class="fp-stage" style="width:' + V + 'px;height:' + V + 'px;">' +
        '<canvas id="fpEdCv"></canvas><div class="fp-guide"></div></div>' +
        '<div class="fp-slrow"><span>Zoom</span><input type="range" id="fpEdZoom" min="50" max="400" step="1"><b id="fpEdZoomV"></b></div>' +
        '<div class="fp-slrow"><span>Miringkan</span><input type="range" id="fpEdFine" min="-45" max="45" step="1"><b id="fpEdFineV"></b></div>' +
        '<div class="fp-row">' +
        '<button type="button" class="btn-small" id="fpEdKiri" title="Putar 90° ke kiri">⟲ Kiri</button>' +
        '<button type="button" class="btn-small" id="fpEdKanan" title="Putar 90° ke kanan">⟳ Kanan</button>' +
        '<button type="button" class="btn-small" id="fpEdCermin" title="Balik kiri-kanan">⇋ Cermin</button>' +
        '<button type="button" class="btn-small" id="fpEdReset">Reset</button>' +
        '</div>' +
        '<div class="fp-pesan" id="fpEdPesan">Lingkaran = tampilan di avatar.</div>' +
        '<div class="fp-aksi"><button type="button" class="btn-small" id="fpEdBatal">Batal</button>' +
        '<button type="button" class="btn-small btn-small--primary" id="fpEdOk">Terapkan</button></div>' +
        '</div>';
      document.body.appendChild(ov);

      var cv = ov.querySelector('#fpEdCv');
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = cv.height = Math.round(V * dpr);
      cv.style.width = cv.style.height = V + 'px';
      var ctx = cv.getContext('2d');
      var zoomEl = ov.querySelector('#fpEdZoom'), zoomV = ov.querySelector('#fpEdZoomV');
      var fineEl = ov.querySelector('#fpEdFine'), fineV = ov.querySelector('#fpEdFineV');
      var pesan = ov.querySelector('#fpEdPesan'), btnOk = ov.querySelector('#fpEdOk');
      var menunggu = false;

      function gambar() {
        if (menunggu) return;
        menunggu = true;
        requestAnimationFrame(function () { menunggu = false; gambarKe(ctx, src, cv.width, st); });
      }
      function sinkron() {
        zoomEl.value = Math.round(st.zoom * 100); zoomV.textContent = Math.round(st.zoom * 100) + '%';
        fineEl.value = st.fine; fineV.textContent = st.fine + '°';
        klemState(src, st); gambar();
      }
      sinkron();

      function tutup(hasil) { document.removeEventListener('keydown', esk, true); ov.remove(); selesai(hasil); }
      function esk(e) { if (e.key === 'Escape') { e.stopPropagation(); tutup(null); } }
      document.addEventListener('keydown', esk, true);

      // geser (1 jari/mouse) + cubit zoom (2 jari)
      var ptr = {}, jarak0 = 0, zoom0 = 1;
      function jarak() { var k = Object.keys(ptr); var a = ptr[k[0]], b = ptr[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; }
      cv.addEventListener('pointerdown', function (e) {
        try { cv.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ }
        ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (Object.keys(ptr).length === 2) { jarak0 = jarak(); zoom0 = st.zoom; }
      });
      cv.addEventListener('pointermove', function (e) {
        var p = ptr[e.pointerId]; if (!p) return;
        var n = Object.keys(ptr).length;
        if (n === 1) { st.ox += (e.clientX - p.x) / V; st.oy += (e.clientY - p.y) / V; }
        ptr[e.pointerId] = { x: e.clientX, y: e.clientY };
        if (n === 2) { st.zoom = Math.max(0.5, Math.min(4, zoom0 * jarak() / jarak0)); sinkron(); return; }
        klemState(src, st); gambar();
      });
      function lepas(e) { delete ptr[e.pointerId]; jarak0 = 0; }
      cv.addEventListener('pointerup', lepas);
      cv.addEventListener('pointercancel', lepas);
      cv.addEventListener('wheel', function (e) {
        e.preventDefault();
        st.zoom = Math.max(0.5, Math.min(4, st.zoom * Math.exp(-e.deltaY * 0.0015)));
        sinkron();
      }, { passive: false });

      zoomEl.addEventListener('input', function () { st.zoom = zoomEl.value / 100; sinkron(); });
      fineEl.addEventListener('input', function () { st.fine = parseInt(fineEl.value, 10) || 0; sinkron(); });
      function putar(d) { st.rot = (st.rot + d + 360) % 360; st.ox = 0; st.oy = 0; sinkron(); }
      ov.querySelector('#fpEdKiri').addEventListener('click', function () { putar(-90); });
      ov.querySelector('#fpEdKanan').addEventListener('click', function () { putar(90); });
      ov.querySelector('#fpEdCermin').addEventListener('click', function () { st.flip = !st.flip; sinkron(); });
      ov.querySelector('#fpEdReset').addEventListener('click', function () { st = stateAwal(src); sinkron(); });
      ov.querySelector('#fpEdBatal').addEventListener('click', function () { tutup(null); });
      btnOk.addEventListener('click', async function () {
        btnOk.disabled = true; btnOk.textContent = 'Memproses...';
        try {
          var b = await renderBlob(src, st);
          tutup({ blob: b, state: st });
        } catch (err) {
          pesan.textContent = err.message; pesan.className = 'fp-pesan err';
          btnOk.disabled = false; btnOk.textContent = 'Terapkan';
        }
      });
    });
  }

  function pesanError(e) {
    var m = (e && (e.message || e.error_description)) || String(e || '');
    if (/set_foto_profil|foto_path|Bucket not found|bucket.*not.*found/i.test(m)) return 'Fitur foto belum aktif. Jalankan migrasi_foto_guru.sql di Supabase → SQL Editor, lalu muat ulang halaman.';
    if (/row-level security|violates|not authorized|403/i.test(m)) return 'Tidak punya izin mengubah foto ini.';
    return m;
  }

  // ---------- gaya ----------
  function pasangGaya() {
    if (document.getElementById('fotoProfilStyle')) return;
    var st = document.createElement('style');
    st.id = 'fotoProfilStyle';
    st.textContent =
      '.fp-av{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:linear-gradient(135deg,var(--primary-soft,#6366f1),#4f46e5);color:#fff;font-weight:700;overflow:hidden;background-size:cover;background-position:center;flex-shrink:0;vertical-align:middle;}' +
      '.fp-av.has-foto,.user-chip__avatar.has-foto,.fp-portal-av.has-foto{background-size:cover!important;background-position:center!important;background-repeat:no-repeat;color:transparent!important;font-size:0!important;}' +
      '.fp-klik{cursor:pointer;position:relative;transition:box-shadow .15s ease,transform .15s ease;}' +
      '.fp-klik:hover{box-shadow:0 0 0 3px rgba(99,102,241,.28);}' +
      '.fp-klik:focus-visible{outline:2px solid var(--primary,#4f46e5);outline-offset:2px;}' +
      '.fp-portal-av{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;background:linear-gradient(135deg,var(--primary-soft,#6366f1),#4f46e5);flex-shrink:0;}' +
      '.fp-ov{position:fixed;inset:0;z-index:1100;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:16px;}' +
      '.fp-box{background:var(--surface,#fff);color:var(--ink,#0f172a);border-radius:16px;width:100%;max-width:380px;padding:24px 24px 22px;box-shadow:0 20px 50px rgba(0,0,0,.25);text-align:center;}' +
      '.fp-box h3{margin:0 0 4px;font-size:18px;font-weight:700;}' +
      '.fp-box p{margin:0 0 16px;font-size:12.5px;color:var(--ink-soft,#64748b);}' +
      '.fp-prev{width:150px;height:150px;font-size:56px;margin:0 auto 14px;box-shadow:0 4px 14px rgba(0,0,0,.18);}' +
      '.fp-prev.has-foto{font-size:0;}' +
      '.fp-row{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:10px;}' +
      '.fp-pesan{min-height:18px;font-size:12.5px;margin:6px 0 12px;}' +
      '.fp-pesan.err{color:#b42318;}.fp-pesan.ok{color:#067647;}' +
      '.fp-aksi{display:flex;gap:8px;justify-content:center;}' +
      '.fp-edbox{max-width:360px;max-height:100%;overflow-y:auto;}' +
      '.fp-stage{position:relative;margin:0 auto 12px;border-radius:10px;overflow:hidden;background:#fff;touch-action:none;user-select:none;-webkit-user-select:none;box-shadow:0 0 0 1px rgba(0,0,0,.15);}' +
      '.fp-stage canvas{display:block;cursor:grab;touch-action:none;}.fp-stage canvas:active{cursor:grabbing;}' +
      '.fp-guide{position:absolute;inset:0;border-radius:50%;pointer-events:none;box-shadow:0 0 0 999px rgba(15,23,42,.4);border:2px solid rgba(255,255,255,.95);}' +
      '.fp-slrow{display:flex;align-items:center;gap:10px;margin:0 0 8px;font-size:12.5px;color:var(--ink-soft,#64748b);}' +
      '.fp-slrow span{width:62px;text-align:left;flex-shrink:0;}.fp-slrow input{flex:1;min-width:0;}.fp-slrow b{width:42px;text-align:right;font-weight:600;color:var(--ink,#0f172a);}';
    document.head.appendChild(st);
  }

  function setLatar(el, url, nama) {
    if (!el) return;
    if (url) {
      el.style.backgroundImage = 'url("' + url + '")';
      el.classList.add('has-foto');
    } else {
      el.style.backgroundImage = '';
      el.classList.remove('has-foto');
      if (nama && !el.textContent.trim()) el.textContent = inisial(nama);
    }
  }

  // ---------- isi avatar kecil di tabel: <span class="fp-av" data-fp-path data-fp-nama> ----------
  async function isiAvatar(root) {
    pasangGaya();
    var els = Array.prototype.slice.call((root || document).querySelectorAll('.fp-av[data-fp-nama]'));
    els.forEach(function (el) { if (!el.textContent.trim()) el.textContent = inisial(el.dataset.fpNama); });
    var paths = els.map(function (el) { return el.dataset.fpPath; }).filter(Boolean);
    if (!paths.length) return;
    var m = await urlBanyak(paths);
    els.forEach(function (el) { var u = m[el.dataset.fpPath]; if (u) setLatar(el, u, el.dataset.fpNama); });
  }

  // Pasang foto (atau huruf inisial kalau path kosong) ke elemen .fp-av mana pun.
  async function setFoto(el, path, nama) {
    pasangGaya();
    if (!el) return;
    if (!el.textContent.trim()) el.textContent = inisial(nama);
    var u = path ? await urlFoto(path) : null;
    setLatar(el, u, nama);
  }

  // ---------- jendela ganti foto ----------
  // opts: { userId, nama, path, diriSendiri, onSaved(pathBaru|null, urlBaru|null) }
  async function bukaModal(opts) {
    pasangGaya();
    var userId = opts.userId, nama = opts.nama || '';
    var pathLama = opts.path || null;
    var blobBaru = null, previewBaru = null, hapus = false;
    var sumber = null, stateEdit = null; // gambar asli + pengaturan editor (untuk Edit ulang)

    var ov = document.createElement('div');
    ov.className = 'fp-ov';
    ov.innerHTML =
      '<div class="fp-box" role="dialog" aria-modal="true">' +
      '<h3>Foto Profil</h3>' +
      '<p>' + (opts.diriSendiri ? 'Foto ini tampil di semua aplikasi E-Rapor.' : 'Foto profil <b>' + esc(nama) + '</b> — tampil di semua aplikasi.') + '</p>' +
      '<div class="fp-av fp-prev" id="fpPrev">' + esc(inisial(nama)) + '</div>' +
      '<div class="fp-row">' +
      '<label class="btn-small" style="cursor:pointer;">Pilih Foto<input type="file" id="fpFile" accept="image/*" style="display:none;"></label>' +
      '<button type="button" class="btn-small" id="fpEdit" style="display:none;">Atur / Crop</button>' +
      '<button type="button" class="btn-small" id="fpHapus" style="display:none;">Hapus Foto</button>' +
      '</div>' +
      '<div class="fp-pesan" id="fpPesan">Pilih foto, lalu atur posisi, zoom & rotasi sebelum disimpan (±50 KB).</div>' +
      '<div class="fp-aksi"><button type="button" class="btn-small" id="fpBatal">Tutup</button>' +
      '<button type="button" class="btn-small btn-small--primary" id="fpSimpan" disabled>Simpan</button></div>' +
      '</div>';
    document.body.appendChild(ov);

    var prev = ov.querySelector('#fpPrev'), pesan = ov.querySelector('#fpPesan');
    var btnSimpan = ov.querySelector('#fpSimpan'), btnHapus = ov.querySelector('#fpHapus'), btnEdit = ov.querySelector('#fpEdit');

    function tutup() { if (previewBaru) URL.revokeObjectURL(previewBaru); document.removeEventListener('keydown', esk); ov.remove(); }
    function esk(e) { if (e.key === 'Escape' && !document.querySelector('.fp-ed')) tutup(); }
    function info(t, cls) { pesan.textContent = t; pesan.className = 'fp-pesan' + (cls ? ' ' + cls : ''); }
    function segarkan() {
      if (previewBaru) { setLatar(prev, previewBaru); }
      else if (pathLama && !hapus) { urlFoto(pathLama).then(function (u) { setLatar(prev, u, nama); }); }
      else { setLatar(prev, null, nama); prev.textContent = inisial(nama); }
      btnHapus.style.display = ((pathLama && !hapus) || previewBaru) ? '' : 'none';
      btnEdit.style.display = (sumber && previewBaru) ? '' : 'none';
      btnSimpan.disabled = !(blobBaru || hapus);
    }
    segarkan();

    document.addEventListener('keydown', esk);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) tutup(); });
    ov.querySelector('#fpBatal').addEventListener('click', tutup);

    function terapkan(h) {
      if (previewBaru) URL.revokeObjectURL(previewBaru);
      blobBaru = h.blob; stateEdit = h.state; previewBaru = URL.createObjectURL(h.blob); hapus = false;
      info('Siap disimpan (' + Math.round(h.blob.size / 1024) + ' KB).');
    }

    ov.querySelector('#fpFile').addEventListener('change', async function (e) {
      var f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      info('Membuka foto...');
      try {
        var src = await muatSumber(f);
        var h = await bukaEditor(src, null);
        if (h) { sumber = src; terapkan(h); }
        else info(blobBaru ? 'Siap disimpan (' + Math.round(blobBaru.size / 1024) + ' KB).' : '');
      } catch (err) { info(err.message, 'err'); }
      segarkan();
    });

    btnEdit.addEventListener('click', async function () {
      if (!sumber) return;
      try {
        var h = await bukaEditor(sumber, stateEdit);
        if (h) terapkan(h);
      } catch (err) { info(err.message, 'err'); }
      segarkan();
    });

    btnHapus.addEventListener('click', function () {
      if (previewBaru) { URL.revokeObjectURL(previewBaru); previewBaru = null; blobBaru = null; sumber = null; stateEdit = null; }
      else if (pathLama) { hapus = true; }
      info(hapus ? 'Foto akan dihapus saat kamu klik Simpan.' : '');
      segarkan();
    });

    btnSimpan.addEventListener('click', async function () {
      btnSimpan.disabled = true; btnSimpan.textContent = 'Menyimpan...';
      var pathBaru = null, diunggah = null;
      try {
        if (blobBaru) {
          pathBaru = userId + '/foto-' + Date.now() + '.jpg';
          var up = await sb().storage.from(BUCKET).upload(pathBaru, blobBaru, { contentType: 'image/jpeg', upsert: false });
          if (up.error) throw up.error;
          diunggah = pathBaru;
        }
        var rp = await sb().rpc('set_foto_profil', { p_path: pathBaru, p_user: userId });
        if (rp.error) { if (diunggah) await sb().storage.from(BUCKET).remove([diunggah]); throw rp.error; }
        if (pathLama) { try { await sb().storage.from(BUCKET).remove([pathLama]); } catch (x) { /* abaikan */ } }
        var urlBaru = pathBaru ? await urlFoto(pathBaru) : null;
        try { if (window.catatAktivitas) catatAktivitas('lainnya', 'Akun', (opts.diriSendiri ? 'Mengubah foto profil sendiri' : 'Mengubah foto profil guru: ' + nama)); } catch (x) { /* abaikan */ }
        if (opts.onSaved) opts.onSaved(pathBaru, urlBaru);
        try { document.dispatchEvent(new CustomEvent('fotoprofil:berubah', { detail: { userId: userId, path: pathBaru } })); } catch (x) { /* abaikan */ }
        tutup();
      } catch (err) {
        info(pesanError(err), 'err');
        btnSimpan.disabled = false; btnSimpan.textContent = 'Simpan';
      }
    });
  }

  // ---------- avatar pojok kanan atas ----------
  function cariAvatar() {
    var el = document.getElementById('userAvatar');
    if (el) return el;
    var chip = document.querySelector('.user-chip');
    if (chip) {
      el = document.createElement('div');
      el.className = 'user-chip__avatar'; el.id = 'userAvatar';
      chip.appendChild(el);
      return el;
    }
    var portal = document.querySelector('.portal__user');
    if (portal) {
      el = document.createElement('div');
      el.className = 'fp-portal-av'; el.id = 'userAvatar';
      portal.insertBefore(el, portal.firstChild);
      return el;
    }
    return null;
  }

  async function init() {
    if (!sb()) return;
    var ses = await sb().auth.getSession();
    var session = ses && ses.data && ses.data.session;
    if (!session) return;
    var uid = session.user.id;
    pasangGaya();

    var kunciCache = 'fp:' + uid;
    var av = cariAvatar();
    if (!av) return;

    // Tampilkan dulu dari cache sesi supaya tidak berkedip.
    try {
      var c = JSON.parse(sessionStorage.getItem(kunciCache) || 'null');
      if (c && c.url && c.exp > Date.now()) setLatar(av, c.url);
    } catch (e) { /* abaikan */ }

    var r = await sb().from('profiles').select('nama, foto_path').eq('id', uid).maybeSingle();
    if (r.error || !r.data) return; // akun siswa / migrasi belum dijalankan: tidak ada fitur foto
    var nama = r.data.nama || session.user.email;
    var path = r.data.foto_path || null;

    if (!av.textContent.trim() || av.textContent.trim() === '•') av.textContent = inisial(nama);

    async function pasang(p) {
      var u = p ? await urlFoto(p) : null;
      setLatar(av, u, nama);
      try {
        if (u) sessionStorage.setItem(kunciCache, JSON.stringify({ url: u, exp: Date.now() + 50 * 60 * 1000 }));
        else sessionStorage.removeItem(kunciCache);
      } catch (e) { /* abaikan */ }
    }
    await pasang(path);

    av.classList.add('fp-klik');
    av.setAttribute('role', 'button');
    av.setAttribute('tabindex', '0');
    av.setAttribute('title', 'Ubah foto profil');
    function buka() {
      bukaModal({
        userId: uid, nama: nama, path: path, diriSendiri: true,
        onSaved: function (pBaru) { path = pBaru; pasang(path); }
      });
    }
    document.addEventListener('fotoprofil:berubah', function (e) {
      if (e.detail && e.detail.userId === uid) { path = e.detail.path; pasang(path); }
    });
    av.addEventListener('click', buka);
    av.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); buka(); } });
  }

  window.FotoProfil = { bukaModal: bukaModal, bukaEditor: bukaEditor, setFoto: setFoto, isiAvatar: isiAvatar, urlFoto: urlFoto, urlBanyak: urlBanyak, kompres: kompres };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
