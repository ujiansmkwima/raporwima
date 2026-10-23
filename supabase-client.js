// =========================================================
// KONEKSI SUPABASE
// Ganti dua nilai di bawah ini dengan milik project kamu.
// Ambil di: Supabase Dashboard → Project Settings → API
//   - "Project URL"      -> SUPABASE_URL
//   - "anon public" key  -> SUPABASE_ANON_KEY
// =========================================================

var SUPABASE_URL = "https://iejpwxmcqwecejsrezry.supabase.co";
var SUPABASE_ANON_KEY = "sb_publishable_dZfvfiSsA-JAndPn172VSg_sq_zRWqS";

var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------
// LOGIN SISWA
// Siswa masuk dengan NIS (bukan email). Di Supabase Auth, akunnya memakai
// email internal <NIS>@siswa.raporwima.local (dibuat oleh
// migrasi_akun_siswa.sql). Domain di bawah HARUS sama dengan fungsi
// public.siswa_email() di migrasi itu.
// ---------------------------------------------------------
var SISWA_EMAIL_DOMAIN = "siswa.raporwima.local";

// Kalau yang diketik mengandung "@" dianggap email (guru/admin), selain itu NIS.
function emailDariInputLogin(teks) {
  var t = String(teks || "").trim();
  if (!t) return "";
  if (t.indexOf("@") !== -1) return t;
  return t.toLowerCase() + "@" + SISWA_EMAIL_DOMAIN;
}

// ---------------------------------------------------------
// LOG AKTIVITAS
// Mencatat login / logout / cetak / unduh ke tabel log_aktivitas lewat
// fungsi database catat_aktivitas() (lihat migrasi_log_aktivitas.sql).
// Perubahan data (tambah/ubah/hapus) TIDAK perlu dicatat di sini: sudah
// otomatis oleh trigger database.
//
// Dibuat aman: tidak pernah melempar error dan tidak menahan lebih dari
// batas waktu (default 1,5 detik), jadi login/logout tidak akan macet
// walaupun migrasi log belum dijalankan atau koneksi lambat.
//   aksi: 'login' | 'logout' | 'cetak' | 'unduh' | 'lainnya'
// ---------------------------------------------------------
// Nama aplikasi untuk kolom log_aktivitas.aplikasi, ditebak dari halaman
// yang sedang dibuka (lihat migrasi_log_aplikasi.sql).
function aplikasiDariHalaman() {
  var b = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (b.indexOf("bukuinduk") === 0) return "Buku Induk";
  if (b === "admin.html" || b === "guru.html") return "E-Rapor";
  if (b === "pkl.html") return "PKL";
  if (b.indexOf("supervisi") === 0) return "Supervisi";
  if (b === "pelanggaran.html") return "Pelanggaran";
  if (b === "pengaturan-admin.html") return "Pengaturan Sekolah";
  if (b === "log-admin.html") return "Log Aktivitas";
  if (b === "siswa.html") return "Portal Siswa";
  return "Akun"; // index.html (login), portal.html
}

function catatAktivitas(aksi, modul, ringkasan, detail, batasMs) {
  try {
    var param = {
      p_aksi: aksi,
      p_modul: modul,
      p_ringkasan: ringkasan || null,
      p_detail: detail || null
    };
    var panggil = supabaseClient.rpc("catat_aktivitas", Object.assign({ p_aplikasi: aplikasiDariHalaman() }, param))
      .then(function (r) {
        // Migrasi migrasi_log_aplikasi.sql belum dijalankan -> coba cara lama.
        if (r && r.error) return supabaseClient.rpc("catat_aktivitas", param).then(function () {}, function () {});
      }, function () {});
    var tunggu = new Promise(function (resolve) { setTimeout(resolve, batasMs || 1500); });
    return Promise.race([panggil, tunggu]);
  } catch (e) {
    return Promise.resolve();
  }
}
