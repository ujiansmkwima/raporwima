// =========================================================
// EDGE FUNCTION: admin-create-guru
// Dipanggil dari admin.html (menu "Guru") untuk membuat akun
// login baru (Supabase Auth) sekaligus mengisi tabel profiles,
// tanpa admin perlu buka Supabase Dashboard → Authentication
// secara manual.
//
// Yang dilakukan function ini:
//   1. Memastikan pemanggil sudah login DAN rolenya 'admin'
//      (dicek lewat tabel profiles, bukan cuma percaya token).
//   2. Membuat user baru di Supabase Auth (email + password).
//   3. Menambahkan baris ke public.profiles (nama, role).
//   4. Kalau langkah 3 gagal, user Auth yang baru dibuat di
//      langkah 2 langsung dihapus lagi (rollback), supaya tidak
//      ada akun "nyangkut" tanpa profil.
//
// Env var SUPABASE_URL, SUPABASE_ANON_KEY, dan
// SUPABASE_SERVICE_ROLE_KEY sudah otomatis tersedia di setiap
// Edge Function Supabase — TIDAK perlu diisi manual di menu
// Secrets.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  // Preflight CORS (browser selalu kirim OPTIONS dulu sebelum POST)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ error: "Method tidak didukung, gunakan POST." }, 405);
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // ---- 1. Ambil token pemanggil dari header Authorization ----
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return json({ error: "Tidak ada sesi login. Silakan login ulang." }, 401);
    }

    // Client dengan hak akses SETARA pemanggil (anon key + token dia),
    // dipakai HANYA untuk memverifikasi identitas token tersebut.
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(jwt);
    if (callerErr || !callerData?.user) {
      return json({ error: "Sesi login tidak valid. Silakan login ulang." }, 401);
    }

    // Client dengan Service Role Key: hak akses penuh, dipakai untuk
    // cek role admin & membuat akun baru. Kuncinya TIDAK PERNAH
    // dikirim ke browser — hanya hidup di dalam Edge Function ini.
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ---- 2. Pastikan pemanggil memang admin ----
    const { data: callerProfile, error: profileErr } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", callerData.user.id)
      .maybeSingle();

    if (profileErr || !callerProfile || callerProfile.role !== "admin") {
      return json({ error: "Hanya admin yang boleh menambah akun." }, 403);
    }

    // ---- 3. Validasi input ----
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "create").trim();

    // ---- Aksi UPDATE: dipakai tombol "Edit" di menu Guru ----
    if (action === "update") {
      const userId = String(body.user_id || "").trim();
      const namaUpd = String(body.nama || "").trim();
      const emailUpd = String(body.email || "").trim().toLowerCase();
      const passwordUpd = String(body.password || "");
      const roleUpd = String(body.role || "").trim();

      if (!userId || !namaUpd || !emailUpd) {
        return json({ error: "Nama dan email wajib diisi." }, 400);
      }
      if (roleUpd && !["admin", "guru"].includes(roleUpd)) {
        return json({ error: "Role harus 'admin' atau 'guru'." }, 400);
      }
      if (passwordUpd && passwordUpd.length < 6) {
        return json({ error: "Password baru minimal 6 karakter." }, 400);
      }

      // Update akun login (email selalu diselaraskan, password hanya kalau diisi)
      const authPayload: Record<string, unknown> = { email: emailUpd };
      if (passwordUpd) authPayload.password = passwordUpd;

      const { error: authUpdErr } = await adminClient.auth.admin.updateUserById(userId, authPayload);
      if (authUpdErr) {
        const msg = authUpdErr.message || "Gagal memperbarui akun login.";
        const friendly = /already been registered|already exists/i.test(msg)
          ? "Email ini sudah dipakai akun lain."
          : msg;
        return json({ error: friendly }, 400);
      }

      // Update tabel profiles (nama, email, role)
      const profilePayload: Record<string, unknown> = { nama: namaUpd, email: emailUpd };
      if (roleUpd) profilePayload.role = roleUpd;

      const { error: profUpdErr } = await adminClient.from("profiles").update(profilePayload).eq("id", userId);
      if (profUpdErr) {
        return json({ error: "Akun login diperbarui, tapi gagal menyimpan profil: " + profUpdErr.message }, 400);
      }

      return json({ success: true, user_id: userId }, 200);
    }

    // ---- Aksi DELETE: dipakai tombol "Hapus" / "Hapus Terpilih" di menu Guru ----
    if (action === "delete") {
      const idsRaw = body.user_ids !== undefined ? body.user_ids : body.user_id;
      const userIds: string[] = Array.isArray(idsRaw)
        ? idsRaw.map((x) => String(x).trim()).filter(Boolean)
        : (idsRaw ? [String(idsRaw).trim()] : []);

      if (!userIds.length) {
        return json({ error: "Tidak ada akun yang dipilih untuk dihapus." }, 400);
      }

      // Admin tidak boleh menghapus akunnya sendiri (supaya tidak terkunci keluar).
      if (userIds.includes(callerData.user.id)) {
        return json({ error: "Tidak bisa menghapus akun yang sedang dipakai login saat ini." }, 400);
      }

      const gagal: { user_id: string; error: string }[] = [];
      let berhasil = 0;

      for (const uid of userIds) {
        // Hapus baris profil dulu (kalau gagal, akun Auth tidak ikut dihapus
        // supaya tidak ada akun Auth "nyangkut" tanpa profil).
        const { error: profDelErr } = await adminClient.from("profiles").delete().eq("id", uid);
        if (profDelErr) {
          gagal.push({ user_id: uid, error: profDelErr.message });
          continue;
        }
        const { error: authDelErr } = await adminClient.auth.admin.deleteUser(uid);
        if (authDelErr) {
          gagal.push({ user_id: uid, error: authDelErr.message });
          continue;
        }
        berhasil++;
      }

      return json({ success: gagal.length === 0, deleted_count: berhasil, failed: gagal }, 200);
    }

    // ---- Aksi CREATE (default): membuat akun guru baru ----
    const nama = String(body.nama || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const role = String(body.role || "guru").trim();

    if (!nama || !email || !password) {
      return json({ error: "Nama, email, dan password wajib diisi." }, 400);
    }
    if (password.length < 6) {
      return json({ error: "Password minimal 6 karakter." }, 400);
    }
    if (!["admin", "guru"].includes(role)) {
      return json({ error: "Role harus 'admin' atau 'guru'." }, 400);
    }

    // ---- 4. Buat akun di Supabase Auth ----
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // langsung aktif, tidak perlu klik link verifikasi email
    });

    if (createErr || !created?.user) {
      const msg = createErr?.message || "Gagal membuat akun login.";
      const friendly = /already been registered|already exists/i.test(msg)
        ? "Email ini sudah terdaftar."
        : msg;
      return json({ error: friendly }, 400);
    }

    // ---- 5. Isi tabel profiles (nama + email + role) ----
    const { error: insertErr } = await adminClient.from("profiles").insert({
      id: created.user.id,
      nama,
      email,
      role,
    });

    if (insertErr) {
      // Rollback: hapus akun Auth yang terlanjur dibuat supaya tidak
      // ada akun tanpa profil (bisa login tapi tidak dikenali sistem).
      await adminClient.auth.admin.deleteUser(created.user.id);
      return json({ error: "Gagal menyimpan profil: " + insertErr.message }, 400);
    }

    return json({ success: true, user_id: created.user.id }, 200);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Terjadi kesalahan tak terduga." }, 500);
  }
});
