// routes/lms.js — NEW FILE
// Real API untuk LMS: forum, tugas, submission, materi, notifikasi
'use strict';

const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB    = require('../config/database');

const nowISO = () => new Date().toISOString();
const STAFF  = ['guru','tata_usaha','kepala_sekolah','wakil_kepala_sekolah','super_admin'];
const cleanText = (value, max = 500) => (
    value === undefined || value === null
        ? null
        : String(value).replace(/[<>]/g, '').trim().slice(0, max) || null
);
const cleanUrl = value => {
    const text = cleanText(value, 500);
    if (!text) return null;
    return /^(https?:\/\/|\/uploads\/|uploads\/|asset\/|\/asset\/)/i.test(text) ? text : null;
};

/* ══════════════════════════════════════════════
   TUGAS
   ══════════════════════════════════════════════ */

// GET /api/lms/tugas?kelas=XI TKJ 1 — ambil tugas untuk kelas siswa
router.get('/tugas', authenticate, (req, res) => {
    const db = getDB();
    try {
        const kelas = req.query.kelas
            || db.prepare('SELECT kelas FROM siswa_profil WHERE nisn = ?').get(req.user.nisn)?.kelas
            || 'XI TKJ 1';

        const tugas = db.prepare(`
            SELECT t.*, u.nama_lengkap as guru_nama,
                   s.id as submission_id, s.status as submission_status,
                   s.submitted_at, s.nilai as submission_nilai
            FROM tugas_kelas t
            LEFT JOIN users u ON t.created_by = u.id
            LEFT JOIN submission_tugas s ON s.tugas_id = t.id AND s.nisn = ?
            WHERE t.kelas = ? AND t.is_active = 1
            ORDER BY t.deadline ASC
        `).all(req.user.nisn || '', kelas);

        return res.json({ success: true, data: tugas });
    } catch (err) {
        console.error('[LMS tugas GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data tugas.' });
    }
});

// POST /api/lms/tugas — guru buat tugas baru
router.post('/tugas', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { judul, deskripsi, mapel, kelas, deadline } = req.body;
    if (!judul || !mapel || !kelas) {
        return res.status(400).json({ success: false, message: 'judul, mapel, kelas wajib diisi.' });
    }
    try {
        const id  = uuidv4();
        const now = nowISO();
        db.prepare(`
            INSERT INTO tugas_kelas (id,judul,deskripsi,mapel,kelas,deadline,created_by,is_active,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,1,?,?)
        `).run(id, judul, deskripsi || null, mapel, kelas, deadline || null, req.user.sub, now, now);

        // Kirim notifikasi ke semua siswa di kelas tersebut
        const siswaList = db.prepare(`
            SELECT u.id FROM users u
            JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE sp.kelas = ? AND u.role = 'siswa' AND u.is_active = 1
        `).all(kelas);

        const insertNotif = db.prepare(`
            INSERT INTO notifikasi (id,user_id,judul,pesan,tipe,link,created_at)
            VALUES (?,?,?,?,?,?,?)
        `);
        const sendNotifs = db.transaction(() => {
            for (const s of siswaList) {
                insertNotif.run(
                    uuidv4(), s.id,
                    `Tugas Baru: ${judul}`,
                    `${mapel} — Deadline: ${deadline || 'Tidak ditentukan'}`,
                    'tugas', '/LMS.html#tugas', now
                );
            }
        });
        sendNotifs();

        return res.status(201).json({ success: true, message: 'Tugas berhasil dibuat.', data: { id } });
    } catch (err) {
        console.error('[LMS tugas POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat tugas.' });
    }
});

// POST /api/lms/tugas/:id/submit — siswa submit tugas
router.post('/tugas/:id/submit', authenticate, (req, res) => {
    const db = getDB();
    const { jawaban, file_url } = req.body;
    const { id: tugasId }       = req.params;
    const nisn                  = req.user.nisn;

    if (!nisn) return res.status(400).json({ success: false, message: 'NISN tidak ditemukan di token.' });
    if (!jawaban && !file_url) return res.status(400).json({ success: false, message: 'Jawaban atau file wajib ada.' });

    try {
        const tugas = db.prepare('SELECT * FROM tugas_kelas WHERE id = ? AND is_active = 1').get(tugasId);
        if (!tugas) return res.status(404).json({ success: false, message: 'Tugas tidak ditemukan.' });

        // Cek deadline
        if (tugas.deadline && new Date(tugas.deadline) < new Date()) {
            return res.status(400).json({ success: false, message: 'Deadline tugas sudah lewat.' });
        }

        const existing = db.prepare('SELECT id FROM submission_tugas WHERE tugas_id = ? AND nisn = ?').get(tugasId, nisn);
        if (existing) {
            // Update submission yang sudah ada
            db.prepare(`
                UPDATE submission_tugas SET jawaban = ?, file_url = ?, status = 'submitted', submitted_at = ? WHERE id = ?
            `).run(jawaban || null, file_url || null, nowISO(), existing.id);
        } else {
            db.prepare(`
                INSERT INTO submission_tugas (id,tugas_id,nisn,jawaban,file_url,status,submitted_at)
                VALUES (?,?,?,?,?,'submitted',?)
            `).run(uuidv4(), tugasId, nisn, jawaban || null, file_url || null, nowISO());
        }

        return res.status(200).json({ success: true, message: 'Tugas berhasil dikumpulkan.' });
    } catch (err) {
        console.error('[LMS submit tugas]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengumpulkan tugas.' });
    }
});

