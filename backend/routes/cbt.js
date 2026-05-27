// routes/cbt.js
// CBT API: exam sessions, class tokens, secure question delivery, server-side grading.
'use strict';

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB    = require('../config/database');
const { getSchoolClasses } = require('../utils/schoolClasses');

const STAFF = ['guru', 'tata_usaha', 'kepala_sekolah', 'super_admin'];
const VALID_MAPEL = ['matematika', 'bindo', 'basing', 'pkk', 'sejarah', 'produktif'];
const VALID_STATUS = ['draft', 'open', 'closed', 'archived'];

function nowISO() {
    return new Date().toISOString();
}

function generateCbtToken() {
    return crypto.randomBytes(16).toString('hex');
}

function getExpiry(minutes = 180) {
    return new Date(Date.now() + minutes * 60_000).toISOString();
}

function isExpired(iso) {
    return iso && new Date(iso).getTime() <= Date.now();
}

function validateMapel(mapel) {
    return VALID_MAPEL.includes(mapel);
}

function sanitizeQuestion(row) {
    return {
        id: row.id,
        soal: row.soal,
        opsi: [row.opsi_a, row.opsi_b, row.opsi_c, row.opsi_d, row.opsi_e].filter(Boolean),
    };
}

function cleanText(value, max = 240) {
    if (value === undefined || value === null) return null;
    return String(value).replace(/[<>]/g, '').trim().slice(0, max) || null;
}

function notifyStudents(db, students, { judul, pesan, tipe = 'cbt', link = '/LMS.html' }) {
    if (!students.length) return 0;
    const insert = db.prepare(`
        INSERT INTO notifikasi (id,user_id,judul,pesan,tipe,link,created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    let count = 0;
    for (const s of students) {
        if (!s.id) continue;
        insert.run(uuidv4(), s.id, cleanText(judul, 120), cleanText(pesan, 500), tipe, link, nowISO());
        count++;
    }
    return count;
}

function getActiveStudentsByClass(db, kelas) {
    return db.prepare(`
        SELECT u.id, u.nisn, u.nama_lengkap
        FROM users u
        JOIN siswa_profil sp ON sp.nisn = u.nisn
        WHERE sp.kelas = ? AND u.role = 'siswa' AND u.is_active = 1 AND u.nisn IS NOT NULL
        ORDER BY u.nama_lengkap ASC
    `).all(kelas);
}

function getExam(db, examId) {
    if (!examId) return null;
    return db.prepare('SELECT * FROM cbt_exams WHERE id = ?').get(examId);
}

function assertExamAvailable(exam) {
    if (!exam) return { ok: true };
    if (exam.status !== 'open') {
        return { ok: false, code: 403, message: 'Sesi ujian belum dibuka atau sudah ditutup.' };
    }
    if (exam.start_at && new Date(exam.start_at).getTime() > Date.now()) {
        return { ok: false, code: 403, message: 'Sesi ujian belum dimulai.' };
    }
    if (exam.end_at && new Date(exam.end_at).getTime() <= Date.now()) {
        return { ok: false, code: 403, message: 'Sesi ujian sudah berakhir.' };
    }
    return { ok: true };
}

function findValidSession(db, nisn, token) {
    if (!nisn || !token || !/^[a-f0-9]{32}$/i.test(token)) return null;
    const session = db.prepare(`
        SELECT cs.*, u.nama_lengkap, sp.kelas as siswa_kelas
        FROM cbt_sessions cs
        JOIN users u ON cs.nisn = u.nisn
        LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
        WHERE cs.token = ? AND cs.nisn = ? AND cs.used = 0
    `).get(token.toLowerCase(), nisn);
    if (!session || isExpired(session.expires_at)) return null;
    return session;
}

function assignQuestionsIfNeeded(db, exam) {
    if (!exam) return [];

    const existing = db.prepare(`
        SELECT b.id, b.soal, b.opsi_a, b.opsi_b, b.opsi_c, b.opsi_d, b.opsi_e
        FROM cbt_exam_questions eq
        JOIN bank_soal b ON b.id = eq.question_id
        WHERE eq.exam_id = ? AND b.is_active = 1
        ORDER BY eq.urutan ASC
    `).all(exam.id);
    if (existing.length) return existing;

    const count = Math.max(1, Math.min(parseInt(exam.question_count) || 40, 100));
    const rows = db.prepare(`
        SELECT id, soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e
        FROM bank_soal
        WHERE mapel = ? AND is_active = 1
        ORDER BY RANDOM()
        LIMIT ?
    `).all(exam.mapel, count);

    if (!rows.length) return [];

    const insert = db.prepare(`
        INSERT OR IGNORE INTO cbt_exam_questions (id, exam_id, question_id, urutan, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    const tx = db.transaction(() => {
        rows.forEach((q, index) => insert.run(uuidv4(), exam.id, q.id, index + 1, nowISO()));
    });
    tx();

    return rows;
}

function listExamQuestionsForGrading(db, examId, mapel) {
    if (examId) {
        const rows = db.prepare(`
            SELECT b.id, b.jawaban
            FROM cbt_exam_questions eq
            JOIN bank_soal b ON b.id = eq.question_id
            WHERE eq.exam_id = ? AND b.is_active = 1
            ORDER BY eq.urutan ASC
        `).all(examId);
        if (rows.length) return rows;
    }
    return db.prepare(`
        SELECT id, jawaban
        FROM bank_soal
        WHERE mapel = ? AND is_active = 1
        ORDER BY id
    `).all(mapel);
}

/* ── GET /api/cbt/kelas — class list for admin CBT ───────────── */
router.get('/kelas', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        const counts = db.prepare(`
            SELECT kelas, COUNT(*) as total_siswa
            FROM siswa_profil
            WHERE kelas IS NOT NULL AND kelas != ''
            GROUP BY kelas
            ORDER BY kelas ASC
        `).all().reduce((acc, row) => {
            acc[row.kelas] = row.total_siswa || 0;
            return acc;
        }, {});
        const data = getSchoolClasses().map(k => ({ ...k, total_siswa: counts[k.kelas] || 0 }));
        return res.json({ success: true, data });
    } catch (err) {
        console.error('[CBT kelas]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data kelas.' });
    }
});

