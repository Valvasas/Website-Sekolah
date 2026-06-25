# Website SMKN 1 Terisi

Website sekolah dengan layanan digital untuk halaman publik, LMS siswa/guru, CBT, PPDB, kantin, dan panel admin.

## Struktur Folder

- `frontend/` - halaman publik dan dashboard pengguna yang disajikan sebagai static files.
- `backend/` - server Express, API, autentikasi, modul LMS/CBT, panel admin, dan konfigurasi runtime.
- `asset/` - media website seperti foto, video, dan gambar hero.
- `data/` - database lokal/runtime. Folder ini diabaikan Git dan tidak boleh ikut deployment source.

## Menjalankan Lokal

```bash
cd backend
npm install
npm start
```

Server berjalan di `http://localhost:3001`.

## Uji Coba Server Lokal Sekolah

1. Salin `backend/.env.example` menjadi `backend/.env`.
2. Set `NODE_ENV=production` untuk simulasi realistis, isi `JWT_SECRET` dan `JWT_REFRESH_SECRET` dengan secret berbeda minimal 32 karakter, lalu gunakan `COOKIE_SECURE=auto` selama server masih diakses lewat HTTP LAN.
3. Set `ALLOWED_ORIGINS` dan `FRONTEND_URL` ke alamat LAN server, contoh `http://192.168.1.10:3001`.
4. Jalankan dari folder `backend`:

```bash
npm install --omit=dev
npm start
```

5. Dari komputer/HP satu jaringan, buka `http://IP-SERVER:3001` dan cek `http://IP-SERVER:3001/api/health`.

Catatan: Google OAuth dan email reset password hanya aktif kalau credential Google/SMTP sudah diisi. Tanpa itu, fitur utama website, admin, LMS, CBT, PPDB, dan export tetap bisa diuji.

Registrasi akun publik memakai OTP dua tahap. Isi `EMAIL_USER` dan `EMAIL_PASS` agar OTP email aktif. Verifikasi nomor telepon bersifat opsional dan baru muncul jika `SMS_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, serta `TWILIO_FROM_NUMBER` sudah diisi. Akun tidak dibuat sebelum OTP berhasil diverifikasi.

## Production Checklist

- Set `NODE_ENV=production`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `ALLOWED_ORIGINS`, dan kredensial email di environment server, bukan di repository.
- Gunakan `COOKIE_SECURE=true` setelah website memakai domain HTTPS. Untuk pengujian LAN HTTP, gunakan `COOKIE_SECURE=auto`.
- Jalankan `npm install --omit=dev` di server production.
- Jangan commit `backend/public/uploads/`, `backend/logs/`, `backend/backups/`, `data/`, `.env*`, `node_modules/`, atau artefak QA seperti `.sixth/`.
- Simpan upload dan database di storage/runtime server yang dibackup terpisah.
- File eksperimen satu kali pakai jangan disimpan di root proyek. Jika butuh script maintenance, simpan dengan nama jelas di `backend/utils/` dan dokumentasikan sebelum dipakai ulang.

## Maintenance

Pedoman struktur, data runtime, komentar, dan langkah verifikasi tersedia di [`MAINTENANCE.md`](MAINTENANCE.md).
