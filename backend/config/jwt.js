// config/jwt.js
'use strict';

const jwt = require('jsonwebtoken');

// SECURITY FIX: Jangan izinkan fallback secret di production
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
    if (process.env.NODE_ENV === 'production') {
        console.error('FATAL: JWT_SECRET tidak di-set. Server tidak bisa start di production.');
        process.exit(1);
    } else {
        console.warn('WARNING: JWT_SECRET tidak di-set, menggunakan fallback development key. JANGAN di production!');
    }
}
const EFFECTIVE_SECRET = SECRET || 'dev_only_fallback_key_NOT_FOR_PRODUCTION_32chars!!';

const EXPIRES_IN      = process.env.JWT_EXPIRES_IN || '8h';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function generateAccessToken(payload) {
    return jwt.sign(payload, EFFECTIVE_SECRET, { expiresIn: EXPIRES_IN });
}

function generateRefreshToken(payload) {
    return jwt.sign(payload, EFFECTIVE_SECRET, { expiresIn: REFRESH_EXPIRES });
}

function verifyToken(token) {
    try {
        return { valid: true, decoded: jwt.verify(token, EFFECTIVE_SECRET) };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

function createPayload(user) {
    return {
        sub:   user.id,
        email: user.email,
        role:  user.role,
        nama:  user.nama_lengkap,
        nisn:  user.nisn || null,
        nip:   user.nip  || null,
    };
}

module.exports = { generateAccessToken, generateRefreshToken, verifyToken, createPayload };