/* ── CRUD bank soal CBT ────────────────────────────────────── */
router.get('/bank-soal', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { mapel, search = '', page = 1, limit = 50 } = req.query;
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 50, 1), 100);
    const offset = (pageInt - 1) * limitInt;

    const conds = [];
    const params = [];
    if (mapel) {
        if (!validateMapel(mapel)) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
        conds.push('mapel = ?');
        params.push(mapel);
    }
    if (search) {
        conds.push('(soal LIKE ? OR jenis_ujian LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    try {
        const rows = db.prepare(`
            SELECT id,mapel,jenis_ujian,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,tingkat,is_active,created_at,updated_at
            FROM bank_soal
            ${where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limitInt, offset);
        const total = db.prepare(`SELECT COUNT(*) as c FROM bank_soal ${where}`).get(...params)?.c || 0;
        return res.json({
            success: true,
            data: { questions: rows, pagination: { total, page: pageInt, limit: limitInt, totalPages: Math.ceil(total / limitInt) } }
        });
    } catch (err) {
        console.error('[CBT bank GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil bank soal.' });
    }
});

router.post('/bank-soal', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { mapel, jenis_ujian = 'CBT', soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e = null, jawaban, tingkat = 'sedang' } = req.body;
    if (!validateMapel(mapel)) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
    if (!soal || !opsi_a || !opsi_b || !opsi_c || !opsi_d || !jawaban) {
        return res.status(400).json({ success: false, message: 'Soal, opsi A-D, dan jawaban wajib diisi.' });
    }
    if (!['A', 'B', 'C', 'D', 'E'].includes(String(jawaban).toUpperCase())) {
        return res.status(400).json({ success: false, message: 'Jawaban harus A, B, C, D, atau E.' });
    }
    if (String(jawaban).toUpperCase() === 'E' && !opsi_e) {
        return res.status(400).json({ success: false, message: 'Opsi E wajib diisi jika jawaban E.' });
    }

    try {
        const id = uuidv4();
        const now = nowISO();
        db.prepare(`
            INSERT INTO bank_soal
            (id,mapel,jenis_ujian,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,tingkat,created_by,is_active,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
        `).run(
            id, mapel, String(jenis_ujian || 'CBT').trim(), String(soal).trim(),
            String(opsi_a).trim(), String(opsi_b).trim(), String(opsi_c).trim(), String(opsi_d).trim(),
            opsi_e ? String(opsi_e).trim() : null,
            String(jawaban).toUpperCase(), String(tingkat || 'sedang').trim(), req.user.sub, now, now
        );
        return res.status(201).json({ success: true, message: 'Soal CBT berhasil ditambahkan.', data: { id } });
    } catch (err) {
        console.error('[CBT bank POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menambahkan soal CBT.' });
    }
});

router.put('/bank-soal/:id', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const existing = db.prepare('SELECT id FROM bank_soal WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Soal tidak ditemukan.' });

    const allowed = ['mapel','jenis_ujian','soal','opsi_a','opsi_b','opsi_c','opsi_d','opsi_e','jawaban','tingkat','is_active'];
    const fields = [];
    const vals = { id: req.params.id, now: nowISO() };
    for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        if (key === 'mapel' && !validateMapel(req.body[key])) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
        if (key === 'jawaban' && !['A','B','C','D','E'].includes(String(req.body[key]).toUpperCase())) {
            return res.status(400).json({ success: false, message: 'Jawaban harus A-E.' });
        }
        vals[key] = key === 'jawaban' ? String(req.body[key]).toUpperCase() : req.body[key];
        fields.push(`${key} = @${key}`);
    }
    if (!fields.length) return res.status(400).json({ success: false, message: 'Tidak ada perubahan.' });
    fields.push('updated_at = @now');

    try {
        db.prepare(`UPDATE bank_soal SET ${fields.join(', ')} WHERE id = @id`).run(vals);
        return res.json({ success: true, message: 'Soal CBT berhasil diperbarui.' });
    } catch (err) {
        console.error('[CBT bank PUT]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui soal CBT.' });
    }
});

router.delete('/bank-soal/:id', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        const info = db.prepare('UPDATE bank_soal SET is_active = 0, updated_at = ? WHERE id = ?').run(nowISO(), req.params.id);
        if (!info.changes) return res.status(404).json({ success: false, message: 'Soal tidak ditemukan.' });
        return res.json({ success: true, message: 'Soal CBT dinonaktifkan.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal menonaktifkan soal CBT.' });
    }
});

/* ── CRUD ujian CBT ──────────────────────────────────────────── */
router.get('/exams', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { status, kelas, mapel, page = 1, limit = 30 } = req.query;
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 30, 1), 100);
    const offset = (pageInt - 1) * limitInt;

    const conds = [];
    const params = [];
    if (status) { conds.push('e.status = ?'); params.push(status); }
    if (kelas)  { conds.push('e.kelas = ?');  params.push(kelas); }
    if (mapel)  { conds.push('e.mapel = ?');  params.push(mapel); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    try {
        const rows = db.prepare(`
            SELECT e.*,
                   u.nama_lengkap as created_by_name,
                   COUNT(DISTINCT q.question_id) as total_soal,
                   COUNT(DISTINCT s.id) as total_token,
                   SUM(CASE WHEN s.used = 1 THEN 1 ELSE 0 END) as total_selesai
            FROM cbt_exams e
            LEFT JOIN users u ON u.id = e.created_by
            LEFT JOIN cbt_exam_questions q ON q.exam_id = e.id
            LEFT JOIN cbt_sessions s ON s.exam_id = e.id
            ${where}
            GROUP BY e.id
            ORDER BY e.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limitInt, offset);
        const total = db.prepare(`SELECT COUNT(*) as c FROM cbt_exams e ${where}`).get(...params)?.c || 0;
        return res.json({
            success: true,
            data: { exams: rows, pagination: { total, page: pageInt, limit: limitInt, totalPages: Math.ceil(total / limitInt) } }
        });
    } catch (err) {
        console.error('[CBT exams GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil sesi CBT.' });
    }
});

