// routes/lms.js — NEW FILE
// Real API untuk LMS: forum, tugas, submission, materi, notifikasi
'use strict';

const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB    = require('../config/database');
const ENV      = require('../config/env');

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
const isStaffUser = user => STAFF.includes(user?.role);

function requireEnabled(flag, message) {
    return (_req, res, next) => {
        if (!flag) return res.status(403).json({ success: false, message });
        next();
    };
}

function normalizeList(value, maxItems = 20) {
    const raw = Array.isArray(value) ? value : String(value || '').split(',');
    return [...new Set(raw.map(v => cleanText(v, 80)).filter(Boolean))].slice(0, maxItems);
}

function syncTaskAverageToGradebook(db, { nisn, mapel, semester = 'genap' }) {
    if (!nisn || !mapel) return null;
    const avg = db.prepare(`
        SELECT AVG(s.nilai) as rata
        FROM submission_tugas s
        JOIN tugas_kelas t ON t.id = s.tugas_id
        WHERE s.nisn = ?
          AND t.mapel = ?
          AND t.is_active = 1
          AND COALESCE(t.show_score, 1) = 1
          AND s.status = 'dinilai'
          AND s.nilai IS NOT NULL
    `).get(nisn, mapel)?.rata;
    if (avg === undefined || avg === null) return null;

    const tugasAvg = Number(Number(avg).toFixed(2));
    const existing = db.prepare('SELECT id FROM nilai_siswa WHERE nisn = ? AND semester = ? AND mapel = ?')
        .get(nisn, semester, mapel);
    if (existing) {
        db.prepare('UPDATE nilai_siswa SET tugas = ? WHERE id = ?').run(tugasAvg, existing.id);
    } else {
        db.prepare(`
            INSERT INTO nilai_siswa (id, nisn, semester, mapel, uh, uts, uas, tugas, kkm, created_at)
            VALUES (?, ?, ?, ?, 0, 0, 0, ?, 70, ?)
        `).run(uuidv4(), nisn, semester, mapel, tugasAvg, nowISO());
    }
    return tugasAvg;
}

