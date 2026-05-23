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
const { authenticate } = require('../middleware/auth');
const getDB    = require('../config/database');

// ── Upload directory ───────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../public/uploads');
const CATEGORIES = {
    tugas:   path.join(UPLOAD_DIR, 'tugas'),
    profil:  path.join(UPLOAD_DIR, 'profil'),
    ppdb:    path.join(UPLOAD_DIR, 'ppdb'),
    materi:  path.join(UPLOAD_DIR, 'materi'),
    general: path.join(UPLOAD_DIR, 'general'),
};
Object.values(CATEGORIES).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── MIME type whitelist ────────────────────────────────────────────
const ALLOWED_TYPES = {
    tugas:  ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','application/zip'],
    profil: ['image/jpeg','image/png','image/webp'],
    ppdb:   ['application/pdf','image/jpeg','image/png'],
    materi: ['application/pdf','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','video/mp4','image/jpeg','image/png'],
    general:['application/pdf','image/jpeg','image/png'],
};

const MAX_SIZE = {
    tugas:  10 * 1024 * 1024,  // 10MB
    profil:  2 * 1024 * 1024,  //  2MB
    ppdb:    5 * 1024 * 1024,  //  5MB
    materi: 50 * 1024 * 1024,  // 50MB
    general: 5 * 1024 * 1024,  //  5MB
};

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
    const id      = uuidv4();
    const fileUrl = `/uploads/${category}/${fileName}`;
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
        const allowed = ['guru','tata_usaha','kepala_sekolah','super_admin'];
        if (!allowed.includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Hanya guru/staff yang bisa upload materi.' });
        }
        next();
    },
    createUploader('materi').single('file'),
    (req, res) => {
        if (!req.file) return res.status(400).json({ success: false, message: 'Tidak ada file yang di-upload.' });
        try {
            const db = getDB();
            const record = saveFileRecord(db, {
                uploaderId:   req.user.sub,
                originalName: req.file.originalname,
                fileName:     req.file.filename,
                category:     'materi',
                mimeType:     req.file.mimetype,
                size:         req.file.size,
                entityType:   'materi',
                entityId:     req.body.kelas || null,
            });
            return res.status(201).json({ success: true, message: 'Materi berhasil di-upload.', data: record });
        } catch (err) {
            fs.unlink(req.file.path, () => {});
            console.error('[Upload materi]', err.message);
            return res.status(500).json({ success: false, message: 'Gagal menyimpan materi.' });
        }
    }
);

// ── ROUTE: GET file list per category (untuk LMS materi) ──────────
router.get('/list/:category', authenticate, (req, res) => {
    const db       = getDB();
    const category = req.params.category;
    const valid    = ['tugas','profil','ppdb','materi','general'];
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
    if (err?.message?.includes('tidak diizinkan')) {
        return res.status(415).json({ success: false, message: err.message });
    }
    console.error('[Upload error]', err.message);
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan saat upload.' });
});

module.exports = router;