// PATCH /api/lms/tugas/:tugasId/nilai/:nisn — guru beri nilai
router.patch('/tugas/:tugasId/nilai/:nisn', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { nilai, feedback } = req.body;
    if (nilai === undefined) return res.status(400).json({ success: false, message: 'nilai wajib ada.' });
    try {
        db.prepare(`
            UPDATE submission_tugas SET nilai = ?, feedback = ?, status = 'dinilai' WHERE tugas_id = ? AND nisn = ?
        `).run(parseFloat(nilai), feedback || null, req.params.tugasId, req.params.nisn);
        return res.json({ success: true, message: 'Nilai berhasil disimpan.' });
    } catch (err) {
        console.error('[LMS nilai tugas]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan nilai.' });
    }
});

/* ══════════════════════════════════════════════
   MATERI
   ══════════════════════════════════════════════ */

// GET /api/lms/materi?mapel=TKJ — ambil materi
router.get('/materi', authenticate, (req, res) => {
    const db = getDB();
    try {
        const { mapel, search } = req.query;
        const conds  = [];
        const params = [];

        if (mapel)  { conds.push('f.entity_id = ?'); params.push(mapel); }
        if (search) {
            const s = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
            conds.push('(f.original_name LIKE ? OR f.entity_id LIKE ?)');
            params.push(s, s);
        }
        conds.push("f.category = 'materi'");

        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : "WHERE f.category = 'materi'";
        const files = db.prepare(`
            SELECT f.id, f.original_name, f.file_url, f.mime_type,
                   f.size_bytes, f.entity_id as mapel, f.created_at,
                   u.nama_lengkap as uploaded_by
            FROM file_uploads f
            LEFT JOIN users u ON f.uploader_id = u.id
            ${where}
            ORDER BY f.created_at DESC
        `).all(...params);

        // Format ukuran file
        const formatted = files.map(f => ({
            ...f,
            ukuran: formatBytes(f.size_bytes),
            jenis:  getFileType(f.mime_type),
            tipe:   getFileTipe(f.mime_type),
        }));

        return res.json({ success: true, data: formatted });
    } catch (err) {
        console.error('[LMS materi GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil materi.' });
    }
});

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    if (bytes >= 1024*1024) return `${(bytes/1024/1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes/1024).toFixed(0)} KB`;
    return `${bytes} B`;
}
function getFileType(mime) {
    if (mime?.includes('pdf'))   return 'PDF';
    if (mime?.includes('video')) return 'VIDEO';
    if (mime?.includes('powerpoint') || mime?.includes('presentation')) return 'PPT';
    if (mime?.includes('word') || mime?.includes('document')) return 'DOC';
    if (mime?.includes('image')) return 'IMG';
    return 'FILE';
}
function getFileTipe(mime) {
    if (mime?.includes('pdf'))   return 'pdf';
    if (mime?.includes('video')) return 'video';
    if (mime?.includes('powerpoint') || mime?.includes('presentation')) return 'ppt';
    if (mime?.includes('word') || mime?.includes('document')) return 'doc';
    return 'file';
}

/* ══════════════════════════════════════════════
   FORUM
   ══════════════════════════════════════════════ */