function ensureLmsSchema(db) {
    const taskCols = db.pragma('table_info(tugas_kelas)').map(c => c.name);
    if (!taskCols.includes('assignment_group_id')) db.exec('ALTER TABLE tugas_kelas ADD COLUMN assignment_group_id TEXT');
    if (!taskCols.includes('target_nisn')) db.exec('ALTER TABLE tugas_kelas ADD COLUMN target_nisn TEXT');
    if (!taskCols.includes('show_score')) db.exec('ALTER TABLE tugas_kelas ADD COLUMN show_score INTEGER NOT NULL DEFAULT 1');

    const forumCols = db.pragma('table_info(forum_posts)').map(c => c.name);
    if (!forumCols.includes('is_pinned')) db.exec('ALTER TABLE forum_posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
    if (!forumCols.includes('pinned_at')) db.exec('ALTER TABLE forum_posts ADD COLUMN pinned_at TEXT');
    if (!forumCols.includes('pinned_by')) db.exec('ALTER TABLE forum_posts ADD COLUMN pinned_by TEXT');

    const uploadCols = db.pragma('table_info(file_uploads)').map(c => c.name);
    if (!uploadCols.includes('materi_title')) db.exec('ALTER TABLE file_uploads ADD COLUMN materi_title TEXT');
    if (!uploadCols.includes('materi_desc')) db.exec('ALTER TABLE file_uploads ADD COLUMN materi_desc TEXT');
    if (!uploadCols.includes('mapel')) db.exec('ALTER TABLE file_uploads ADD COLUMN mapel TEXT');
    if (!uploadCols.includes('target_type')) db.exec('ALTER TABLE file_uploads ADD COLUMN target_type TEXT');
    if (!uploadCols.includes('target_kelas')) db.exec('ALTER TABLE file_uploads ADD COLUMN target_kelas TEXT');
    if (!uploadCols.includes('target_nisn')) db.exec('ALTER TABLE file_uploads ADD COLUMN target_nisn TEXT');
}

function getUserClass(db, user) {
    if (!user?.nisn) return null;
    return db.prepare('SELECT kelas FROM siswa_profil WHERE nisn = ?').get(user.nisn)?.kelas || null;
}

function canAccessForumPost(db, user, postId) {
    const post = db.prepare('SELECT id, visibility, kelas FROM forum_posts WHERE id = ?').get(postId);
    if (!post) return { ok: false, code: 404, message: 'Diskusi tidak ditemukan.' };
    if (post.visibility !== 'class') return { ok: true, post };
    if (isStaffUser(user)) return { ok: true, post };
    const kelas = getUserClass(db, user);
    if (kelas && kelas === post.kelas) return { ok: true, post };
    return { ok: false, code: 403, message: 'Diskusi ini hanya untuk kelas terkait.' };
}

/* ══════════════════════════════════════════════
   TUGAS
   ══════════════════════════════════════════════ */

// GET /api/lms/tugas?kelas=XI TKJ 1 — ambil tugas untuk kelas siswa
router.get('/tugas', authenticate, (req, res) => {
    const db = getDB();
    try {
        ensureLmsSchema(db);
        if (isStaffUser(req.user)) {
            const canSeeAllTasks = ['super_admin','kepala_sekolah','wakil_kepala_sekolah'].includes(req.user.role);
            const tugas = db.prepare(`
                SELECT t.*, u.nama_lengkap as guru_nama,
                       COUNT(DISTINCT CASE WHEN t.target_nisn IS NOT NULL THEN target_user.nisn ELSE su.nisn END) as total_siswa,
                   COUNT(DISTINCT s.nisn) as total_selesai,
                   COUNT(DISTINCT CASE WHEN s.status = 'dinilai' THEN s.nisn END) as total_direview
                FROM tugas_kelas t
                LEFT JOIN users u ON t.created_by = u.id
                LEFT JOIN siswa_profil sp ON sp.kelas = t.kelas AND t.target_nisn IS NULL
                LEFT JOIN users su ON su.nisn = sp.nisn AND su.role = 'siswa' AND su.is_active = 1
                LEFT JOIN users target_user ON target_user.nisn = t.target_nisn AND target_user.role = 'siswa' AND target_user.is_active = 1
                LEFT JOIN submission_tugas s ON s.tugas_id = t.id AND s.nisn = COALESCE(t.target_nisn, sp.nisn)
                WHERE ${canSeeAllTasks ? '1=1' : 't.created_by = ?'} AND t.is_active = 1
                GROUP BY t.id
                ORDER BY t.created_at DESC, t.deadline ASC
            `).all(...(canSeeAllTasks ? [] : [req.user.sub]));

            return res.json({ success: true, data: tugas });
        }

        const kelas = req.query.kelas
            || db.prepare('SELECT kelas FROM siswa_profil WHERE nisn = ?').get(req.user.nisn)?.kelas
            || 'XI TKJ 1';

        const tugas = db.prepare(`
            SELECT t.*, u.nama_lengkap as guru_nama,
                   s.id as submission_id, s.status as submission_status,
                   s.submitted_at,
                   CASE WHEN COALESCE(t.show_score, 1) = 1 THEN s.nilai ELSE NULL END as submission_nilai,
                   CASE WHEN COALESCE(t.show_score, 1) = 1 THEN s.feedback ELSE NULL END as submission_feedback
            FROM tugas_kelas t
            LEFT JOIN users u ON t.created_by = u.id
            LEFT JOIN submission_tugas s ON s.tugas_id = t.id AND s.nisn = ?
            WHERE ((t.target_nisn IS NULL AND t.kelas = ?) OR t.target_nisn = ?) AND t.is_active = 1
            ORDER BY t.deadline ASC
        `).all(req.user.nisn || '', kelas, req.user.nisn || '');

        return res.json({ success: true, data: tugas });
    } catch (err) {
        console.error('[LMS tugas GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data tugas.' });
    }
});

