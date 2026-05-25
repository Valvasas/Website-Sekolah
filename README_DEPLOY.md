# 🚀 Panduan Deploy & Integrasi — EduGate SMKN 1 Terisi
> Versi Final — Admin Panel + Login Baru + Auth Guard

---

## 📁 File yang Perlu Diganti / Ditambah

### Frontend (`/frontend/`)
| File | Status | Keterangan |
|------|--------|-----------|
| `login.html` | **GANTI** | Login baru: registrasi guru/TU dengan bidang/jabatan, 3 tab (Login/Daftar/Cek PPDB) |
| `auth-guard.js` | **BARU** | Guard JWT terpusat — pasang di semua halaman yang butuh auth |
| `DATA.html` | **HAPUS** | Tidak digunakan lagi |
| `DATA.css` | **HAPUS** | Tidak digunakan lagi |
| `DATA.js` | **HAPUS** | Tidak digunakan lagi |

### Admin Panel (`/backend/admin-panel/`)
| File | Status | Keterangan |
|------|--------|-----------|
| `dashboard.html` | **GANTI** | Panel lengkap: CBT, Nilai LMS, Jadwal, Kehadiran, Berita, PPDB, Users, Audit |

### Backend
| File | Status | Keterangan |
|------|--------|-----------|
| `controllers/authController.js` | **GANTI** | Support bidang, staff pending approval |
| `controllers/userController.js` | **GANTI** | Support bidang + getPendingStaff |
| `routes/users.js` | **GANTI** | Route baru: pending-staff, approve |
| `utils/migrateAddBidang.js` | **BARU** | Migrasi kolom bidang ke DB |

---

## ⚡ Langkah Deploy (Urutan Penting!)

### 1. Backup DB dulu
```bash
cp backend/data/smkn1terisi.db backend/data/smkn1terisi.db.backup
```

### 2. Copy semua file baru
```bash
# Frontend
cp login.html         frontend/login.html
cp auth-guard.js      frontend/auth-guard.js

# Admin Panel
cp dashboard.html     backend/admin-panel/dashboard.html

# Backend
cp authController.js  backend/controllers/authController.js
cp userController.js  backend/controllers/userController.js
cp users.js           backend/routes/users.js
cp migrateAddBidang.js backend/utils/migrateAddBidang.js
```

### 3. Jalankan migrasi DB
```bash
cd backend
node utils/migrateAddBidang.js
```

### 4. Hapus file DATA yang tidak dipakai
```bash
rm frontend/DATA.html
rm frontend/DATA.css
rm frontend/DATA.js
```

### 5. Restart server
```bash
npm run dev   # development
# atau
npm start     # production
```

---

## 🔐 Cara Pasang auth-guard.js di Halaman

Tambahkan di `<head>` **SEBELUM** script lain:

```html
<!-- Tentukan halaman butuh auth + role yang boleh akses -->
<meta name="auth-required" content="true">
<meta name="auth-roles"    content="siswa,guru,wali_murid">

<script src="/auth-guard.js"></script>
<!-- script halaman lainnya setelah ini -->
```

### Contoh per halaman:

**DATA.html (portal siswa):**
```html
<meta name="auth-required" content="true">
<meta name="auth-roles"    content="siswa,wali_murid">
```

**admin-panel/dashboard.html:**
```html
<meta name="auth-required" content="true">
<meta name="auth-roles"    content="super_admin,kepala_sekolah,guru,tata_usaha">
```

**LMS.html:**
```html
<meta name="auth-required" content="true">
<meta name="auth-roles"    content="siswa,guru,wali_murid">
```

**cbt.html:**
```html
<meta name="auth-required" content="true">
<meta name="auth-roles"    content="siswa">
```

**Halaman publik (index.html, ppdb.html, kesiswaan.html, dll):**
```html
<!-- Tidak perlu meta auth-required -->
```

---

## 👥 Alur Registrasi Staff Baru (Guru / Tata Usaha)

```
Guru/TU buka login.html
  → Tab "Daftar" → Pilih "Guru" atau "Staff TU"
  → Isi form: nama, email, NIP, bidang studi/jabatan, password
  → Submit → akun dibuat tapi is_active = 0 (pending)
  → Email verifikasi dikirim

Admin buka admin-panel/dashboard.html
  → Menu "Manajemen User"
  → Lihat user dengan status "Nonaktif" (guru/TU pending)
  → Klik tombol ✓ (Aktifkan)
  → POST /api/users/:id/approve dipanggil
  → is_active = 1 → guru/TU bisa login
```

---

## 🎛️ Akses Per Role di Admin Panel

| Menu | super_admin | kepala_sekolah | guru | tata_usaha |
|------|:-----------:|:--------------:|:----:|:----------:|
| Dashboard | ✅ | ✅ | ✅ | ✅ |
| Ruang CBT | ✅ | ✅ | ✅ | ❌ |
| Nilai LMS | ✅ | ✅ | ✅ | ❌ |
| Jadwal | ✅ | ✅ | ✅ | ❌ |
| Kehadiran | ✅ | ✅ | ✅ | ❌ |
| Berita/Pengumuman | ✅ | ✅ | ❌ | ✅ |
| Data PPDB | ✅ | ✅ | ❌ | ✅ |
| Manajemen User | ✅ | ✅ | ❌ | ❌ |
| Audit Log | ✅ | ✅ | ❌ | ❌ |

---

## 🔌 API Endpoint Baru

```
GET  /api/users/pending-staff     → Daftar guru/TU pending approval (admin only)
PATCH /api/users/:id/approve      → Aktifkan akun staff (admin only)
```

---

## 🧪 Test Akun Demo

| Role | Login | Password |
|------|-------|----------|
| Super Admin | admin@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| Kepala Sekolah | kepsek@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| Guru | deni.setiawan@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| Tata Usaha | tu@smkn1terisi.sch.id | Smkn1Terisi@2024 |
| Siswa | NISN: 0012345678 | Smkn1Terisi@2024 |

---

## ✅ Checklist Final

- [ ] DB backup sebelum migrasi
- [ ] `node utils/migrateAddBidang.js` sudah dijalankan
- [ ] `login.html` baru sudah di-deploy
- [ ] `auth-guard.js` sudah ada di folder frontend
- [ ] `dashboard.html` admin panel sudah di-deploy
- [ ] `authController.js` + `userController.js` sudah diganti
- [ ] `routes/users.js` sudah diganti
- [ ] `DATA.html`, `DATA.css`, `DATA.js` sudah dihapus
- [ ] Server restart
- [ ] Test login semua role
- [ ] Test registrasi guru → approval admin