router.post('/exams', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const {
        title, mapel, kelas,
        durasi_menit = 90,
        question_count = 40,
        start_at = null,
        end_at = null,
        status = 'draft'
    } = req.body;

    if (!title || !mapel || !kelas) {
        return res.status(400).json({ success: false, message: 'title, mapel, dan kelas wajib diisi.' });
    }
    if (!validateMapel(mapel)) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ success: false, message: 'Status tidak valid.' });

    try {
        const id = uuidv4();
        const now = nowISO();
        db.prepare(`
            INSERT INTO cbt_exams
            (id,title,mapel,kelas,durasi_menit,question_count,start_at,end_at,status,created_by,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        `).run(
            id, title.trim(), mapel, kelas.trim(),
            Math.max(1, parseInt(durasi_menit) || 90),
            Math.max(1, Math.min(parseInt(question_count) || 40, 100)),
            start_at || null, end_at || null, status,
            req.user.sub, now, now
        );
        return res.status(201).json({ success: true, message: 'Sesi CBT berhasil dibuat.', data: { id } });
    } catch (err) {
        console.error('[CBT exams POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat sesi CBT.' });
    }
});

router.put('/exams/:id', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });
    if (exam.status === 'archived') return res.status(400).json({ success: false, message: 'Sesi arsip tidak bisa diedit.' });

    const allowed = ['title', 'mapel', 'kelas', 'durasi_menit', 'question_count', 'start_at', 'end_at', 'status'];
    const fields = [];
    const vals = { id: req.params.id, now: nowISO() };

    for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        if (key === 'mapel' && !validateMapel(req.body[key])) {
            return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
        }
        if (key === 'status' && !VALID_STATUS.includes(req.body[key])) {
            return res.status(400).json({ success: false, message: 'Status tidak valid.' });
        }
        if (['durasi_menit', 'question_count'].includes(key)) vals[key] = Math.max(1, parseInt(req.body[key]) || 1);
        else vals[key] = req.body[key] || null;
        fields.push(`${key} = @${key}`);
    }

    if (!fields.length) return res.status(400).json({ success: false, message: 'Tidak ada perubahan.' });
    fields.push('updated_at = @now');

    try {
        db.prepare(`UPDATE cbt_exams SET ${fields.join(', ')} WHERE id = @id`).run(vals);
        return res.json({ success: true, message: 'Sesi CBT berhasil diperbarui.' });
    } catch (err) {
        console.error('[CBT exams PUT]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui sesi CBT.' });
    }
});