// POST /api/lms/tugas — guru buat tugas baru
router.post('/tugas', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const judul = cleanText(req.body.judul, 160);
    const deskripsi = cleanText(req.body.deskripsi, 2000);
    const kelasList = normalizeList(req.body.kelas_list || req.body.kelas);
    const mapelList = normalizeList(req.body.mapel_list || req.body.mapel);
    const targetNisnList = normalizeList(req.body.target_nisn_list || req.body.target_nisn, 40)
        .map(n => String(n).replace(/\D/g, '').slice(0, 10))
        .filter(n => n.length === 10);
    const deadline = cleanText(req.body.deadline, 40);
    const showScore = (req.body.show_score === false || req.body.show_score === 0 || req.body.show_score === '0') ? 0 : 1;

    if (!judul || !mapelList.length || (!kelasList.length && !targetNisnList.length)) {
        return res.status(400).json({ success: false, message: 'Judul, minimal 1 mapel, dan target kelas atau NISN siswa wajib diisi.' });
    }
    if ((kelasList.length + targetNisnList.length) * mapelList.length > 80) {
        return res.status(400).json({ success: false, message: 'Target terlalu banyak. Maksimal 80 kombinasi target-mapel per publish.' });
    }
    try {
        ensureLmsSchema(db);
        const groupId = uuidv4();
        const now = nowISO();
        const ids = [];
        const insertTask = db.prepare(`
            INSERT INTO tugas_kelas (id,judul,deskripsi,mapel,kelas,deadline,assignment_group_id,target_nisn,show_score,created_by,is_active,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)
        `);
        const siswaStmt = db.prepare(`
            SELECT DISTINCT u.id FROM users u
            JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE sp.kelas = ? AND u.role = 'siswa' AND u.is_active = 1
        `);
        const targetSiswaStmt = db.prepare(`
            SELECT u.id, u.nisn, sp.kelas
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE u.nisn = ? AND u.role = 'siswa' AND u.is_active = 1
        `);

        const insertNotif = db.prepare(`
            INSERT INTO notifikasi (id,user_id,judul,pesan,tipe,link,created_at)
            VALUES (?,?,?,?,?,?,?)
        `);
        db.transaction(() => {
            for (const kelas of kelasList) {
                for (const mapel of mapelList) {
                    const id = uuidv4();
                    ids.push(id);
                    insertTask.run(id, judul, deskripsi, mapel, kelas, deadline, groupId, null, showScore, req.user.sub, now, now);
                    for (const s of siswaStmt.all(kelas)) {
                        insertNotif.run(
                            uuidv4(), s.id,
                            `Tugas Baru: ${judul}`,
                            `${mapel} - ${kelas} - Deadline: ${deadline || 'Tidak ditentukan'}`,
                            'tugas', '/LMS.html#tugas', now
                        );
                    }
                }
            }
            for (const nisn of targetNisnList) {
                const target = targetSiswaStmt.get(nisn);
                if (!target) continue;
                for (const mapel of mapelList) {
                    const id = uuidv4();
                    ids.push(id);
                    const kelas = target.kelas || 'Individu';
                    insertTask.run(id, judul, deskripsi, mapel, kelas, deadline, groupId, nisn, showScore, req.user.sub, now, now);
                    insertNotif.run(
                        uuidv4(), target.id,
                        `Tugas Individu: ${judul}`,
                        `${mapel} - ${kelas} - Deadline: ${deadline || 'Tidak ditentukan'}`,
                        'tugas', '/LMS.html#tugas', now
                    );
                }
            }
        })();

        return res.status(201).json({
            success: true,
            message: `Tugas berhasil diterbitkan ke ${kelasList.length} kelas, ${targetNisnList.length} siswa, dan ${mapelList.length} mapel.`,
            data: { ids, assignment_group_id: groupId }
        });
    } catch (err) {
        console.error('[LMS tugas POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat tugas.' });
    }
});

