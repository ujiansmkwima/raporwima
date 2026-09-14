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
