// utils/migrateAddBidang.js
// ══════════════════════════════════════════════════════════════
//  Jalankan SEKALI setelah deploy:
//    node utils/migrateAddBidang.js
//
//  Menambahkan kolom:
//    - users.bidang         TEXT  (bidang studi/jabatan guru & TU)
//    - users.jabatan_detail TEXT  (detail jabatan untuk metadata)
//  dan memperbarui route users agar bisa read/write kolom baru.
// ══════════════════════════════════════════════════════════════
'use strict';

require('dotenv').config();
const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.resolve(
  (process.env.DB_PATH || './data/smkn1terisi')
    .replace(/\.bin$/, '').replace(/\.db$/, '') + '.db'
);

if (!fs.existsSync(DB_PATH)) {
  console.error('❌ File DB tidak ditemukan:', DB_PATH);
  console.error('   Jalankan node utils/setupDatabase.js terlebih dahulu.');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

console.log('\n🔧 Menjalankan migrasi: Tambah kolom bidang ke tabel users\n');

/* ── Cek kolom yang sudah ada ── */
const cols = db.pragma('table_info(users)').map(c => c.name);

if (!cols.includes('bidang')) {
  db.exec('ALTER TABLE users ADD COLUMN bidang TEXT');
  console.log('  ✅  Kolom users.bidang ditambahkan');
} else {
  console.log('  ℹ️   Kolom users.bidang sudah ada — skip');
}

if (!cols.includes('jabatan_detail')) {
  db.exec('ALTER TABLE users ADD COLUMN jabatan_detail TEXT');
  console.log('  ✅  Kolom users.jabatan_detail ditambahkan');
} else {
  console.log('  ℹ️   Kolom users.jabatan_detail sudah ada — skip');
}

/* ── Seed bidang untuk user demo yang sudah ada ── */
const seedBidang = [
  { email: 'deni.setiawan@smkn1terisi.sch.id', bidang: 'Teknik Komputer & Jaringan (TKJ)' },
  { email: 'ratna.sari@smkn1terisi.sch.id',     bidang: 'Matematika' },
  { email: 'tu@smkn1terisi.sch.id',             bidang: 'Administrasi Umum & Kesekretariatan' },
  { email: 'kepsek@smkn1terisi.sch.id',          bidang: 'Manajemen Sekolah' },
];

const updateStmt = db.prepare(`UPDATE users SET bidang = ? WHERE email = ? AND (bidang IS NULL OR bidang = '')`);
seedBidang.forEach(s => {
  const info = updateStmt.run(s.bidang, s.email);
  if (info.changes > 0) console.log(`  ✅  Set bidang "${s.bidang}" → ${s.email}`);
});

db.close();
console.log('\n✅ Migrasi selesai!\n');
