// middleware/auth.js
'use strict';

const { verifyToken } = require('../config/jwt');
const { getCookie, ACCESS_COOKIE } = require('../utils/sessionCookies');

function getRequestToken(req) {
    const authHeader = req.headers['authorization'];
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    return bearer || getCookie(req, ACCESS_COOKIE) || '';
}

function authenticate(req, res, next) {
    const token = getRequestToken(req);

    if (!token) {
        return res.status(401).json({ success:false, message:'Akses ditolak. Token tidak ditemukan.' });
    }

    const { valid, decoded, error } = verifyToken(token);
    if (!valid) {
        return res.status(401).json({
            success: false,
            message: error === 'jwt expired' ? 'Sesi telah berakhir. Silakan login kembali.' : 'Token tidak valid.'
        });
    }

    // Cek user masih aktif
    try {
        const getDB = require('../config/database');
        const db    = getDB();
        const user  = db.prepare('SELECT id, role, is_active FROM users WHERE id=:id').get({ id:decoded.sub });
        if (!user || !user.is_active) {
            return res.status(401).json({ success:false, message:'Akun tidak ditemukan atau tidak aktif.' });
        }
    } catch(e) {
        // DB belum init atau error — tetap izinkan jika token valid
        console.warn('[Auth] DB check skip:', e.message);
    }

    req.user = decoded;
    next();
}

function optionalAuth(req, res, next) {
    const token = getRequestToken(req);
    if (token) {
        const { valid, decoded } = verifyToken(token);
        if (valid) req.user = decoded;
    }
    next();
}

function authorize(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success:false, message:'Autentikasi diperlukan.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success:  false,
                message:  `Akses ditolak. Diperlukan role: ${roles.join(' atau ')}.`,
                yourRole: req.user.role
            });
        }
        next();
    };
}

function isSelfOrAdmin(req, res, next) {
    const targetId = req.params.id || req.params.userId;
    if (req.user?.sub === targetId || req.user?.role === 'super_admin') return next();
    return res.status(403).json({ success:false, message:'Anda hanya bisa mengakses data milik sendiri.' });
}

const isAdmin  = authorize('super_admin');
const isContentAdmin = authorize('super_admin','content_admin');
const isStaff  = authorize('super_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha');
const isGuru   = authorize('super_admin','kepala_sekolah','wakil_kepala_sekolah','guru');
const isSiswa  = authorize('siswa');
const isKepsek = authorize('super_admin','kepala_sekolah','wakil_kepala_sekolah');
const isTU     = authorize('super_admin','tata_usaha');

module.exports = {
    authenticate, optionalAuth, authorize,
    isAdmin, isContentAdmin, isStaff, isGuru, isSiswa, isKepsek, isTU,
    isSelfOrAdmin, getRequestToken
};
