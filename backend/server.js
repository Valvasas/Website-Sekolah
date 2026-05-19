// server.js — Entry point utama SMKN 1 Terisi Backend
'use strict';

require('dotenv').config();

const express   = require('express');
const http      = require('http');
const WebSocket = require('ws');
const cors      = require('cors');
const helmet    = require('helmet');
const path      = require('path');
const morgan    = require('morgan');
const fs        = require('fs');
const { v4: uuidv4 } = require('uuid');

const { initDatabase } = require('./config/database');
const { apiLimiter }   = require('./middleware/rateLimiter');

const app    = express();
const server = http.createServer(app);

/* ── Middleware dasar ────────────────────────────────── */
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || 'http://localhost:3001',
        'http://localhost:3000',
        'http://127.0.0.1:3001',
        'http://127.0.0.1:3000',
    ],
    credentials:    true,
    methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

/* ── Static files ────────────────────────────────────── */
const projectRootPath = path.resolve(__dirname, '..');
const frontendPath    = path.join(projectRootPath, 'frontend');

app.use('/asset', express.static(path.join(projectRootPath, 'asset')));
app.use(express.static(frontendPath, { index: 'index.html', extensions: ['html'] }));
app.use('/admin-panel', express.static(path.join(__dirname, 'admin-panel')));

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir));

/* ── Health check (tanpa auth) ───────────────────────── */
app.get('/api/health', (_req, res) => res.json({
    status: 'OK', timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development', version: '1.0.0'
}));

/* ── Rate limiter API ────────────────────────────────── */
app.use('/api/', apiLimiter);

/* ════════════════════════════════════════════════════════
   WEBSOCKET — CBT Admin Panel (fitur existing tetap jalan)
   ════════════════════════════════════════════════════════ */
function setupWebSocket() {
    const wss     = new WebSocket.Server({ server });
    const clients = new Map();   // nisn → ws
    let   adminWs = null;

    wss.on('connection', (ws) => {
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw); } catch { return; }

            switch (msg.type) {
                case 'admin_auth':
                    adminWs = ws; ws.role = 'admin';
                    send(ws, { type:'admin_auth_ok', message:'Terhubung sebagai admin.' });
                    break;

                case 'student_join':
                    ws.nisn = msg.nisn; ws.role = 'student';
                    clients.set(msg.nisn, ws);
                    fwdAdmin({ ...msg });
                    break;

                case 'device_info': case 'battery_update': case 'network_speed':
                case 'location':    case 'location_update': case 'camera_frame':
                case 'answer_update': case 'violation':
                    fwdAdmin(msg);
                    break;

                case 'student_finish':
                    fwdAdmin(msg);
                    saveCBT(msg);
                    break;

                case 'admin_warn':
                    send(clients.get(msg.targetNisn), { type:'warning', message: msg.message });
                    break;

                case 'admin_kick':
                    send(clients.get(msg.targetNisn), { type:'kicked' });
                    clients.delete(msg.targetNisn);
                    break;

                case 'admin_broadcast':
                    clients.forEach(c => send(c, { type:'broadcast', message: msg.message }));
                    send(adminWs, { type:'broadcast_ack' });
                    break;

                case 'admin_end_all':
                    clients.forEach(c => send(c, { type:'force_finish' }));
                    break;
            }
        });

        ws.on('close', () => {
            if (ws.nisn) {
                clients.delete(ws.nisn);
                fwdAdmin({ type:'student_disconnect', nisn: ws.nisn });
            }
            if (ws.role === 'admin') adminWs = null;
        });

        ws.on('error', (e) => console.error('[WS]', e.message));
    });

    // Heartbeat — bersihkan koneksi zombie setiap 30 detik
    setInterval(() => {
        wss.clients.forEach(ws => {
            if (!ws.isAlive) { ws.terminate(); return; }
            ws.isAlive = false;
            ws.ping();
        });
    }, 30_000);

    function send(ws, payload) {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
    }
    function fwdAdmin(msg) { send(adminWs, msg); }

    function saveCBT(data) {
        try {
            const db = require('./config/database')();
            db.prepare(`
                INSERT INTO cbt_results (id,nisn,mapel,benar,salah,kosong,nilai,selesai_at)
                VALUES (:id,:nisn,:mapel,:benar,:salah,:kosong,:nilai,:now)
            `).run({
                id: uuidv4(), nisn: data.nisn||'', mapel: data.mapel||'',
                benar: data.benar||0, salah: data.salah||0,
                kosong: data.kosong||0, nilai: data.nilai||0,
                now: new Date().toISOString()
            });
        } catch(e) { console.error('[WS-CBT]', e.message); }
    }
}

/* ════════════════════════════════════════════════════════
   ROUTES — dipasang setelah DB init
   ════════════════════════════════════════════════════════ */
