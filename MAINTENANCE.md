# Maintenance Guide

Dokumen ini menjadi acuan singkat agar perubahan berikutnya tetap konsisten dan mudah ditinjau.

## Batas Modul

- `frontend/` berisi halaman statis, dashboard LMS, CBT siswa, dan aset kode browser.
- `backend/routes/` menangani kontrak HTTP per domain.
- `backend/controllers/` menangani alur autentikasi dan manajemen user.
- `backend/modules/cbt/` berisi fondasi CBT yang dipisahkan dari route kompatibilitas lama.
- `backend/config/` hanya untuk konfigurasi runtime dan koneksi layanan.
- `backend/utils/` hanya untuk utilitas yang dapat dijalankan ulang dengan aman.

## Data Runtime

Folder berikut bukan source code dan tidak boleh masuk commit:

- `backend/.env`
- `backend/data/` dan `data/`
- `backend/public/uploads/`
- `backend/backups/`
- `backend/logs/`
- `node_modules/`

Backup database dikelola aplikasi dengan retensi lima file terbaru. Jangan menghapus backup atau upload aktif dari source cleanup.

## Aturan Komentar

- Jelaskan alasan, batas keamanan, atau kontrak yang tidak terlihat dari kode.
- Gunakan judul section pendek untuk file besar.
- Hindari komentar seperti `FIX`, `FINAL`, `SUPER`, histori percobaan, atau narasi perubahan.
- Jangan menyimpan kode lama dalam komentar. Git adalah tempat histori perubahan.

## Verifikasi Sebelum Rilis

Jalankan dari root proyek:

```powershell
node --check frontend/LMS.js
node --check frontend/cbt.js
node --check frontend/script.js
Set-Location backend
npm test
```

Setelah server berjalan, cek:

- `/api/health`
- login siswa dan staff
- upload foto profil
- materi LMS dan submission tugas
- pembuatan, token, monitoring, hasil, dan export CBT
- Kantinku pada viewport desktop dan 390px

## Penambahan Fitur

1. Ikuti pola API dan validasi yang sudah ada.
2. Sanitasi input di server, bukan hanya browser.
3. Pertahankan aksesibilitas dan target sentuh minimal 44px.
4. Tambahkan progressive disclosure untuk daftar atau detail panjang.
5. Perbarui `.env.example` dan dokumen ini jika ada konfigurasi atau direktori runtime baru.
