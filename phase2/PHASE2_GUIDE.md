# SMKN 1 Terisi — Phase 2 Patch Guide
## Semua Blocker & Missing Features Fixed

---

## File Structure

```
phase2/
├── backend/
│   ├── config/
│   │   ├── database.js        ← REPLACE (better-sqlite3)
│   │   └── env.js             ← NEW FILE
│   ├── utils/
│   │   └── setupDatabase.js   ← REPLACE (all tables + seed)
│   ├── routes/
│   │   ├── lms.js             ← NEW FILE (forum, tugas, materi, notif)
│   │   └── upload.js          ← NEW FILE (file uploads)
│   ├── ecosystem.config.js    ← NEW FILE (PM2 config)
│   └── server.js              ← REPLACE (final clean version)
└── frontend/
    ├── auth-guard.js          ← NEW FILE (missing file!)
    └── LMS.js                 ← REPLACE (real API, no dummy data)
```

---

## Step 1 — Install Dependencies

```bash
cd backend

# Ganti sql.js dengan better-sqlite3
npm uninstall sql.js
npm install better-sqlite3

# Update multer ke versi aman
npm install multer@latest

# Install winston untuk logging (opsional tapi direkomendasikan)
npm install winston
```

---

## Step 2 — Apply Files

### Replace files:
```bash
# Backend
cp phase2/backend/config/database.js     backend/config/database.js
cp phase2/backend/utils/setupDatabase.js backend/utils/setupDatabase.js
cp phase2/backend/server.js              backend/server.js

# Frontend
cp phase2/frontend/LMS.js               frontend/LMS.js
```

### New files (tambahkan):
```bash
cp phase2/backend/config/env.js          backend/config/env.js
cp phase2/backend/routes/lms.js          backend/routes/lms.js
cp phase2/backend/routes/upload.js       backend/routes/upload.js
cp phase2/backend/ecosystem.config.js    backend/ecosystem.config.js
cp phase2/frontend/auth-guard.js         frontend/auth-guard.js
```

---

## Step 3 — Hapus Dead Code

```bash
# Hapus folder config duplikat yang tidak dipakai
rm -rf backend/admin-panel/config/
```

---

## Step 4 — Update .env

```bash
# Generate JWT_SECRET dulu
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Edit .env
nano backend/.env
```

Pastikan ini ada di `.env`:
```env
JWT_SECRET=hasil_generate_di_atas_minimal_32_karakter
NODE_ENV=development
PORT=3001
DB_PATH=./data/smkn1terisi
```

---

## Step 5 — Migrasi Database

### Jika fresh install (belum ada DB):
```bash
cd backend && npm run dev
# setup() otomatis buat semua tabel + seed data
```