function setupRoutes() {
    // Passport (Google OAuth opsional)
    try {
        const passport = require('./config/passport');
        app.use(passport.initialize());
    } catch(e) { console.warn('[Passport] Skip:', e.message); }

    // API Routes
    app.use('/api/auth',    require('./routes/auth'));
    app.use('/api/users',   require('./routes/users'));
    app.use('/api/content', require('./routes/content'));
    app.use('/api/siswa',   require('./routes/siswa'));
    app.use('/api/ppdb',    require('./routes/ppdb'));

    // ── Halaman khusus backend ──────────────────────────
    app.get('/admin-panel',        (_r, res) => res.redirect('/admin-panel/login.html'));
    app.get('/admin-panel/',       (_r, res) => res.redirect('/admin-panel/login.html'));
    app.get('/reset-password',     (_r, res) => res.sendFile(path.join(__dirname, 'admin-panel', 'reset-password.html')));
    app.get('/admin-panel/login',  (_r, res) => res.redirect('/admin-panel/login.html'));

    // ── 404 untuk API ───────────────────────────────────
    app.use('/api/*', (req, res) => {
        res.status(404).json({ success:false, message:`Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.` });
    });

    // ── Frontend fallback ───────────────────────────────
    app.get('*', (req, res) => {
        // Jangan serve direktori
        if (req.path.endsWith('/') && req.path !== '/') {
            return res.redirect(req.path.slice(0, -1));
        }
        const file = path.join(frontendPath, req.path);
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
            return res.sendFile(file);
        }
        res.sendFile(path.join(frontendPath, 'index.html'));
    });

    // ── Global error handler ────────────────────────────
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => {
        console.error('[Server Error]', err.message);
        if (err.type === 'entity.too.large') {
            return res.status(413).json({ success:false, message:'Ukuran file terlalu besar.' });
        }
        res.status(err.status || 500).json({
            success: false,
            message: process.env.NODE_ENV === 'development' ? err.message : 'Terjadi kesalahan server.'
        });
    });
}

/* ════════════════════════════════════════════════════════
   MAIN — async agar bisa await initDatabase
   ════════════════════════════════════════════════════════ */
async function main() {
    const PORT = parseInt(process.env.PORT) || 3001;

    // 1. Init database
    process.stdout.write('⏳ Menginisialisasi database...');
    try {
        await initDatabase();
        process.stdout.write(' ✅\n');
    } catch(err) {
        console.error('\n❌ Gagal init database:', err.message);
        process.exit(1);
    }

    // 2. Setup schema & seed data
    process.stdout.write('⏳ Setup schema database...');
    try {
        await require('./utils/setupDatabase').setup();
        process.stdout.write(' ✅\n');
    } catch(err) {
        console.error('\n❌ Gagal setup schema:', err.message);
        process.exit(1);
    }

    // 3. Setup routes & WebSocket
    setupRoutes();
    setupWebSocket();

    // 4. Test email (opsional, jangan crash jika gagal)
    const emailConfigured = process.env.EMAIL_USER &&
        process.env.EMAIL_USER !== 'emailsekolah@gmail.com' &&
        process.env.EMAIL_PASS  !== 'your_app_password';

    if (emailConfigured) {
        require('./config/mailer').verifyConnection().catch(() => {});
    }

    // 5. Start server
    server.listen(PORT, () => {
        console.log('\n╔══════════════════════════════════════════════════════════╗');
        console.log('║         SMKN 1 TERISI — Backend Server v1.0              ║');
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log(`║  🌐  Website     : http://localhost:${PORT}                    ║`);
        console.log(`║  🔑  Login       : http://localhost:${PORT}/admin-panel/login.html ║`);
        console.log(`║  🖥   Dashboard  : http://localhost:${PORT}/admin-panel/dashboard.html ║`);
        console.log(`║  📝  CBT Admin   : http://localhost:${PORT}/admin.html          ║`);
        console.log(`║  📝  CBT Siswa   : http://localhost:${PORT}/cbt.html            ║`);
        console.log(`║  📄  SKL Portal  : http://localhost:${PORT}/SKL.html            ║`);
        console.log(`║  📊  Data Siswa  : http://localhost:${PORT}/DATA.html           ║`);
        console.log(`║  ❤️   Health     : http://localhost:${PORT}/api/health          ║`);
        console.log('╠══════════════════════════════════════════════════════════╣');
        console.log('║  🔑  Password default: Smkn1Terisi@2024                  ║');
        console.log('║  📧  Email (off) — atur .env untuk aktifkan              ║');
        console.log(`║  🗄️  Database    : ${process.env.DB_PATH || './data/smkn1terisi'}.bin   ║`);
        console.log('╚══════════════════════════════════════════════════════════╝\n');
    });
}

/* ── Graceful shutdown ───────────────────────────────── */
process.on('SIGTERM', () => {
    console.log('\n🛑 Server shutting down...');
    try { require('./config/database').saveDB(); } catch(e) {}
    server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
    console.log('\n🛑 Server dihentikan.');
    try { require('./config/database').saveDB(); } catch(e) {}
    process.exit(0);
});

process.on('uncaughtException',  (e) => console.error('[Uncaught Exception]', e.message));
process.on('unhandledRejection', (e) => console.error('[Unhandled Rejection]', e));

main();

module.exports = { app, server };