router.patch('/exams/:id/status', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { status } = req.body;
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    try {
        const info = db.prepare('UPDATE cbt_exams SET status = ?, updated_at = ? WHERE id = ?').run(status, nowISO(), req.params.id);
        if (!info.changes) return res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });
        if (status === 'open') {
            const exam = getExam(db, req.params.id);
            const siswaList = getActiveStudentsByClass(db, exam.kelas);
            notifyStudents(db, siswaList, {
                judul: 'Sesi CBT dibuka',
                pesan: `${exam.title} untuk ${exam.kelas} sudah dibuka. Masuk melalui layanan CBT di dashboard siswa.`,
                link: '/LMS.html'
            });
        }
        return res.json({ success: true, message: `Sesi CBT diset ke ${status}.` });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengubah status sesi CBT.' });
    }
});

router.delete('/exams/:id', authenticate, authorize('super_admin'), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });
    try {
        db.prepare('UPDATE cbt_exams SET status = ?, updated_at = ? WHERE id = ?').run('archived', nowISO(), req.params.id);
        return res.json({ success: true, message: 'Sesi CBT diarsipkan.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengarsipkan sesi CBT.' });
    }
});

router.post('/exams/:id/questions/assign', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });

    try {
        const count = Math.max(1, Math.min(parseInt(req.body.question_count || exam.question_count) || 40, 100));
        const rows = db.prepare(`
            SELECT id FROM bank_soal
            WHERE mapel = ? AND is_active = 1
            ORDER BY RANDOM()
            LIMIT ?
        `).all(exam.mapel, count);
        if (!rows.length) return res.status(400).json({ success: false, message: 'Bank soal untuk mapel ini masih kosong.' });

        const tx = db.transaction(() => {
            db.prepare('DELETE FROM cbt_exam_questions WHERE exam_id = ?').run(exam.id);
            const insert = db.prepare(`
                INSERT INTO cbt_exam_questions (id, exam_id, question_id, urutan, created_at)
                VALUES (?, ?, ?, ?, ?)
            `);
            rows.forEach((q, index) => insert.run(uuidv4(), exam.id, q.id, index + 1, nowISO()));
            db.prepare('UPDATE cbt_exams SET question_count = ?, updated_at = ? WHERE id = ?').run(rows.length, nowISO(), exam.id);
        });
        tx();

        return res.json({ success: true, message: `${rows.length} soal dipasang ke sesi CBT.`, data: { total: rows.length } });
    } catch (err) {
        console.error('[CBT assign questions]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memasang soal sesi CBT.' });
    }
});

