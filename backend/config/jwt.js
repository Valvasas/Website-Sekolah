// config/jwt.js

'use strict';

const jwt = require('jsonwebtoken');

const SECRET          = process.env.JWT_SECRET || 'fallback_secret_ganti_ini';
const EXPIRES_IN      = process.env.JWT_EXPIRES_IN || '8h';
const REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

function generateAccessToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function generateRefreshToken(payload) {
    return jwt.sign(payload, SECRET, { expiresIn: REFRESH_EXPIRES });
}

function verifyToken(token) {
    try {
        return { valid: true, decoded: jwt.verify(token, SECRET) };
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

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyToken,
    createPayload,
};