// GET /api/lms/forum?mapel=TKJ
router.get('/forum', authenticate, (req, res) => {
    const db = getDB();
    try {
        const { mapel, page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const conds  = ['fp.parent_id IS NULL'];
        const params = [];

        if (mapel) { conds.push('fp.mapel = ?'); params.push(mapel); }

        const posts = db.prepare(`
            SELECT fp.id, fp.konten, fp.mapel, fp.likes, fp.attachment_url, fp.attachment_name, fp.attachment_type, fp.created_at,
                   u.id as user_id, u.nama_lengkap, u.role,
                   (SELECT COUNT(*) FROM forum_posts r WHERE r.parent_id = fp.id) as total_balasan,
                   EXISTS(SELECT 1 FROM forum_likes fl WHERE fl.post_id = fp.id AND fl.user_id = ?) as sudah_like
            FROM forum_posts fp
            JOIN users u ON fp.user_id = u.id
            WHERE ${conds.join(' AND ')}
            ORDER BY fp.created_at DESC
            LIMIT ? OFFSET ?
        `).all(req.user.sub, ...params, parseInt(limit), offset);

        const repliesStmt = db.prepare(`
            SELECT fp.id, fp.parent_id, fp.konten, fp.attachment_url, fp.attachment_name, fp.attachment_type, fp.created_at,
                   u.nama_lengkap, u.role
            FROM forum_posts fp
            JOIN users u ON fp.user_id = u.id
            WHERE fp.parent_id = ?
            ORDER BY fp.created_at ASC
            LIMIT 5
        `);
        return res.json({ success: true, data: posts.map(post => ({ ...post, replies: repliesStmt.all(post.id) })) });
    } catch (err) {
        console.error('[Forum GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil forum.' });
    }
});

// POST /api/lms/forum — buat post baru
router.post('/forum', authenticate, (req, res) => {
    const db = getDB();
    const { konten, mapel, parent_id, attachment_url, attachment_name, attachment_type } = req.body;
    if (!konten?.trim() && !attachment_url) return res.status(400).json({ success: false, message: 'Konten atau lampiran wajib diisi.' });

    try {
        const id  = uuidv4();
        const now = nowISO();
        db.prepare(`
            INSERT INTO forum_posts
            (id,user_id,mapel,konten,parent_id,likes,attachment_url,attachment_name,attachment_type,created_at,updated_at)
            VALUES (?,?,?,?,?,0,?,?,?,?,?)
        `).run(
            id,
            req.user.sub,
            mapel || null,
            konten?.trim() || '',
            parent_id || null,
            cleanUrl(attachment_url),
            cleanText(attachment_name, 180),
            cleanText(attachment_type, 80),
            now,
            now
        );

        return res.status(201).json({ success: true, message: 'Post berhasil dikirim.', data: { id } });
    } catch (err) {
        console.error('[Forum POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengirim post.' });
    }
});

// POST /api/lms/forum/:id/like — toggle like
router.post('/forum/:id/like', authenticate, (req, res) => {
    const db     = getDB();
    const postId = req.params.id;
    const userId = req.user.sub;

    try {
        const existing = db.prepare('SELECT 1 FROM forum_likes WHERE post_id = ? AND user_id = ?').get(postId, userId);
        if (existing) {
            db.prepare('DELETE FROM forum_likes WHERE post_id = ? AND user_id = ?').run(postId, userId);
            db.prepare('UPDATE forum_posts SET likes = likes - 1 WHERE id = ? AND likes > 0').run(postId);
            return res.json({ success: true, liked: false });
        } else {
            db.prepare('INSERT INTO forum_likes (post_id, user_id) VALUES (?, ?)').run(postId, userId);
            db.prepare('UPDATE forum_posts SET likes = likes + 1 WHERE id = ?').run(postId);
            return res.json({ success: true, liked: true });
        }
    } catch (err) {
        console.error('[Forum like]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memproses like.' });
    }
});

/* ══════════════════════════════════════════════
   NOTIFIKASI
   ══════════════════════════════════════════════ */

// GET /api/lms/notifikasi
router.get('/notifikasi', authenticate, (req, res) => {
    const db = getDB();
    try {
        const notifs = db.prepare(`
            SELECT * FROM notifikasi WHERE user_id = ?
            ORDER BY created_at DESC LIMIT 30
        `).all(req.user.sub);

        const unread = db.prepare('SELECT COUNT(*) as c FROM notifikasi WHERE user_id = ? AND is_read = 0').get(req.user.sub).c;

        return res.json({ success: true, data: notifs, unread });
    } catch (err) {
        console.error('[Notif GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil notifikasi.' });
    }
});

// PATCH /api/lms/notifikasi/read-all — tandai semua sudah dibaca
router.patch('/notifikasi/read-all', authenticate, (req, res) => {
    const db = getDB();
    try {
        db.prepare('UPDATE notifikasi SET is_read = 1 WHERE user_id = ?').run(req.user.sub);
        return res.json({ success: true, message: 'Semua notifikasi ditandai sudah dibaca.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal memperbarui notifikasi.' });
    }
});

module.exports = router;
