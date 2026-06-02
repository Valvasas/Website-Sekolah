// config/env.js — Centralized env validation
// Panggil di paling awal server.js: require('./config/env');
'use strict';

require('dotenv').config();

const isDev = process.env.NODE_ENV !== 'production';

// ── Schema validasi ────────────────────────────────────────────────
const schema = [
    { key: 'JWT_SECRET',     required: true,  fatal: true,  min: 32,
      hint: 'Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"' },
    { key: 'NODE_ENV',       required: false, default: 'development' },
    { key: 'PORT',           required: false, default: '3001', validate: v => !isNaN(parseInt(v)) },
    { key: 'DB_PATH',        required: false, default: './data/smkn1terisi' },
    { key: 'JWT_EXPIRES_IN', required: false, default: '8h' },
    { key: 'JWT_REFRESH_EXPIRES_IN', required: false, default: '7d' },
    { key: 'LOGIN_MAX_ATTEMPTS',     required: false, default: '5', validate: v => !isNaN(parseInt(v)) },
    { key: 'LOGIN_WINDOW_MINUTES',   required: false, default: '15', validate: v => !isNaN(parseInt(v)) },
    { key: 'RESET_TOKEN_EXPIRY',     required: false, default: '15', validate: v => !isNaN(parseInt(v)) },
    { key: 'JSON_BODY_LIMIT',        required: false, default: '2mb' },
    { key: 'UPLOAD_MAX_TOTAL_GB',    required: false, default: '28', validate: v => !isNaN(parseFloat(v)) },
    { key: 'UPLOAD_MAX_TUGAS_MB',    required: false, default: '25', validate: v => !isNaN(parseInt(v)) },
    { key: 'UPLOAD_MAX_MATERI_MB',   required: false, default: '40', validate: v => !isNaN(parseInt(v)) },
    { key: 'UPLOAD_MAX_FORUM_MB',    required: false, default: '20', validate: v => !isNaN(parseInt(v)) },
    { key: 'UPLOAD_MAX_CBT_MB',      required: false, default: '30', validate: v => !isNaN(parseInt(v)) },
    // Production-only
    { key: 'ALLOWED_ORIGINS', required: !isDev, fatal: false,
      hint: 'Set ke domain sekolah: https://smkn1terisi.sch.id' },
    // Optional — hanya warning jika tidak ada
    { key: 'EMAIL_USER', required: false, warnIfMissing: true,
      hint: 'Fitur email (lupa password, verifikasi) tidak aktif tanpa ini.' },
    { key: 'EMAIL_PASS', required: false, warnIfMissing: true },
];

const errors   = [];
const warnings = [];

for (const rule of schema) {
    const val = process.env[rule.key];

    // Set default jika tidak ada
    if (!val && rule.default !== undefined) {
        process.env[rule.key] = rule.default;
        continue;
    }

    // Required check
    if (!val && rule.required) {
        const msg = `[ENV] MISSING: ${rule.key}${rule.hint ? `\n  → Cara fix: ${rule.hint}` : ''}`;
        if (rule.fatal) errors.push(msg);
        else warnings.push(msg);
        continue;
    }

    // Warning jika opsional tapi tidak diset
    if (!val && rule.warnIfMissing) {
        warnings.push(`[ENV] NOT SET (opsional): ${rule.key}${rule.hint ? ` — ${rule.hint}` : ''}`);
        continue;
    }

    // Minimum length check
    if (val && rule.min && val.length < rule.min) {
        const msg = `[ENV] TOO SHORT: ${rule.key} (minimal ${rule.min} karakter, sekarang ${val.length})`;
        if (rule.fatal) errors.push(msg);
        else warnings.push(msg);
        continue;
    }

    // Custom validator
    if (val && rule.validate && !rule.validate(val)) {
        warnings.push(`[ENV] INVALID VALUE: ${rule.key} = "${val}"`);
    }
}

// Print warnings
if (warnings.length > 0) {
    console.warn('\n⚠️  Environment warnings:');
    warnings.forEach(w => console.warn(' ', w));
    console.warn('');
}

// Fatal errors — crash di production, warning di dev
if (errors.length > 0) {
    console.error('\n❌ Environment errors (FATAL):');
    errors.forEach(e => console.error(' ', e));
    if (!isDev) {
        console.error('\nServer tidak bisa start di production dengan konfigurasi yang tidak valid.\n');
        process.exit(1);
    } else {
        console.warn('\n⚠️  Berjalan di development mode dengan konfigurasi tidak lengkap.\n');
    }
}

module.exports = {
    PORT:          parseInt(process.env.PORT) || 3001,
    NODE_ENV:      process.env.NODE_ENV || 'development',
    IS_DEV:        isDev,
    IS_PROD:       !isDev,
    JWT_SECRET:    process.env.JWT_SECRET,
    DB_PATH:       process.env.DB_PATH || './data/smkn1terisi',
    FRONTEND_URL:  process.env.FRONTEND_URL || 'http://localhost:3001',
    ALLOWED_ORIGINS: (process.env.ALLOWED_ORIGINS || '')
        .split(',').map(o => o.trim()).filter(Boolean),
    ALLOWED_ORIGIN_SUFFIXES: (process.env.ALLOWED_ORIGIN_SUFFIXES || '')
        .split(',').map(o => o.trim().replace(/^\./, '').toLowerCase()).filter(Boolean),
    LOGIN_MAX_ATTEMPTS:   parseInt(process.env.LOGIN_MAX_ATTEMPTS)   || 5,
    LOGIN_WINDOW_MINUTES: parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15,
    RESET_TOKEN_EXPIRY:   parseInt(process.env.RESET_TOKEN_EXPIRY)   || 15,
    JSON_BODY_LIMIT:      process.env.JSON_BODY_LIMIT || '2mb',
    UPLOAD_MAX_TOTAL_GB:  parseFloat(process.env.UPLOAD_MAX_TOTAL_GB) || 28,
    UPLOAD_MAX_TUGAS_MB:  parseInt(process.env.UPLOAD_MAX_TUGAS_MB)   || 25,
    UPLOAD_MAX_MATERI_MB: parseInt(process.env.UPLOAD_MAX_MATERI_MB)  || 40,
    UPLOAD_MAX_FORUM_MB:  parseInt(process.env.UPLOAD_MAX_FORUM_MB)   || 20,
    UPLOAD_MAX_CBT_MB:    parseInt(process.env.UPLOAD_MAX_CBT_MB)     || 30,
};
