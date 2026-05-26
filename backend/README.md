# Backend SMKN 1 Terisi

**Stack:** Node.js · Express · sql.js · JWT · bcrypt · WebSocket

## Quick Start

```bash
cd backend
cp .env.example .env
npm install
node utils/setupDatabase.js
npm run dev
```

Server: http://localhost:3001

## Akun Default (password: Smkn1Terisi@2024)

| Role | Login |
|------|-------|
| super_admin | admin@smkn1terisi.sch.id |
| kepala_sekolah | kepsek@smkn1terisi.sch.id |
| guru | deni.setiawan@smkn1terisi.sch.id |
| tata_usaha | tu@smkn1terisi.sch.id |
| siswa | NISN: 0012345678 |
| wali_murid | supriadi@gmail.com |

## Frontend Files (timpa ke root project)

| File | Perubahan |
|------|-----------|
| auth-guard.js | BARU — proteksi JWT per halaman |
| DATA.js | Fetch dari /api/siswa/*, fallback offline |
| LMS.html | Tambah script auth-guard.js |
| login.html | Form ke /api/auth/login |
| SKL.js | Fetch dari /api/content/skl/cari |
| script.js | Ticker dari /api/content/announcements |
| ppdb.html | Form ke /api/ppdb |

## Cara pakai auth-guard.js

```html
<script src="auth-guard.js"></script>  <!-- SEBELUM script utama -->
<script src="DATA.js"></script>
```

## API Endpoints

```
POST /api/auth/login             publik
POST /api/auth/register          publik
POST /api/auth/refresh           publik
POST /api/auth/forgot-password   publik
POST /api/auth/reset-password    publik
GET  /api/auth/me                auth

GET  /api/siswa/dashboard        siswa/wali
GET  /api/siswa/profil           siswa/wali
PUT  /api/siswa/profil           siswa
GET  /api/siswa/nilai            siswa/guru
GET  /api/siswa/kehadiran        siswa/wali
GET  /api/siswa/jadwal           siswa

POST /api/content/skl/cari       publik
GET  /api/content/announcements  publik
GET  /api/cbt-results            staff

POST /api/ppdb                   publik
GET  /api/ppdb/cek?nomor=        publik
GET  /api/ppdb                   staff
PATCH /api/ppdb/:id/status       staff
```

## Migrasi DB (jika sudah ada)

```bash
node utils/setupDatabase.js --migrate
```

## Production

```bash
npm install -g pm2
pm2 start server.js --name smkn1terisi
pm2 save && pm2 startup
```

## .env Wajib Diubah di Production

```
JWT_SECRET=ganti-dengan-string-acak-panjang
JWT_REFRESH_SECRET=ganti-dengan-string-acak-panjang
FRONTEND_URL=https://domain-sekolah.sch.id
```
