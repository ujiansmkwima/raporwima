/* sticky-nama.js
   Membekukan (freeze) kolom "Nama" / "Nama Siswa" pada semua tabel data
   yang bisa digeser ke samping, supaya nama tetap terlihat saat tabel
   digeser ke kanan. Tabel di halaman ini dirender lewat JavaScript
   (innerHTML), jadi kolom ditandai otomatis memakai MutationObserver. */
(function () {
  'use strict';
  var KELAS = 'col-nama-sticky';
  var COCOK = /^nama( siswa)?$/i;

  function indeksKolomNama(tabel) {
    var barisHead = tabel.tHead && tabel.tHead.rows[0];
    if (!barisHead) return -1;
    var posisi = 0;
    for (var i = 0; i < barisHead.cells.length; i++) {
      var sel = barisHead.cells[i];
      if (COCOK.test((sel.textContent || '').replace(/\s+/g, ' ').trim())) return posisi;
      posisi += sel.colSpan || 1;
    }
    return -1;
  }

  function tandai(tabel) {
    if (!tabel.tHead || !tabel.tHead.rows.length) return;
    var idx = indeksKolomNama(tabel);
    if (idx < 0) return;
    var barisHead = tabel.tHead.rows[0];
    // Cari sel header pada posisi idx
    var pos = 0;
    for (var i = 0; i < barisHead.cells.length; i++) {
      if (pos === idx) { barisHead.cells[i].classList.add(KELAS); break; }
      pos += barisHead.cells[i].colSpan || 1;
    }
    // Sel isi tabel pada posisi yang sama
    Array.prototype.forEach.call(tabel.tBodies, function (tb) {
      Array.prototype.forEach.call(tb.rows, function (tr) {
        var p = 0;
        for (var j = 0; j < tr.cells.length; j++) {
          var c = tr.cells[j];
          if (p === idx) {
            if ((c.colSpan || 1) === 1) c.classList.add(KELAS);
            break;
          }
          p += c.colSpan || 1;
        }
      });
    });
  }

  var terjadwal = false;
  function pindai() {
    terjadwal = false;
    var daftar = document.querySelectorAll('.table-wrap > table.data-table');
    for (var i = 0; i < daftar.length; i++) tandai(daftar[i]);
  }
  function jadwalkan() {
    if (terjadwal) return;
    terjadwal = true;
    (window.requestAnimationFrame || setTimeout)(pindai);
  }

  function mulai() {
    pindai();
    new MutationObserver(jadwalkan).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) mulai();
  else document.addEventListener('DOMContentLoaded', mulai);
})();
