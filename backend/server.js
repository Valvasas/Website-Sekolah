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
const crypto     = require('crypto');
const { v4: uuidv4 } = require('uuid');

const { initDatabase }                   = require('./config/database');
const { apiLimiter }                     = require('./middleware/rateLimiter');
const { verifyToken }                    = require('./config/jwt');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorHandler');
const permissions                        = require('./utils/permissions');

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
const allowedOriginSuffixes = [...ENV.ALLOWED_ORIGIN_SUFFIXES];
if (ENV.IS_DEV) {
    allowedOrigins.push(
        'http://localhost:3000', 'http://localhost:3001',
        'http://127.0.0.1:3000', 'http://127.0.0.1:3001'
    );
}

function isPrivateLanHost(hostname) {
    return /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})$/.test(hostname);
}

function isAllowedOrigin(origin) {
    if (allowedOrigins.includes(origin)) return true;

    let parsed;
    try { parsed = new URL(origin); } catch { return false; }

    const hostname = parsed.hostname.toLowerCase();
    if (ENV.IS_DEV && parsed.protocol === 'http:' && isPrivateLanHost(hostname)) return true;

    return allowedOriginSuffixes.some(suffix =>
        hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
}

app.use(cors({
    origin: (origin, cb) => {
        if (!origin) return cb(null, true); // Server-to-server / curl
        if (isAllowedOrigin(origin)) return cb(null, true);
        console.warn(`[CORS] Blocked: ${origin}`);
        cb(new Error(`Origin tidak diizinkan: ${origin}`));
    },
    credentials:    true,
    methods:        ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
}));

/* ── Body parsing ─────────────────────────────────────────────────── */
app.use(express.json({ limit: ENV.JSON_BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: ENV.JSON_BODY_LIMIT }));

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

app.get('/api/resource-status', (_req, res) => {
    const authHeader = _req.headers['authorization'];
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { valid, decoded } = verifyToken(rawToken);
    const allowed = ['super_admin','content_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha'];
    if (!valid || !allowed.includes(decoded?.role)) {
        return res.status(401).json({ success:false, message:'Autentikasi admin/staff diperlukan.' });
    }
    const uploadRoot = path.join(__dirname, 'public/uploads');
    const maxBytes = Math.round(ENV.UPLOAD_MAX_TOTAL_GB * 1024 * 1024 * 1024);
    function dirSize(dir) {
        if (!fs.existsSync(dir)) return 0;
        return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
            const full = path.join(dir, entry.name);
            return sum + (entry.isDirectory() ? dirSize(full) : fs.statSync(full).size);
        }, 0);
    }
    const usedBytes = dirSize(uploadRoot);
    res.json({
        success: true,
        data: {
            profile: '2vCPU / 4GB RAM / 40GB SSD ready',
            uploadUsedBytes: usedBytes,
            uploadMaxBytes: maxBytes,
            uploadUsedPct: maxBytes ? Math.round((usedBytes / maxBytes) * 100) : 0,
            bodyLimit: ENV.JSON_BODY_LIMIT,
            fileLimitsMb: {
                tugas: ENV.UPLOAD_MAX_TUGAS_MB,
                materi: ENV.UPLOAD_MAX_MATERI_MB,
                forum: ENV.UPLOAD_MAX_FORUM_MB,
                cbt: ENV.UPLOAD_MAX_CBT_MB,
            },
            features: publicFeatureFlags(),
            uptime: Math.floor(process.uptime()),
            heapMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        }
    });
});

function publicFeatureFlags() {
    return {
        forumAttachment: ENV.FEATURE_FORUM_ATTACHMENT,
        forumVideoAttachment: ENV.FEATURE_FORUM_VIDEO_ATTACHMENT,
        forumAudioAttachment: ENV.FEATURE_FORUM_AUDIO_ATTACHMENT,
        forumChat: ENV.FEATURE_FORUM_CHAT,
        forumVoiceNote: ENV.FEATURE_FORUM_VOICE_NOTE,
        localVideoUpload: ENV.FEATURE_LOCAL_VIDEO_UPLOAD,
        kantin: ENV.FEATURE_KANTIN,
        cbtCameraMonitor: ENV.FEATURE_CBT_CAMERA_MONITOR,
    };
}

