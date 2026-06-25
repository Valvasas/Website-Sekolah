// config/env.js — Centralized env validation
// Panggil di paling awal server.js: require('./config/env');
'use strict';

require('dotenv').config();

const isDev = process.env.NODE_ENV !== 'production';

// ── Schema validasi ────────────────────────────────────────────────
const schema = [
    { key: 'JWT_SECRET',     required: true,  fatal: true,  min: 32,
      hint: 'Generate: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"' },
    { key: 'JWT_REFRESH_SECRET', required: !isDev, fatal: true, min: 32,
      hint: 'Gunakan secret berbeda dari JWT_SECRET untuk refresh token di production.' },
    { key: 'NODE_ENV',       required: false, default: 'development' },
    { key: 'PORT',           required: false, default: '3001', validate: v => !isNaN(parseInt(v)) },
    { key: 'DB_PATH',        required: false, default: './data/smkn1terisi' },
    { key: 'JWT_EXPIRES_IN', required: false, default: '8h' },
    { key: 'JWT_REFRESH_EXPIRES_IN', required: false, default: '7d' },
    { key: 'LOGIN_MAX_ATTEMPTS',     required: false, default: '5', validate: v => !isNaN(parseInt(v)) },
    { key: 'LOGIN_WINDOW_MINUTES',   required: false, default: '15', validate: v => !isNaN(parseInt(v)) },
    { key: 'API_MAX_REQUESTS_PER_MINUTE', required: false, default: '300', validate: v => !isNaN(parseInt(v)) },
    { key: 'RESET_TOKEN_EXPIRY',     required: false, default: '15', validate: v => !isNaN(parseInt(v)) },
    { key: 'REGISTER_MAX_PER_HOUR',  required: false, default: '5', validate: v => !isNaN(parseInt(v)) },
    { key: 'OTP_VERIFY_MAX_PER_15_MIN', required: false, default: '10', validate: v => !isNaN(parseInt(v)) },
    { key: 'OTP_RESEND_MAX_PER_HOUR', required: false, default: '5', validate: v => !isNaN(parseInt(v)) },
    { key: 'GOOGLE_AUTO_PROVISION',  required: false, default: 'false' },
    { key: 'JSON_BODY_LIMIT',        required: false, default: '1mb' },
    { key: 'UPLOAD_MAX_TOTAL_GB',    required: false, default: '5', validate: v => !isNaN(parseFloat(v)) },
    { key: 'UPLOAD_MAX_TUGAS_MB',    required: false, default: '3', validate: v => !isNaN(parseInt(v)) },
    { key: 'UPLOAD_MAX_MATERI_MB',   required: false, default: '5', validate: v => !isNaN(parseInt(v)) },
    { key: 'UPLOAD_MAX_FORUM_MB',    required: false, default: '2', validate: v => !isNaN(parseInt(v)) },
    { key: 'UPLOAD_MAX_CBT_MB',      required: false, default: '3', validate: v => !isNaN(parseInt(v)) },
    { key: 'UPLOAD_MAX_KANTIN_MB',   required: false, default: '1', validate: v => !isNaN(parseInt(v)) },
    { key: 'FEATURE_FORUM_ATTACHMENT', required: false, default: 'true' },
    { key: 'FEATURE_FORUM_VIDEO_ATTACHMENT', required: false, default: 'true' },
    { key: 'FEATURE_FORUM_AUDIO_ATTACHMENT', required: false, default: 'true' },
    { key: 'FEATURE_FORUM_CHAT',     required: false, default: 'true' },
    { key: 'FEATURE_FORUM_VOICE_NOTE', required: false, default: 'false' },
    { key: 'FEATURE_LOCAL_VIDEO_UPLOAD', required: false, default: 'true' },
    { key: 'FEATURE_KANTIN',         required: false, default: 'true' },
    { key: 'FEATURE_CBT_CAMERA_MONITOR', required: false, default: 'true' },
    { key: 'FORUM_IMAGE_MAX_MB',     required: false, default: '1', validate: v => !isNaN(parseInt(v)) },
    { key: 'FORUM_DOCUMENT_MAX_MB',  required: false, default: '3', validate: v => !isNaN(parseInt(v)) },
    { key: 'FORUM_VIDEO_MAX_MB',     required: false, default: '5', validate: v => !isNaN(parseInt(v)) },
    { key: 'FORUM_AUDIO_MAX_MB',     required: false, default: '3', validate: v => !isNaN(parseInt(v)) },
    { key: 'FORUM_MAX_POST_LENGTH',  required: false, default: '2000', validate: v => !isNaN(parseInt(v)) },
    { key: 'FORUM_MAX_COMMENT_LENGTH', required: false, default: '1000', validate: v => !isNaN(parseInt(v)) },
    { key: 'KANTIN_IMAGE_MAX_MB',    required: false, default: '1', validate: v => !isNaN(parseInt(v)) },
    { key: 'KANTIN_MAX_PRODUCTS_PER_USER', required: false, default: '20', validate: v => !isNaN(parseInt(v)) },
    { key: 'KANTIN_MAX_ACTIVE_PRODUCTS_PER_USER', required: false, default: '10', validate: v => !isNaN(parseInt(v)) },
    { key: 'KANTIN_REVIEW_MAX_LENGTH', required: false, default: '500', validate: v => !isNaN(parseInt(v)) },
    { key: 'KANTIN_CHAT_MAX_ATTACHMENT_MB', required: false, default: '2', validate: v => !isNaN(parseInt(v)) },
    // Production-only
    { key: 'ALLOWED_ORIGINS', required: !isDev, fatal: false,
      hint: 'Set ke domain sekolah: https://smkn1terisi.sch.id' },
    // Optional — hanya warning jika tidak ada
    { key: 'EMAIL_USER', required: false, warnIfMissing: true,
      hint: 'Fitur email (lupa password, verifikasi) tidak aktif tanpa ini.' },
    { key: 'EMAIL_PASS', required: false, warnIfMissing: true },
    { key: 'SMS_PROVIDER', required: false },
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
    console.warn('\nEnvironment warnings:');
    warnings.forEach(w => console.warn(' ', w));
    console.warn('');
}

