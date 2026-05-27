// server.js — SMKN 1 Terisi Backend (Final Version)
'use strict';

// ── 1. Validasi ENV dulu sebelum apapun ───────────────────────────
const ENV = require('./config/env');

const express    = require('express');
const http       = require('http');
const WebSocket  = require('ws');
const cors       = require('cors');
const helmet     = require('helmet');
const path       = require('path');
const morgan     = require('morgan');
const fs         = require('fs');
const { v4: uuidv4 } = require('uuid');

const { initDatabase }                   = require('./config/database');
const { apiLimiter }                     = require('./middleware/rateLimiter');
const { verifyToken }                    = require('./config/jwt');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');

const app    = express();
const server = http.createServer(app);

/* ── Logging setup (ke file di production) ────────────────────────── */
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

if (ENV.IS_PROD) {
    const accessLog = fs.createWriteStream(path.join(logsDir, 'access.log'), { flags: 'a' });
    app.use(morgan('combined', { stream: accessLog }));
} else {
    app.use(morgan('dev'));
}

/* ── Security headers ─────────────────────────────────────────────── */
app.use(helmet({
    contentSecurityPolicy:    false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

/* ── CORS (dynamic, dari env) ─────────────────────────────────────── */
const allowedOrigins = [...ENV.ALLOWED_ORIGINS];
if (ENV.IS_DEV) {
    allowedOrigins.push(
        'http://localhost:3000', 'http://localhost:3001',
        'http://127.0.0.1:3000', 'http://127.0.0.1:3001'
    );
}

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // Server-to-server / curl
        if (allowedOrigins.includes(origin)) return cb(null, true);
        console.warn(`[CORS] Blocked: ${origin}`);
        cb(new Error(`Origin tidak diizinkan: ${origin}`));
    },
    credentials:    true,
    methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
}));

/* ── Body parsing ─────────────────────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

/* ── Static files dengan cache headers ───────────────────────────── */
const projectRoot  = path.resolve(__dirname, '..');
const frontendPath = path.join(projectRoot, 'frontend');
const uploadDir    = path.join(__dirname, 'public/uploads');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Assets dengan cache 1 hari di production
const staticOpts = ENV.IS_PROD ? { maxAge: '1d', etag: true } : {};
app.use('/asset',    express.static(path.join(projectRoot, 'asset'), staticOpts));
app.use('/uploads',  express.static(uploadDir, staticOpts));
app.use('/admin-panel', express.static(path.join(__dirname, 'admin-panel')));

app.get(['/login', '/login.html'], (_req, res) => {
    res.sendFile(path.join(frontendPath, 'login.html'));
});

app.use(express.static(frontendPath, { index: 'index.html', extensions: ['html'], ...staticOpts }));