### Jika sudah ada DB lama (sql.js .bin):
```bash
cd backend
node -e "
const path = require('path');
const fs   = require('fs');

// Export data dari .bin lama
async function migrate() {
  const SQL    = await require('sql.js')();
  const oldPath = path.resolve('./data/smkn1terisi.bin');

  if (!fs.existsSync(oldPath)) {
    console.log('File .bin tidak ditemukan, skip migrasi data.');
    return;
  }

  const oldDB  = new SQL.Database(fs.readFileSync(oldPath));
  const Database = require('better-sqlite3');
  const newDB  = new Database('./data/smkn1terisi.db');

  // Jalankan setup dulu untuk buat tabel
  require('./utils/setupDatabase').setup();

  // Migrasi users
  try {
    const users = oldDB.exec('SELECT * FROM users')[0];
    if (users) {
      const insert = newDB.prepare('INSERT OR IGNORE INTO users VALUES (' + users.columns.map(() => '?').join(',') + ')');
      const tx = newDB.transaction((rows) => { for (const r of rows) insert.run(r); });
      tx(users.values);
      console.log('✅ Users migrated:', users.values.length);
    }
  } catch(e) { console.warn('Skip users:', e.message); }

  // Migrasi skl_data
  try {
    const skl = oldDB.exec('SELECT * FROM skl_data')[0];
    if (skl) {
      const insert = newDB.prepare('INSERT OR IGNORE INTO skl_data VALUES (' + skl.columns.map(() => '?').join(',') + ')');
      const tx = newDB.transaction((rows) => { for (const r of rows) insert.run(r); });
      tx(skl.values);
      console.log('✅ SKL migrated:', skl.values.length);
    }
  } catch(e) { console.warn('Skip SKL:', e.message); }

  // Migrasi cbt_results
  try {
    const cbt = oldDB.exec('SELECT * FROM cbt_results')[0];
    if (cbt) {
      const insert = newDB.prepare('INSERT OR IGNORE INTO cbt_results VALUES (' + cbt.columns.map(() => '?').join(',') + ')');
      const tx = newDB.transaction((rows) => { for (const r of rows) insert.run(r); });
      tx(cbt.values);
      console.log('✅ CBT results migrated:', cbt.values.length);
    }
  } catch(e) { console.warn('Skip CBT:', e.message); }

  oldDB.close();
  newDB.close();
  console.log('\\n✅ Migrasi selesai!');
}
migrate().catch(console.error);
"
```

---

## Step 6 — Tambah auth-guard ke halaman frontend

Tambahkan tag berikut di `<head>` semua halaman yang butuh login,
**SEBELUM** script lain:

```html
<!-- LMS.html -->
<head>
  <meta name="auth-required" content="true">
  <meta name="auth-roles" content="siswa,guru,wali_murid">
  <script src="/auth-guard.js"></script>
  <!-- script lain di bawah ini -->
</head>

<!-- cbt.html -->
<head>
  <meta name="auth-required" content="false"> <!-- CBT punya auth sendiri -->
</head>

<!-- admin-panel/dashboard.html — sudah ada auth check sendiri, skip -->
```

---

## Step 7 — Test server

```bash
cd backend
npm run dev

# Cek semua endpoint OK:
curl http://localhost:3001/api/health
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"identifier":"0012345678","password":"Smkn1Terisi@2024","role":"siswa"}'
```

---

## Step 8 — Production deploy

```bash
cd backend

# Install PM2 global jika belum ada
npm install -g pm2

# Set NODE_ENV ke production
export NODE_ENV=production

# Start dengan PM2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup  # Ikuti instruksi yang muncul untuk auto-start saat reboot

# Monitor
pm2 status
pm2 logs smkn1terisi-backend
```

---

## Checklist Final

| Item                                  | Status |
|---------------------------------------|--------|
| better-sqlite3 (no data loss)         | ✅     |
| auth-guard.js (semua halaman aman)    | ✅     |
| LMS connect ke real API               | ✅     |
| Forum tersimpan ke DB                 | ✅     |
| Tugas assign + submit ke DB           | ✅     |
| File upload (tugas, profil, PPDB)     | ✅     |
| Materi upload oleh guru               | ✅     |
| Notifikasi real-time per user         | ✅     |
| Env validation saat startup           | ✅     |
| PM2 production config                 | ✅     |
| Error handler global (no stack leak)  | ✅     |
| WebSocket JWT auth                    | ✅     |
| CBT server-side token                 | ✅     |
| SQL injection prevention              | ✅     |
| CORS hardened                         | ✅     |
| Dead code (admin-panel/config) dihapus| ✅     |

---

## Yang Masih Perlu Dikerjakan (Next Sprint)

1. **UI Guru** — Panel input nilai & kehadiran di dashboard.html
2. **Bank Soal** — UI manage soal CBT untuk guru
3. **Export nilai** — PDF/Excel untuk laporan akademik
4. **Dark mode** — CBT & LMS support prefers-color-scheme
5. **Halaman 404** — Custom page untuk URL tidak valid
6. **Panduan user** — Halaman /panduan.html untuk siswa baru
