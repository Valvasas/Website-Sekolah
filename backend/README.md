# Backend SMKN 1 Terisi

Node.js + Express + sql.js + JWT + WebSocket

## Setup

```bash
cd backend
cp .env.example .env       # edit jika perlu
npm install
node utils/setupDatabase.js   # buat DB + seed data
npm run dev                   # development (nodemon)
# atau
npm start                     # production
```

Server berjalan di `http://localhost:3001`

## Akun Default

| Role | Login | Password |
|---|---|---|
| super_admin | admin@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| kepala_sekolah | kepsek@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| guru | deni.setiawan@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| tata_usaha | tu@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| siswa | NISN: 0012345678 | Smkn1Terisi@2024 |
| wali_murid | supriadi@gmail.com | Smkn1Terisi@2024 |

## API Endpoints

### Auth — `/api/auth/`
| Method | Path | Deskripsi |
|---|---|---|
| POST | /login | Login semua role |
| POST | /register | Daftar akun baru |
| POST | /logout | Logout |
| POST | /refresh | Refresh access token |
| POST | /forgot-password | Kirim email reset |
| POST | /reset-password | Ganti password via token |
| POST | /change-password | Ganti password (sudah login) |
| GET | /me | Profil user saat ini |
| GET | /verify-email | Verifikasi email |

### Users — `/api/users/` *(butuh auth)*
| Method | Path | Akses |
|---|---|---|
| GET | / | Staff only |
| GET | /stats | Admin only |
| GET | /audit-logs | Admin only |
| POST | / | Admin only |
| PUT | /:id | Self atau admin |
| DELETE | /:id | Admin only |

### Content — `/api/content/`
| Method | Path | Akses |
|---|---|---|
| POST | /skl/cari | Publik |
| GET | /skl | TU+ |
| POST | /skl | TU+ |
| PUT | /skl/:id | TU+ |
| DELETE | /skl/:id | Admin |
| GET | /announcements | Publik |
| POST | /announcements | Staff |
| GET | /cbt-results | Staff |
| GET | /cbt-results/export | Staff |

## Contoh Request Login

```bash
# Login staff (email)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smkn1terisi.sch.id","password":"Smkn1Terisi@2024"}'

# Login siswa (NISN)
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"nisn":"0012345678","password":"Smkn1Terisi@2024"}'

# Cari SKL
curl -X POST http://localhost:3001/api/content/skl/cari \
  -H "Content-Type: application/json" \
  -d '{"nisn":"0012345678","nama":"AHMAD FARHAN MAULANA","ttl":"2008-01-15","tahun_lulus":"2026"}'
```

## Struktur Folder

```
backend/
├── server.js
├── package.json
├── .env.example
├── config/         jwt, database, mailer, passport
├── controllers/    authController, userController
├── middleware/     auth, auditLog, rateLimiter, validate
├── routes/         auth, users, content
├── utils/          setupDatabase, testServer
├── admin-panel/    login.html, dashboard.html, reset-password.html
└── data/           smkn1terisi.bin (di-ignore git)
```

## Frontend Files yang Diupdate

Salin file-file ini ke root project:
- `SKL.js` → fetch dari `/api/content/skl/cari`
- `script.js` → ticker bar dari `/api/content/announcements`
- `login.html` → form login ke `/api/auth/login`