router.get('/tugas/progress', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        ensureLmsSchema(db);
        const canSeeAllTasks = ['super_admin','kepala_sekolah','wakil_kepala_sekolah'].includes(req.user.role);
        const rows = db.prepare(`
            SELECT t.id, t.assignment_group_id, t.judul, t.mapel, t.kelas, t.deadline, t.created_at, COALESCE(t.show_score, 1) as show_score,
                   COUNT(DISTINCT CASE WHEN t.target_nisn IS NOT NULL THEN target_user.nisn ELSE u.nisn END) as total_siswa,
                   COUNT(DISTINCT s.nisn) as total_selesai,
                   COUNT(DISTINCT CASE WHEN s.status = 'dinilai' THEN s.nisn END) as total_direview,
                   GROUP_CONCAT(CASE WHEN COALESCE(t.target_nisn, u.nisn) IS NOT NULL AND s.id IS NULL THEN COALESCE(t.target_nisn, sp.nisn) || ' - ' || COALESCE(target_user.nama_lengkap, u.nama_lengkap, t.target_nisn, sp.nisn) END, '||') as belum_list
            FROM tugas_kelas t
            LEFT JOIN siswa_profil sp ON sp.kelas = t.kelas AND t.target_nisn IS NULL
            LEFT JOIN users u ON u.nisn = sp.nisn AND u.role = 'siswa' AND u.is_active = 1
            LEFT JOIN users target_user ON target_user.nisn = t.target_nisn AND target_user.role = 'siswa' AND target_user.is_active = 1
            LEFT JOIN submission_tugas s ON s.tugas_id = t.id AND s.nisn = COALESCE(t.target_nisn, sp.nisn)
            WHERE ${canSeeAllTasks ? '1=1' : 't.created_by = ?'} AND t.is_active = 1
            GROUP BY t.id
            ORDER BY t.created_at DESC, t.kelas ASC, t.mapel ASC
            LIMIT 200
        `).all(...(canSeeAllTasks ? [] : [req.user.sub])).map(row => ({
            ...row,
            total_siswa: Number(row.total_siswa || 0),
            total_selesai: Number(row.total_selesai || 0),
            total_direview: Number(row.total_direview || 0),
            belum: row.belum_list ? row.belum_list.split('||').filter(Boolean).slice(0, 12) : []
        }));
        return res.json({ success: true, data: rows });
    } catch (err) {
        console.error('[LMS tugas progress]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil progress tugas.' });
    }
});