router.post('/exams/:id/tokens', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });
    if (exam.status === 'archived') return res.status(400).json({ success: false, message: 'Sesi CBT sudah diarsipkan.' });

    try {
        const siswaList = getActiveStudentsByClass(db, exam.kelas);
        if (!siswaList.length) {
            return res.status(400).json({ success: false, message: `Belum ada siswa aktif di kelas ${exam.kelas}. Lengkapi profil siswa terlebih dahulu.` });
        }

        const expiry = req.body.expires_at || exam.end_at || getExpiry((parseInt(exam.durasi_menit) || 90) + 60);
        const results = [];
        const tx = db.transaction(() => {
            db.prepare('UPDATE cbt_sessions SET used = 1, status = ? WHERE exam_id = ? AND used = 0').run('revoked', exam.id);
            const insert = db.prepare(`
                INSERT INTO cbt_sessions
                (id, exam_id, nisn, mapel, token, used, status, durasi_menit, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, 0, 'issued', ?, ?, ?)
            `);
            siswaList.forEach(s => {
                const token = generateCbtToken();
                insert.run(uuidv4(), exam.id, s.nisn, exam.mapel, token, exam.durasi_menit, expiry, nowISO());
                results.push({ nisn: s.nisn, nama_lengkap: s.nama_lengkap, token, expires_at: expiry });
            });
            notifyStudents(db, siswaList, {
                judul: 'Token CBT tersedia',
                pesan: `Token ${exam.title}: lihat token ujianmu di layanan CBT dashboard siswa.`,
                link: '/LMS.html'
            });
        });
        tx();

        return res.status(201).json({ success: true, message: `${results.length} token kelas berhasil dibuat.`, data: results });
    } catch (err) {
        console.error('[CBT class tokens]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat token kelas.' });
    }
});

router.get('/exams/:id/tokens', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        const rows = db.prepare(`
            SELECT cs.id, cs.nisn, cs.mapel, cs.token, cs.used, cs.status,
                   cs.start_time, cs.end_time, cs.expires_at, cs.created_at,
                   cs.last_seen_at, cs.location_lat, cs.location_lng,
                   cs.device_info, cs.browser_info, cs.network_mbps,
                   cs.camera_status, cs.screen_status,
                   cs.progress_answered, cs.progress_total, cs.current_question,
                   cs.violation_count,
                   u.nama_lengkap
            FROM cbt_sessions cs
            LEFT JOIN users u ON u.nisn = cs.nisn
            WHERE cs.exam_id = ?
            ORDER BY u.nama_lengkap ASC
        `).all(req.params.id);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengambil token sesi CBT.' });
    }
});

router.get('/exams/:id/monitor', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        const exam = getExam(db, req.params.id);
        if (!exam) return res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });
        const rows = db.prepare(`
            SELECT cs.id, cs.nisn, cs.mapel, cs.status, cs.used, cs.start_time, cs.end_time,
                   cs.last_seen_at, cs.location_lat, cs.location_lng, cs.device_info, cs.browser_info,
                   cs.network_mbps, cs.camera_status, cs.screen_status,
                   cs.progress_answered, cs.progress_total, cs.current_question,
                   cs.violation_count, cs.last_camera_frame, cs.last_screen_frame,
                   u.nama_lengkap,
                   cr.nilai, cr.benar, cr.salah, cr.kosong, cr.selesai_at
            FROM cbt_sessions cs
            LEFT JOIN users u ON u.nisn = cs.nisn
            LEFT JOIN cbt_results cr ON cr.session_id = cs.id
            WHERE cs.exam_id = ?
            ORDER BY u.nama_lengkap ASC
        `).all(req.params.id).map(row => ({
            ...row,
            device_info: safeParseJson(row.device_info),
            browser_info: safeParseJson(row.browser_info)
        }));
        return res.json({ success: true, data: { exam, students: rows } });
    } catch (err) {
        console.error('[CBT monitor]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil monitoring CBT.' });
    }
});