function requireApiRole(req, res, roles) {
    const authHeader = req.headers['authorization'];
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { valid, decoded } = verifyToken(rawToken);
    if (!valid || !roles.includes(decoded?.role)) {
        res.status(401).json({ success:false, message:'Akses tidak diizinkan untuk role akun ini.' });
        return null;
    }
    return decoded;
}

function requireApiPermission(req, res, permission) {
    const authHeader = req.headers['authorization'];
    const rawToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const { valid, decoded } = verifyToken(rawToken);
    if (!valid || !permissions.hasPermission(decoded, permission)) {
        res.status(401).json({ success:false, message:'Akses tidak diizinkan untuk permission akun ini.' });
        return null;
    }
    return decoded;
}

function formatStorageFile(row) {
    return {
        id: row.id,
        original_name: row.original_name,
        file_url: row.file_url,
        mime_type: row.mime_type,
        size_bytes: Number(row.size_bytes || 0),
        size_mb: Number((Number(row.size_bytes || 0) / 1024 / 1024).toFixed(2)),
        category: row.category,
        entity_type: row.entity_type,
        created_at: row.created_at,
        uploader_name: row.uploader_name || '-',
    };
}

function resolveUploadPathFromRow(row) {
    const uploadRoot = path.join(__dirname, 'public/uploads');
    const candidate = row.file_path
        ? path.resolve(row.file_path)
        : path.resolve(__dirname, 'public', String(row.file_url || '').replace(/^\/+/, ''));
    if (!candidate.startsWith(uploadRoot)) return null;
    return candidate;
}

app.get('/api/features', (_req, res) => {
    res.json({ success:true, data: publicFeatureFlags() });
});

app.get('/api/storage/files', (req, res) => {
    if (!requireApiPermission(req, res, 'manageStorage')) return;
    try {
        const db = require('./config/database')();
        const category = String(req.query.category || '').trim();
        const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
        const order = req.query.sort === 'old' ? 'f.created_at ASC' : 'f.size_bytes DESC';
        const where = category ? 'WHERE f.category = ?' : '';
        const params = category ? [category, limit] : [limit];
        const rows = db.prepare(`
            SELECT f.*, u.nama_lengkap as uploader_name
            FROM file_uploads f
            LEFT JOIN users u ON u.id = f.uploader_id
            ${where}
            ORDER BY ${order}
            LIMIT ?
        `).all(...params);
        res.json({ success:true, data: rows.map(formatStorageFile) });
    } catch (err) {
        console.error('[Storage files]', err.message);
        res.status(500).json({ success:false, message:'Gagal mengambil daftar file.' });
    }
});

app.delete('/api/storage/files/:id', (req, res) => {
    if (!requireApiPermission(req, res, 'manageStorage')) return;
    try {
        const db = require('./config/database')();
        const row = db.prepare('SELECT * FROM file_uploads WHERE id = ?').get(req.params.id);
        if (!row) return res.status(404).json({ success:false, message:'File tidak ditemukan.' });
        const filePath = resolveUploadPathFromRow(row);
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.prepare('DELETE FROM file_uploads WHERE id = ?').run(req.params.id);
        res.json({ success:true, message:'File berhasil dihapus dari storage dan database.' });
    } catch (err) {
        console.error('[Storage delete]', err.message);
        res.status(500).json({ success:false, message:'Gagal menghapus file.' });
    }
});

