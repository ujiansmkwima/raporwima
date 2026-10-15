/* bottomnav.js
 * -----------------------------------------------------------------
 * Menu aplikasi (Menu Utama, Buku Induk, E-Rapor, PKL, Supervisi,
 * Pelanggaran) tampil sebagai BAR BAWAH di layar HP (<= 860px, sama
 * dengan breakpoint laci menu di mobile.js). Di desktop tidak ada
 * perubahan sama sekali.
 *
 * Dipakai di halaman guru & admin: portal, guru, admin, bukuinduk-guru,
 * bukuinduk-admin, pkl, supervisi, supervisi-admin, pelanggaran.
 *
 * Tujuan tiap tombol mengikuti role (admin / guru). Role diambil dari
 * nama file halaman bila jelas (mis. admin.html), kalau tidak dari
 * tabel profiles (di-cache di sessionStorage per user).
 * -----------------------------------------------------------------
 */
(function () {
  'use strict';

  var BREAKPOINT = 860;

  var IKON = {
    menu: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>',
    bi: '<path d="M15 13a3 3 0 1 0-6 0"/><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20"/><circle cx="12" cy="8" r="2"/>',
    rapor: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    pkl: '<path d="M12 12h.01"/><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M22 13a18.15 18.15 0 0 1-20 0"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    sup: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    pel: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4"/><path d="M12 16h.01"/>'
  };

  // ---------- halaman ini ----------
  var berkas = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var kunciAktif = null;
  var roleDariBerkas = null;
  if (berkas === 'portal.html') { kunciAktif = 'menu'; }
  else if (berkas === 'bukuinduk-admin.html') { kunciAktif = 'bi'; roleDariBerkas = 'admin'; }
  else if (berkas === 'bukuinduk-guru.html') { kunciAktif = 'bi'; roleDariBerkas = 'guru'; }
  else if (berkas === 'admin.html') { kunciAktif = 'rapor'; roleDariBerkas = 'admin'; }
  else if (berkas === 'guru.html') { kunciAktif = 'rapor'; roleDariBerkas = 'guru'; }
  else if (berkas === 'pkl.html') { kunciAktif = 'pkl'; }
  else if (berkas === 'supervisi-admin.html') { kunciAktif = 'sup'; roleDariBerkas = 'admin'; }
  else if (berkas === 'supervisi.html') { kunciAktif = 'sup'; roleDariBerkas = 'guru'; }
  else if (berkas === 'pelanggaran.html') { kunciAktif = 'pel'; }
  else { return; } // halaman lain (login, siswa, dll): tidak dipasang

  function daftar(role) {
    var admin = role === 'admin';
    return [
      { k: 'menu',  label: 'Menu Utama',  href: 'portal.html' },
      { k: 'bi',    label: 'Buku Induk',  href: admin ? 'bukuinduk-admin.html' : 'bukuinduk-guru.html' },
      { k: 'rapor', label: 'E-Rapor',     href: admin ? 'admin.html' : 'guru.html' },
      { k: 'pkl',   label: 'PKL',         href: 'pkl.html' },
      { k: 'sup',   label: 'Supervisi',   href: admin ? 'supervisi-admin.html' : 'supervisi.html' },
      { k: 'pel',   label: 'Pelanggaran', href: 'pelanggaran.html' }
    ];
  }

  // ---------- gaya (disisipkan lewat JS supaya tidak tergantung versi style.css) ----------
  function pasangGaya() {
    if (document.getElementById('bottomnavStyle')) return;
    var st = document.createElement('style');
    st.id = 'bottomnavStyle';
    st.textContent =
      '.bnav{display:none;}' +
      '@media screen and (max-width:' + BREAKPOINT + 'px){' +
        'body.has-bnav{padding-bottom:calc(66px + env(safe-area-inset-bottom,0px));}' +
        '.bnav{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:50;' +
          'background:rgba(255,255,255,.97);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);' +
          'border-top:1px solid var(--border,#e2e8f0);box-shadow:0 -6px 20px -8px rgba(15,23,42,.18);' +
          'padding:0 2px env(safe-area-inset-bottom,0px);}' +
        '.bnav__item{position:relative;flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'gap:3px;padding:8px 1px 7px;text-decoration:none;color:var(--ink-soft,#64748b);font-size:10px;font-weight:600;line-height:1.15;' +
          'text-align:center;-webkit-tap-highlight-color:transparent;}' +
        '.bnav__item svg{width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0;}' +
        '.bnav__item span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
        '.bnav__item.is-active{color:var(--primary,#4f46e5);font-weight:800;}' +
        '.bnav__item.is-active::before{content:"";position:absolute;top:-1px;left:24%;right:24%;height:2.5px;' +
          'background:var(--primary,#4f46e5);border-radius:0 0 3px 3px;}' +
        /* tombol "Menu Utama" di topbar jadi mubazir karena sudah ada di bar bawah */
        '.topbar .topbar__app{display:none !important;}' +
        /* elemen melayang lain digeser naik supaya tidak tertutup bar */
        '.simpan-atas{bottom:calc(76px + env(safe-area-inset-bottom,0px)) !important;}' +
        '.pd-toast{bottom:calc(76px + env(safe-area-inset-bottom,0px)) !important;}' +
      '}';
    document.head.appendChild(st);
  }

  // ---------- render ----------
  function render(role) {
    var items = daftar(role);
    var nav = document.getElementById('bottomNavApp');
    if (!nav) {
      nav = document.createElement('nav');
      nav.id = 'bottomNavApp';
      nav.className = 'bnav';
      nav.setAttribute('aria-label', 'Menu aplikasi');
      document.body.appendChild(nav);
      document.body.classList.add('has-bnav');
    }
    nav.innerHTML = items.map(function (it) {
      var aktif = it.k === kunciAktif;
      return '<a class="bnav__item' + (aktif ? ' is-active' : '') + '" href="' + it.href + '"' +
        (aktif ? ' aria-current="page"' : '') + '>' +
        '<svg viewBox="0 0 24 24" aria-hidden="true">' + IKON[it.k] + '</svg><span>' + it.label + '</span></a>';
    }).join('');
  }

  // ---------- role ----------
  function roleTersimpan(uid) {
    try { return sessionStorage.getItem('bnav_role_' + uid); } catch (e) { return null; }
  }
  function simpanRole(uid, role) {
    try { sessionStorage.setItem('bnav_role_' + uid, role); } catch (e) {}
  }

  async function cariRole() {
    if (typeof supabaseClient === 'undefined') return 'guru';
    try {
      var ses = await supabaseClient.auth.getSession();
      var user = ses && ses.data && ses.data.session && ses.data.session.user;
      if (!user) return 'guru';
      var cache = roleTersimpan(user.id);
      if (cache) return cache;
      var pr = await supabaseClient.from('profiles').select('role').eq('id', user.id).single();
      var role = (pr && pr.data && pr.data.role === 'admin') ? 'admin' : 'guru';
      if (pr && pr.data) simpanRole(user.id, role);
      return role;
    } catch (e) {
      return 'guru';
    }
  }

  async function mulai() {
    pasangGaya();
    if (roleDariBerkas) {
      render(roleDariBerkas);
      return;
    }
    // pkl / pelanggaran / portal: role bergantung akun
    render('guru'); // tampil dulu supaya bar tidak "muncul belakangan"
    var role = await cariRole();
    if (role === 'admin') render('admin');
  }

  if (document.body) mulai();
  else document.addEventListener('DOMContentLoaded', mulai);
})();
