// routes/upload.js — NEW FILE
// Handles semua file upload: lampiran tugas, foto profil, berkas PPDB
'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { authenticate, isStaff, isContentAdmin } = require('../middleware/auth');
const getDB    = require('../config/database');
const ENV      = require('../config/env');

// ── Upload directory ───────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');
const CATEGORIES = {
    tugas:   path.join(UPLOAD_DIR, 'tugas'),
    profil:  path.join(UPLOAD_DIR, 'profil'),
    ppdb:    path.join(UPLOAD_DIR, 'ppdb'),
    materi:  path.join(UPLOAD_DIR, 'materi'),
    website: path.join(UPLOAD_DIR, 'website'),
    cbt:     path.join(UPLOAD_DIR, 'cbt'),
    kantin:  path.join(UPLOAD_DIR, 'kantin'),
    forum:   path.join(UPLOAD_DIR, 'forum'),
    kantin_chat: path.join(UPLOAD_DIR, 'kantin-chat'),
    general: path.join(UPLOAD_DIR, 'general'),
};
Object.values(CATEGORIES).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const VIDEO_MIMES = ['video/mp4','video/webm','video/quicktime'];
const FORUM_AUDIO_MIMES = ['audio/mpeg','audio/wav','audio/ogg','audio/webm'];

// ── MIME type whitelist ────────────────────────────────────────────
const BASE_ALLOWED_TYPES = {
    tugas:  ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','image/jpeg','image/png','image/webp','image/gif'],
    profil: ['image/jpeg','image/png','image/webp'],
    ppdb:   ['application/pdf','image/jpeg','image/png'],
    materi: ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','video/mp4','video/webm','video/quicktime','image/jpeg','image/png','image/webp','image/gif'],
    website:['image/jpeg','image/png','image/webp'],
    cbt:    ['image/jpeg','image/png','image/webp','audio/mpeg','audio/wav','audio/ogg','video/mp4','video/webm'],
    kantin: ['image/jpeg','image/png','image/webp'],
    forum:  ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/wav','audio/ogg','audio/webm'],
    kantin_chat:['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime','audio/mpeg','audio/wav','audio/ogg','audio/webm'],
    general:['application/pdf','image/jpeg','image/png'],
};

function buildAllowedTypes() {
    const map = Object.fromEntries(Object.entries(BASE_ALLOWED_TYPES).map(([key, types]) => [key, [...types]]));
    if (!ENV.FEATURE_FORUM_ATTACHMENT) {
        map.forum = [];
        map.kantin_chat = [];
    }
    if (!ENV.FEATURE_FORUM_VIDEO_ATTACHMENT) {
        map.forum = map.forum.filter(type => !VIDEO_MIMES.includes(type));
        map.kantin_chat = map.kantin_chat.filter(type => !VIDEO_MIMES.includes(type));
    }
    if (!ENV.FEATURE_FORUM_AUDIO_ATTACHMENT) {
        map.forum = map.forum.filter(type => !FORUM_AUDIO_MIMES.includes(type));
        map.kantin_chat = map.kantin_chat.filter(type => !FORUM_AUDIO_MIMES.includes(type));
    }
    return map;
}

const ALLOWED_TYPES = buildAllowedTypes();

const MAX_SIZE = {
    tugas:  ENV.UPLOAD_MAX_TUGAS_MB * 1024 * 1024,
    profil:  1 * 1024 * 1024,  //  1MB
    ppdb:    3 * 1024 * 1024,  //  3MB
    materi: ENV.UPLOAD_MAX_MATERI_MB * 1024 * 1024,
    website: 2 * 1024 * 1024,  //  2MB
    cbt:    ENV.UPLOAD_MAX_CBT_MB * 1024 * 1024,
    kantin:  ENV.UPLOAD_MAX_KANTIN_MB * 1024 * 1024,
    forum:  ENV.UPLOAD_MAX_FORUM_MB * 1024 * 1024,
    kantin_chat: ENV.KANTIN_CHAT_MAX_ATTACHMENT_MB * 1024 * 1024,
    general: 5 * 1024 * 1024,  //  5MB
};

const UPLOAD_QUOTA_BYTES = Math.round(ENV.UPLOAD_MAX_TOTAL_GB * 1024 * 1024 * 1024);

function cleanText(value, max = 500) {
    return String(value || '').replace(/[<>]/g, '').trim().slice(0, max) || null;
}

function cleanNisn(value) {
    const text = String(value || '').replace(/\D/g, '').slice(0, 10);
    return text.length === 10 ? text : null;
}

