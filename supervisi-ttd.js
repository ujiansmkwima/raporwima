/* supervisi-ttd.js — Atur NIP + tanda tangan (gambar) guru/supervisor untuk PDF hasil supervisi.
   Data disimpan di tabel supervisi_ttd (lihat migrasi_supervisi_ttd.sql): hanya pemilik dan admin yang bisa membacanya.
   Dua cara mengisi tanda tangan: unggah foto/scan, atau coret langsung di kotak (jari / mouse).
   Pemakaian:  SvTtd.buka(guruId, namaGuru, function () { ...dipanggil setelah tersimpan... }); */
var SvTtd = (function () {
  var LEBAR_MAKS = 500;

  function esc(s) { return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function bacaGambar(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = function () { reject(new Error('Gagal membaca file.')); };
      r.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('File bukan gambar yang valid.')); };
        img.onload = function () { resolve(img); };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  // Foto tanda tangan di kertas -> latar dibuat transparan (kecerahan latar diperkirakan dari piksel dominan).
  function hapusLatar(c) {
    var ctx = c.getContext('2d'), w = c.width, h = c.height, im = ctx.getImageData(0, 0, w, h), d = im.data, n = w * h;
    var hist = new Array(256).fill(0), i, l;
    for (i = 0; i < n; i++) { l = Math.round(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]); hist[l]++; }
    var acc = 0, bg = 255;
    for (l = 0; l < 256; l++) { acc += hist[l]; if (acc >= n * 0.6) { bg = l; break; } }
    if (bg < 120) return;                       // foto gelap: biarkan apa adanya
    var lo = bg * 0.14, hi = bg * 0.45;
    for (i = 0; i < n; i++) {
      l = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      var dif = bg - l, a = dif <= lo ? 0 : (dif >= hi ? 255 : (dif - lo) / (hi - lo) * 255);
      d[i * 4 + 3] = Math.min(d[i * 4 + 3], a);
    }
    ctx.putImageData(im, 0, 0);
  }

  // Potong bagian kosong di sekeliling coretan; null bila tidak ada coretan sama sekali.
  function potong(c) {
    var w = c.width, h = c.height, d = c.getContext('2d').getImageData(0, 0, w, h).data, x, y;
    var x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    var pad = 4; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    var o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
    o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
    return o;
  }

  async function dariFile(file) {
    var img = await bacaGambar(file), s = img.width > LEBAR_MAKS ? LEBAR_MAKS / img.width : 1;
    var c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    hapusLatar(c);
    var p = potong(c);
    if (!p) throw new Error('Tanda tangan tidak terdeteksi pada gambar. Pakai foto dengan tinta yang jelas di kertas putih.');
    return p.toDataURL('image/png');
  }

  function padCoret(canvas) {
    var ctx = canvas.getContext('2d'), gambar = false, aktif = false, last = null;
    ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height }; }
    canvas.addEventListener('pointerdown', function (e) { e.preventDefault(); aktif = true; last = pos(e); try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* abaikan */ }
      ctx.beginPath(); ctx.arc(last.x, last.y, 1.3, 0, 6.3); ctx.fillStyle = '#111'; ctx.fill(); gambar = true; });
    canvas.addEventListener('pointermove', function (e) { if (!aktif) return; e.preventDefault(); var p = pos(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
    function selesai() { aktif = false; }
    canvas.addEventListener('pointerup', selesai); canvas.addEventListener('pointercancel', selesai); canvas.addEventListener('pointerleave', selesai);
    return {
      kosong: function () { return !gambar; },
      hapus: function () { ctx.clearRect(0, 0, canvas.width, canvas.height); gambar = false; },
      hasil: function () { var p = potong(canvas); return p ? p.toDataURL('image/png') : null; }
    };
  }

  async function buka(guruId, nama, selesai) {
    var o = document.createElement('div'); o.className = 'modal-overlay';
    o.innerHTML = '<div class="modal-box"><div class="modal-box__head"><div class="modal-box__title">NIP & Tanda Tangan — ' + esc(nama || '') + '</div><button class="modal-box__close">×</button></div>' +
      '<div class="panel-note" style="margin-bottom:12px;">Dipakai di blok tanda tangan PDF hasil supervisi. Hanya pemilik dan admin yang dapat melihat tanda tangan ini.</div>' +
      '<div class="field"><label>NIP (opsional)</label><input id="ttdNip" placeholder="Kosongkan bila tidak ada"></div>' +
      '<div class="sv-q"><div class="sv-q__t">Tanda tangan saat ini</div><div id="ttdPrev"></div></div>' +
      '<div class="sv-q"><div class="sv-q__t">Cara 1 — Unggah foto / scan tanda tangan</div><input type="file" id="ttdFile" accept="image/png,image/jpeg,image/webp">' +
      '<div style="font-size:12px;color:var(--ink-soft);margin-top:6px;">Tanda tangan di kertas putih dengan tinta gelap. Latar putih dibuang otomatis.</div></div>' +
      '<div class="sv-q"><div class="sv-q__t">Cara 2 — Coret langsung di kotak (jari / mouse)</div>' +
      '<canvas id="ttdPad" width="600" height="200" style="width:100%;max-width:420px;height:auto;aspect-ratio:3/1;border:1px dashed var(--border);border-radius:8px;background:#fff;touch-action:none;display:block;"></canvas>' +
      '<div style="margin-top:8px;"><button class="btn-small" id="ttdBersih" type="button">Hapus Coretan</button> <button class="btn-small" id="ttdPakai" type="button">Pakai Coretan Ini</button></div></div>' +
      '<div style="margin-top:14px;"><button class="btn-small btn-small--primary" id="ttdSimpan" type="button">Simpan</button> <button class="btn-small" id="ttdHapus" type="button">Hapus Tanda Tangan</button> <span id="ttdMsg" style="font-size:12.5px;color:var(--ink-soft);"></span></div></div>';
    document.body.appendChild(o);
    o.querySelector('.modal-box__close').addEventListener('click', function () { o.remove(); });
    var msg = o.querySelector('#ttdMsg'), prev = o.querySelector('#ttdPrev'), ttd = null;
    function gambarPrev() {
      prev.innerHTML = ttd ? '<img src="' + ttd + '" alt="Tanda tangan" style="max-height:80px;max-width:240px;object-fit:contain;border:1px solid var(--border);border-radius:6px;padding:4px;background:#fff;">' : '<span style="font-size:12.5px;color:var(--ink-soft);">Belum ada tanda tangan.</span>';
    }
    gambarPrev();

    var cur = await supabaseClient.from('supervisi_ttd').select('nip, ttd').eq('guru_id', guruId).maybeSingle();
    if (cur.error) { msg.textContent = 'Tabel belum siap — jalankan migrasi_supervisi_ttd.sql di Supabase. (' + cur.error.message + ')'; }
    else if (cur.data) { o.querySelector('#ttdNip').value = cur.data.nip || ''; ttd = cur.data.ttd || null; gambarPrev(); }

    var pad = padCoret(o.querySelector('#ttdPad'));
    o.querySelector('#ttdFile').addEventListener('change', async function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      try { msg.textContent = 'Memproses gambar...'; ttd = await dariFile(f); gambarPrev(); msg.textContent = 'Gambar siap — klik Simpan.'; }
      catch (err) { msg.textContent = err.message; }
    });
    o.querySelector('#ttdBersih').addEventListener('click', function () { pad.hapus(); });
    o.querySelector('#ttdPakai').addEventListener('click', function () {
      if (pad.kosong()) { msg.textContent = 'Kotak masih kosong.'; return; }
      ttd = pad.hasil(); gambarPrev(); msg.textContent = 'Coretan dipakai — klik Simpan.';
    });
    o.querySelector('#ttdHapus').addEventListener('click', function () { ttd = null; gambarPrev(); msg.textContent = 'Tanda tangan dihapus — klik Simpan.'; });
    o.querySelector('#ttdSimpan').addEventListener('click', async function () {
      var b = this; b.disabled = true; msg.textContent = 'Menyimpan...';
      var res = await supabaseClient.from('supervisi_ttd').upsert({ guru_id: guruId, nip: o.querySelector('#ttdNip').value.trim() || null, ttd: ttd, updated_at: new Date().toISOString() }, { onConflict: 'guru_id' });
      b.disabled = false;
      if (res.error) { msg.textContent = 'Gagal menyimpan: ' + res.error.message; return; }
      o.remove(); if (selesai) selesai();
    });
  }

  return { buka: buka };
})();
