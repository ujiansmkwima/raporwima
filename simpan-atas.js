/* =========================================================
 * SIMPAN-ATAS — Tombol "Simpan" kedua di atas tabel, rata kanan
 * Dipakai bersama oleh admin.html dan guru.html.
 *
 * Banyak halaman input berupa tabel panjang, sementara tombol
 * Simpan aslinya ada di bawah tabel (atau jauh di kepala halaman).
 * Skrip ini memasang SATU tombol Simpan tambahan tepat di atas
 * tabel, di sisi kanan, supaya mudah terlihat.
 *
 * Tombol tambahan ini hanyalah "perpanjangan" tombol aslinya:
 *  - kalau diklik, yang dijalankan tetap handler tombol asli
 *    (tidak ada logika simpan yang digandakan);
 *  - teks dan status nonaktif-nya selalu mengikuti tombol asli,
 *    jadi ikut berubah jadi "Menyimpan..." dan terkunci selama
 *    proses simpan berjalan;
 *  - atribut data-guard-scope disalin, supaya peringatan
 *    "Perubahan Belum Disimpan" (unsaved-guard.js) bekerja sama
 *    persis seperti klik pada tombol asli.
 *
 * PEMAKAIAN (panggil sesudah HTML halaman selesai dirender):
 *   SimpanAtas.pasang('idTombolAsli');
 *   SimpanAtas.pasang('idTombolAsli', { tabel: '#selektorTabel' });
 *
 * Tanpa opsi tabel, tabel dipilih otomatis: .table-wrap terakhir
 * yang ada SEBELUM tombol asli (tombol di bawah tabel), kalau tidak
 * ada maka .table-wrap pertama SESUDAH tombol asli (tombol di atas).
 * Aman dipanggil berulang untuk halaman yang sama.
 * ========================================================= */
(function () {
  'use strict';
  if (window.SimpanAtas) return;

  function cariTabel(asli, selector) {
    if (selector) return document.querySelector(selector);
    var semua = document.querySelectorAll('#content .table-wrap');
    var sebelum = null, sesudah = null;
    for (var i = 0; i < semua.length; i++) {
      var pos = asli.compareDocumentPosition(semua[i]);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) sebelum = semua[i];
      else if ((pos & Node.DOCUMENT_POSITION_FOLLOWING) && !sesudah) sesudah = semua[i];
    }
    return sebelum || sesudah;
  }

  function pasang(idAsli, opsi) {
    opsi = opsi || {};
    var asli = document.getElementById(idAsli);
    if (!asli) return null;

    var idAtas = idAsli + 'Atas';
    var lama = document.getElementById(idAtas);
    if (lama) return lama;

    var tabel = cariTabel(asli, opsi.tabel);
    if (!tabel || !tabel.parentNode) return null;

    var tombol = document.createElement('button');
    tombol.type = 'button';
    tombol.id = idAtas;
    tombol.className = 'btn-small btn-small--primary';
    var scope = asli.getAttribute('data-guard-scope');
    if (scope) tombol.setAttribute('data-guard-scope', scope);

    function sinkron() {
      tombol.textContent = (asli.textContent || '').trim();
      tombol.disabled = !!asli.disabled;
    }
    sinkron();

    tombol.addEventListener('click', function () {
      if (!asli.disabled) asli.click();
    });

    // Ikuti perubahan teks/status tombol asli (mis. "Menyimpan...").
    var pengamat = new MutationObserver(function () {
      if (!asli.isConnected) { pengamat.disconnect(); return; }
      sinkron();
    });
    pengamat.observe(asli, {
      attributes: true, attributeFilter: ['disabled'],
      childList: true, characterData: true, subtree: true
    });

    var baris = document.createElement('div');
    baris.className = 'simpan-atas';
    baris.style.cssText = 'display:flex;justify-content:flex-end;margin:0 0 10px;';
    baris.appendChild(tombol);
    tabel.parentNode.insertBefore(baris, tabel);
    return tombol;
  }

  window.SimpanAtas = { pasang: pasang };
})();