function ensureFileUploadSchema(db) {
    const cols = db.pragma('table_info(file_uploads)').map(c => c.name);
    if (!cols.includes('materi_title')) db.exec('ALTER TABLE file_uploads ADD COLUMN materi_title TEXT');
    if (!cols.includes('materi_desc')) db.exec('ALTER TABLE file_uploads ADD COLUMN materi_desc TEXT');
    if (!cols.includes('mapel')) db.exec('ALTER TABLE file_uploads ADD COLUMN mapel TEXT');
    if (!cols.includes('target_type')) db.exec('ALTER TABLE file_uploads ADD COLUMN target_type TEXT');
    if (!cols.includes('target_kelas')) db.exec('ALTER TABLE file_uploads ADD COLUMN target_kelas TEXT');
    if (!cols.includes('target_nisn')) db.exec('ALTER TABLE file_uploads ADD COLUMN target_nisn TEXT');
}

function getDirSize(dir) {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((sum, entry) => {
        const full = path.join(dir, entry.name);
        return sum + (entry.isDirectory() ? getDirSize(full) : fs.statSync(full).size);
    }, 0);
}

function enforceUploadQuota(req, res, next) {
    try {
        const used = getDirSize(UPLOAD_DIR);
        if (UPLOAD_QUOTA_BYTES > 0 && used >= UPLOAD_QUOTA_BYTES) {
            return res.status(507).json({
                success: false,
                message: 'Kuota penyimpanan upload sudah penuh. Arsipkan atau hapus file lama sebelum upload lagi.'
            });
        }
    } catch (err) {
        console.warn('[Upload quota check]', err.message);
    }
    next();
}

function blockDisabledUploadFeature(category, mimeType) {
    if (category === 'forum' && !ENV.FEATURE_FORUM_ATTACHMENT) {
        return 'Lampiran forum sedang dinonaktifkan sementara. Teks forum tetap bisa digunakan.';
    }
    if (['forum','kantin_chat'].includes(category) && !ENV.FEATURE_FORUM_VIDEO_ATTACHMENT && VIDEO_MIMES.includes(mimeType)) {
        return 'Upload video forum sedang dibatasi. Pakai file lebih ringan atau aktifkan FEATURE_FORUM_VIDEO_ATTACHMENT=true.';
    }
    if (['forum','kantin_chat'].includes(category) && !ENV.FEATURE_FORUM_AUDIO_ATTACHMENT && FORUM_AUDIO_MIMES.includes(mimeType)) {
        return 'Upload audio forum sedang dibatasi. Aktifkan FEATURE_FORUM_AUDIO_ATTACHMENT=true jika dibutuhkan.';
    }
    return '';
}

function uploadPressureMessage(category, mimeType) {
    const used = getDirSize(UPLOAD_DIR);
    const pct = UPLOAD_QUOTA_BYTES ? (used / UPLOAD_QUOTA_BYTES) * 100 : 0;
    const isMedia = VIDEO_MIMES.includes(mimeType) || FORUM_AUDIO_MIMES.includes(mimeType);
    const critical = ['ppdb','tugas','profil'].includes(category);
    if (pct >= 95 && !critical) {
        return 'Storage server hampir penuh. Upload non-kritis sementara diblokir; minta super admin cleanup storage dulu.';
    }
    if (pct >= 85 && isMedia) {
        return 'Upload media sementara dibatasi karena kapasitas server hampir penuh.';
    }
    return '';
}

function maxSizeByMime(category, mimeType) {
    if (category === 'forum') {
        if (mimeType.startsWith('image/')) return ENV.FORUM_IMAGE_MAX_MB * 1024 * 1024;
        if (VIDEO_MIMES.includes(mimeType)) return ENV.FORUM_VIDEO_MAX_MB * 1024 * 1024;
        if (FORUM_AUDIO_MIMES.includes(mimeType)) return ENV.FORUM_AUDIO_MAX_MB * 1024 * 1024;
        return ENV.FORUM_DOCUMENT_MAX_MB * 1024 * 1024;
    }
    return MAX_SIZE[category] || MAX_SIZE.general;
}

function validateUploadedFilePolicy(req, res, next) {
    const file = req.file;
    if (!file) return next();
    const category = req.uploadCategory || 'general';
    const limit = maxSizeByMime(category, file.mimetype);
    if (file.size > limit) {
        fs.unlink(file.path, () => {});
        return res.status(413).json({
            success: false,
            message: `File terlalu besar untuk kategori ${category}. Maksimal ${Math.round(limit / 1024 / 1024)}MB.`
        });
    }
    next();
}

