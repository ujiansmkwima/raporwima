# Cara Deploy `admin-create-guru` lewat Supabase Dashboard

Tidak perlu install CLI / terminal. Semua bisa lewat browser.

1. Buka **Supabase Dashboard** → pilih project kamu.
2. Di sidebar kiri, klik **Edge Functions**.
3. Klik **Deploy a new function** → pilih **Via Editor** (bukan lewat CLI).
4. Isi **Name**: `admin-create-guru` (harus persis, karena dipanggil
   dari admin.html dengan nama ini).
5. Hapus isi editor default, lalu **copy-paste seluruh isi file
   `index.ts`** yang ada satu folder dengan panduan ini ke editor.
6. Klik **Deploy**.
7. Tunggu sampai statusnya **Active** (biasanya beberapa detik).

Tidak perlu mengisi apa pun di menu **Edge Functions → Secrets** —
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, dan `SUPABASE_SERVICE_ROLE_KEY`
sudah otomatis tersedia di semua Edge Function.

## Cara Tes

1. Login ke `admin.html` dengan akun admin.
2. Buka menu **Guru** di sidebar.
3. Isi form **Nama Guru / Email / Password / Role**, lalu klik
   **+ Tambah Akun**.
4. Kalau berhasil, muncul pesan hijau dan nama guru langsung muncul
   di daftar di bawahnya. Guru tersebut sekarang bisa login lewat
   `index.html` pakai email & password yang baru dibuat.

## Kalau Muncul Error

- **"Hanya admin yang boleh menambah akun."** → akun yang dipakai
  login bukan admin (cek kolom `role` di tabel `profiles`).
- **"Email ini sudah terdaftar."** → pakai email lain, atau hapus dulu
  user lama lewat Supabase Dashboard → Authentication → Users.
- **Gagal terhubung ke server / 404** → pastikan nama function di
  Dashboard persis `admin-create-guru`, dan function statusnya
  **Active**.
- **401 / sesi tidak valid** → login ulang di `index.html`, sesi
  admin mungkin sudah kedaluwarsa.

## Update: sekarang function ini juga menangani Edit Guru

`index.ts` sudah ditambah aksi `update` (dipanggil otomatis lewat
tombol **Edit** di menu Guru → bisa ubah nama, email, role, dan
reset password). Kalau function ini sudah pernah di-deploy
sebelumnya, **deploy ulang** dengan copy-paste isi `index.ts` yang
terbaru (ulangi langkah 3–7 di atas) supaya tombol Edit berfungsi.
