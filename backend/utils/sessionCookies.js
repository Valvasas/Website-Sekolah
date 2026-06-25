'use strict';

const ENV = require('../config/env');

const ACCESS_COOKIE = 'smkn_access';
const REFRESH_COOKIE = 'smkn_refresh';

function parseCookies(header = '') {
    return String(header || '')
        .split(';')
        .map(part => part.trim())
        .filter(Boolean)
        .reduce((cookies, part) => {
            const eq = part.indexOf('=');
            if (eq <= 0) return cookies;
            const key = part.slice(0, eq).trim();
            const raw = part.slice(eq + 1);
            try {
                cookies[key] = decodeURIComponent(raw);
            } catch {
                cookies[key] = raw;
            }
            return cookies;
        }, {});
}

function getCookie(req, name) {
    return parseCookies(req.headers?.cookie || '')[name] || '';
}

function durationToMs(value, fallbackMs) {
    const text = String(value || '').trim();
    const match = text.match(/^(\d+)\s*(ms|s|m|h|d)?$/i);
    if (!match) return fallbackMs;
    const amount = Number(match[1]);
    const unit = (match[2] || 'ms').toLowerCase();
    const multipliers = {
        ms: 1,
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
    };
    return amount * (multipliers[unit] || 1);
}

function cookieBaseOptions(req) {
    const isHttps = req.secure || req.headers?.['x-forwarded-proto'] === 'https';
    const secureMode = String(process.env.COOKIE_SECURE || 'auto').trim().toLowerCase();
    const secure = secureMode === 'true' || secureMode === '1'
        ? true
        : secureMode === 'false' || secureMode === '0'
            ? false
            : isHttps;
    return {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
    };
}

function setAuthCookies(req, res, { accessToken, refreshToken, refreshDays = 7 }) {
    if (accessToken) {
        res.cookie(ACCESS_COOKIE, accessToken, {
            ...cookieBaseOptions(req),
            maxAge: durationToMs(process.env.JWT_EXPIRES_IN || '8h', 8 * 60 * 60 * 1000),
        });
    }
    if (refreshToken) {
        res.cookie(REFRESH_COOKIE, refreshToken, {
            ...cookieBaseOptions(req),
            maxAge: Math.max(1, Number(refreshDays) || 7) * 24 * 60 * 60 * 1000,
        });
    }
}

function clearAuthCookies(req, res) {
    const base = cookieBaseOptions(req);
    res.clearCookie(ACCESS_COOKIE, base);
    res.clearCookie(REFRESH_COOKIE, base);
}

module.exports = {
    ACCESS_COOKIE,
    REFRESH_COOKIE,
    parseCookies,
    getCookie,
    setAuthCookies,
    clearAuthCookies,
};
