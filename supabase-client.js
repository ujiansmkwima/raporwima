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
