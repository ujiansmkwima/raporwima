/* mobile.js
 * -----------------------------------------------------------------
 * Tampilan HP untuk semua halaman ber-layout "app" (guru, admin,
 * supervisi). Dipakai bersama style.css (bagian "MOBILE").
 *
 * 1) Menu samping jadi LACI geser: tombol ☰ di topbar membuka menu,
 *    tap di luar / pilih menu / tombol Esc menutupnya lagi.
 * 2) Tabel isian (nilai, presensi, ekskul, dll) tampil sebagai KARTU
 *    per baris di layar sempit: tiap kolom diberi label (dari header
 *    tabel) lewat atribut data-label. DOM & id/class elemen TIDAK
 *    diubah, jadi semua kode simpan/import/unduh tetap bekerja.
 *    Tabel dirender ulang lewat innerHTML, jadi dipantau dengan
 *    MutationObserver (sama seperti sticky-nama.js).
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  var MAKS_KOLOM_TABEL_BACA = 5; // tabel baca-saja sampai segini kolom ikut jadi kartu

  // ---------- 1) Laci menu ----------
  function pasangLaci() {
    var sidebar = document.querySelector('.app > .sidebar');
    var topbar = document.querySelector('.topbar');
    if (!sidebar || !topbar || document.getElementById('btnMenuMobile')) return;

    var tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.id = 'btnMenuMobile';
    tombol.className = 'menu-toggle';
    tombol.setAttribute('aria-label', 'Buka menu');
    tombol.setAttribute('aria-expanded', 'false');
    tombol.innerHTML = '<span></span><span></span><span></span>';
    topbar.insertBefore(tombol, topbar.firstChild);

    var overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);

    function buka(ya) {
      document.body.classList.toggle('nav-open', ya);
      tombol.setAttribute('aria-expanded', ya ? 'true' : 'false');
      tombol.setAttribute('aria-label', ya ? 'Tutup menu' : 'Buka menu');
    }

    tombol.addEventListener('click', function () {
      buka(!document.body.classList.contains('nav-open'));
    });
    overlay.addEventListener('click', function () { buka(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') buka(false); });
    window.addEventListener('resize', function () { if (window.innerWidth > 860) buka(false); });

    // Menu diisi lewat JS (async) — pakai delegasi klik. Setelah memilih
    // menu, laci menutup supaya konten langsung terlihat.
    sidebar.addEventListener('click', function (e) {
      var item = e.target.closest ? e.target.closest('.menu-item') : null;
      if (item) setTimeout(function () { buka(false); }, 0);
    });
  }

  // ---------- 2) Tabel -> kartu ----------
  function teksHeader(th) {
    return (th.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function punyaKontrol(tabel) {
    return !!tabel.querySelector('tbody input, tbody textarea, tbody select');
  }

  function prosesTabel(tabel) {
    var barisHead = tabel.tHead && tabel.tHead.rows[0];
    if (!barisHead) return;
    var head = Array.prototype.slice.call(barisHead.cells);
    if (!head.length) return;
    for (var i = 0; i < head.length; i++) {
      if ((head[i].colSpan || 1) !== 1) return; // header bertingkat: biarkan tabel biasa
    }
    if (tabel.tHead.rows.length > 1) return;

    var kartu = punyaKontrol(tabel) || head.length <= MAKS_KOLOM_TABEL_BACA;
    if (!kartu) return; // tabel baca-saja yang lebar (rekap/leger): tetap geser + kolom Nama beku

    var label = head.map(teksHeader);
    tabel.classList.add('data-table--cards');
    if (tabel.parentNode && tabel.parentNode.classList) tabel.parentNode.classList.add('table-wrap--cards');

    Array.prototype.forEach.call(tabel.tBodies, function (tb) {
      Array.prototype.forEach.call(tb.rows, function (tr) {
        var sel = tr.cells;
        if (sel.length !== head.length) { tr.classList.add('row-catatan'); return; } // mis. "Belum ada data" (colspan)
        for (var j = 0; j < sel.length; j++) {
          var td = sel[j];
          if (!td.hasAttribute('data-label')) td.setAttribute('data-label', label[j]);
          var lbl = label[j].toLowerCase();
          if (/^no\.?$/.test(lbl)) td.classList.add('td-no');
          else if (/^nama( siswa| peserta didik)?$/.test(lbl)) td.classList.add('td-nama');
          else if (td.querySelector('textarea') || /catatan|deskripsi|capaian|keterangan|kegiatan|aksi|tindakan/.test(lbl) ||
                   (td.querySelector('button, a.btn-small') && !td.querySelector('input, select'))) {
            td.classList.add('td-lebar');
          }
          if (!label[j]) td.classList.add('td-tanpa-label');
        }
      });
    });
  }

  var terjadwal = false;
  function pindai() {
    terjadwal = false;
    var daftar = document.querySelectorAll('.table-wrap > table.data-table');
    for (var i = 0; i < daftar.length; i++) prosesTabel(daftar[i]);
  }
  function jadwalkan() {
    if (terjadwal) return;
    terjadwal = true;
    (window.requestAnimationFrame || setTimeout)(pindai);
  }

  function mulai() {
    pasangLaci();
    pindai();
    new MutationObserver(function () { pasangLaci(); jadwalkan(); })
      .observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) mulai();
  else document.addEventListener('DOMContentLoaded', mulai);
})();