// ── Multer storage engine ──────────────────────────────────────────
function createStorage(category) {
    return multer.diskStorage({
        destination: (_req, _file, cb) => {
            cb(null, CATEGORIES[category] || CATEGORIES.general);
        },
        filename: (_req, file, cb) => {
            // Nama file: timestamp_random.ext — mencegah overwrite & path traversal
            const ext   = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
            const rand  = crypto.randomBytes(8).toString('hex');
            const fname = `${Date.now()}_${rand}${ext}`;
            cb(null, fname);
        }
    });
}

function createUploader(category) {
    return multer({
        storage: createStorage(category),
        limits:  { fileSize: MAX_SIZE[category] || MAX_SIZE.general },
        fileFilter: (_req, file, cb) => {
            const allowed = ALLOWED_TYPES[category] || ALLOWED_TYPES.general;
            const disabledMessage = blockDisabledUploadFeature(category, file.mimetype);
            if (disabledMessage) return cb(new Error(disabledMessage));
            const pressureMessage = uploadPressureMessage(category, file.mimetype);
            if (pressureMessage) return cb(new Error(pressureMessage));
            if (allowed.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error(`Tipe file '${file.mimetype}' tidak diizinkan untuk kategori ${category}.`));
            }
        }
    });
}

// ── Helper: simpan record upload ke DB ────────────────────────────
function saveFileRecord(db, { uploaderId, originalName, fileName, category, mimeType, size, entityType, entityId }) {
    ensureFileUploadSchema(db);
    const id      = uuidv4();
    const publicCategory = category === 'kantin_chat' ? 'kantin-chat' : category;
    const fileUrl = `/uploads/${publicCategory}/${fileName}`;
    const filePath = path.join(CATEGORIES[category], fileName);
    db.prepare(`
        INSERT INTO file_uploads (id,uploader_id,original_name,file_name,file_path,file_url,mime_type,size_bytes,category,entity_type,entity_id,created_at)
        VALUES (@id,@uploader_id,@original_name,@file_name,@file_path,@file_url,@mime_type,@size_bytes,@category,@entity_type,@entity_id,@created_at)
    `).run({
        id, uploader_id: uploaderId, original_name: originalName,
        file_name: fileName, file_path: filePath, file_url: fileUrl,
        mime_type: mimeType, size_bytes: size, category,
        entity_type: entityType || null, entity_id: entityId || null,
        created_at: new Date().toISOString()
    });
    return { id, fileUrl, fileName };
}

// ── ROUTE: Upload lampiran tugas ───────────────────────────────────
router.post('/tugas',
    authenticate,
    enforceUploadQuota,
    createUploader('tugas').single('file'),
    (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
        try {
            const db = getDB();
            const record = saveFileRecord(db, {
                uploaderId:   req.user.sub,
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                category:     'tugas',
                mimeType:     req.file.mimetype,
                size:         req.file.size,
                entityType:   'submission_tugas',
                entityId:     req.body.tugas_id || null,
            });
            return res.status(201).json({ success: true, message: 'File berhasil di-upload.', data: record });
        } catch (err) {
            // Hapus file jika DB gagal
            fs.unlink(req.file.path, () => {});
            console.error('[Upload tugas]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan file.' });
        }
    }
);

// ── ROUTE: Upload foto profil ──────────────────────────────────────
router.post('/profil',
    authenticate,
    enforceUploadQuota,
    createUploader('profil').single('foto'),
    (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
        try {
            const db = getDB();

            // Hapus foto profil lama jika ada
            const user = db.prepare('SELECT foto_profil FROM users WHERE id = ?').get(req.user.sub);
            if (user?.foto_profil) {
                const oldPath = path.join(__dirname, '../public', user.foto_profil);
                if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {});
            }

            const fileUrl = `/uploads/profil/${req.file.filename}`;

            // Update di DB
            db.prepare('UPDATE users SET foto_profil = ?, updated_at = ? WHERE id = ?')
              .run(fileUrl, new Date().toISOString(), req.user.sub);

            saveFileRecord(db, {
                uploaderId:   req.user.sub,
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                category:     'profil',
                mimeType:     req.file.mimetype,
                size:         req.file.size,
                entityType:   'users',
                entityId:     req.user.sub,
            });

            return res.status(200).json({ success: true, message: 'Foto profil berhasil diperbarui.', data: { fileUrl } });
        } catch (err) {
            fs.unlink(req.file.path, () => {});
            console.error('[Upload profil]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan foto profil.' });
        }
    }
);