/* ── Legacy token generator tetap didukung ─────────────────── */
router.post('/token/generate', authenticate, authorize(...STAFF), (req, res) => {
    const db  = getDB();
    const now = nowISO();
    const { nisn, siswa: bulkNisn, mapel, durasi_menit = 90, exam_id = null } = req.body;

    if (!mapel || !validateMapel(mapel)) {
        return res.status(400).json({ success: false, message: 'mapel wajib valid.' });
    }

    try {
        const nisnList = Array.isArray(bulkNisn) && bulkNisn.length ? bulkNisn : nisn ? [nisn] : [];
        if (!nisnList.length) return res.status(400).json({ success: false, message: 'nisn atau siswa (array) wajib diisi.' });
        if (nisnList.length > 100) return res.status(400).json({ success: false, message: 'Maksimal 100 siswa per batch.' });

        const results = [];
        const expiry = getExpiry((parseInt(durasi_menit) || 90) + 60);
        const tx = db.transaction(() => {
            for (const n of nisnList) {
                const user = db.prepare('SELECT id,nama_lengkap FROM users WHERE nisn = ? AND role = ? AND is_active = 1').get(n, 'siswa');
                if (!user) continue;
                if (exam_id) {
                    db.prepare('UPDATE cbt_sessions SET used = 1, status = ? WHERE exam_id = ? AND nisn = ? AND used = 0').run('revoked', exam_id, n);
                } else {
                    db.prepare('UPDATE cbt_sessions SET used = 1, status = ? WHERE nisn = ? AND mapel = ? AND used = 0').run('revoked', n, mapel);
                }
                const token = generateCbtToken();
                db.prepare(`
                    INSERT INTO cbt_sessions
                    (id, exam_id, nisn, mapel, token, used, status, durasi_menit, expires_at, created_at)
                    VALUES (?, ?, ?, ?, ?, 0, 'issued', ?, ?, ?)
                `).run(uuidv4(), exam_id || null, n, mapel, token, durasi_menit, expiry, now);
                results.push({ nisn: n, nama_lengkap: user.nama_lengkap, token, expires_at: expiry });
            }
        });
        tx();

        return res.status(201).json({ success: true, message: `${results.length} token berhasil dibuat.`, data: results });
    } catch (err) {
        console.error('[CBT generate token]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal generate token ujian.' });
    }
});

/* ── Validasi token siswa ───────────────────────────────────── */
router.post('/token/validate', (req, res) => {
    const db = getDB();
    const { nisn, token } = req.body;
    if (!nisn || !token) return res.status(400).json({ success: false, message: 'nisn dan token wajib ada.' });

    try {
        const session = findValidSession(db, nisn, token);
        if (!session) {
            return res.status(401).json({ success: false, message: 'Token tidak valid, sudah digunakan, atau sudah kadaluarsa. Hubungi guru pengawas.' });
        }

        const exam = getExam(db, session.exam_id);
        const availability = assertExamAvailable(exam);
        if (!availability.ok) return res.status(availability.code).json({ success: false, message: availability.message });

        const questionCount = exam
            ? (db.prepare('SELECT COUNT(*) as c FROM cbt_exam_questions WHERE exam_id = ?').get(exam.id)?.c || exam.question_count)
            : (db.prepare('SELECT COUNT(*) as c FROM bank_soal WHERE mapel = ? AND is_active = 1').get(session.mapel)?.c || 0);

        return res.status(200).json({
            success: true,
            message: 'Token valid.',
            data: {
                session_id:    session.id,
                exam_id:       session.exam_id || null,
                exam_title:    exam?.title || null,
                kelas:         exam?.kelas || session.siswa_kelas || null,
                nisn:          session.nisn,
                mapel:         session.mapel,
                durasi_menit:  session.durasi_menit,
                jumlah_soal:   questionCount,
                siswa_nama:    session.nama_lengkap,
                expires_at:    session.expires_at
            }
        });
    } catch (err) {
        console.error('[CBT validate token]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memvalidasi token.' });
    }
});