app.post('/api/storage/cleanup-orphans', (req, res) => {
    if (!requireApiPermission(req, res, 'manageStorage')) return;
    try {
        const uploadRoot = path.join(__dirname, 'public/uploads');
        const db = require('./config/database')();
        const known = new Set(db.prepare('SELECT file_path FROM file_uploads WHERE file_path IS NOT NULL').all().map(r => path.resolve(r.file_path)));
        const orphanFiles = [];
        function walk(dir) {
            if (!fs.existsSync(dir)) return;
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(full);
                else if (!known.has(path.resolve(full))) orphanFiles.push(full);
            }
        }
        walk(uploadRoot);
        const shouldDelete = req.query.delete === 'true' || req.body?.delete === true;
        let deleted = 0;
        if (shouldDelete) {
            orphanFiles.forEach(file => {
                if (path.resolve(file).startsWith(uploadRoot) && fs.existsSync(file)) {
                    fs.unlinkSync(file);
                    deleted += 1;
                }
            });
        }
        res.json({
            success:true,
            message: shouldDelete ? `${deleted} file orphan dihapus.` : `${orphanFiles.length} file orphan ditemukan. Jalankan mode hapus jika sudah dicek.`,
            data: {
                count: orphanFiles.length,
                deleted,
                files: orphanFiles.slice(0, 50).map(file => path.relative(uploadRoot, file).replace(/\\/g, '/')),
            }
        });
    } catch (err) {
        console.error('[Storage cleanup]', err.message);
        res.status(500).json({ success:false, message:'Gagal cleanup storage.' });
    }
});

function dbFilePath() {
    const configured = ENV.DB_PATH.endsWith('.db') ? ENV.DB_PATH : `${ENV.DB_PATH}.db`;
    return path.isAbsolute(configured) ? configured : path.resolve(__dirname, configured);
}

function backupDirPath() {
    const dir = path.join(__dirname, 'backups');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive:true });
    return dir;
}

app.get('/api/backup/database', (req, res) => {
    if (!requireApiPermission(req, res, 'backupDatabase')) return;
    try {
        const dir = backupDirPath();
        const rows = fs.readdirSync(dir)
            .filter(name => /^smkn1terisi-\d{8}-\d{6}\.db$/.test(name))
            .map(name => {
                const stat = fs.statSync(path.join(dir, name));
                return { name, size_bytes: stat.size, created_at: stat.birthtime.toISOString() };
            })
            .sort((a, b) => b.created_at.localeCompare(a.created_at));
        res.json({ success:true, data: rows });
    } catch (err) {
        res.status(500).json({ success:false, message:'Gagal membaca daftar backup.' });
    }
});

app.post('/api/backup/database', (req, res) => {
    if (!requireApiPermission(req, res, 'backupDatabase')) return;
    try {
        const source = dbFilePath();
        if (!fs.existsSync(source)) return res.status(404).json({ success:false, message:'File database tidak ditemukan.' });
        const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
        const name = `smkn1terisi-${stamp.slice(0,8)}-${stamp.slice(8)}.db`;
        const dir = backupDirPath();
        fs.copyFileSync(source, path.join(dir, name));
        const backups = fs.readdirSync(dir).filter(n => /^smkn1terisi-\d{8}-\d{6}\.db$/.test(n)).sort().reverse();
        backups.slice(5).forEach(old => fs.unlinkSync(path.join(dir, old)));
        res.status(201).json({ success:true, message:'Backup database berhasil dibuat.', data:{ name } });
    } catch (err) {
        console.error('[DB backup]', err.message);
        res.status(500).json({ success:false, message:'Gagal membuat backup database.' });
    }
});

app.get('/api/backup/database/:name', (req, res) => {
    if (!requireApiPermission(req, res, 'backupDatabase')) return;
    const name = String(req.params.name || '');
    if (!/^smkn1terisi-\d{8}-\d{6}\.db$/.test(name)) return res.status(400).json({ success:false, message:'Nama backup tidak valid.' });
    const file = path.join(backupDirPath(), name);
    if (!fs.existsSync(file)) return res.status(404).json({ success:false, message:'Backup tidak ditemukan.' });
    res.download(file, name);
});

/* ── Rate limiter untuk semua /api/* ──────────────────────────────── */
app.use('/api/', apiLimiter);

/* ════════════════════════════════════════════════════════════════════
   WEBSOCKET — CBT Admin Panel (dengan JWT auth)
   ════════════════════════════════════════════════════════════════════ */