router.get('/tugas/:id/submissions', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        ensureLmsSchema(db);
        const task = db.prepare(`
            SELECT t.id, t.judul, t.mapel, t.kelas, t.deadline, t.created_by, COALESCE(t.show_score, 1) as show_score
            FROM tugas_kelas t
            WHERE t.id = ? AND t.is_active = 1
        `).get(req.params.id);
        if (!task) return res.status(404).json({ success:false, message:'Tugas tidak ditemukan.' });
        if (task.created_by !== req.user.sub && !['super_admin','kepala_sekolah','wakil_kepala_sekolah'].includes(req.user.role)) {
            return res.status(403).json({ success:false, message:'Anda tidak punya akses meninjau tugas ini.' });
        }
        const submissions = db.prepare(`
            SELECT s.id, s.nisn, s.jawaban, s.file_url, s.status, s.nilai, s.feedback, s.submitted_at,
                   u.nama_lengkap
            FROM submission_tugas s
            LEFT JOIN users u ON u.nisn = s.nisn
            WHERE s.tugas_id = ?
            ORDER BY s.submitted_at DESC
        `).all(req.params.id);
        return res.json({ success:true, data:{ task, submissions } });
    } catch (err) {
        console.error('[LMS tugas submissions]', err.message);
        return res.status(500).json({ success:false, message:'Gagal mengambil submission tugas.' });
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
    const { nilai, feedback, semester = 'genap' } = req.body;
    if (nilai === undefined) return res.status(400).json({ success: false, message: 'nilai wajib ada.' });
    try {
        const task = db.prepare('SELECT id, mapel, created_by, COALESCE(show_score, 1) as show_score FROM tugas_kelas WHERE id = ? AND is_active = 1').get(req.params.tugasId);
        if (!task) return res.status(404).json({ success:false, message:'Tugas tidak ditemukan.' });
        if (task.created_by !== req.user.sub && !['super_admin','kepala_sekolah','wakil_kepala_sekolah'].includes(req.user.role)) {
            return res.status(403).json({ success:false, message:'Anda tidak punya akses menilai tugas ini.' });
        }
        let syncedTaskAverage = null;
        const info = db.transaction(() => {
            const result = db.prepare(`
                UPDATE submission_tugas SET nilai = ?, feedback = ?, status = 'dinilai' WHERE tugas_id = ? AND nisn = ?
            `).run(parseFloat(nilai), feedback || null, req.params.tugasId, req.params.nisn);
            if (result.changes && Number(task.show_score) !== 0) {
                syncedTaskAverage = syncTaskAverageToGradebook(db, {
                    nisn: req.params.nisn,
                    mapel: task.mapel,
                    semester: cleanText(semester, 20) || 'genap',
                });
            }
            return result;
        })();
        if (!info.changes) return res.status(404).json({ success:false, message:'Submission siswa belum ditemukan.' });
        return res.json({
            success: true,
            message: Number(task.show_score) === 0
                ? 'Review dan nilai tersimpan sebagai arsip guru. Nilai tidak ditampilkan ke siswa dan tidak masuk Nilai Saya.'
                : syncedTaskAverage === null
                ? 'Nilai berhasil disimpan.'
                : `Nilai berhasil disimpan dan rekap Nilai Saya diperbarui. Rata-rata tugas ${task.mapel}: ${syncedTaskAverage}.`,
            data: { synced_task_average: syncedTaskAverage, mapel: task.mapel, semester: cleanText(semester, 20) || 'genap', show_score: Number(task.show_score) !== 0 }
        });
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
        ensureLmsSchema(db);
        const { mapel, search, target = '' } = req.query;
        const conds  = ["f.category = 'materi'"];
        const params = [];
        const userClass = getUserClass(db, req.user);

        if (mapel)  { conds.push('(f.mapel = ? OR f.entity_id = ?)'); params.push(mapel, mapel); }
        if (search) {
            const s = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
            conds.push('(f.original_name LIKE ? OR f.entity_id LIKE ? OR f.materi_title LIKE ? OR f.mapel LIKE ? OR f.target_kelas LIKE ? OR f.target_nisn LIKE ?)');
            params.push(s, s, s, s, s, s);
        }
        if (!isStaffUser(req.user)) {
            conds.push(`(
                f.target_type IS NULL
                OR f.target_type = 'school'
                OR (f.target_type = 'class' AND f.target_kelas = ?)
                OR (f.target_type = 'student' AND f.target_nisn = ?)
            )`);
            params.push(userClass || '', req.user.nisn || '');
        } else if (target === 'class') {
            conds.push("f.target_type = 'class'");
        } else if (target === 'student') {
            conds.push("f.target_type = 'student'");
        } else if (target === 'school') {
            conds.push("f.target_type = 'school'");
        }

        const where = 'WHERE ' + conds.join(' AND ');
        const files = db.prepare(`
            SELECT f.id, f.original_name, f.file_url, f.mime_type,
                   f.size_bytes, COALESCE(f.mapel, f.entity_id) as mapel,
                   f.materi_title, f.materi_desc, f.target_type, f.target_kelas, f.target_nisn,
                   f.entity_id, f.created_at,
                   u.nama_lengkap as uploaded_by
            FROM file_uploads f
            LEFT JOIN users u ON f.uploader_id = u.id
            ${where}
            ORDER BY f.created_at DESC
        `).all(...params);

        // Format ukuran file
        const formatted = files.map(f => ({
            ...f,
            title: f.materi_title || f.original_name,
            deskripsi: f.materi_desc || null,
            target_label: f.target_type === 'student'
                ? `Siswa ${f.target_nisn || '-'}`
                : f.target_type === 'class'
                    ? `Kelas ${f.target_kelas || f.entity_id || '-'}`
                    : f.target_type === 'school'
                        ? 'Semua siswa'
                        : (f.entity_id ? `Target ${f.entity_id}` : 'Umum'),
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

router.use('/forum', requireEnabled(
    ENV.FEATURE_FORUM_CHAT,
    'Forum diskusi sedang dimatikan untuk mode hosting hemat. Admin bisa mengaktifkan FEATURE_FORUM_CHAT=true jika server siap.'
));

// GET /api/lms/forum?mapel=TKJ&scope=school|class
router.get('/forum', authenticate, (req, res) => {
    const db = getDB();
    try {
        ensureLmsSchema(db);
        const { mapel, scope = 'school', page = 1, limit = 20 } = req.query;
        const offset = (parseInt(page) - 1) * parseInt(limit);
        const conds  = ['fp.parent_id IS NULL'];
        const params = [];
        const userClass = getUserClass(db, req.user);

        if (mapel) { conds.push('fp.mapel = ?'); params.push(mapel); }
        if (scope === 'class') {
            if (!isStaffUser(req.user) && !userClass) {
                return res.json({ success: true, data: [], user_class: null });
            }
            conds.push('fp.visibility = ?');
            params.push('class');
            if (!isStaffUser(req.user)) {
                conds.push('fp.kelas = ?');
                params.push(userClass);
            }
        } else if (!isStaffUser(req.user)) {
            conds.push("(fp.visibility = 'school' OR (fp.visibility = 'class' AND fp.kelas = ?))");
            params.push(userClass || '');
        }

        const posts = db.prepare(`
            SELECT fp.id, fp.konten, fp.mapel, fp.visibility, fp.kelas, fp.likes, fp.attachment_url, fp.attachment_name, fp.attachment_type,
                   fp.is_pinned, fp.pinned_at, fp.created_at,
                   u.id as user_id, u.nama_lengkap, u.role,
                   (SELECT COUNT(*) FROM forum_posts r WHERE r.parent_id = fp.id) as total_balasan,
                   EXISTS(SELECT 1 FROM forum_likes fl WHERE fl.post_id = fp.id AND fl.user_id = ?) as sudah_like
            FROM forum_posts fp
            JOIN users u ON fp.user_id = u.id
            WHERE ${conds.join(' AND ')}
            ORDER BY fp.is_pinned DESC, COALESCE(fp.pinned_at, fp.created_at) DESC, fp.created_at DESC
            LIMIT ? OFFSET ?
        `).all(req.user.sub, ...params, parseInt(limit), offset);

        const repliesStmt = db.prepare(`
            SELECT fp.id, fp.parent_id, fp.konten, fp.visibility, fp.kelas, fp.attachment_url, fp.attachment_name, fp.attachment_type, fp.created_at,
                   u.nama_lengkap, u.role
            FROM forum_posts fp
            JOIN users u ON fp.user_id = u.id
            WHERE fp.parent_id = ?
            ORDER BY fp.created_at ASC
            LIMIT 5
        `);
        return res.json({ success: true, data: posts.map(post => ({ ...post, replies: repliesStmt.all(post.id) })), user_class: userClass });
    } catch (err) {
        console.error('[Forum GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil forum.' });
    }
});

// POST /api/lms/forum — buat post baru
router.post('/forum', authenticate, (req, res) => {
    const db = getDB();
    const { konten, mapel, parent_id, visibility = 'school', kelas, attachment_url, attachment_name, attachment_type } = req.body;
    if (!konten?.trim() && !attachment_url) return res.status(400).json({ success: false, message: 'Konten atau lampiran wajib diisi.' });

    try {
        ensureLmsSchema(db);
        const id  = uuidv4();
        const now = nowISO();
        const userClass = getUserClass(db, req.user);
        let postVisibility = visibility === 'class' ? 'class' : 'school';
        let postClass = postVisibility === 'class'
            ? (isStaffUser(req.user) ? cleanText(kelas, 80) : userClass)
            : null;
        if (postVisibility === 'class' && isStaffUser(req.user) && !postClass) {
            return res.status(400).json({ success: false, message: 'Pilih kelas target untuk diskusi kelas.' });
        }
        if (postVisibility === 'class' && !isStaffUser(req.user) && !userClass) {
            return res.status(400).json({ success: false, message: 'Profil kelas kamu belum lengkap untuk diskusi kelas.' });
        }
        if (parent_id) {
            const access = canAccessForumPost(db, req.user, parent_id);
            if (!access.ok) return res.status(access.code).json({ success: false, message: access.message });
            postVisibility = access.post.visibility || 'school';
            postClass = access.post.kelas || null;
        }
        db.prepare(`
            INSERT INTO forum_posts
            (id,user_id,mapel,visibility,kelas,konten,parent_id,likes,attachment_url,attachment_name,attachment_type,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?)
        `).run(
            id,
            req.user.sub,
            mapel || null,
            postVisibility,
            postClass,
            cleanText(konten, parent_id ? ENV.FORUM_MAX_COMMENT_LENGTH : ENV.FORUM_MAX_POST_LENGTH) || '',
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
        const access = canAccessForumPost(db, req.user, postId);
        if (!access.ok) return res.status(access.code).json({ success: false, message: access.message });
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

router.patch('/forum/:id/pin', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const postId = req.params.id;
    try {
        ensureLmsSchema(db);
        const post = db.prepare('SELECT id, is_pinned FROM forum_posts WHERE id = ? AND parent_id IS NULL').get(postId);
        if (!post) return res.status(404).json({ success: false, message: 'Diskusi tidak ditemukan.' });
        const shouldPin = req.body.pinned === undefined ? !post.is_pinned : !!req.body.pinned;
        db.prepare(`
            UPDATE forum_posts
            SET is_pinned = ?, pinned_at = ?, pinned_by = ?, updated_at = ?
            WHERE id = ?
        `).run(shouldPin ? 1 : 0, shouldPin ? nowISO() : null, shouldPin ? req.user.sub : null, nowISO(), postId);
        return res.json({ success: true, pinned: shouldPin, message: shouldPin ? 'Diskusi dipin.' : 'Pin diskusi dilepas.' });
    } catch (err) {
        console.error('[Forum pin]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengubah pin diskusi.' });
    }
});

/* ══════════════════════════════════════════════
   CHAT PRIBADI LMS
   ══════════════════════════════════════════════ */

router.use('/contacts', requireEnabled(
    ENV.FEATURE_FORUM_CHAT,
    'Chat pribadi LMS sedang dimatikan untuk mode hosting hemat.'
));
router.use('/private-chat', requireEnabled(
    ENV.FEATURE_FORUM_CHAT,
    'Chat pribadi LMS sedang dimatikan untuk mode hosting hemat.'
));

router.get('/contacts', authenticate, (req, res) => {
    const db = getDB();
    try {
        const myClass = getUserClass(db, req.user);
        const params = [req.user.sub];
        const conds = ['u.id != ?', "u.role = 'siswa'", 'u.is_active = 1'];
        if (!isStaffUser(req.user) && myClass) {
            conds.push('sp.kelas = ?');
            params.push(myClass);
        }
        const rows = db.prepare(`
            SELECT u.id, u.nama_lengkap, u.role, u.nisn, sp.kelas,
                   (
                       SELECT message FROM lms_private_messages pm
                       WHERE (pm.sender_id = u.id AND pm.receiver_id = ?)
                          OR (pm.sender_id = ? AND pm.receiver_id = u.id)
                       ORDER BY pm.created_at DESC LIMIT 1
                   ) as last_message,
                   (
                       SELECT created_at FROM lms_private_messages pm
                       WHERE (pm.sender_id = u.id AND pm.receiver_id = ?)
                          OR (pm.sender_id = ? AND pm.receiver_id = u.id)
                       ORDER BY pm.created_at DESC LIMIT 1
                   ) as last_at,
                   (
                       SELECT COUNT(*) FROM lms_private_messages pm
                       WHERE pm.sender_id = u.id AND pm.receiver_id = ? AND pm.read_at IS NULL
                   ) as unread
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE ${conds.join(' AND ')}
            ORDER BY last_at IS NULL ASC, last_at DESC, u.nama_lengkap ASC
            LIMIT 80
        `).all(req.user.sub, req.user.sub, req.user.sub, req.user.sub, req.user.sub, ...params);
        return res.json({ success: true, data: rows, user_class: myClass });
    } catch (err) {
        console.error('[LMS contacts]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil kontak chat.' });
    }
});

router.get('/private-chat/:userId', authenticate, (req, res) => {
    const db = getDB();
    const peerId = req.params.userId;
    try {
        const peer = db.prepare(`
            SELECT u.id, u.nama_lengkap, u.role, u.nisn, sp.kelas
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE u.id = ? AND u.is_active = 1
        `).get(peerId);
        if (!peer) return res.status(404).json({ success: false, message: 'Kontak tidak ditemukan.' });
        if (!isStaffUser(req.user) && peer.role !== 'siswa') {
            return res.status(403).json({ success: false, message: 'Chat pribadi siswa hanya untuk sesama siswa.' });
        }
        db.prepare('UPDATE lms_private_messages SET read_at = ? WHERE sender_id = ? AND receiver_id = ? AND read_at IS NULL')
            .run(nowISO(), peerId, req.user.sub);
        const rows = db.prepare(`
            SELECT pm.*, su.nama_lengkap as sender_name
            FROM lms_private_messages pm
            JOIN users su ON su.id = pm.sender_id
            WHERE (pm.sender_id = ? AND pm.receiver_id = ?)
               OR (pm.sender_id = ? AND pm.receiver_id = ?)
            ORDER BY pm.created_at ASC
            LIMIT 200
        `).all(req.user.sub, peerId, peerId, req.user.sub);
        return res.json({ success: true, data: { peer, messages: rows, current_user_id: req.user.sub } });
    } catch (err) {
        console.error('[LMS private chat GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memuat chat pribadi.' });
    }
});

router.post('/private-chat/:userId', authenticate, (req, res) => {
    const db = getDB();
    const peerId = req.params.userId;
    const message = cleanText(req.body.message, 1000);
    if (!message) return res.status(400).json({ success: false, message: 'Pesan wajib diisi.' });
    try {
        const peer = db.prepare('SELECT id, role FROM users WHERE id = ? AND is_active = 1').get(peerId);
        if (!peer) return res.status(404).json({ success: false, message: 'Kontak tidak ditemukan.' });
        if (peer.id === req.user.sub) return res.status(400).json({ success: false, message: 'Tidak bisa mengirim pesan ke diri sendiri.' });
        if (!isStaffUser(req.user) && peer.role !== 'siswa') {
            return res.status(403).json({ success: false, message: 'Chat pribadi siswa hanya untuk sesama siswa.' });
        }
        const id = uuidv4();
        db.prepare(`
            INSERT INTO lms_private_messages (id, sender_id, receiver_id, message, created_at)
            VALUES (?, ?, ?, ?, ?)
        `).run(id, req.user.sub, peerId, message, nowISO());
        return res.status(201).json({ success: true, message: 'Pesan terkirim.', data: { id } });
    } catch (err) {
        console.error('[LMS private chat POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengirim pesan.' });
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
