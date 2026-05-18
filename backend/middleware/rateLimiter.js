// middleware/rateLimiter.js
// Proteksi brute force & spam request

'use strict';

const rateLimit = require('express-rate-limit');

// ── Login rate limiter — 5 kali gagal → blocked 15 menit ─
const loginLimiter = rateLimit({
    windowMs: (parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15) * 60 * 1000,
    max:      parseInt(process.env.LOGIN_MAX_ATTEMPTS) || 5,
    skipSuccessfulRequests: true, // hanya hitung request GAGAL
    standardHeaders: true,
    legacyHeaders:   false,
    message: {
        success: false,
        message: `Terlalu banyak percobaan login. Coba lagi dalam ${process.env.LOGIN_WINDOW_MINUTES || 15} menit.`,
        retryAfter: true
    },
    keyGenerator: (req) => {
        // Rate limit per IP + identifier (email/nisn)
        return `${req.ip}_${req.body?.identifier || 'unknown'}`;
    }
});

// ── Register rate limiter — 3 akun per IP per jam ─────────
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 jam
    max:      3,
    message: {
        success: false,
        message: 'Terlalu banyak pendaftaran dari IP ini. Coba lagi dalam 1 jam.'
    }
});

// ── Password reset limiter — 3 request per 15 menit ───────
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max:      3,
    message: {
        success: false,
        message: 'Terlalu banyak permintaan reset password. Coba lagi dalam 15 menit.'
    }
});

// ── API umum — 100 request per menit ──────────────────────
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max:      100,
    message: {
        success: false,
        message: 'Terlalu banyak request. Coba lagi sebentar lagi.'
    }
});

module.exports = {
    loginLimiter,
    registerLimiter,
    passwordResetLimiter,
    apiLimiter,
};