router.get('/tokens', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { mapel, exam_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    try {
        const conds = [];
        const params = [];
        if (mapel)   { conds.push('cs.mapel = ?'); params.push(mapel); }
        if (exam_id) { conds.push('cs.exam_id = ?'); params.push(exam_id); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const rows = db.prepare(`
            SELECT cs.*, u.nama_lengkap, e.title as exam_title, e.kelas
            FROM cbt_sessions cs
            LEFT JOIN users u ON cs.nisn = u.nisn
            LEFT JOIN cbt_exams e ON e.id = cs.exam_id
            ${where}
            ORDER BY cs.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, parseInt(limit), offset);
        const total = db.prepare(`SELECT COUNT(*) as c FROM cbt_sessions cs ${where}`).get(...params)?.c || 0;
        return res.json({ success: true, data: { tokens: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } } });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengambil data token.' });
    }
});

router.get('/student/sessions', authenticate, (req, res) => {
    const db = getDB();
    if (req.user.role !== 'siswa') return res.status(403).json({ success: false, message: 'Hanya siswa.' });
    try {
        const rows = db.prepare(`
            SELECT e.id as exam_id, e.title, e.mapel, e.kelas, e.durasi_menit, e.question_count,
                   e.start_at, e.end_at, e.status,
                   cs.token, cs.used, cs.status as token_status, cs.expires_at, cs.start_time, cs.end_time
            FROM cbt_sessions cs
            JOIN cbt_exams e ON e.id = cs.exam_id
            WHERE cs.nisn = ?
              AND e.status IN ('draft','open')
              AND cs.status != 'revoked'
            ORDER BY e.status = 'open' DESC, e.created_at DESC
            LIMIT 10
        `).all(req.user.nisn);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengambil sesi CBT siswa.' });
    }
});

router.delete('/token/:token', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        db.prepare('UPDATE cbt_sessions SET used = 1, status = ? WHERE token = ?').run('revoked', req.params.token);
        return res.status(200).json({ success: true, message: 'Token berhasil diinvalidasi.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal invalidasi token.' });
    }
});

/* ── Soal siswa: tidak pernah mengirim kunci jawaban ───────── */
router.get('/soal/ujian/:mapel', (req, res) => {
    const db = getDB();
    const mapel = req.params.mapel;
    const { nisn, token } = req.query;

    if (!validateMapel(mapel)) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
    if (!nisn || !token) return res.status(401).json({ success: false, message: 'NISN dan token wajib untuk mengambil soal.' });

    try {
        const session = findValidSession(db, nisn, token);
        if (!session || session.mapel !== mapel) {
            return res.status(401).json({ success: false, message: 'Token ujian tidak valid untuk mapel ini.' });
        }

        const exam = getExam(db, session.exam_id);
        const availability = assertExamAvailable(exam);
        if (!availability.ok) return res.status(availability.code).json({ success: false, message: availability.message });

        let rows = assignQuestionsIfNeeded(db, exam);
        if (!rows.length) {
            rows = db.prepare(`
                SELECT id, soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e
                FROM bank_soal
                WHERE mapel = ? AND is_active = 1
                ORDER BY RANDOM()
                LIMIT 40
            `).all(mapel);
        }

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Soal belum tersedia di database. Hubungi guru pengawas.' });
        }

        db.prepare(`
            UPDATE cbt_sessions
            SET start_time = COALESCE(start_time, ?), status = 'started'
            WHERE id = ?
        `).run(nowISO(), session.id);

        return res.json({ success: true, data: rows.map(sanitizeQuestion) });
    } catch (err) {
        console.error('[CBT soal]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil soal.' });
    }
});

/* ── Submit jawaban: server-side grading ───────────────────── */
router.post('/submit', (req, res) => {
    const db = getDB();
    const { nisn, token, answers } = req.body;
    if (!nisn || !token || !Array.isArray(answers)) {
        return res.status(400).json({ success: false, message: 'nisn, token, dan answers wajib ada.' });
    }

    try {
        const session = findValidSession(db, nisn, token);
        if (!session) return res.status(401).json({ success: false, message: 'Sesi ujian tidak valid atau sudah selesai.' });

        const exam = getExam(db, session.exam_id);
        const availability = assertExamAvailable(exam);
        if (!availability.ok && availability.message !== 'Sesi ujian sudah berakhir.') {
            return res.status(availability.code).json({ success: false, message: availability.message });
        }

        const questions = listExamQuestionsForGrading(db, session.exam_id, session.mapel);
        if (!questions.length) return res.status(400).json({ success: false, message: 'Soal ujian belum tersedia untuk dinilai.' });

        const answerMap = new Map();
        for (const item of answers) {
            const qid = String(item.question_id || '').trim();
            const jawaban = String(item.jawaban || '').toUpperCase();
            if (qid && /^[A-E]$/.test(jawaban)) answerMap.set(qid, jawaban);
        }

        let benar = 0;
        let salah = 0;
        let kosong = 0;
        const insertAnswer = db.prepare(`
            INSERT INTO cbt_answers (id, exam_id, session_id, nisn, question_id, jawaban, is_correct, answered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, question_id) DO UPDATE SET
                jawaban = excluded.jawaban,
                is_correct = excluded.is_correct,
                answered_at = excluded.answered_at
        `);

        const tx = db.transaction(() => {
            for (const q of questions) {
                const jawaban = answerMap.get(q.id) || null;
                if (!jawaban) {
                    kosong++;
                    insertAnswer.run(uuidv4(), session.exam_id || null, session.id, nisn, q.id, null, null, nowISO());
                    continue;
                }
                const isCorrect = jawaban === String(q.jawaban).toUpperCase() ? 1 : 0;
                if (isCorrect) benar++;
                else salah++;
                insertAnswer.run(uuidv4(), session.exam_id || null, session.id, nisn, q.id, jawaban, isCorrect, nowISO());
            }

            const total = questions.length;
            const nilai = total ? Math.round((benar / total) * 100) : 0;
            db.prepare('DELETE FROM cbt_results WHERE session_id = ?').run(session.id);
            db.prepare(`
                INSERT INTO cbt_results (id, exam_id, session_id, nisn, mapel, benar, salah, kosong, nilai, selesai_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(uuidv4(), session.exam_id || null, session.id, nisn, session.mapel, benar, salah, kosong, nilai, nowISO());
            db.prepare(`
                UPDATE cbt_sessions
                SET used = 1, status = 'finished', end_time = ?, start_time = COALESCE(start_time, ?)
                WHERE id = ?
            `).run(nowISO(), nowISO(), session.id);
        });
        tx();

        const total = questions.length;
        const nilai = total ? Math.round((benar / total) * 100) : 0;
        return res.json({
            success: true,
            message: 'Jawaban berhasil dikumpulkan.',
            data: { benar, salah, kosong, nilai, total, lulus: nilai >= 70 }
        });
    } catch (err) {
        console.error('[CBT submit]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengumpulkan jawaban.' });
    }
});

