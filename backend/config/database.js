// Shared better-sqlite3 connection used by routes and services.
'use strict';

require('dotenv').config();
const path = require('path');
const fs   = require('fs');

// better-sqlite3 harus diinstall dulu:
// npm install better-sqlite3
let Database;
try {
    Database = require('better-sqlite3');
} catch(e) {
    console.error('better-sqlite3 tidak ditemukan.');
    console.error('   Jalankan: npm install better-sqlite3');
    process.exit(1);
}

const configuredDbPath = (process.env.DB_PATH || './data/smkn1terisi')
    .replace(/\.bin$/, '')
    .replace(/\.db$/, '') + '.db';
const DB_PATH = path.isAbsolute(configuredDbPath)
    ? configuredDbPath
    : path.resolve(__dirname, '..', configuredDbPath);
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let _db = null;

// ── Inisialisasi (synchronous — better-sqlite3 tidak butuh async) ──
function initDatabase() {
    if (_db) return _db;

    _db = new Database(DB_PATH, {
        // verbose: process.env.NODE_ENV === 'development' ? console.log : null,
    });

    // Optimasi performa & keamanan
    _db.pragma('journal_mode = WAL');        // Write-Ahead Logging — lebih cepat & aman
    _db.pragma('foreign_keys = ON');         // Enforce FK constraints
    _db.pragma('synchronous = NORMAL');      // Balance antara safety & speed
    _db.pragma('cache_size = -32000');       // 32MB cache
    _db.pragma('temp_store = MEMORY');       // Temporary tables di memory

    console.log(`Database terhubung: ${DB_PATH}`);
    return _db;
}

// Access is explicit so modules cannot silently create a second connection.
function getDB() {
    if (!_db) throw new Error('[DB] Belum diinisialisasi. Panggil initDatabase() dahulu.');
    return _db;
}

// Kept for compatibility with older callers; better-sqlite3 writes synchronously.
function saveDB() {
    // No-op: better-sqlite3 menulis ke disk secara synchronous otomatis
    // Fungsi ini dibiarkan ada agar tidak perlu ubah server.js
}

function closeDB() {
    if (_db) {
        _db.close();
        _db = null;
        console.log('Database connection closed.');
    }
}

// Default export remains callable for compatibility with existing modules.
module.exports             = getDB;
module.exports.initDatabase = initDatabase;
module.exports.saveDB       = saveDB;
module.exports.closeDB      = closeDB;
module.exports.getDB        = getDB;