function setupWebSocket() {
    const wss     = new WebSocket.Server({ server });
    const clients = new Map();
    const adminClients = new Set();
    const MAX_WS_PAYLOAD_BYTES = 64 * 1024;
    const WS_MESSAGE_WINDOW_MS = 10_000;
    const WS_MESSAGE_LIMIT = 40;

    function resolveCbtWsSession(db, nisn, token) {
        const rawToken = String(token || '').trim();
        if (!nisn || !rawToken) return null;

        const direct = db.prepare(`
            SELECT * FROM cbt_sessions
            WHERE token = ? AND nisn = ? AND used = 0 AND token_scope != 'class'
        `).get(rawToken.toLowerCase(), nisn);
        if (direct && (!direct.expires_at || new Date(direct.expires_at).getTime() > Date.now())) return direct;

        const publicToken = rawToken.toUpperCase();
        if (!/^[A-Z0-9]{6,16}$/.test(publicToken)) return null;
        const student = db.prepare(`
            SELECT u.nisn, u.nama_lengkap, sp.kelas
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE u.nisn = ? AND u.role = 'siswa' AND u.is_active = 1
        `).get(nisn);
        if (!student?.kelas) return null;

        const classSession = db.prepare(`
            SELECT * FROM cbt_sessions
            WHERE UPPER(token) = ? AND token_scope = 'class' AND kelas = ? AND used = 0 AND status != 'revoked'
            ORDER BY created_at DESC
            LIMIT 1
        `).get(publicToken, student.kelas);
        if (!classSession || (classSession.expires_at && new Date(classSession.expires_at).getTime() <= Date.now())) return null;

        const existing = db.prepare(`
            SELECT * FROM cbt_sessions
            WHERE exam_id = ? AND nisn = ? AND class_token_id = ? AND used = 0 AND status != 'revoked'
            ORDER BY created_at DESC
            LIMIT 1
        `).get(classSession.exam_id, nisn, classSession.id);
        if (existing && (!existing.expires_at || new Date(existing.expires_at).getTime() > Date.now())) return existing;

        const sessionId = uuidv4();
        const individualToken = crypto.randomBytes(16).toString('hex');
        db.prepare(`
            INSERT INTO cbt_sessions
            (id, exam_id, nisn, mapel, token, used, status, token_scope, kelas, class_token_id, durasi_menit, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, 0, 'issued', 'individual', ?, ?, ?, ?, ?)
        `).run(sessionId, classSession.exam_id || null, nisn, classSession.mapel, individualToken, student.kelas, classSession.id, classSession.durasi_menit, classSession.expires_at, new Date().toISOString());
        return db.prepare('SELECT * FROM cbt_sessions WHERE id = ?').get(sessionId);
    }

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
                    if (!valid || !['super_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha'].includes(decoded?.role)) {
                        send(ws, { type: 'error', message: 'Token admin tidak valid.' });
                        ws.close(1008, 'Unauthorized');
                        return;
                    }
                    ws.role = 'admin';
                    ws.isAuth = true;
                    ws.adminUser = decoded;
                    ws.examFilter = null;
                    adminClients.add(ws);
                    send(ws, { type: 'admin_auth_ok', message: `Terhubung sebagai ${decoded.nama}.` });
                    break;
                }

                case 'admin_subscribe':
                    if (ws.role !== 'admin') return;
                    ws.examFilter = cleanText(msg.examId, 80);
                    send(ws, { type: 'admin_subscribe_ok', examId: ws.examFilter });
                    break;

                case 'student_join': {
                    const { nisn, token: cbtToken, mapel } = msg;
                    if (!nisn || !cbtToken) {
                        send(ws, { type: 'error', message: 'NISN dan token wajib.' });
                        ws.close(1008, 'Missing credentials');
                        return;
                    }
                    try {
                        const db      = require('./config/database')();
                        const session = resolveCbtWsSession(db, nisn, cbtToken);

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
                            session.token
                        );
                        ws.nisn = nisn; ws.mapel = session.mapel; ws.sessionId = session.id; ws.examId = session.exam_id || null;
                        ws.role = 'student'; ws.isAuth = true;
                        clients.set(nisn, ws);
                        fwdAdminToExam({ ...msg, mapel: session.mapel, exam_id: session.exam_id || null, session_id: session.id }, session.exam_id || null);
                    } catch(e) {
                        console.error('[WS student_join]', e.message);
                        send(ws, { type: 'error', message: 'Gagal validasi session.' });
                    }
                    break;
                }

                case 'device_info': case 'browser_info': case 'battery_update': case 'network_speed':
                case 'location': case 'location_update': case 'camera_status': case 'camera_frame':
                case 'screen_frame': case 'screen_status':
                case 'answer_update': case 'violation':
                    if (!ENV.FEATURE_CBT_CAMERA_MONITOR && ['camera_frame','screen_frame','screen_status'].includes(msg.type)) {
                        send(ws, { type: 'proctor_disabled', message: 'Monitoring kamera/screen sedang dimatikan di server.' });
                        return;
                    }
                    saveProctorEvent(msg, ws);
                    fwdAdminTelemetry(msg, ws);
                    break;

                case 'student_help':
                    if (ws.role !== 'student') return;
                    handleStudentHelp(msg, ws);
                    break;

                case 'student_finish':
                    fwdAdminToExam({ ...msg, exam_id: ws.examId || msg.exam_id || null }, ws.examId || msg.exam_id || null);
                    saveCBT(msg, ws.nisn);
                    try {
                        require('./config/database')()
                            .prepare(`UPDATE cbt_sessions SET used = 1, end_time = datetime('now') WHERE id = ?`)
                            .run(ws.sessionId);
                    } catch {}
                    break;

                case 'admin_warn':
                    if (ws.role !== 'admin') return;
                    send(clients.get(msg.targetNisn), { type: 'warning', message: msg.message });
                    break;
                case 'admin_reply':
                    if (ws.role !== 'admin') return;
                    handleAdminReply(msg, ws);
                    break;
                case 'admin_kick':
                    if (ws.role !== 'admin') return;
                    send(clients.get(msg.targetNisn), { type: 'kicked' });
                    clients.get(msg.targetNisn)?.close();
                    clients.delete(msg.targetNisn);
                    break;
                case 'admin_broadcast':
                    if (ws.role !== 'admin') return;
                    handleAdminBroadcast(msg, ws);
                    break;
                case 'admin_proctor_start':
                    if (ws.role !== 'admin') return;
                    handleAdminProctorControl(msg, ws, true);
                    break;
                case 'admin_proctor_stop':
                    if (ws.role !== 'admin') return;
                    handleAdminProctorControl(msg, ws, false);
                    break;
                case 'admin_end_all':
                    if (ws.role !== 'admin') return;
                    sendToExamStudents(ws.examFilter || cleanText(msg.examId, 80) || null, { type: 'force_finish' });
                    break;
            }
        });

        ws.on('close', () => {
            if (ws.nisn) {
                clients.delete(ws.nisn);
                fwdAdminToExam({ type: 'student_disconnect', nisn: ws.nisn, exam_id: ws.examId || null }, ws.examId || null);
            }
            if (ws.role === 'admin') adminClients.delete(ws);
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
    function fwdAdmin(msg) {
        adminClients.forEach(admin => send(admin, msg));
    }

    function fwdAdminToExam(msg, examId) {
        adminClients.forEach(admin => {
            if (admin.examFilter && examId && admin.examFilter !== examId) return;
            send(admin, msg);
        });
    }

    function fwdAdminTelemetry(msg, ws) {
        if (!adminClients.size) return;
        if (!['camera_frame', 'screen_frame'].includes(msg.type)) {
            fwdAdminToExam({ ...msg, exam_id: ws.examId || msg.exam_id || null }, ws.examId || msg.exam_id || null);
            return;
        }
        const now = Date.now();
        const key = `${msg.type}:${ws?.nisn || 'unknown'}`;
        const minGap = msg.monitoring ? (msg.type === 'screen_frame' ? 1400 : 900) : (msg.type === 'screen_frame' ? 30_000 : 20_000);
        ws.lastForwardedFrameAt = ws.lastForwardedFrameAt || {};
        if (now - (ws.lastForwardedFrameAt[key] || 0) < minGap) return;
        ws.lastForwardedFrameAt[key] = now;
        fwdAdminToExam({ ...msg, exam_id: ws.examId || msg.exam_id || null }, ws.examId || msg.exam_id || null);
    }

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

    function saveCbtMessage({ examId = null, sessionId = null, nisn = null, senderRole, senderName = null, messageType, message, createdBy = null }) {
        const text = cleanText(message, 1000);
        if (!text) return null;
        const id = uuidv4();
        require('./config/database')().prepare(`
            INSERT INTO cbt_messages
            (id, exam_id, session_id, nisn, sender_role, sender_name, message_type, message, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
            id, examId || null, sessionId || null, nisn || null,
            cleanText(senderRole, 40) || 'system',
            cleanText(senderName, 120),
            cleanText(messageType, 40) || 'student_help',
            text,
            createdBy || null
        );
        return { id, message: text };
    }

    function sendToExamStudents(examId, payload) {
        clients.forEach(client => {
            if (examId && client.examId !== examId) return;
            send(client, payload);
        });
    }

    function handleStudentHelp(msg, ws) {
        const saved = saveCbtMessage({
            examId: ws.examId,
            sessionId: ws.sessionId,
            nisn: ws.nisn,
            senderRole: 'siswa',
            senderName: msg.senderName || ws.nisn,
            messageType: 'student_help',
            message: msg.message
        });
        if (!saved) {
            send(ws, { type: 'chat_error', message: 'Pesan kosong tidak dikirim.' });
            return;
        }
        const payload = {
            type: 'student_help',
            id: saved.id,
            exam_id: ws.examId || null,
            session_id: ws.sessionId || null,
            nisn: ws.nisn,
            sender_name: cleanText(msg.senderName, 120) || ws.nisn,
            message: saved.message,
            created_at: new Date().toISOString()
        };
        fwdAdminToExam(payload, ws.examId || null);
        send(ws, { type: 'student_help_ack', id: saved.id, message: saved.message });
    }

    function handleAdminReply(msg, ws) {
        const target = clients.get(msg.targetNisn);
        const examId = cleanText(msg.examId, 80) || target?.examId || null;
        const adminName = cleanText(msg.senderName, 120) || ws.adminUser?.nama || 'Panitia CBT';
        const saved = saveCbtMessage({
            examId,
            sessionId: target?.sessionId || null,
            nisn: cleanText(msg.targetNisn, 30),
            senderRole: ws.adminUser?.role || 'admin',
            senderName: adminName,
            messageType: 'admin_reply',
            message: msg.message,
            createdBy: ws.adminUser?.sub || null
        });
        if (!saved) {
            send(ws, { type: 'chat_error', message: 'Balasan kosong tidak dikirim.' });
            return;
        }
        const payload = {
            type: 'admin_reply',
            id: saved.id,
            exam_id: examId,
            nisn: cleanText(msg.targetNisn, 30),
            sender_name: adminName,
            message: saved.message,
            created_at: new Date().toISOString()
        };
        send(target, payload);
        fwdAdminToExam({ ...payload, type: 'admin_reply_sent' }, examId);
    }

    function handleAdminBroadcast(msg, ws) {
        const examId = cleanText(msg.examId, 80) || ws.examFilter || null;
        const adminName = cleanText(msg.senderName, 120) || ws.adminUser?.nama || 'Panitia CBT';
        const saved = saveCbtMessage({
            examId,
            senderRole: ws.adminUser?.role || 'admin',
            senderName: adminName,
            messageType: 'announcement',
            message: msg.message,
            createdBy: ws.adminUser?.sub || null
        });
        if (!saved) {
            send(ws, { type: 'chat_error', message: 'Announcement kosong tidak dikirim.' });
            return;
        }
        const payload = {
            type: 'announcement',
            id: saved.id,
            exam_id: examId,
            sender_name: adminName,
            message: saved.message,
            created_at: new Date().toISOString()
        };
        sendToExamStudents(examId, payload);
        fwdAdminToExam({ ...payload, type: 'broadcast_ack' }, examId);
    }

    function handleAdminProctorControl(msg, ws, active) {
        const targetNisn = cleanText(msg.targetNisn, 30);
        const target = clients.get(targetNisn);
        const mode = ['camera', 'screen', 'both'].includes(msg.mode) ? msg.mode : 'both';
        if (!target) {
            send(ws, { type: 'proctor_control_error', targetNisn, message: 'Siswa sedang offline atau belum masuk sesi.' });
            return;
        }
        const requestedExamId = cleanText(msg.examId, 80) || ws.examFilter || null;
        if (requestedExamId && target.examId && String(target.examId) !== String(requestedExamId)) {
            send(ws, { type: 'proctor_control_error', targetNisn, message: 'Siswa tidak berada pada sesi CBT yang sedang dipantau.' });
            return;
        }
        send(target, { type: active ? 'start_proctor_stream' : 'stop_proctor_stream', mode });
        fwdAdminToExam({
            type: active ? 'proctor_stream_started' : 'proctor_stream_stopped',
            nisn: targetNisn,
            exam_id: target.examId || requestedExamId || null,
            mode,
            created_at: new Date().toISOString()
        }, target.examId || requestedExamId || null);
    }

    function saveProctorEvent(msg, ws) {
        if (!ws?.nisn) return;
        try {
            const db = require('./config/database')();
            const base = { nisn: ws.nisn, mapel: ws.mapel, sessionId: ws.sessionId, now: new Date().toISOString() };
            switch (msg.type) {
                case 'device_info':
                    db.prepare(`
                        UPDATE cbt_sessions
                        SET device_info = @info, browser_info = @browser, camera_status = @camera,
                            screen_status = @screen, last_seen_at = @now
                        WHERE id = @sessionId
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
                        WHERE id = @sessionId
                    `).run({ ...base, info: JSON.stringify(msg.info || {}) });
                    break;
                case 'network_speed':
                    db.prepare(`
                        UPDATE cbt_sessions SET network_mbps = @mbps, last_seen_at = @now
                        WHERE id = @sessionId
                    `).run({ ...base, mbps: Number(msg.mbps) || null });
                    break;
                case 'location':
                case 'location_update':
                    db.prepare(`
                        UPDATE cbt_sessions SET location_lat = @lat, location_lng = @lng, last_seen_at = @now
                        WHERE id = @sessionId
                    `).run({ ...base, lat: cleanCoord(msg.lat), lng: cleanCoord(msg.lng) });
                    break;
                case 'camera_status':
                    db.prepare(`
                        UPDATE cbt_sessions SET camera_status = @status, last_seen_at = @now
                        WHERE id = @sessionId
                    `).run({ ...base, status: cleanText(msg.status, 40) || 'unknown' });
                    break;
                case 'camera_frame':
                    db.prepare(`
                        UPDATE cbt_sessions SET camera_status = 'active', last_camera_frame = @frame, last_seen_at = @now
                        WHERE id = @sessionId
                    `).run({ ...base, frame: limitedDataUrl(msg.frame) });
                    break;
                case 'screen_frame':
                    db.prepare(`
                        UPDATE cbt_sessions SET screen_status = 'active', last_screen_frame = @frame, last_seen_at = @now
                        WHERE id = @sessionId
                    `).run({ ...base, frame: limitedDataUrl(msg.frame) });
                    break;
                case 'screen_status':
                    db.prepare(`
                        UPDATE cbt_sessions SET screen_status = @status, last_seen_at = @now
                        WHERE id = @sessionId
                    `).run({ ...base, status: cleanText(msg.status, 40) || 'unknown' });
                    break;
                case 'answer_update':
                    db.prepare(`
                        UPDATE cbt_sessions
                        SET progress_answered = @answered, progress_total = @total,
                            current_question = @current, last_seen_at = @now
                        WHERE id = @sessionId
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
                        WHERE id = @sessionId
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
    app.use('/api/kantin',  require('./routes/kantin'));
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