// Fatal errors — crash di production, warning di dev
if (errors.length > 0) {
    console.error('\nFatal environment errors:');
    errors.forEach(e => console.error(' ', e));
    if (!isDev) {
        console.error('\nServer tidak bisa start di production dengan konfigurasi yang tidak valid.\n');
        process.exit(1);
    } else {
        console.warn('\nDevelopment mode berjalan dengan konfigurasi tidak lengkap.\n');
    }
}

const boolFlag = value => ['1','true','yes','on'].includes(String(value || '').toLowerCase());

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
    API_MAX_REQUESTS_PER_MINUTE: parseInt(process.env.API_MAX_REQUESTS_PER_MINUTE) || 300,
    GOOGLE_AUTO_PROVISION: boolFlag(process.env.GOOGLE_AUTO_PROVISION),
    RESET_TOKEN_EXPIRY:   parseInt(process.env.RESET_TOKEN_EXPIRY)   || 15,
    REGISTER_MAX_PER_HOUR: parseInt(process.env.REGISTER_MAX_PER_HOUR) || 5,
    OTP_VERIFY_MAX_PER_15_MIN: parseInt(process.env.OTP_VERIFY_MAX_PER_15_MIN) || 10,
    OTP_RESEND_MAX_PER_HOUR: parseInt(process.env.OTP_RESEND_MAX_PER_HOUR) || 5,
    JSON_BODY_LIMIT:      process.env.JSON_BODY_LIMIT || '1mb',
    UPLOAD_MAX_TOTAL_GB:  parseFloat(process.env.UPLOAD_MAX_TOTAL_GB) || 5,
    UPLOAD_MAX_TUGAS_MB:  parseInt(process.env.UPLOAD_MAX_TUGAS_MB)   || 3,
    UPLOAD_MAX_MATERI_MB: parseInt(process.env.UPLOAD_MAX_MATERI_MB)  || 5,
    UPLOAD_MAX_FORUM_MB:  parseInt(process.env.UPLOAD_MAX_FORUM_MB)   || 2,
    UPLOAD_MAX_CBT_MB:    parseInt(process.env.UPLOAD_MAX_CBT_MB)     || 3,
    UPLOAD_MAX_KANTIN_MB: parseInt(process.env.UPLOAD_MAX_KANTIN_MB)  || 1,
    FEATURE_FORUM_ATTACHMENT: boolFlag(process.env.FEATURE_FORUM_ATTACHMENT),
    FEATURE_FORUM_VIDEO_ATTACHMENT: boolFlag(process.env.FEATURE_FORUM_VIDEO_ATTACHMENT),
    FEATURE_FORUM_AUDIO_ATTACHMENT: boolFlag(process.env.FEATURE_FORUM_AUDIO_ATTACHMENT),
    FEATURE_FORUM_CHAT:   boolFlag(process.env.FEATURE_FORUM_CHAT),
    FEATURE_FORUM_VOICE_NOTE: boolFlag(process.env.FEATURE_FORUM_VOICE_NOTE),
    FEATURE_LOCAL_VIDEO_UPLOAD: boolFlag(process.env.FEATURE_LOCAL_VIDEO_UPLOAD),
    FEATURE_KANTIN:       boolFlag(process.env.FEATURE_KANTIN),
    FEATURE_CBT_CAMERA_MONITOR: boolFlag(process.env.FEATURE_CBT_CAMERA_MONITOR),
    FORUM_IMAGE_MAX_MB:   parseInt(process.env.FORUM_IMAGE_MAX_MB) || 1,
    FORUM_DOCUMENT_MAX_MB: parseInt(process.env.FORUM_DOCUMENT_MAX_MB) || 3,
    FORUM_VIDEO_MAX_MB:   parseInt(process.env.FORUM_VIDEO_MAX_MB) || 5,
    FORUM_AUDIO_MAX_MB:   parseInt(process.env.FORUM_AUDIO_MAX_MB) || 3,
    FORUM_MAX_POST_LENGTH: parseInt(process.env.FORUM_MAX_POST_LENGTH) || 2000,
    FORUM_MAX_COMMENT_LENGTH: parseInt(process.env.FORUM_MAX_COMMENT_LENGTH) || 1000,
    KANTIN_IMAGE_MAX_MB:  parseInt(process.env.KANTIN_IMAGE_MAX_MB) || 1,
    KANTIN_MAX_PRODUCTS_PER_USER: parseInt(process.env.KANTIN_MAX_PRODUCTS_PER_USER) || 20,
    KANTIN_MAX_ACTIVE_PRODUCTS_PER_USER: parseInt(process.env.KANTIN_MAX_ACTIVE_PRODUCTS_PER_USER) || 10,
    KANTIN_REVIEW_MAX_LENGTH: parseInt(process.env.KANTIN_REVIEW_MAX_LENGTH) || 500,
    KANTIN_CHAT_MAX_ATTACHMENT_MB: parseInt(process.env.KANTIN_CHAT_MAX_ATTACHMENT_MB) || 2,
};