/* ── Health check (tanpa auth, tanpa rate limit) ──────────────────── */
app.get('/api/health', (_req, res) => {
    const db = require('./config/database');
    let dbStatus = 'ok';
    try { db().prepare('SELECT 1').get(); } catch { dbStatus = 'error'; }

    res.json({
        status:    dbStatus === 'ok' ? 'OK' : 'DEGRADED',
        db:        dbStatus,
        uptime:    Math.floor(process.uptime()),
        memory:    `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        timestamp: new Date().toISOString(),
        env:       ENV.NODE_ENV,
        version:   '2.0.0',
    });
});

/* ── Rate limiter untuk semua /api/* ──────────────────────────────── */
app.use('/api/', apiLimiter);

/* ════════════════════════════════════════════════════════════════════
   WEBSOCKET — CBT Admin Panel (dengan JWT auth)
   ════════════════════════════════════════════════════════════════════ */
function setupWebSocket() {
    const wss     = new WebSocket.Server({ server });
    const clients = new Map();
    let   adminWs = null;
    const MAX_WS_PAYLOAD_BYTES = 64 * 1024;
    const WS_MESSAGE_WINDOW_MS = 10_000;
    const WS_MESSAGE_LIMIT = 40;

    function isWsRateLimited(ws) {
        const now = Date.now();
        if (!ws.rateWindowStart || now - ws.rateWindowStart > WS_MESSAGE_WINDOW_MS) {
            ws.rateWindowStart = now;
            ws.rateCount = 0;
        }
        ws.rateCount += 1;
        return ws.rateCount > WS_MESSAGE_LIMIT;
    }

    function isPlainObject(value) {
        return value && typeof value === 'object' && !Array.isArray(value);
    }

    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.isAuth  = false;
        ws.role    = null;

        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (raw) => {
            const size = Buffer.isBuffer(raw) ? raw.length : Buffer.byteLength(String(raw));
            if (size > MAX_WS_PAYLOAD_BYTES) {
                send(ws, { type: 'error', message: 'Payload terlalu besar.' });
                ws.close(1009, 'Payload too large');
                return;
            }
            if (isWsRateLimited(ws)) {
                send(ws, { type: 'error', message: 'Terlalu banyak pesan.' });
                ws.close(1008, 'Rate limited');
                return;
            }

            let msg;
            try { msg = JSON.parse(raw); } catch { return; }
            if (!isPlainObject(msg) || typeof msg.type !== 'string' || msg.type.length > 40) return;

            // Auth gate
            if (!ws.isAuth && !['admin_auth','student_join'].includes(msg.type)) {
                send(ws, { type: 'error', message: 'Belum terautentikasi.' });
                return;
            }

            switch (msg.type) {
                case 'admin_auth': {
                    const { valid, decoded } = verifyToken(msg.token || '');
                    if (!valid || !['super_admin','kepala_sekolah','guru'].includes(decoded?.role)) {
                        send(ws, { type: 'error', message: 'Token admin tidak valid.' });
                        ws.close(1008, 'Unauthorized');
                        return;
                    }
                    if (adminWs && adminWs !== ws && adminWs.readyState === WebSocket.OPEN) {
                        adminWs.close(1000, 'Replaced');
                    }
                    adminWs = ws; ws.role = 'admin'; ws.isAuth = true;
                    send(ws, { type: 'admin_auth_ok', message: `Terhubung sebagai ${decoded.nama}.` });
                    break;
                }

                case 'student_join': {
                    const { nisn, token: cbtToken, mapel } = msg;
                    if (!nisn || !cbtToken) {
                        send(ws, { type: 'error', message: 'NISN dan token wajib.' });
                        ws.close(1008, 'Missing credentials');
                        return;
                    }
                    try {
                        const db      = require('./config/database')();
                        const session = db.prepare(
                            `SELECT * FROM cbt_sessions WHERE token = ? AND nisn = ? AND used = 0 AND expires_at > datetime('now')`
                        ).get(cbtToken, nisn);

                        if (!session) {
                            send(ws, { type: 'error', message: 'Token ujian tidak valid atau sudah kadaluarsa.' });
                            ws.close(1008, 'Invalid CBT token');
                            return;
                        }

                        db.prepare(`
                            UPDATE cbt_sessions
                            SET start_time = COALESCE(start_time, datetime('now')),
                                last_seen_at = datetime('now'),
                                location_lat = COALESCE(?, location_lat),
                                location_lng = COALESCE(?, location_lng),
                                device_info = COALESCE(?, device_info),
                                browser_info = COALESCE(?, browser_info)
                            WHERE token = ?
                        `).run(
                            cleanCoord(msg.lat),
                            cleanCoord(msg.lng),
                            msg.device ? JSON.stringify({ device: cleanText(msg.device, 80) }) : null,
                            msg.browser ? JSON.stringify({ browser: cleanText(msg.browser, 120) }) : null,
                            cbtToken
                        );
                        ws.nisn = nisn; ws.mapel = session.mapel;
                        ws.role = 'student'; ws.isAuth = true;
                        clients.set(nisn, ws);
                        fwdAdmin({ ...msg, mapel: session.mapel });
                    } catch(e) {
                        console.error('[WS student_join]', e.message);
                        send(ws, { type: 'error', message: 'Gagal validasi session.' });
                    }
                    break;
                }

                case 'device_info': case 'browser_info': case 'battery_update': case 'network_speed':
                case 'location': case 'location_update': case 'camera_frame':
                case 'screen_frame': case 'screen_status':
                case 'answer_update': case 'violation':
                    saveProctorEvent(msg, ws);
                    fwdAdmin(msg);
                    break;

                case 'student_finish':
                    fwdAdmin(msg);
                    saveCBT(msg, ws.nisn);
                    try {
                        require('./config/database')()
                            .prepare(`UPDATE cbt_sessions SET used = 1, end_time = datetime('now') WHERE nisn = ? AND mapel = ?`)
                            .run(ws.nisn, ws.mapel);
                    } catch {}
                    break;

                case 'admin_warn':
                    if (ws.role !== 'admin') return;
                    send(clients.get(msg.targetNisn), { type: 'warning', message: msg.message });
                    break;
                case 'admin_kick':
                    if (ws.role !== 'admin') return;
                    send(clients.get(msg.targetNisn), { type: 'kicked' });
                    clients.get(msg.targetNisn)?.close();
                    clients.delete(msg.targetNisn);
                    break;
                case 'admin_broadcast':
                    if (ws.role !== 'admin') return;
                    clients.forEach(c => send(c, { type: 'broadcast', message: msg.message }));
                    send(adminWs, { type: 'broadcast_ack' });
                    break;
                case 'admin_end_all':
                    if (ws.role !== 'admin') return;
                    clients.forEach(c => send(c, { type: 'force_finish' }));
                    break;
            }
        });

        ws.on('close', () => {
            if (ws.nisn) {
                clients.delete(ws.nisn);
                fwdAdmin({ type: 'student_disconnect', nisn: ws.nisn });
            }
            if (ws.role === 'admin') adminWs = null;
        });

        ws.on('error', e => console.error('[WS]', e.message));
    });

    setInterval(() => {
        wss.clients.forEach(ws => {
            if (!ws.isAlive) { ws.terminate(); return; }
            ws.isAlive = false; ws.ping();
        });
    }, 30_000);

    function send(ws, payload) {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    }
    function fwdAdmin(msg) { send(adminWs, msg); }

    function cleanText(value, max = 200) {
        if (value === undefined || value === null) return null;
        return String(value).replace(/[<>]/g, '').slice(0, max);
    }

    function cleanCoord(value) {
        if (value === undefined || value === null || value === '') return null;
        const num = Number(value);
        return Number.isFinite(num) ? num.toFixed(6) : null;
    }

    function limitedDataUrl(value) {
        if (typeof value !== 'string') return null;
        if (!value.startsWith('data:image/jpeg;base64,')) return null;
        return value.length <= 60_000 ? value : null;
    }

    function saveProctorEvent(msg, ws) {
        if (!ws?.nisn) return;
        try {
            const db = require('./config/database')();
            const base = { nisn: ws.nisn, mapel: ws.mapel, now: new Date().toISOString() };
            switch (msg.type) {
                case 'device_info':
                    db.prepare(`
                        UPDATE cbt_sessions
                        SET device_info = @info, browser_info = @browser, camera_status = @camera,
                            screen_status = @screen, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({
                        ...base,
                        info: JSON.stringify(msg.info || {}),
                        browser: JSON.stringify({ browser: msg.info?.browser || null, lang: msg.info?.lang || null }),
                        camera: msg.info?.camera ? 'supported' : 'unsupported',
                        screen: msg.info?.screenCapture ? 'supported' : 'unknown'
                    });
                    break;
                case 'browser_info':
                    db.prepare(`
                        UPDATE cbt_sessions SET browser_info = @info, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({ ...base, info: JSON.stringify(msg.info || {}) });
                    break;
                case 'network_speed':
                    db.prepare(`
                        UPDATE cbt_sessions SET network_mbps = @mbps, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({ ...base, mbps: Number(msg.mbps) || null });
                    break;
                case 'location':
                case 'location_update':
                    db.prepare(`
                        UPDATE cbt_sessions SET location_lat = @lat, location_lng = @lng, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({ ...base, lat: cleanCoord(msg.lat), lng: cleanCoord(msg.lng) });
                    break;
                case 'camera_frame':
                    db.prepare(`
                        UPDATE cbt_sessions SET camera_status = 'active', last_camera_frame = @frame, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({ ...base, frame: limitedDataUrl(msg.frame) });
                    break;
                case 'screen_frame':
                    db.prepare(`
                        UPDATE cbt_sessions SET screen_status = 'active', last_screen_frame = @frame, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({ ...base, frame: limitedDataUrl(msg.frame) });
                    break;
                case 'screen_status':
                    db.prepare(`
                        UPDATE cbt_sessions SET screen_status = @status, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({ ...base, status: cleanText(msg.status, 40) || 'unknown' });
                    break;
                case 'answer_update':
                    db.prepare(`
                        UPDATE cbt_sessions
                        SET progress_answered = @answered, progress_total = @total,
                            current_question = @current, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run({
                        ...base,
                        answered: Math.max(0, parseInt(msg.answered) || 0),
                        total: Math.max(0, parseInt(msg.total) || 0),
                        current: Math.max(0, parseInt(msg.current) || 0)
                    });
                    break;
                case 'violation':
                    db.prepare(`
                        UPDATE cbt_sessions
                        SET violation_count = violation_count + 1, last_seen_at = @now
                        WHERE nisn = @nisn AND mapel = @mapel AND used = 0
                    `).run(base);
                    break;
            }
        } catch(e) {
            console.error('[WS proctor save]', e.message);
        }
    }

    function saveCBT(data, fallbackNisn) {
        if (data.serverVerified) return;
        try {
            require('./config/database')().prepare(
                `INSERT INTO cbt_results (id,nisn,mapel,benar,salah,kosong,nilai,selesai_at) VALUES (?,?,?,?,?,?,?,datetime('now'))`
            ).run(uuidv4(), data.nisn || fallbackNisn || '', data.mapel || '', data.benar || 0, data.salah || 0, data.kosong || 0, data.nilai || 0);
        } catch(e) { console.error('[WS saveCBT]', e.message); }
    }
}

/* ════════════════════════════════════════════════════════════════════
   ROUTES
   ════════════════════════════════════════════════════════════════════ */
function setupRoutes() {
    // Google OAuth (opsional)
    try {
        const passport = require('./config/passport');
        app.use(passport.initialize());
    } catch(e) { console.warn('[Passport] Skip:', e.message); }

    // ── Core routes ─────────────────────────────────────────────────
    app.use('/api/auth',    require('./routes/auth'));
    app.use('/api/users',   require('./routes/users'));
    app.use('/api/content', require('./routes/content'));
    app.use('/api/siswa',   require('./routes/siswa'));
    app.use('/api/ppdb',    require('./routes/ppdb'));
    app.use('/api/cbt',     require('./routes/cbt'));
    app.use('/api/lms',     require('./routes/lms'));      // NEW
    app.use('/api/upload',  require('./routes/upload'));   // NEW

    // ── Admin panel pages ────────────────────────────────────────────
    app.get('/admin-panel',       (_r, res) => res.redirect('/admin-panel/login.html'));
    app.get('/admin-panel/',      (_r, res) => res.redirect('/admin-panel/login.html'));
    app.get('/reset-password',    (_r, res) => res.sendFile(path.join(__dirname, 'admin-panel', 'reset-password.html')));

    // ── API 404 harus diproses sebelum frontend fallback ─────────────
    app.use('/api/*', notFoundHandler);

    // ── Frontend SPA fallback ────────────────────────────────────────
    app.get('*', (req, res) => {
        if (req.path.endsWith('/') && req.path !== '/') {
            return res.redirect(req.path.slice(0, -1));
        }
        const file = path.join(frontendPath, req.path);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            return res.sendFile(file);
        }
        res.sendFile(path.join(frontendPath, 'index.html'));
    });

    // ── Error handlers (urutan penting!) ────────────────────────────
    app.use(globalErrorHandler);
}

/* ════════════════════════════════════════════════════════════════════
   MAIN
   ════════════════════════════════════════════════════════════════════ */
function main() {
    process.stdout.write('⏳ Setup schema & seed data...');
    try {
        require('./utils/setupDatabase').setup();
        process.stdout.write(' ✅\n');
    } catch(err) {
        console.error('\n❌ Gagal setup schema:', err.message);
        process.exit(1);
    }

    // better-sqlite3 synchronous — tidak perlu async
    process.stdout.write('⏳ Menginisialisasi database...');
    try {
        initDatabase();
        process.stdout.write(' ✅\n');
    } catch(err) {
        console.error('\n❌ Gagal init database:', err.message);
        process.exit(1);
    }

    setupRoutes();
    setupWebSocket();

    // Email (opsional)
    const emailConfigured = process.env.EMAIL_USER &&
        process.env.EMAIL_USER !== 'emailsekolah@gmail.com' &&
        process.env.EMAIL_PASS  !== 'app_password_gmail_disini';
    if (emailConfigured) {
        require('./config/mailer').verifyConnection().catch(() => {});
    }

    server.listen(ENV.PORT, () => {
        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║       SMKN 1 TERISI — Backend Server v2.0                ║');
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║  🌐  Website    : http://localhost:${ENV.PORT}                    ║`);
        console.log(`║  🔑  Admin      : http://localhost:${ENV.PORT}/admin-panel/login.html ║`);
        console.log(`║  📝  CBT Siswa  : http://localhost:${ENV.PORT}/cbt.html            ║`);
        console.log(`║  📚  LMS        : http://localhost:${ENV.PORT}/LMS.html            ║`);
        console.log(`║  ❤️   Health    : http://localhost:${ENV.PORT}/api/health          ║`);
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║  🗄️  DB         : ${ENV.DB_PATH}.db                       ║`);
        console.log(`║  🌍  Mode       : ${ENV.NODE_ENV.padEnd(10)}                          ║`);
        console.log('╚══════════════════════════════════════════════════════════╝\n');
    });
}

/* ── Graceful shutdown ────────────────────────────────────────────── */
function gracefulShutdown(signal) {
    console.log(`\n🛑 ${signal} received — shutting down gracefully...`);
    server.close(() => {
        try { require('./config/database').closeDB(); } catch {}
        console.log('✅ Server closed.');
        process.exit(0);
    });
    // Force exit setelah 10 detik
    setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('uncaughtException',  e => { console.error('[Uncaught]', e.message); if (ENV.IS_PROD) process.exit(1); });
process.on('unhandledRejection', e => { console.error('[Unhandled]', e); });

main();
module.exports = { app, server };
