'use strict';

const crypto = require('crypto');
const ENV = require('../config/env');
const { getCookie } = require('../utils/sessionCookies');

const CSRF_COOKIE = 'smkn_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function isHttpsRequest(req) {
    return req.secure || req.headers?.['x-forwarded-proto'] === 'https';
}

function cookieOptions(req) {
    const secureMode = String(process.env.COOKIE_SECURE || 'auto').trim().toLowerCase();
    const secure = secureMode === 'true' || secureMode === '1'
        ? true
        : secureMode === 'false' || secureMode === '0'
            ? false
            : isHttpsRequest(req);
    return {
        httpOnly: false,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 24 * 60 * 60 * 1000,
    };
}

function createToken() {
    return crypto.randomBytes(32).toString('hex');
}

function safeCompare(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    if (left.length === 0 || left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function ensureToken(req, res) {
    let token = getCookie(req, CSRF_COOKIE);
    if (!token || token.length < 32) {
        token = createToken();
        res.cookie(CSRF_COOKIE, token, cookieOptions(req));
    }
    return token;
}

function csrfTokenEndpoint(req, res) {
    const token = ensureToken(req, res);
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, csrfToken: token });
}

function csrfProtection(req, res, next) {
    if (SAFE_METHODS.has(req.method)) {
        ensureToken(req, res);
        return next();
    }

    const cookieToken = getCookie(req, CSRF_COOKIE);
    const headerToken = req.get(CSRF_HEADER) || req.body?._csrf || '';

    if (!safeCompare(cookieToken, headerToken)) {
        return res.status(403).json({
            success: false,
            message: 'CSRF token tidak valid. Muat ulang halaman lalu coba lagi.',
        });
    }

    return next();
}

module.exports = {
    CSRF_COOKIE,
    CSRF_HEADER,
    csrfProtection,
    csrfTokenEndpoint,
};
