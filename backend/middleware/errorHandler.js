// middleware/errorHandler.js — NEW FILE
// FIX: Centralized error handler, tidak bocorkan stack trace ke client di production
'use strict';

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Global async error wrapper
 * Pakai ini untuk wrap route handler agar tidak perlu try/catch manual
 * Contoh: router.get('/profil', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Global error middleware — pasang di paling bawah app setelah semua route
 * app.use(globalErrorHandler)
 */
function globalErrorHandler(err, req, res, _next) {
    // Log full error di server (selalu)
    console.error(`[ERROR] ${req.method} ${req.originalUrl}`);
    console.error(`  Message: ${err.message}`);
    if (isDev) console.error(err.stack);

    // Tentukan status code
    const status = err.status || err.statusCode || 500;

    // Payload error — stack hanya di development
    const payload = {
        success: false,
        message: isDev ? err.message : getPublicMessage(status),
    };

    if (isDev && err.stack) {
        payload.stack = err.stack.split('\n').slice(0, 5);
    }

    // Handle specific error types
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ success: false, message: 'Ukuran file terlalu besar. Maksimal 10MB.' });
    }
    if (err.name === 'ValidationError') {
        return res.status(422).json({ success: false, message: err.message, errors: err.errors });
    }
    if (err.name === 'UnauthorizedError' || err.message?.includes('jwt')) {
        return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah kadaluarsa.' });
    }

    return res.status(status).json(payload);
}

function getPublicMessage(status) {
    const messages = {
        400: 'Permintaan tidak valid.',
        401: 'Autentikasi diperlukan.',
        403: 'Akses ditolak.',
        404: 'Resource tidak ditemukan.',
        409: 'Data sudah ada (konflik).',
        413: 'Ukuran request terlalu besar.',
        422: 'Data tidak valid.',
        429: 'Terlalu banyak request. Coba lagi nanti.',
        500: 'Terjadi kesalahan pada server.',
        503: 'Server sedang tidak tersedia.',
    };
    return messages[status] || 'Terjadi kesalahan.';
}

/**
 * 404 handler — pasang sebelum globalErrorHandler tapi setelah semua route
 * app.use(notFoundHandler)
 */
function notFoundHandler(req, res) {
    // Jangan log asset requests yang 404 (favicon, dll)
    if (!req.path.match(/\.(ico|png|jpg|css|js|map)$/)) {
        console.warn(`[404] ${req.method} ${req.originalUrl}`);
    }
    res.status(404).json({
        success: false,
        message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`
    });
}

module.exports = { asyncHandler, globalErrorHandler, notFoundHandler };