// ── ROUTE: Upload berkas PPDB ──────────────────────────────────────
// Tidak butuh auth karena calon siswa belum punya akun
router.post('/ppdb',
    enforceUploadQuota,
    createUploader('ppdb').fields([
        { name: 'kartu_keluarga', maxCount: 1 },
        { name: 'akta_kelahiran', maxCount: 1 },
        { name: 'skl_ijazah',     maxCount: 1 },
        { name: 'pas_foto',       maxCount: 1 },
    ]),
    (req, res) => {
        const files = req.files;
        if (!files || Object.keys(files).length === 0) {
            return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
        }

        const result = {};
        try {
            // Tidak perlu simpan ke DB karena PPDB belum login
            // Return URL saja untuk disimpan bersama data pendaftaran
            for (const [fieldName, fileArr] of Object.entries(files)) {
                result[fieldName] = `/uploads/ppdb/${fileArr[0].filename}`;
            }
            return res.status(201).json({ success: true, message: 'Berkas berhasil di-upload.', data: result });
        } catch (err) {
            // Hapus semua file yang sudah terupload jika gagal
            for (const fileArr of Object.values(files)) {
                fs.unlink(fileArr[0].path, () => {});
            }
            console.error('[Upload PPDB]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan berkas.' });
        }
    }
);

// ── ROUTE: Upload materi (guru/staff) ─────────────────────────────
router.post('/materi',
    authenticate,
    (req, res, next) => {
        // Cek role
        const allowed = ['guru','tata_usaha','kepala_sekolah','wakil_kepala_sekolah','super_admin'];
        if (!allowed.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Hanya guru/staff yang bisa upload materi.' });
        }
        next();
    },
    enforceUploadQuota,
    createUploader('materi').single('file'),
    (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
        try {
            const db = getDB();
            ensureFileUploadSchema(db);
            const targetType = ['school','class','student'].includes(req.body.target_type) ? req.body.target_type : 'class';
            const targetKelas = targetType === 'class' ? cleanText(req.body.kelas || req.body.target_kelas, 80) : null;
            const targetNisn = targetType === 'student' ? cleanNisn(req.body.target_nisn || req.body.nisn) : null;
            if (targetType === 'class' && !targetKelas) {
                fs.unlink(req.file.path, () => {});
                return res.status(400).json({ success: false, message: 'Kelas target wajib dipilih.' });
            }
            if (targetType === 'student' && !targetNisn) {
                fs.unlink(req.file.path, () => {});
                return res.status(400).json({ success: false, message: 'NISN target wajib 10 digit.' });
            }
            const record = saveFileRecord(db, {
                uploaderId:   req.user.sub,
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                category:     'materi',
                mimeType:     req.file.mimetype,
                size:         req.file.size,
                entityType:   targetType === 'student' ? 'materi_siswa' : targetType === 'school' ? 'materi_sekolah' : 'materi_kelas',
                entityId:     targetType === 'student' ? targetNisn : targetType === 'class' ? targetKelas : 'school',
            });
            db.prepare(`
                UPDATE file_uploads
                SET materi_title = ?, materi_desc = ?, mapel = ?, target_type = ?, target_kelas = ?, target_nisn = ?
                WHERE id = ?
            `).run(
                cleanText(req.body.title || req.body.judul || req.file.originalname, 160),
                cleanText(req.body.deskripsi || req.body.description, 1500),
                cleanText(req.body.mapel, 100),
                targetType,
                targetKelas,
                targetNisn,
                record.id
            );
            return res.status(201).json({ success: true, message: 'Materi berhasil di-upload.', data: record });
        } catch (err) {
            fs.unlink(req.file.path, () => {});
            console.error('[Upload materi]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan materi.' });
        }
    }
);

// ── ROUTE: Upload aset website (berita, galeri, PPDB info) ───────
router.post('/website',
    authenticate,
    isContentAdmin,
    enforceUploadQuota,
    createUploader('website').single('image'),
    (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada gambar yang di-upload.' });
        try {
            const db = getDB();
            const record = saveFileRecord(db, {
                uploaderId:   req.user.sub,
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                category:     'website',
                mimeType:     req.file.mimetype,
                size:         req.file.size,
                entityType:   req.body.entity_type || 'website_contents',
                entityId:     req.body.entity_id || null,
            });
            return res.status(201).json({ success: true, message: 'Gambar website berhasil di-upload.', data: record });
        } catch (err) {
            fs.unlink(req.file.path, () => {});
            console.error('[Upload website]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan gambar website.' });
        }
    }
);

