/* pengajuan-data.js
 * -----------------------------------------------------------------
 * Sisi GURU / ADMIN untuk "Pengajuan Pembetulan Data Siswa".
 * Dipakai bersama oleh guru.html (wali kelas) dan admin.html.
 *
 *   PengajuanData.pasangBadge(menuEl)      -> angka notifikasi di menu + pop-up saat ada pengajuan baru
 *   PengajuanData.render(container, opts)  -> daftar pengajuan + tombol Terima / Tolak
 *       opts.tahunAjaranId (opsional, untuk menampilkan kelas siswa)
 *
 * Yang bisa dibaca hanya pengajuan siswa yang menjadi hak akses pengguna
 * (wali kelas: siswa kelasnya; admin: semua) — dijaga oleh RLS database.
 * Terima / tolak lewat fungsi database proses_pengajuan_data().
 * Perlu: supabaseClient (supabase-client.js), bukuinduk-fields.js (label isian).
 * -----------------------------------------------------------------
 */
(function (global) {
  'use strict';

  function esc(s) {
    return (s === null || s === undefined) ? '' : String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var LABEL = {};
  var TIPE = {};
  if (global.BI_FIELDS) global.BI_FIELDS.SEMUA.forEach(function (f) { LABEL[f.k] = f.l; TIPE[f.k] = f.tipe; });

  function tampilNilai(k, v) {
    if (v === null || v === undefined || String(v).trim() === '') return '<span class="pd-kosong">(kosong)</span>';
    if (TIPE[k] === 'date') {
      var d = new Date(v + 'T00:00:00');
      if (!isNaN(d.getTime())) return esc(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
    }
    if (k === 'jenis_kelamin') return v === 'L' ? 'Laki-laki' : (v === 'P' ? 'Perempuan' : esc(v));
    return esc(v);
  }

  function formatWaktu(iso) {
    try {
      return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' }).replace(/\./g, ':') + ' WIB';
    } catch (e) { return iso; }
  }

  async function hitung() {
    var r = await supabaseClient.from('pengajuan_data_siswa').select('id', { count: 'exact', head: true });
    return r.error ? 0 : (r.count || 0);
  }

  // ---------- Notifikasi: angka di menu + pop-up ----------
  var terakhir = 0;
  var timer = null;

  function popup(n, menuEl) {
    var lama = document.getElementById('pdToast');
    if (lama) lama.remove();
    var t = document.createElement('div');
    t.id = 'pdToast';
    t.className = 'pd-toast';
    t.innerHTML = '<div class="pd-toast__t">Pengajuan pembetulan data</div>' +
      '<div class="pd-toast__d">Ada ' + n + ' pengajuan dari siswa yang menunggu persetujuan Anda.</div>' +
      '<div class="pd-toast__a"><button type="button" class="btn-small btn-small--primary" id="pdToastBuka">Lihat</button> ' +
      '<button type="button" class="btn-small" id="pdToastTutup">Nanti</button></div>';
    document.body.appendChild(t);
    document.getElementById('pdToastTutup').addEventListener('click', function () { t.remove(); });
    document.getElementById('pdToastBuka').addEventListener('click', function () { t.remove(); if (menuEl) menuEl.click(); });
    setTimeout(function () { if (t.parentNode) t.remove(); }, 15000);
  }

  function pasangBadge(menuEl) {
    if (!menuEl) return;
    var badge = menuEl.querySelector('.menu-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'menu-badge';
      badge.hidden = true;
      menuEl.appendChild(badge);
    }
    async function segarkan() {
      var n = await hitung();
      badge.textContent = n;
      badge.hidden = n === 0;
      if (n > terakhir) popup(n, menuEl);
      terakhir = n;
    }
    menuEl._pdSegarkan = segarkan;
    segarkan();
    if (timer) clearInterval(timer);
    timer = setInterval(segarkan, 60000);
  }

  // ---------- Daftar pengajuan ----------
  async function render(container, opts) {
    opts = opts || {};
    container.innerHTML =
      '<div class="panel-head"><div><div class="panel-head__title">Pengajuan Pembetulan Data Siswa</div>' +
      '<div class="panel-head__desc">Siswa mengajukan pembetulan biodata. <b>Terima</b> = perubahan disimpan ke data siswa. ' +
      '<b>Tolak</b> = pengajuan dihapus dan tidak ada yang disimpan. NIS, NISN, NIK, dan No. KK tidak bisa diubah lewat pengajuan.</div></div></div>' +
      '<div id="pdList"><div class="panel-note">Memuat pengajuan...</div></div>';
    var list = container.querySelector('#pdList');

    var r = await supabaseClient.from('pengajuan_data_siswa')
      .select('id, siswa_id, perubahan, diajukan_pada, siswa:siswa_id(nama, nis)')
      .order('diajukan_pada', { ascending: true });
    if (r.error) {
      list.innerHTML = '<div class="panel-note">Gagal memuat: ' + esc(r.error.message) +
        '<br>Pastikan <b>migrasi_pengajuan_data_siswa.sql</b> sudah dijalankan di Supabase.</div>';
      return;
    }
    var rows = r.data || [];

    var kelasPer = {};
    if (rows.length && opts.tahunAjaranId) {
      var sk = await supabaseClient.from('siswa_kelas').select('siswa_id, kelas:kelas_id(nama)')
        .eq('tahun_ajaran_id', opts.tahunAjaranId).in('siswa_id', rows.map(function (x) { return x.siswa_id; }));
      (sk.data || []).forEach(function (x) { kelasPer[x.siswa_id] = x.kelas ? x.kelas.nama : ''; });
    }

    var menuEl = opts.menuEl;
    if (menuEl && menuEl._pdSegarkan) menuEl._pdSegarkan();

    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state__mark">✓</div><div class="empty-state__title">Tidak ada pengajuan</div>' +
        '<div class="empty-state__desc">Belum ada siswa yang mengajukan pembetulan data. Pengajuan baru akan muncul di sini dan di notifikasi menu.</div></div>';
      return;
    }

    list.innerHTML = '';
    rows.forEach(function (p) {
      var s = p.siswa || {};
      var baris = Object.keys(p.perubahan || {}).map(function (k) {
        var x = p.perubahan[k] || {};
        return '<tr><td>' + esc(LABEL[k] || k) + '</td><td>' + tampilNilai(k, x.lama) + '</td><td class="pd-baru">' + tampilNilai(k, x.baru) + '</td></tr>';
      }).join('');
      var card = document.createElement('div');
      card.className = 'pd-card';
      card.innerHTML =
        '<div class="pd-card__head"><div><div class="pd-card__nama">' + esc(s.nama || '—') + '</div>' +
        '<div class="pd-card__meta">NIS ' + esc(s.nis || '—') + (kelasPer[p.siswa_id] ? ' · Kelas ' + esc(kelasPer[p.siswa_id]) : '') +
        ' · diajukan ' + esc(formatWaktu(p.diajukan_pada)) + '</div></div>' +
        '<div class="pd-card__aksi"><button type="button" class="btn-small btn-small--primary" data-terima>Terima</button> ' +
        '<button type="button" class="btn-small btn-small--danger" data-tolak>Tolak</button></div></div>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Isian</th><th>Data sekarang</th><th>Usulan siswa</th></tr></thead><tbody>' + baris + '</tbody></table></div>';
      list.appendChild(card);

      async function proses(setuju) {
        var teks = setuju
          ? 'Terima pengajuan ' + (s.nama || '') + '? Perubahan akan disimpan ke data siswa.'
          : 'Tolak pengajuan ' + (s.nama || '') + '? Pengajuan akan dihapus dan tidak disimpan.';
        if (!confirm(teks)) return;
        var btns = card.querySelectorAll('button');
        btns.forEach(function (b) { b.disabled = true; });
        var res = await supabaseClient.rpc('proses_pengajuan_data', { p_id: p.id, p_setuju: setuju });
        if (res.error) {
          btns.forEach(function (b) { b.disabled = false; });
          alert('Gagal memproses: ' + res.error.message);
          return;
        }
        if (res.data === 'SUDAH_TIDAK_ADA') alert('Pengajuan ini sudah tidak ada (mungkin dibatalkan siswa).');
        if (opts.onChange) opts.onChange();
        render(container, opts);
      }
      card.querySelector('[data-terima]').addEventListener('click', function () { proses(true); });
      card.querySelector('[data-tolak]').addEventListener('click', function () { proses(false); });
    });
  }

  global.PengajuanData = { hitung: hitung, pasangBadge: pasangBadge, render: render };
})(window);