router.get('/results', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { nisn, mapel, exam_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    try {
        const conds = [];
        const params = [];
        if (nisn)    { conds.push('cr.nisn = ?'); params.push(nisn); }
        if (mapel)   { conds.push('cr.mapel = ?'); params.push(mapel); }
        if (exam_id) { conds.push('cr.exam_id = ?'); params.push(exam_id); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const rows = db.prepare(`
            SELECT cr.*, u.nama_lengkap, u.no_hp, e.title as exam_title, e.kelas,
                   cs.location_lat, cs.location_lng, cs.device_info, cs.browser_info,
                   cs.network_mbps, cs.camera_status, cs.screen_status, cs.violation_count
            FROM cbt_results cr
            LEFT JOIN users u ON cr.nisn = u.nisn
            LEFT JOIN cbt_exams e ON e.id = cr.exam_id
            LEFT JOIN cbt_sessions cs ON cs.id = cr.session_id
            ${where}
            ORDER BY cr.selesai_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, parseInt(limit), offset).map(row => ({
            ...row,
            device_info: safeParseJson(row.device_info),
            browser_info: safeParseJson(row.browser_info)
        }));
        const total = db.prepare(`SELECT COUNT(*) as c FROM cbt_results cr ${where}`).get(...params)?.c || 0;
        return res.json({ success: true, data: { results: rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) } } });
    } catch (err) {
        console.error('[CBT results]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil hasil ujian.' });
    }
});

function safeParseJson(value) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
}

module.exports = router;