// ── ROUTE: Upload foto produk Kantin ku (siswa) ───────────────────
router.post('/kantin',
    authenticate,
    enforceUploadQuota,
    createUploader('kantin').single('image'),
    (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada gambar yang di-upload.' });
        try {
            const db = getDB();
            const record = saveFileRecord(db, {
                uploaderId:   req.user.sub,
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                category:     'kantin',
                mimeType:     req.file.mimetype,
                size:         req.file.size,
                entityType:   req.body.entity_type || 'kantin_product',
                entityId:     req.body.entity_id || null,
            });
            return res.status(201).json({ success: true, message: 'Foto produk berhasil di-upload.', data: record });
        } catch (err) {
            fs.unlink(req.file.path, () => {});
            console.error('[Upload Kantin]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan foto produk.' });
        }
    }
);

function uploadStudentAttachment(category, entityType) {
    return [
        authenticate,
        enforceUploadQuota,
        (req, _res, next) => { req.uploadCategory = category; next(); },
        createUploader(category).single('file'),
        validateUploadedFilePolicy,
        (req, res) => {
            if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
            try {
                const db = getDB();
                const record = saveFileRecord(db, {
                    uploaderId:   req.user.sub,
                    originalName: req.file.originalname,
                    fileName:     req.file.filename,
                    category,
                    mimeType:     req.file.mimetype,
                    size:         req.file.size,
                    entityType:   req.body.entity_type || entityType,
                    entityId:     req.body.entity_id || null,
                });
                return res.status(201).json({ success: true, message: 'Lampiran berhasil di-upload.', data: { ...record, mimeType:req.file.mimetype, originalName:req.file.originalname } });
            } catch (err) {
                fs.unlink(req.file.path, () => {});
                console.error(`[Upload ${category}]`, err.message);
                return res.status(500).json({ success: false, message: 'Gagal menyimpan lampiran.' });
            }
        }
    ];
}

router.post('/forum', ...uploadStudentAttachment('forum', 'forum_posts'));
router.post('/kantin-chat', ...uploadStudentAttachment('kantin_chat', 'kantin_chats'));

// ── ROUTE: Upload media soal CBT (guru/staff) ─────────────────────
router.post('/cbt',
    authenticate,
    isStaff,
    enforceUploadQuota,
    createUploader('cbt').single('file'),
    (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
        try {
            const db = getDB();
            const record = saveFileRecord(db, {
                uploaderId:   req.user.sub,
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                category:     'cbt',
                mimeType:     req.file.mimetype,
                size:         req.file.size,
                entityType:   req.body.entity_type || 'cbt_question',
                entityId:     req.body.entity_id || null,
            });
            const mediaType = req.file.mimetype.startsWith('image/')
                ? 'image'
                : req.file.mimetype.startsWith('audio/')
                    ? 'audio'
                    : 'video';
            return res.status(201).json({
                success: true,
                message: 'Media CBT berhasil di-upload.',
                data: { ...record, mediaType }
            });
        } catch (err) {
            fs.unlink(req.file.path, () => {});
            console.error('[Upload CBT]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan media CBT.' });
        }
    }
);

// ── ROUTE: GET file list per category (untuk LMS materi) ──────────
router.get('/list/:category', authenticate, (req, res) => {
    const db       = getDB();
    const category = req.params.category;
    const valid    = ['tugas','profil','ppdb','materi','website','cbt','kantin','forum','kantin_chat','general'];
    if (!valid.includes(category)) {
        return res.status(400).json({ success: false, message: 'Kategori tidak valid.' });
    }
    try {
        const files = db.prepare(
            `SELECT id,original_name,file_url,mime_type,size_bytes,entity_type,entity_id,created_at
             FROM file_uploads WHERE category = ? ORDER BY created_at DESC LIMIT 100`
        ).all(category);
        return res.status(200).json({ success: true, data: files });
    } catch (err) {
        console.error('[Upload list]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil daftar file.' });
    }
});

// ── Error handler khusus Multer ────────────────────────────────────
router.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({ success: false, message: 'File terlalu besar. Periksa batas ukuran file.' });
        }
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
    }
    if (err?.message?.includes('sedang dimatikan')) {
        return res.status(403).json({ success: false, message: err.message });
    }
    if (err?.message?.includes('dibatasi') || err?.message?.includes('hampir penuh')) {
        return res.status(507).json({ success: false, message: err.message });
    }
    if (err?.message?.includes('tidak diizinkan')) {
        return res.status(415).json({ success: false, message: err.message });
    }
    console.error('[Upload error]', err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan saat upload.' });
});

module.exports = router;
