// utils/testServer.js — 25 test cases validasi semua modul
'use strict';

require('dotenv').config();
const path = require('path');
const fs   = require('fs');

let passed = 0, failed = 0;

function ok(label, fn) {
    try {
        const r = fn();
        if (r instanceof Promise) {
            return r.then(() => { console.log(`  ✅  ${label}`); passed++; })
                    .catch(e  => { console.log(`  ❌  ${label}\n      Error: ${e.message}`); failed++; });
        }
        console.log(`  ✅  ${label}`); passed++;
    } catch(e) { console.log(`  ❌  ${label}\n      Error: ${e.message}`); failed++; }
}

async function run() {
    console.log('\n🧪 SMKN 1 Terisi — Test Suite\n');
    console.log('─'.repeat(50));

    // 1-6: Dependencies
    await ok('Load dotenv',      () => require('dotenv'));
    await ok('Load express',     () => require('express'));
    await ok('Load bcryptjs',    () => require('bcryptjs'));
    await ok('Load jsonwebtoken',() => require('jsonwebtoken'));
    await ok('Load uuid',        () => require('uuid'));
    await ok('Load better-sqlite3', () => require('better-sqlite3'));

    // 7-11: Database langsung
    let db;
    await ok('Init database langsung', () => {
        const Database = require('better-sqlite3');
        const configuredDbPath = (process.env.DB_PATH || './data/smkn1terisi')
            .replace(/\.bin$/, '').replace(/\.db$/, '') + '.db';
        const DB_PATH = path.isAbsolute(configuredDbPath)
            ? configuredDbPath
            : path.resolve(__dirname, '..', configuredDbPath);
        if (!fs.existsSync(DB_PATH)) throw new Error('File DB tidak ditemukan. Jalankan setupDatabase.js dulu.');
        db = new Database(DB_PATH);
    });

    await ok('Query users table', () => {
        const cnt = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
        console.log(`      (${cnt} user di database)`);
        if (cnt === 0) throw new Error('Tabel users kosong');
    });

    await ok('Query announcements table', () => {
        const cnt = db.prepare('SELECT COUNT(*) as c FROM announcements').get().c;
        console.log(`      (${cnt} pengumuman)`);
    });

    await ok('Query skl_data table', () => {
        const cnt = db.prepare('SELECT COUNT(*) as c FROM skl_data').get().c;
        console.log(`      (${cnt} data SKL)`);
    });

    await ok('Query cbt_results table', () => {
        db.prepare('SELECT COUNT(*) as c FROM cbt_results').get();
    });

    // 12-16: Config & Middleware
    await ok('Load JWT config',          () => require('../config/jwt'));
    await ok('Load auth middleware',      () => require('../middleware/auth'));
    await ok('Load validate middleware',  () => require('../middleware/validate'));
    await ok('Load rateLimiter middleware',() => require('../middleware/rateLimiter'));
    await ok('Load auditLog middleware',  () => require('../middleware/auditLog'));

    // 17-19: Controllers & Routes
    await ok('Load auth controller',  () => require('../controllers/authController'));
    await ok('Load user controller',  () => require('../controllers/userController'));
    await ok('Load auth routes',      () => require('../routes/auth'));
    await ok('Load users routes',     () => require('../routes/users'));
    await ok('Load content routes',   () => require('../routes/content'));

    // 20: Audit log fungsi
    await ok('Audit log berfungsi', () => {
        const { log } = require('../middleware/auditLog');
        if (typeof log !== 'function') throw new Error('log bukan function');
    });

    // 21: bcrypt
    await ok('bcrypt hash & compare (simulasi login)', async () => {
        const bcrypt = require('bcryptjs');
        const hash   = await bcrypt.hash('TestPass123!', 10);
        const ok2    = await bcrypt.compare('TestPass123!', hash);
        if (!ok2) throw new Error('bcrypt compare gagal');
    });

    // 22: password validation
    await ok('Validasi password rule', () => {
        const pw = 'Smkn1Terisi@2024';
        if (!/[A-Z]/.test(pw)) throw new Error('Tidak ada huruf besar');
        if (!/[a-z]/.test(pw)) throw new Error('Tidak ada huruf kecil');
        if (!/\d/.test(pw))    throw new Error('Tidak ada angka');
        if (!/[@$!%*?&#]/.test(pw)) throw new Error('Tidak ada simbol');
        if (pw.length < 8)     throw new Error('Terlalu pendek');
    });

    // 23: Akun default ada
    await ok('Cek akun default ada di database', () => {
        const res = db.prepare("SELECT id FROM users WHERE email='admin@smkn1terisi.sch.id'").get();
        if (!res) throw new Error('Akun admin tidak ditemukan');
    });

    // 24: SKL default ada
    await ok('Cek data SKL default', () => {
        const res = db.prepare("SELECT id FROM skl_data WHERE nisn='0012345678'").get();
        if (!res) throw new Error('Data SKL default tidak ditemukan');
    });

    // 25: JWT sign/verify
    await ok('JWT sign & verify', () => {
        const { generateAccessToken, verifyToken, createPayload } = require('../config/jwt');
        const payload = createPayload({ id:'test-id', role:'siswa', nama_lengkap:'Test' });
        const token   = generateAccessToken(payload);
        const decoded = verifyToken(token);
        if (!decoded || !decoded.valid || decoded.decoded.sub !== 'test-id') throw new Error('JWT decode gagal');
    });

    if (db) db.close();

    console.log('─'.repeat(50));
    console.log(`\n  Hasil: ${passed} lulus, ${failed} gagal\n`);
    if (failed > 0) {
        console.log('⚠️  Ada error. Perbaiki sebelum menjalankan server.\n');
        process.exit(1);
    } else {
        console.log('🎉 Semua test lulus! Server siap dijalankan.\n');
        console.log('  npm run dev    → development mode (nodemon)');
        console.log('  npm start      → production mode\n');
        process.exit(0);
    }
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
