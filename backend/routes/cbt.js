// routes/cbt.js
// CBT API: exam sessions, class tokens, secure question delivery, server-side grading.
'use strict';

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const JSZip    = require('jszip');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const { cbtPublicLimiter } = require('../middleware/rateLimiter');
const getDB    = require('../config/database');
const { getSchoolClasses } = require('../utils/schoolClasses');

const STAFF = ['guru', 'kepala_sekolah', 'wakil_kepala_sekolah', 'super_admin'];
const CBT_FULL_ACCESS = ['super_admin', 'kepala_sekolah', 'wakil_kepala_sekolah'];
const VALID_MAPEL = ['matematika', 'bindo', 'basing', 'pkk', 'sejarah', 'produktif'];
const VALID_STATUS = ['draft', 'open', 'closed', 'archived'];
const VALID_ANSWERS = ['A', 'B', 'C', 'D', 'E'];
const VALID_QUESTION_TYPES = ['multiple_choice', 'essay'];
const VALID_MEDIA_TYPES = ['image', 'audio', 'video', 'canvas'];

function nowISO() {
    return new Date().toISOString();
}

function generateCbtToken() {
    return crypto.randomBytes(16).toString('hex');
}

function generatePublicClassToken() {
    return crypto.randomBytes(4).toString('hex').toUpperCase();
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
        question_type: row.question_type || 'multiple_choice',
        opsi: [row.opsi_a, row.opsi_b, row.opsi_c, row.opsi_d, row.opsi_e].filter(Boolean),
        media_type: row.media_type || null,
        media_url: row.media_url || null,
        media_alt: row.media_alt || null,
        canvas_data: safeParseJson(row.canvas_data),
        essay_min_words: row.essay_min_words || 0,
    };
}

function cleanText(value, max = 240) {
    if (value === undefined || value === null) return null;
    return String(value).replace(/[<>]/g, '').trim().slice(0, max) || null;
}

function cleanUrl(value, max = 500) {
    const text = cleanText(value, max);
    if (!text) return null;
    if (/^(https?:\/\/|\/uploads\/|uploads\/|asset\/|\/asset\/)/i.test(text)) return text;
    return null;
}

function normalizeKeywordList(value) {
    if (Array.isArray(value)) return value.map(v => cleanText(v, 80)).filter(Boolean).join(', ');
    return cleanText(value, 1000);
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

function getStudentByNisn(db, nisn) {
    if (!nisn) return null;
    return db.prepare(`
        SELECT u.id, u.nisn, u.nama_lengkap, sp.kelas as siswa_kelas
        FROM users u
        LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
        WHERE u.nisn = ? AND u.role = 'siswa' AND u.is_active = 1
    `).get(nisn);
}

function canManageAllCbt(user) {
    return CBT_FULL_ACCESS.includes(user?.role);
}

function canAccessExam(user, exam) {
    if (!exam) return false;
    if (canManageAllCbt(user)) return true;
    return exam.created_by === user?.sub;
}

function assertExamAccess(user, exam, res) {
    if (!exam) {
        res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });
        return false;
    }
    if (!canAccessExam(user, exam)) {
        res.status(403).json({ success: false, message: 'Sesi CBT ini milik akun lain.' });
        return false;
    }
    return true;
}

function normalizeQuestionPayload(raw, index = 0) {
    const opsi = Array.isArray(raw?.opsi) ? raw.opsi : [];
    const questionType = VALID_QUESTION_TYPES.includes(raw?.question_type) ? raw.question_type : 'multiple_choice';
    const mediaType = VALID_MEDIA_TYPES.includes(raw?.media_type) ? raw.media_type : null;
    const q = {
        mapel: raw?.mapel,
        jenis_ujian: cleanText(raw?.jenis_ujian || 'CBT', 40) || 'CBT',
        question_type: questionType,
        soal: cleanText(raw?.soal, 2000),
        opsi_a: cleanText(raw?.opsi_a ?? opsi[0], 800),
        opsi_b: cleanText(raw?.opsi_b ?? opsi[1], 800),
        opsi_c: cleanText(raw?.opsi_c ?? opsi[2], 800),
        opsi_d: cleanText(raw?.opsi_d ?? opsi[3], 800),
        opsi_e: cleanText(raw?.opsi_e ?? opsi[4], 800),
        jawaban: String(raw?.jawaban || '').trim().toUpperCase(),
        essay_keywords: normalizeKeywordList(raw?.essay_keywords),
        essay_min_words: Math.max(0, Math.min(parseInt(raw?.essay_min_words) || 0, 1000)),
        media_type: mediaType,
        media_url: mediaType === 'canvas' ? null : cleanUrl(raw?.media_url),
        media_alt: cleanText(raw?.media_alt, 240),
        canvas_data: mediaType === 'canvas' ? cleanText(
            typeof raw?.canvas_data === 'string' ? raw.canvas_data : JSON.stringify(raw?.canvas_data || null),
            8000
        ) : null,
        tingkat: cleanText(raw?.tingkat || 'sedang', 40) || 'sedang',
        urutan: Math.max(1, parseInt(raw?.urutan) || index + 1)
    };
    if (!q.soal) {
        return { ok: false, message: `Soal nomor ${index + 1}: pertanyaan wajib diisi.` };
    }
    if (q.question_type === 'multiple_choice') {
        if (!q.opsi_a || !q.opsi_b || !q.opsi_c || !q.opsi_d) {
            return { ok: false, message: `Soal nomor ${index + 1}: opsi A-D wajib diisi untuk pilihan ganda.` };
        }
        if (!VALID_ANSWERS.includes(q.jawaban)) {
            return { ok: false, message: `Soal nomor ${index + 1}: jawaban benar harus A-E.` };
        }
        if (q.jawaban === 'E' && !q.opsi_e) {
            return { ok: false, message: `Soal nomor ${index + 1}: opsi E wajib diisi karena kunci jawabannya E.` };
        }
    } else {
        q.jawaban = null;
    }
    return { ok: true, data: q };
}

function legacyRequiredText(value) {
    return value === undefined || value === null ? '' : String(value);
}

function createAndAssignQuestions(db, exam, questions, userId) {
    if (!Array.isArray(questions) || !questions.length) return 0;
    const now = nowISO();
    const insertQuestion = db.prepare(`
        INSERT INTO bank_soal
        (id,mapel,jenis_ujian,question_type,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,
         essay_keywords,essay_min_words,media_type,media_url,media_alt,canvas_data,tingkat,created_by,is_active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    `);
    const insertExamQuestion = db.prepare(`
        INSERT INTO cbt_exam_questions (id, exam_id, question_id, urutan, created_at)
        VALUES (?, ?, ?, ?, ?)
    `);
    let total = 0;
    questions.forEach((item, index) => {
        const questionId = uuidv4();
        insertQuestion.run(
            questionId, exam.mapel, item.jenis_ujian || 'CBT', item.question_type || 'multiple_choice', item.soal,
            legacyRequiredText(item.opsi_a), legacyRequiredText(item.opsi_b), legacyRequiredText(item.opsi_c), legacyRequiredText(item.opsi_d), item.opsi_e || null,
            legacyRequiredText(item.jawaban), item.essay_keywords || null, item.essay_min_words || 0,
            item.media_type || null, item.media_url || null, item.media_alt || null, item.canvas_data || null,
            item.tingkat || 'sedang', userId, now, now
        );
        insertExamQuestion.run(uuidv4(), exam.id, questionId, item.urutan || index + 1, now);
        total++;
    });
    return total;
}

function saveCbtMessage(db, {
    exam_id = null, session_id = null, nisn = null, sender_role,
    sender_name = null, message_type = 'student_help', message, created_by = null
}) {
    const id = uuidv4();
    db.prepare(`
        INSERT INTO cbt_messages
        (id, exam_id, session_id, nisn, sender_role, sender_name, message_type, message, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        id, exam_id || null, session_id || null, nisn || null,
        cleanText(sender_role, 40) || 'system',
        cleanText(sender_name, 120),
        cleanText(message_type, 40) || 'student_help',
        cleanText(message, 1000),
        created_by || null,
        nowISO()
    );
    return id;
}

function getExam(db, examId) {
    if (!examId) return null;
    return db.prepare('SELECT * FROM cbt_exams WHERE id = ?').get(examId);
}

function getAssignedQuestionCount(db, examId) {
    if (!examId) return 0;
    return db.prepare(`
        SELECT COUNT(*) as c
        FROM cbt_exam_questions eq
        JOIN bank_soal b ON b.id = eq.question_id
        WHERE eq.exam_id = ? AND b.is_active = 1
    `).get(examId)?.c || 0;
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

function findOrCreateClassSession(db, nisn, token) {
    const publicToken = String(token || '').trim().toUpperCase();
    if (!nisn || !publicToken || !/^[A-Z0-9]{6,16}$/.test(publicToken)) return null;
    const student = getStudentByNisn(db, nisn);
    if (!student?.siswa_kelas) return null;
    const classSession = db.prepare(`
        SELECT cs.*, u.nama_lengkap, ? as siswa_kelas
        FROM cbt_sessions cs
        LEFT JOIN users u ON u.nisn = ?
        WHERE UPPER(cs.token) = ?
          AND cs.token_scope = 'class'
          AND cs.kelas = ?
          AND cs.used = 0
          AND cs.status != 'revoked'
        ORDER BY cs.created_at DESC
        LIMIT 1
    `).get(student.siswa_kelas, nisn, publicToken, student.siswa_kelas);
    if (!classSession || isExpired(classSession.expires_at)) return null;

    const existing = db.prepare(`
        SELECT cs.*, u.nama_lengkap, sp.kelas as siswa_kelas
        FROM cbt_sessions cs
        JOIN users u ON cs.nisn = u.nisn
        LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
        WHERE cs.exam_id = ? AND cs.nisn = ? AND cs.class_token_id = ? AND cs.status != 'revoked'
        ORDER BY cs.created_at DESC
        LIMIT 1
    `).get(classSession.exam_id, nisn, classSession.id);
    if (existing && !isExpired(existing.expires_at) && existing.used === 0) return existing;
    if (existing?.used === 1 || existing?.status === 'finished') return null;

    const individualToken = generateCbtToken();
    const sessionId = uuidv4();
    db.prepare(`
        INSERT INTO cbt_sessions
        (id, exam_id, nisn, mapel, token, used, status, token_scope, kelas, class_token_id, durasi_menit, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, 0, 'issued', 'individual', ?, ?, ?, ?, ?)
    `).run(
        sessionId,
        classSession.exam_id || null,
        nisn,
        classSession.mapel,
        individualToken,
        student.siswa_kelas,
        classSession.id,
        classSession.durasi_menit,
        classSession.expires_at,
        nowISO()
    );
    return db.prepare(`
        SELECT cs.*, u.nama_lengkap, sp.kelas as siswa_kelas
        FROM cbt_sessions cs
        JOIN users u ON cs.nisn = u.nisn
        LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
        WHERE cs.id = ?
    `).get(sessionId);
}

function findValidSession(db, nisn, token) {
    if (!nisn || !token) return null;
    const normalized = String(token).trim();
    if (/^[A-Z0-9]{6,16}$/i.test(normalized)) {
        const classBased = findOrCreateClassSession(db, nisn, normalized);
        if (classBased) return classBased;
    }
    if (!/^[a-f0-9]{32}$/i.test(normalized)) return null;
    const session = db.prepare(`
        SELECT cs.*, u.nama_lengkap, sp.kelas as siswa_kelas
        FROM cbt_sessions cs
        JOIN users u ON cs.nisn = u.nisn
        LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
        WHERE cs.token = ? AND cs.nisn = ? AND cs.used = 0 AND cs.token_scope != 'class'
    `).get(normalized.toLowerCase(), nisn);
    if (!session || isExpired(session.expires_at)) return null;
    return session;
}

function assignQuestionsIfNeeded(db, exam) {
    if (!exam) return [];

    const existing = db.prepare(`
            SELECT b.id, b.soal, b.question_type, b.opsi_a, b.opsi_b, b.opsi_c, b.opsi_d, b.opsi_e,
                   b.media_type, b.media_url, b.media_alt, b.canvas_data, b.essay_min_words
        FROM cbt_exam_questions eq
        JOIN bank_soal b ON b.id = eq.question_id
        WHERE eq.exam_id = ? AND b.is_active = 1
        ORDER BY eq.urutan ASC
    `).all(exam.id);
    if (existing.length) return existing;

    const count = Math.max(1, Math.min(parseInt(exam.question_count) || 40, 100));
    const rows = db.prepare(`
        SELECT id, soal, question_type, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e,
               media_type, media_url, media_alt, canvas_data, essay_min_words
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
            SELECT b.id, b.jawaban, b.question_type, b.essay_keywords, b.essay_min_words
            FROM cbt_exam_questions eq
            JOIN bank_soal b ON b.id = eq.question_id
            WHERE eq.exam_id = ? AND b.is_active = 1
            ORDER BY eq.urutan ASC
        `).all(examId);
        if (rows.length) return rows;
    }
    return db.prepare(`
        SELECT id, jawaban, question_type, essay_keywords, essay_min_words
        FROM bank_soal
        WHERE mapel = ? AND is_active = 1
        ORDER BY id
    `).all(mapel);
}

function listExamQuestionsForAdmin(db, examId) {
    return db.prepare(`
        SELECT eq.urutan,
               b.id, b.mapel, b.jenis_ujian, b.question_type, b.soal,
               b.opsi_a, b.opsi_b, b.opsi_c, b.opsi_d, b.opsi_e, b.jawaban,
               b.essay_keywords, b.essay_min_words,
               b.media_type, b.media_url, b.media_alt, b.canvas_data,
               b.tingkat, b.is_active, b.created_at, b.updated_at
        FROM cbt_exam_questions eq
        JOIN bank_soal b ON b.id = eq.question_id
        WHERE eq.exam_id = ?
        ORDER BY eq.urutan ASC
    `).all(examId).map(row => ({
        ...row,
        canvas_data: safeParseJson(row.canvas_data)
    }));
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
            SELECT id,mapel,jenis_ujian,question_type,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,
                   essay_keywords,essay_min_words,media_type,media_url,media_alt,canvas_data,
                   tingkat,is_active,created_at,updated_at
            FROM bank_soal
            ${where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limitInt, offset).map(row => ({
            ...row,
            canvas_data: safeParseJson(row.canvas_data)
        }));
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
    const normalized = normalizeQuestionPayload(req.body, 0);
    const q = normalized.data;
    const { mapel } = req.body;
    if (!validateMapel(mapel)) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
    if (!normalized.ok) return res.status(400).json({ success: false, message: normalized.message });

    try {
        const id = uuidv4();
        const now = nowISO();
        db.prepare(`
            INSERT INTO bank_soal
            (id,mapel,jenis_ujian,question_type,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,
             essay_keywords,essay_min_words,media_type,media_url,media_alt,canvas_data,tingkat,created_by,is_active,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
        `).run(
            id, mapel, q.jenis_ujian, q.question_type, q.soal,
            legacyRequiredText(q.opsi_a), legacyRequiredText(q.opsi_b), legacyRequiredText(q.opsi_c), legacyRequiredText(q.opsi_d), q.opsi_e || null,
            legacyRequiredText(q.jawaban), q.essay_keywords || null, q.essay_min_words || 0,
            q.media_type || null, q.media_url || null, q.media_alt || null, q.canvas_data || null,
            q.tingkat || 'sedang', req.user.sub, now, now
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

    const allowed = [
        'mapel','jenis_ujian','question_type','soal','opsi_a','opsi_b','opsi_c','opsi_d','opsi_e','jawaban',
        'essay_keywords','essay_min_words','media_type','media_url','media_alt','canvas_data','tingkat','is_active'
    ];
    const fields = [];
    const vals = { id: req.params.id, now: nowISO() };
    for (const key of allowed) {
        if (req.body[key] === undefined) continue;
        if (key === 'mapel' && !validateMapel(req.body[key])) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
        if (key === 'question_type' && !VALID_QUESTION_TYPES.includes(req.body[key])) return res.status(400).json({ success: false, message: 'Tipe soal tidak valid.' });
        if (key === 'media_type' && req.body[key] && !VALID_MEDIA_TYPES.includes(req.body[key])) return res.status(400).json({ success: false, message: 'Tipe media tidak valid.' });
        if (key === 'jawaban' && req.body[key] !== null && req.body[key] !== '' && !['A','B','C','D','E'].includes(String(req.body[key]).toUpperCase())) {
            return res.status(400).json({ success: false, message: 'Jawaban harus A-E.' });
        }
        if (key === 'jawaban') vals[key] = req.body[key] ? String(req.body[key]).toUpperCase() : '';
        else if (['opsi_a', 'opsi_b', 'opsi_c', 'opsi_d'].includes(key)) vals[key] = legacyRequiredText(req.body[key]);
        else if (key === 'essay_keywords') vals[key] = normalizeKeywordList(req.body[key]);
        else if (key === 'essay_min_words') vals[key] = Math.max(0, Math.min(parseInt(req.body[key]) || 0, 1000));
        else if (key === 'media_url') vals[key] = cleanUrl(req.body[key]);
        else if (key === 'canvas_data') vals[key] = cleanText(typeof req.body[key] === 'string' ? req.body[key] : JSON.stringify(req.body[key] || null), 8000);
        else vals[key] = req.body[key];
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
    if (!canManageAllCbt(req.user)) { conds.push('e.created_by = ?'); params.push(req.user.sub); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

    try {
        const rows = db.prepare(`
            SELECT e.*,
                   u.nama_lengkap as created_by_name,
                   COUNT(DISTINCT q.question_id) as total_soal,
                   COUNT(DISTINCT CASE WHEN s.token_scope = 'class' THEN s.id END) as total_token,
                   SUM(CASE WHEN s.status = 'finished' THEN 1 ELSE 0 END) as total_selesai
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
        status = 'draft',
        questions = []
    } = req.body;

    if (!title || !mapel || !kelas) {
        return res.status(400).json({ success: false, message: 'title, mapel, dan kelas wajib diisi.' });
    }
    if (!validateMapel(mapel)) return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
    if (!VALID_STATUS.includes(status)) return res.status(400).json({ success: false, message: 'Status tidak valid.' });
    const normalizedQuestions = [];
    if (Array.isArray(questions) && questions.length) {
        if (questions.length > 100) return res.status(400).json({ success: false, message: 'Maksimal 100 soal per sesi.' });
        for (let i = 0; i < questions.length; i++) {
            const normalized = normalizeQuestionPayload({ ...questions[i], mapel }, i);
            if (!normalized.ok) return res.status(400).json({ success: false, message: normalized.message });
            normalizedQuestions.push(normalized.data);
        }
    }

    try {
        const id = uuidv4();
        const now = nowISO();
        const totalQuestions = normalizedQuestions.length || Math.max(1, Math.min(parseInt(question_count) || 40, 100));
        const exam = {
            id,
            title: title.trim(),
            mapel,
            kelas: kelas.trim(),
            durasi_menit: Math.max(1, parseInt(durasi_menit) || 90),
            question_count: totalQuestions,
            start_at: start_at || null,
            end_at: end_at || null,
            status,
            created_by: req.user.sub
        };

        const tx = db.transaction(() => {
            db.prepare(`
                INSERT INTO cbt_exams
                (id,title,mapel,kelas,durasi_menit,question_count,start_at,end_at,status,created_by,created_at,updated_at)
                VALUES (@id,@title,@mapel,@kelas,@durasi_menit,@question_count,@start_at,@end_at,@status,@created_by,@now,@now)
            `).run({ ...exam, now });
            createAndAssignQuestions(db, exam, normalizedQuestions, req.user.sub);
        });
        tx();

        return res.status(201).json({
            success: true,
            message: normalizedQuestions.length ? 'Draft sesi CBT dan soal berhasil disimpan.' : 'Draft sesi CBT berhasil dibuat.',
            data: { id, question_total: normalizedQuestions.length }
        });
    } catch (err) {
        console.error('[CBT exams POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat sesi CBT.' });
    }
});

router.put('/exams/:id', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!assertExamAccess(req.user, exam, res)) return;
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
        const examBefore = getExam(db, req.params.id);
        if (!assertExamAccess(req.user, examBefore, res)) return;
        if (status === 'open' && getAssignedQuestionCount(db, examBefore.id) < 1) {
            return res.status(400).json({ success: false, message: 'Pasang dan review soal terlebih dahulu sebelum sesi CBT dibuka.' });
        }
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

router.delete('/exams/:id/permanent', authenticate, authorize('super_admin'), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Sesi CBT tidak ditemukan.' });

    try {
        const result = db.transaction(() => {
            const sessionRows = db.prepare('SELECT id FROM cbt_sessions WHERE exam_id = ?').all(exam.id);
            const sessionIds = sessionRows.map(row => row.id);
            const counts = {
                messages: db.prepare('DELETE FROM cbt_messages WHERE exam_id = ?').run(exam.id).changes,
                answers: 0,
                results: db.prepare('DELETE FROM cbt_results WHERE exam_id = ?').run(exam.id).changes,
                sessions: db.prepare('DELETE FROM cbt_sessions WHERE exam_id = ?').run(exam.id).changes,
                questions: db.prepare('DELETE FROM cbt_exam_questions WHERE exam_id = ?').run(exam.id).changes,
                exams: db.prepare('DELETE FROM cbt_exams WHERE id = ?').run(exam.id).changes
            };

            for (const sessionId of sessionIds) {
                counts.answers += db.prepare('DELETE FROM cbt_answers WHERE session_id = ?').run(sessionId).changes;
                counts.results += db.prepare('DELETE FROM cbt_results WHERE session_id = ?').run(sessionId).changes;
                counts.messages += db.prepare('DELETE FROM cbt_messages WHERE session_id = ?').run(sessionId).changes;
            }
            return counts;
        })();

        return res.json({
            success: true,
            message: 'Sesi CBT dihapus permanen.',
            data: result
        });
    } catch (err) {
        console.error('[CBT exam permanent delete]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menghapus permanen sesi CBT.' });
    }
});

router.get('/exams/:id/questions', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!assertExamAccess(req.user, exam, res)) return;

    try {
        const questions = listExamQuestionsForAdmin(db, exam.id);
        return res.json({
            success: true,
            data: {
                exam: {
                    id: exam.id,
                    title: exam.title,
                    mapel: exam.mapel,
                    kelas: exam.kelas,
                    durasi_menit: exam.durasi_menit,
                    question_count: exam.question_count,
                    status: exam.status,
                    start_at: exam.start_at,
                    end_at: exam.end_at
                },
                questions,
                total: questions.length
            }
        });
    } catch (err) {
        console.error('[CBT exam questions GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil soal sesi CBT.' });
    }
});

router.post('/exams/:id/questions/assign', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const exam = getExam(db, req.params.id);
    if (!assertExamAccess(req.user, exam, res)) return;

    try {
        const incomingQuestions = Array.isArray(req.body.questions) ? req.body.questions : [];
        if (incomingQuestions.length) {
            if (incomingQuestions.length > 100) return res.status(400).json({ success: false, message: 'Maksimal 100 soal per sesi.' });
            const normalizedQuestions = [];
            for (let i = 0; i < incomingQuestions.length; i++) {
                const normalized = normalizeQuestionPayload({ ...incomingQuestions[i], mapel: exam.mapel }, i);
                if (!normalized.ok) return res.status(400).json({ success: false, message: normalized.message });
                normalizedQuestions.push(normalized.data);
            }

            const tx = db.transaction(() => {
                db.prepare('DELETE FROM cbt_exam_questions WHERE exam_id = ?').run(exam.id);
                const total = createAndAssignQuestions(db, exam, normalizedQuestions, req.user.sub);
                db.prepare('UPDATE cbt_exams SET question_count = ?, updated_at = ? WHERE id = ?').run(total, nowISO(), exam.id);
            });
            tx();
            return res.json({ success: true, message: `${normalizedQuestions.length} soal eksplisit disimpan ke sesi CBT.`, data: { total: normalizedQuestions.length } });
        }

        const questionIds = Array.isArray(req.body.question_ids) ? req.body.question_ids.map(id => String(id).trim()).filter(Boolean) : [];
        if (questionIds.length) {
            if (questionIds.length > 100) return res.status(400).json({ success: false, message: 'Maksimal 100 soal per sesi.' });
            const placeholders = questionIds.map(() => '?').join(',');
            const rows = db.prepare(`
                SELECT id FROM bank_soal
                WHERE mapel = ? AND is_active = 1 AND id IN (${placeholders})
            `).all(exam.mapel, ...questionIds);
            if (rows.length !== questionIds.length) {
                return res.status(400).json({ success: false, message: 'Ada soal yang tidak valid atau berbeda mapel.' });
            }
            const validIds = new Set(rows.map(r => r.id));
            const tx = db.transaction(() => {
                db.prepare('DELETE FROM cbt_exam_questions WHERE exam_id = ?').run(exam.id);
                const insert = db.prepare(`
                    INSERT INTO cbt_exam_questions (id, exam_id, question_id, urutan, created_at)
                    VALUES (?, ?, ?, ?, ?)
                `);
                questionIds.filter(id => validIds.has(id)).forEach((id, index) => insert.run(uuidv4(), exam.id, id, index + 1, nowISO()));
                db.prepare('UPDATE cbt_exams SET question_count = ?, updated_at = ? WHERE id = ?').run(questionIds.length, nowISO(), exam.id);
            });
            tx();
            return res.json({ success: true, message: `${questionIds.length} soal pilihan dipasang ke sesi CBT.`, data: { total: questionIds.length } });
        }

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
    if (!assertExamAccess(req.user, exam, res)) return;
    if (exam.status === 'archived') return res.status(400).json({ success: false, message: 'Sesi CBT sudah diarsipkan.' });
    if (getAssignedQuestionCount(db, exam.id) < 1) {
        return res.status(400).json({ success: false, message: 'Pasang dan review soal terlebih dahulu sebelum membuat token CBT.' });
    }

    try {
        const siswaList = getActiveStudentsByClass(db, exam.kelas);
        if (!siswaList.length) {
            return res.status(400).json({ success: false, message: `Belum ada siswa aktif di kelas ${exam.kelas}. Lengkapi profil siswa terlebih dahulu.` });
        }

        const expiry = req.body.expires_at || exam.end_at || getExpiry((parseInt(exam.durasi_menit) || 90) + 60);
        let classToken = generatePublicClassToken();
        while (db.prepare('SELECT 1 FROM cbt_sessions WHERE token = ?').get(classToken)) {
            classToken = generatePublicClassToken();
        }
        const classSessionId = uuidv4();
        const tx = db.transaction(() => {
            db.prepare('UPDATE cbt_sessions SET used = 1, status = ? WHERE exam_id = ? AND used = 0').run('revoked', exam.id);
            db.prepare(`
                INSERT INTO cbt_sessions
                (id, exam_id, nisn, mapel, token, used, status, token_scope, kelas, durasi_menit, expires_at, created_at)
                VALUES (?, ?, ?, ?, ?, 0, 'issued', 'class', ?, ?, ?, ?)
            `).run(classSessionId, exam.id, `CLASS:${exam.kelas}`, exam.mapel, classToken, exam.kelas, exam.durasi_menit, expiry, nowISO());
            notifyStudents(db, siswaList, {
                judul: 'Token CBT tersedia',
                pesan: `Token kelas ${exam.title}: ${classToken}. Token hanya bisa dipakai siswa ${exam.kelas}.`,
                link: '/LMS.html'
            });
        });
        tx();

        const result = {
            id: classSessionId,
            token_scope: 'class',
            kelas: exam.kelas,
            mapel: exam.mapel,
            token: classToken,
            total_siswa: siswaList.length,
            expires_at: expiry
        };
        const clipboardText = `${exam.title}\nKelas: ${exam.kelas}\nMapel: ${exam.mapel}\nToken kelas: ${classToken}\nBerlaku untuk ${siswaList.length} siswa kelas ${exam.kelas}`;
        return res.status(201).json({
            success: true,
            message: `Token kelas ${exam.kelas} berhasil dibuat untuk ${siswaList.length} siswa.`,
            data: [result],
            clipboard_text: clipboardText
        });
    } catch (err) {
        console.error('[CBT class tokens]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat token kelas.' });
    }
});

router.get('/exams/:id/tokens', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        const exam = getExam(db, req.params.id);
        if (!assertExamAccess(req.user, exam, res)) return;
        const rows = db.prepare(`
            SELECT cs.id, cs.nisn, cs.mapel, cs.token, cs.used, cs.status, cs.token_scope, cs.kelas, cs.class_token_id,
                   cs.start_time, cs.end_time, cs.expires_at, cs.created_at,
                   cs.last_seen_at, cs.location_lat, cs.location_lng,
                   cs.device_info, cs.browser_info, cs.network_mbps,
                   cs.camera_status, cs.screen_status,
                   cs.progress_answered, cs.progress_total, cs.current_question,
                   cs.violation_count,
                   u.nama_lengkap,
                   (SELECT COUNT(*) FROM siswa_profil sp JOIN users su ON su.nisn = sp.nisn WHERE sp.kelas = cs.kelas AND su.role = 'siswa' AND su.is_active = 1) as total_siswa,
                   (SELECT COUNT(*) FROM cbt_sessions child WHERE child.class_token_id = cs.id AND child.status = 'started') as total_started,
                   (SELECT COUNT(*) FROM cbt_sessions child WHERE child.class_token_id = cs.id AND child.status = 'finished') as total_finished
            FROM cbt_sessions cs
            LEFT JOIN users u ON u.nisn = cs.nisn
            WHERE cs.exam_id = ? AND cs.token_scope = 'class'
            ORDER BY cs.created_at DESC
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
        if (!assertExamAccess(req.user, exam, res)) return;
        const rows = db.prepare(`
            SELECT cs.id, cs.nisn, cs.mapel, cs.status, cs.used, cs.start_time, cs.end_time,
                   cs.last_seen_at, cs.location_lat, cs.location_lng, cs.device_info, cs.browser_info,
                   cs.network_mbps, cs.camera_status, cs.screen_status,
                   cs.progress_answered, cs.progress_total, cs.current_question,
                   cs.violation_count, cs.last_camera_frame, cs.last_screen_frame,
                   u.nama_lengkap, u.foto_profil, sp.kelas as siswa_kelas,
                   cr.nilai, cr.benar, cr.salah, cr.kosong, cr.selesai_at
            FROM cbt_sessions cs
            LEFT JOIN users u ON u.nisn = cs.nisn
            LEFT JOIN siswa_profil sp ON sp.nisn = cs.nisn
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

router.get('/exams/:id/messages', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        const exam = getExam(db, req.params.id);
        if (!assertExamAccess(req.user, exam, res)) return;
        const rows = db.prepare(`
            SELECT cm.*, u.nama_lengkap as siswa_nama, sp.kelas as siswa_kelas
            FROM cbt_messages cm
            LEFT JOIN users u ON u.nisn = cm.nisn
            LEFT JOIN siswa_profil sp ON sp.nisn = cm.nisn
            WHERE cm.exam_id = ?
            ORDER BY cm.created_at DESC
            LIMIT 120
        `).all(exam.id);
        return res.json({ success: true, data: rows.reverse() });
    } catch (err) {
        console.error('[CBT messages GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil chat CBT.' });
    }
});

router.post('/exams/:id/announcement', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const message = cleanText(req.body.message, 1000);
    if (!message) return res.status(400).json({ success: false, message: 'Isi announcement wajib diisi.' });

    try {
        const exam = getExam(db, req.params.id);
        if (!assertExamAccess(req.user, exam, res)) return;
        const id = saveCbtMessage(db, {
            exam_id: exam.id,
            sender_role: req.user.role,
            sender_name: req.user.nama || req.user.email || 'Panitia CBT',
            message_type: 'announcement',
            message,
            created_by: req.user.sub
        });
        return res.status(201).json({ success: true, message: 'Announcement CBT tersimpan.', data: { id } });
    } catch (err) {
        console.error('[CBT announcement POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan announcement CBT.' });
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

        const clipboardText = results
            .map(r => `${r.nama_lengkap} (${r.nisn}): ${r.token}`)
            .join('\n');
        return res.status(201).json({ success: true, message: `${results.length} token berhasil dibuat.`, data: results, clipboard_text: clipboardText });
    } catch (err) {
        console.error('[CBT generate token]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal generate token ujian.' });
    }
});

/* ── Validasi token siswa ───────────────────────────────────── */
router.post('/token/validate', cbtPublicLimiter, (req, res) => {
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
        const student = getStudentByNisn(db, req.user.nisn);
        const kelas = student?.siswa_kelas || '';
        const rows = db.prepare(`
            SELECT e.id as exam_id, e.title, e.mapel, e.kelas, e.durasi_menit, e.question_count,
                   e.start_at, e.end_at, e.status,
                   cs.token, COALESCE(child.used, 0) as used,
                   COALESCE(child.status, cs.status) as token_status,
                   cs.expires_at, child.start_time, child.end_time
            FROM cbt_sessions cs
            JOIN cbt_exams e ON e.id = cs.exam_id
            LEFT JOIN cbt_sessions child ON child.class_token_id = cs.id AND child.nisn = ?
            WHERE cs.token_scope = 'class'
              AND cs.kelas = ?
              AND e.status IN ('draft','open')
              AND cs.status != 'revoked'
            ORDER BY e.status = 'open' DESC, e.created_at DESC
            LIMIT 10
        `).all(req.user.nisn, kelas);
        return res.json({ success: true, data: rows });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengambil sesi CBT siswa.' });
    }
});

router.delete('/token/:token', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        const token = String(req.params.token || '');
        const row = db.prepare('SELECT id FROM cbt_sessions WHERE token = ?').get(token);
        db.prepare('UPDATE cbt_sessions SET used = 1, status = ? WHERE token = ?').run('revoked', token);
        if (row) db.prepare('UPDATE cbt_sessions SET used = 1, status = ? WHERE class_token_id = ? AND used = 0').run('revoked', row.id);
        return res.status(200).json({ success: true, message: 'Token berhasil diinvalidasi.' });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal invalidasi token.' });
    }
});

/* ── Soal siswa: tidak pernah mengirim kunci jawaban ───────── */
router.get('/soal/ujian/:mapel', cbtPublicLimiter, (req, res) => {
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

        let rows = [];
        if (exam) {
            rows = db.prepare(`
                SELECT b.id, b.soal, b.question_type, b.opsi_a, b.opsi_b, b.opsi_c, b.opsi_d, b.opsi_e,
                       b.media_type, b.media_url, b.media_alt, b.canvas_data, b.essay_min_words
                FROM cbt_exam_questions eq
                JOIN bank_soal b ON b.id = eq.question_id
                WHERE eq.exam_id = ? AND b.is_active = 1
                ORDER BY eq.urutan ASC
            `).all(exam.id);
        } else {
            rows = db.prepare(`
                SELECT id, soal, question_type, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e,
                       media_type, media_url, media_alt, canvas_data, essay_min_words
                FROM bank_soal
                WHERE mapel = ? AND is_active = 1
                ORDER BY RANDOM()
                LIMIT 40
            `).all(mapel);
        }

        if (!rows.length) {
            return res.status(404).json({ success: false, message: 'Soal sesi CBT belum dipasang. Hubungi guru pengawas.' });
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
router.post('/submit', cbtPublicLimiter, (req, res) => {
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
            const jawaban = String(item.jawaban ?? '').trim();
            if (qid && jawaban) answerMap.set(qid, jawaban);
        }

        let benar = 0;
        let salah = 0;
        let kosong = 0;
        let essayCorrect = 0;
        let essayPending = 0;
        const insertAnswer = db.prepare(`
            INSERT INTO cbt_answers (id, exam_id, session_id, nisn, question_id, jawaban, answer_type, is_correct, keyword_hits, answered_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, question_id) DO UPDATE SET
                jawaban = excluded.jawaban,
                answer_type = excluded.answer_type,
                is_correct = excluded.is_correct,
                keyword_hits = excluded.keyword_hits,
                answered_at = excluded.answered_at
        `);
        const studentIdentity = db.prepare(`
            SELECT u.nama_lengkap, sp.kelas, sp.jurusan
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE u.nisn = ?
            LIMIT 1
        `).get(nisn) || {};

        const tx = db.transaction(() => {
            for (const q of questions) {
                const type = q.question_type || 'multiple_choice';
                const jawaban = answerMap.get(q.id) || null;
                if (!jawaban) {
                    kosong++;
                    insertAnswer.run(uuidv4(), session.exam_id || null, session.id, nisn, q.id, null, type, null, null, nowISO());
                    continue;
                }
                let normalizedAnswer = jawaban;
                let isCorrect = 0;
                let keywordHits = null;
                if (type === 'essay') {
                    const text = jawaban.toLowerCase().replace(/\s+/g, ' ').trim();
                    const keywords = String(q.essay_keywords || '')
                        .split(/[,;\n]/)
                        .map(k => k.trim().toLowerCase())
                        .filter(Boolean);
                    const minWords = Math.max(0, parseInt(q.essay_min_words) || 0);
                    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
                    const hits = keywords.filter(k => text.includes(k));
                    keywordHits = JSON.stringify({ required: keywords, hits, minWords, words });
                    if (!keywords.length) {
                        essayPending++;
                        isCorrect = 0;
                    } else {
                        isCorrect = hits.length === keywords.length && words >= minWords ? 1 : 0;
                        if (isCorrect) essayCorrect++;
                    }
                } else {
                    normalizedAnswer = jawaban.toUpperCase();
                    if (!/^[A-E]$/.test(normalizedAnswer)) {
                        salah++;
                        insertAnswer.run(uuidv4(), session.exam_id || null, session.id, nisn, q.id, jawaban, type, 0, null, nowISO());
                        continue;
                    }
                    isCorrect = normalizedAnswer === String(q.jawaban).toUpperCase() ? 1 : 0;
                }
                if (isCorrect) benar++;
                else salah++;
                insertAnswer.run(uuidv4(), session.exam_id || null, session.id, nisn, q.id, normalizedAnswer, type, isCorrect, keywordHits, nowISO());
            }

            const total = questions.length;
            const nilai = total ? Math.round((benar / total) * 100) : 0;
            db.prepare('DELETE FROM cbt_results WHERE session_id = ?').run(session.id);
            db.prepare(`
                INSERT INTO cbt_results
                (id, exam_id, session_id, nisn, mapel, nama_siswa, kelas_siswa, jurusan_siswa,
                 benar, salah, kosong, nilai, essay_correct, essay_pending, selesai_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                uuidv4(), session.exam_id || null, session.id, nisn, session.mapel,
                studentIdentity.nama_lengkap || session.nama_lengkap || null,
                studentIdentity.kelas || session.siswa_kelas || session.kelas || null,
                studentIdentity.jurusan || null,
                benar, salah, kosong, nilai, essayCorrect, essayPending, nowISO()
            );
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
            data: { benar, salah, kosong, nilai, total, essay_correct: essayCorrect, essay_pending: essayPending, lulus: nilai >= 70 }
        });
    } catch (err) {
        console.error('[CBT submit]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengumpulkan jawaban.' });
    }
});

router.get('/results/export', authenticate, authorize(...STAFF), async (req, res) => {
    const db = getDB();
    const { exam_id } = req.query;
    try {
        if (!exam_id) {
            return res.status(400).json({ success: false, message: 'Pilih sesi CBT terlebih dahulu.' });
        }

        const exam = getExam(db, exam_id);
        if (!assertExamAccess(req.user, exam, res)) return;

        const rows = getCbtResultRows(db, { exam_id, limit: 10000, offset: 0 });
        const buffer = await buildCbtResultsXlsx({ exam, rows, exportedBy: req.user?.nama || req.user?.email || 'Admin' });
        const filename = `rekap-cbt-${slugifyFilename(exam.title || exam.mapel || 'hasil')}-${new Date().toISOString().slice(0, 10)}.xlsx`;

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(buffer);
    } catch (err) {
        console.error('[CBT export xlsx]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat file Excel hasil CBT.' });
    }
});

router.get('/results', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { nisn, mapel, exam_id, page = 1, limit = 50 } = req.query;
    const pageInt = Math.max(1, parseInt(page) || 1);
    const maxLimit = req.query.export === '1' ? 10000 : 500;
    const limitInt = Math.min(maxLimit, Math.max(1, parseInt(limit) || 50));
    const offset = (pageInt - 1) * limitInt;
    try {
        if (exam_id) {
            const exam = getExam(db, exam_id);
            if (!assertExamAccess(req.user, exam, res)) return;
        } else if (!canManageAllCbt(req.user)) {
            return res.status(400).json({ success: false, message: 'Pilih sesi CBT terlebih dahulu.' });
        }
        let examMeta = null;
        if (exam_id) {
            const exam = getExam(db, exam_id);
            examMeta = exam ? {
                id: exam.id,
                title: exam.title,
                mapel: exam.mapel,
                kelas: exam.kelas,
                jenis_ujian: 'CBT',
                durasi_menit: exam.durasi_menit,
                question_count: exam.question_count,
                status: exam.status,
                start_at: exam.start_at,
                end_at: exam.end_at,
            } : null;
        }
        const conds = [];
        const params = [];
        if (nisn)    { conds.push('cr.nisn = ?'); params.push(nisn); }
        if (mapel)   { conds.push('cr.mapel = ?'); params.push(mapel); }
        if (exam_id) { conds.push('cr.exam_id = ?'); params.push(exam_id); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const rows = getCbtResultRows(db, { where, params, limit: limitInt, offset });
        const total = db.prepare(`SELECT COUNT(*) as c FROM cbt_results cr ${where}`).get(...params)?.c || 0;
        return res.json({
            success: true,
            data: {
                exam: examMeta,
                results: rows,
                pagination: { total, page: pageInt, limit: limitInt, totalPages: Math.ceil(total / limitInt) }
            }
        });
    } catch (err) {
        console.error('[CBT results]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil hasil ujian.' });
    }
});

function getCbtResultRows(db, { exam_id = null, where = '', params = [], limit = 10000, offset = 0 } = {}) {
    let finalWhere = where;
    let finalParams = params;
    if (exam_id) {
        finalWhere = 'WHERE cr.exam_id = ?';
        finalParams = [exam_id];
    }
    return db.prepare(`
        SELECT cr.*,
               COALESCE(NULLIF(TRIM(cr.nama_siswa), ''), NULLIF(TRIM(u.nama_lengkap), ''), cr.nisn) as nama_lengkap,
               u.no_hp, u.email,
               COALESCE(NULLIF(TRIM(cr.kelas_siswa), ''), NULLIF(TRIM(sp.kelas), ''), NULLIF(TRIM(cs.kelas), ''), NULLIF(TRIM(e.kelas), '')) as siswa_kelas,
               COALESCE(NULLIF(TRIM(cr.jurusan_siswa), ''), NULLIF(TRIM(sp.jurusan), '')) as jurusan,
               sp.jenis_kelamin, sp.tempat_lahir, sp.tanggal_lahir, sp.agama,
               sp.alamat, sp.kelurahan, sp.kecamatan, sp.kabupaten, sp.provinsi,
               sp.nama_ayah, sp.nama_ibu, sp.no_hp_ortu, sp.email_ortu,
               e.title as exam_title, e.kelas as kelas_ujian, 'CBT' as jenis_ujian, e.durasi_menit,
               e.question_count, e.start_at as exam_start_at, e.end_at as exam_end_at,
               e.status as exam_status,
               cs.location_lat, cs.location_lng, cs.device_info, cs.browser_info,
               cs.network_mbps, cs.camera_status, cs.screen_status, cs.violation_count,
               cs.start_time, cs.end_time, cs.status as session_status,
               cs.progress_answered, cs.progress_total
        FROM cbt_results cr
        LEFT JOIN users u ON cr.nisn = u.nisn
        LEFT JOIN siswa_profil sp ON sp.nisn = cr.nisn
        LEFT JOIN cbt_exams e ON e.id = cr.exam_id
        LEFT JOIN cbt_sessions cs ON cs.id = cr.session_id
        ${finalWhere}
        ORDER BY cr.selesai_at DESC
        LIMIT ? OFFSET ?
    `).all(...finalParams, limit, offset).map(row => ({
        ...row,
        device_info: safeParseJson(row.device_info),
        browser_info: safeParseJson(row.browser_info)
    }));
}

async function buildCbtResultsXlsx({ exam, rows, exportedBy }) {
    const attempts = prepareCbtRowsForExport(rows, exam);
    const prepared = selectLatestCbtAttempts(attempts);
    const stats = summarizeCbtRows(prepared);
    stats.totalAttempts = attempts.length;
    stats.repeatAttempts = Math.max(0, attempts.length - prepared.length);
    const exportedAt = formatDateTimePlain(new Date().toISOString());
    const title = exam?.title || 'Hasil CBT';
    const kkm = prepared[0]?.kkm || 70;

    const sheets = [
        {
            name: 'Ringkasan',
            widths: [24, 30, 16, 24, 30, 18],
            merges: ['A1:F1', 'A2:F2', 'A10:F10', 'A16:F16', 'A23:F23', 'A28:F28', 'A29:F29', 'A30:F30', 'A31:F31'],
            rowHeights: { 1: 30, 2: 22, 10: 24, 16: 24, 23: 24, 28: 24, 29: 22, 30: 22, 31: 22 },
            hideGridLines: true,
            print: { orientation: 'landscape', fitToWidth: 1 },
            rows: [
                [{ v: 'REKAP HASIL UJIAN CBT', s: 1 }],
                [{ v: 'SMK Negeri 1 Terisi', s: 2 }],
                [],
                [{ v: 'Judul ujian', s: 5 }, title, '', { v: 'Kelas', s: 5 }, exam?.kelas || '-'],
                [{ v: 'Mata pelajaran', s: 5 }, formatMapelLabel(exam?.mapel), '', { v: 'Jenis ujian', s: 5 }, 'CBT'],
                [{ v: 'Durasi resmi', s: 5 }, `${exam?.durasi_menit || '-'} menit`, '', { v: 'Status sesi', s: 5 }, exam?.status || '-'],
                [{ v: 'Periode ujian', s: 5 }, `${formatDateTimePlain(exam?.start_at)} - ${formatDateTimePlain(exam?.end_at)}`, '', { v: 'Export oleh', s: 5 }, exportedBy],
                [{ v: 'Waktu export', s: 5 }, exportedAt, '', { v: 'Total percobaan', s: 5 }, stats.totalAttempts],
                [],
                [{ v: 'Ringkasan Nilai', s: 3 }],
                [{ v: 'Total peserta submit', s: 5 }, stats.total, '', { v: 'Rata-rata', s: 5 }, stats.avg],
                [{ v: 'Nilai tertinggi', s: 5 }, stats.max, '', { v: 'Nilai terendah', s: 5 }, stats.min],
                [{ v: 'Tuntas', s: 5 }, stats.pass, '', { v: 'Remedial', s: 5 }, stats.remedial],
                [{ v: 'Persentase tuntas', s: 5 }, { v: stats.passRate / 100, s: 12 }, '', { v: 'Total pelanggaran', s: 5 }, stats.violations],
                [],
                [{ v: 'Distribusi Predikat', s: 3 }],
                [{ v: 'Predikat', s: 4 }, { v: 'Rentang', s: 4 }, { v: 'Jumlah Siswa', s: 4 }],
                ['A', '90 - 100', stats.predicates.A],
                ['B', '80 - 89', stats.predicates.B],
                ['C', '70 - 79', stats.predicates.C],
                ['D', '< 70', stats.predicates.D],
                [],
                [{ v: 'Kelengkapan Data Siswa', s: 3 }],
                [{ v: 'Nama tersedia', s: 5 }, stats.completeNames, '', { v: 'Nama perlu dilengkapi', s: 5 }, stats.missingNames],
                [{ v: 'Profil lengkap', s: 5 }, stats.completeProfiles, '', { v: 'Profil belum lengkap', s: 5 }, stats.incompleteProfiles],
                [{ v: 'Percobaan ulang', s: 5 }, stats.repeatAttempts, '', { v: 'Peserta unik', s: 5 }, stats.total],
                [],
                [{ v: 'Panduan Sheet', s: 3 }],
                ['Rekap Nilai: tabel utama untuk olah nilai, filter, ranking, dan catatan guru.'],
                ['Data Siswa: identitas administrasi peserta yang tersedia pada profil sekolah.'],
                ['Proctoring: catatan perangkat, kamera, layar, lokasi, dan risiko integritas.']
            ]
        },
        {
            name: 'Rekap Nilai',
            freezeRows: 5,
            autoFilter: true,
            autoFilterRow: 5,
            hideGridLines: true,
            merges: ['A1:Z1', 'A2:Z2'],
            rowHeights: { 1: 30, 2: 22, 5: 32 },
            print: { orientation: 'landscape', fitToWidth: 1 },
            widths: [7, 10, 18, 30, 18, 16, 22, 32, 14, 10, 10, 12, 10, 10, 10, 12, 16, 13, 13, 20, 20, 13, 20, 18, 28, 28],
            rows: [
                [{ v: `REKAP NILAI - ${title}`, s: 1 }],
                [{ v: `${formatMapelLabel(exam?.mapel)} | ${exam?.kelas || '-'} | Diekspor ${exportedAt}`, s: 2 }],
                [],
                [{ v: `KKM ${kkm}`, s: 11 }, { v: `Peserta ${stats.total}`, s: 11 }, { v: `Rata-rata ${stats.avg}`, s: 11 }, { v: `Tuntas ${stats.pass}`, s: 11 }],
                ['No','Ranking','Status Administrasi','Nama Siswa','NISN','Kelas','Mata Pelajaran','Judul Ujian','Jenis Ujian','Nilai','KKM','Predikat','Benar','Salah','Kosong','Total Soal','Persentase Benar','Essay Benar','Essay Pending','Mulai','Selesai','Durasi Menit','Waktu Submit','No HP','Email','Catatan Guru'].map(v => ({ v, s: 4 })),
                ...prepared.map((r, index) => [
                    index + 1, r.rank, { v: r.status_admin, s: r.status_admin === 'Tuntas' ? 6 : 7 },
                    { v: r.nama_lengkap || `Siswa ${r.nisn || '-'}`, s: 10 },
                    { v: String(r.nisn || ''), s: 10 },
                    r.kelas_export, r.mapel_label,
                    r.exam_title_export, r.jenis_ujian_export, { v: Number(r.nilai || 0), s: 9 }, r.kkm,
                    r.predikat, Number(r.benar || 0), Number(r.salah || 0), Number(r.kosong || 0),
                    r.total_soal_export, r.percentage_correct, Number(r.essay_correct || 0), Number(r.essay_pending || 0),
                    formatDateTimePlain(r.start_export), formatDateTimePlain(r.finish_export), r.duration_minutes ?? '',
                    formatDateTimePlain(r.selesai_at), r.no_hp || '', r.email || '', ''
                ])
            ]
        },
        {
            name: 'Data Siswa',
            freezeRows: 5,
            autoFilter: true,
            autoFilterRow: 5,
            hideGridLines: true,
            merges: ['A1:T1', 'A2:T2'],
            rowHeights: { 1: 30, 2: 22, 5: 32 },
            print: { orientation: 'landscape', fitToWidth: 1 },
            widths: [7, 30, 18, 16, 22, 16, 18, 16, 16, 18, 28, 20, 20, 20, 24, 30, 20, 20, 20, 20],
            rows: [
                [{ v: `DATA IDENTITAS PESERTA - ${title}`, s: 1 }],
                [{ v: 'Data berasal dari snapshot hasil ujian dan profil siswa yang tersedia.', s: 2 }],
                [],
                [{ v: `Total peserta ${stats.total}`, s: 11 }, { v: `Profil lengkap ${stats.completeProfiles}`, s: 11 }, { v: `Perlu dilengkapi ${stats.incompleteProfiles}`, s: 11 }],
                ['No','Nama Siswa','NISN','Kelas','Jurusan','Jenis Kelamin','Tempat Lahir','Tanggal Lahir','Agama','No HP Siswa','Email Siswa','Nama Ayah','Nama Ibu','No HP Orang Tua','Email Orang Tua','Alamat','Kelurahan','Kecamatan','Kabupaten','Provinsi'].map(v => ({ v, s: 4 })),
                ...prepared.map((r, index) => [
                    index + 1,
                    { v: r.nama_lengkap || `Siswa ${r.nisn || '-'}`, s: 10 },
                    { v: String(r.nisn || ''), s: 10 },
                    r.kelas_export,
                    r.jurusan || '',
                    r.jenis_kelamin || '',
                    r.tempat_lahir || '',
                    formatDatePlain(r.tanggal_lahir),
                    r.agama || '',
                    r.no_hp || '',
                    r.email || '',
                    r.nama_ayah || '',
                    r.nama_ibu || '',
                    r.no_hp_ortu || '',
                    r.email_ortu || '',
                    r.alamat || '',
                    r.kelurahan || '',
                    r.kecamatan || '',
                    r.kabupaten || '',
                    r.provinsi || ''
                ])
            ]
        },
        {
            name: 'Proctoring',
            freezeRows: 5,
            autoFilter: true,
            autoFilterRow: 5,
            hideGridLines: true,
            merges: ['A1:N1', 'A2:N2'],
            rowHeights: { 1: 30, 2: 22, 5: 32 },
            print: { orientation: 'landscape', fitToWidth: 1 },
            widths: [8, 30, 18, 16, 13, 14, 14, 14, 18, 34, 36, 15, 24, 46],
            rows: [
                [{ v: `CATATAN PROCTORING - ${title}`, s: 1 }],
                [{ v: 'Gunakan sheet ini untuk verifikasi kendala teknis dan indikasi pelanggaran.', s: 2 }],
                [],
                [{ v: `Total pelanggaran ${stats.violations}`, s: 11 }, { v: `Perlu review ${stats.integrityReview}`, s: 11 }],
                ['No','Nama Siswa','NISN','Status Sesi','Progress','Kamera','Layar','Pelanggaran','Risiko Integritas','Perangkat','Browser','Jaringan Mbps','Koordinat','Link Maps'].map(v => ({ v, s: 4 })),
                ...prepared.map((r, index) => [
                    index + 1,
                    { v: r.nama_lengkap || `Siswa ${r.nisn || '-'}`, s: 10 },
                    { v: String(r.nisn || ''), s: 10 },
                    r.session_status || '-',
                    `${r.progress_answered || 0}/${r.progress_total || r.total_soal_export || 0}`,
                    r.camera_export, r.screen_export, Number(r.violation_count || 0),
                    { v: r.integrity_risk, s: r.integrity_risk === 'Normal' ? 6 : 7 },
                    getDeviceBriefPlain(r), getBrowserBriefPlain(r), Number(r.network_mbps || 0) || '',
                    formatLocationPlain(rowToLocation(r)), getMapsLink(rowToLocation(r))
                ])
            ]
        },
        {
            name: 'Riwayat Percobaan',
            freezeRows: 5,
            autoFilter: true,
            autoFilterRow: 5,
            hideGridLines: true,
            merges: ['A1:Q1', 'A2:Q2'],
            rowHeights: { 1: 30, 2: 22, 5: 32 },
            print: { orientation: 'landscape', fitToWidth: 1 },
            widths: [7, 18, 30, 18, 16, 10, 10, 10, 10, 10, 12, 20, 20, 14, 18, 20, 28],
            rows: [
                [{ v: `RIWAYAT PERCOBAAN - ${title}`, s: 1 }],
                [{ v: 'Arsip lengkap seluruh submit. Rekap Nilai memakai percobaan terbaru per NISN.', s: 2 }],
                [],
                [{ v: `Total percobaan ${stats.totalAttempts}`, s: 11 }, { v: `Percobaan ulang ${stats.repeatAttempts}`, s: 11 }, { v: `Peserta unik ${stats.total}`, s: 11 }],
                ['No','NISN','Nama Siswa','Kelas','Percobaan Ke','Nilai','Benar','Salah','Kosong','Total Soal','Predikat','Mulai','Selesai','Durasi Menit','Status Sesi','Waktu Submit','ID Sesi'].map(v => ({ v, s: 4 })),
                ...attempts.map((r, index) => [
                    index + 1,
                    { v: String(r.nisn || ''), s: 10 },
                    { v: r.nama_lengkap || `Siswa ${r.nisn || '-'}`, s: 10 },
                    r.kelas_export,
                    r.attempt_number,
                    { v: Number(r.nilai || 0), s: 9 },
                    Number(r.benar || 0),
                    Number(r.salah || 0),
                    Number(r.kosong || 0),
                    r.total_soal_export,
                    r.predikat,
                    formatDateTimePlain(r.start_export),
                    formatDateTimePlain(r.finish_export),
                    r.duration_minutes ?? '',
                    r.session_status || '-',
                    formatDateTimePlain(r.selesai_at),
                    r.session_id || ''
                ])
            ]
        }
    ];

    return createXlsxBuffer(sheets);
}

function prepareCbtRowsForExport(rows, exam = null) {
    const attemptCounters = new Map();
    return [...rows]
        .sort((a, b) => {
            const studentDiff = String(a.nama_lengkap || a.nisn || '').localeCompare(String(b.nama_lengkap || b.nisn || ''), 'id');
            if (studentDiff) return studentDiff;
            return dateValue(a.selesai_at || a.end_time) - dateValue(b.selesai_at || b.end_time);
        })
        .map(row => {
            const totalSoal = Number(row.benar || 0) + Number(row.salah || 0) + Number(row.kosong || 0);
            const nilai = Number(row.nilai || 0);
            const kkm = 70;
            const mulai = row.start_time || '';
            const selesai = row.selesai_at || row.end_time || '';
            const camera = row.camera_status || '-';
            const screen = row.screen_status || '-';
            const violationCount = Number(row.violation_count || 0);
            const integrityRisk = violationCount >= 3 || camera === 'denied' || screen === 'denied'
                ? 'Perlu review'
                : violationCount > 0 ? 'Ada catatan' : 'Normal';
            const studentKey = String(row.nisn || row.nama_lengkap || row.session_id || 'tanpa-identitas');
            const attemptNumber = (attemptCounters.get(studentKey) || 0) + 1;
            attemptCounters.set(studentKey, attemptNumber);

            return {
                ...row,
                rank: 0,
                attempt_number: attemptNumber,
                kkm,
                total_soal_export: totalSoal || Number(row.question_count || exam?.question_count || 0),
                percentage_correct: totalSoal ? Math.round((Number(row.benar || 0) / totalSoal) * 10000) / 100 : 0,
                status_admin: nilai >= kkm ? 'Tuntas' : 'Remedial',
                predikat: getCbtPredicate(nilai),
                duration_minutes: minutesBetween(mulai, selesai),
                integrity_risk: integrityRisk,
                camera_export: camera,
                screen_export: screen,
                mapel_label: formatMapelLabel(row.mapel || exam?.mapel || ''),
                exam_title_export: row.exam_title || exam?.title || '-',
                kelas_export: row.siswa_kelas || row.kelas_siswa || row.kelas_ujian || exam?.kelas || '-',
                jenis_ujian_export: row.jenis_ujian || 'CBT',
                start_export: mulai,
                finish_export: selesai,
            };
        });
}

function selectLatestCbtAttempts(rows) {
    const latestByStudent = new Map();
    for (const row of rows) {
        const key = String(row.nisn || row.nama_lengkap || row.session_id || '');
        const existing = latestByStudent.get(key);
        if (!existing || dateValue(row.selesai_at || row.finish_export) >= dateValue(existing.selesai_at || existing.finish_export)) {
            latestByStudent.set(key, row);
        }
    }
    return [...latestByStudent.values()]
        .sort((a, b) => {
            const scoreDiff = Number(b.nilai || 0) - Number(a.nilai || 0);
            if (scoreDiff) return scoreDiff;
            return String(a.nama_lengkap || a.nisn || '').localeCompare(String(b.nama_lengkap || b.nisn || ''), 'id');
        })
        .map((row, index) => ({ ...row, rank: index + 1 }));
}

function dateValue(value) {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isFinite(time) ? time : 0;
}

function summarizeCbtRows(rows) {
    const scores = rows.map(r => Number(r.nilai || 0));
    const total = rows.length;
    const pass = rows.filter(r => Number(r.nilai || 0) >= 70).length;
    return {
        total,
        avg: total ? Math.round((scores.reduce((a, b) => a + b, 0) / total) * 100) / 100 : 0,
        max: total ? Math.max(...scores) : 0,
        min: total ? Math.min(...scores) : 0,
        pass,
        remedial: total - pass,
        passRate: total ? Math.round((pass / total) * 10000) / 100 : 0,
        violations: rows.reduce((sum, r) => sum + Number(r.violation_count || 0), 0),
        completeNames: rows.filter(r => r.nama_lengkap && r.nama_lengkap !== r.nisn).length,
        missingNames: rows.filter(r => !r.nama_lengkap || r.nama_lengkap === r.nisn).length,
        completeProfiles: rows.filter(hasCompleteStudentProfile).length,
        incompleteProfiles: rows.filter(r => !hasCompleteStudentProfile(r)).length,
        integrityReview: rows.filter(r => r.integrity_risk !== 'Normal').length,
        predicates: rows.reduce((acc, r) => {
            acc[getCbtPredicate(Number(r.nilai || 0))] += 1;
            return acc;
        }, { A: 0, B: 0, C: 0, D: 0 })
    };
}

function hasCompleteStudentProfile(row) {
    return Boolean(
        row.nama_lengkap
        && row.nisn
        && row.kelas_export
        && row.jurusan
        && row.jenis_kelamin
        && row.tanggal_lahir
    );
}

function getCbtPredicate(score) {
    const value = Number(score || 0);
    if (value >= 90) return 'A';
    if (value >= 80) return 'B';
    if (value >= 70) return 'C';
    return 'D';
}

function minutesBetween(startIso, endIso) {
    if (!startIso || !endIso) return null;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.round((end - start) / 60000);
}

function getDeviceBriefPlain(row) {
    const info = row.device_info || {};
    const battery = info.battery?.level ? ` - Baterai ${info.battery.level}%` : '';
    const screen = info.screenW && info.screenH ? ` - ${info.screenW}x${info.screenH}` : '';
    return `${info.device || info.platform || info.name || '-'}${screen}${battery}`;
}

function getBrowserBriefPlain(row) {
    const info = row.browser_info || {};
    if (info.name) return `${info.name} ${info.version || ''}`.trim();
    return info.browser || info.userAgent?.slice(0, 100) || '-';
}

function rowToLocation(row) {
    return { location_lat: row.location_lat, location_lng: row.location_lng };
}

function formatLocationPlain(row) {
    if (!row.location_lat || !row.location_lng) return '-';
    return `${String(row.location_lat).slice(0, 12)}, ${String(row.location_lng).slice(0, 12)}`;
}

function getMapsLink(row) {
    if (!row.location_lat || !row.location_lng) return '';
    return `https://www.google.com/maps?q=${encodeURIComponent(`${row.location_lat},${row.location_lng}`)}`;
}

function formatDateTimePlain(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatDatePlain(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function formatMapelLabel(mapel) {
    const labels = {
        matematika: 'Matematika',
        bindo: 'Bahasa Indonesia',
        basing: 'Bahasa Inggris',
        pkk: 'PKK',
        sejarah: 'Sejarah Indonesia',
        produktif: 'Kompetensi Keahlian'
    };
    return labels[mapel] || mapel || '-';
}

async function createXlsxBuffer(sheets) {
    const zip = new JSZip();
    zip.file('[Content_Types].xml', contentTypesXml(sheets.length));
    zip.folder('_rels').file('.rels', rootRelsXml());
    const xl = zip.folder('xl');
    xl.file('workbook.xml', workbookXml(sheets));
    xl.file('styles.xml', stylesXml());
    xl.folder('_rels').file('workbook.xml.rels', workbookRelsXml(sheets.length));
    const worksheets = xl.folder('worksheets');
    sheets.forEach((sheet, index) => worksheets.file(`sheet${index + 1}.xml`, worksheetXml(sheet)));
    return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function contentTypesXml(sheetCount) {
    const sheets = Array.from({ length: sheetCount }, (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets}
</Types>`;
}

function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheets) {
    const sheetXml = sheets.map((sheet, index) =>
        `<sheet name="${xmlEscape(worksheetName(sheet.name))}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetXml}</sheets>
</workbook>`;
}

function workbookRelsXml(sheetCount) {
    const sheetRels = Array.from({ length: sheetCount }, (_, i) =>
        `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
    ).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheetRels}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="6"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Aptos Display"/></font><font><b/><sz val="11"/><color rgb="FF475569"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF334155"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FF1E3A5F"/><name val="Aptos"/></font></fonts>
<fills count="10"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B3B60"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF16324F"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCFCE7"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFE4E6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE0F2FE"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="13"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="9" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="6" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="7" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="2" fontId="5" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="49" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyNumberFormat="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="5" fillId="9" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="10" fontId="5" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyNumberFormat="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(sheet) {
    const rows = sheet.rows || [];
    const maxCols = Math.max(...rows.map(row => row.length), sheet.widths?.length || 1);
    const dimension = `A1:${columnName(maxCols)}${Math.max(rows.length, 1)}`;
    const cols = (sheet.widths || []).map((width, index) =>
        `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
    ).join('');
    const rowXml = rows.map((row, rowIndex) => {
        const rowNumber = rowIndex + 1;
        const height = sheet.rowHeights?.[rowNumber];
        const attrs = height ? ` ht="${height}" customHeight="1"` : '';
        return `<row r="${rowNumber}"${attrs}>${row.map((cell, colIndex) => cellXml(cell, rowNumber, colIndex + 1)).join('')}</row>`;
    }).join('');
    const freezeRows = Number(sheet.freezeRows || (sheet.freezeTopRow ? 1 : 0));
    const showGridLines = sheet.hideGridLines ? ' showGridLines="0"' : '';
    const freezePane = freezeRows > 0
        ? `<pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/>`
        : '';
    const freeze = `<sheetViews><sheetView workbookViewId="0"${showGridLines}>${freezePane}</sheetView></sheetViews>`;
    const filterRow = Number(sheet.autoFilterRow || 1);
    const filter = sheet.autoFilter && rows.length ? `<autoFilter ref="A${filterRow}:${columnName(maxCols)}${rows.length}"/>` : '';
    const merges = (sheet.merges || []).length
        ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref => `<mergeCell ref="${xmlEscape(ref)}"/>`).join('')}</mergeCells>`
        : '';
    const print = sheet.print ? `
<printOptions horizontalCentered="0" verticalCentered="0"/>
<pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/>
<pageSetup orientation="${sheet.print.orientation || 'portrait'}" fitToWidth="${sheet.print.fitToWidth || 1}" fitToHeight="0" paperSize="9"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<dimension ref="${dimension}"/>
${freeze}
<sheetFormatPr defaultRowHeight="18"/>
<cols>${cols}</cols>
<sheetData>${rowXml}</sheetData>
${filter}
${merges}
${print}
</worksheet>`;
}

function cellXml(cell, row, col) {
    const normalized = typeof cell === 'object' && cell !== null && !Array.isArray(cell)
        ? cell
        : { v: cell };
    const value = normalized.v === undefined || normalized.v === null ? '' : normalized.v;
    const ref = `${columnName(col)}${row}`;
    const style = Number.isInteger(normalized.s) ? ` s="${normalized.s}"` : '';
    if (typeof value === 'number' && Number.isFinite(value)) {
        return `<c r="${ref}"${style}><v>${value}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(String(value))}</t></is></c>`;
}

function columnName(index) {
    let name = '';
    let n = index;
    while (n > 0) {
        const rem = (n - 1) % 26;
        name = String.fromCharCode(65 + rem) + name;
        n = Math.floor((n - 1) / 26);
    }
    return name;
}

function worksheetName(value) {
    return String(value || 'Sheet').replace(/[\\/?*:[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
}

function xmlEscape(value) {
    return String(value === undefined || value === null ? '' : value).replace(/[<>&"']/g, char => ({
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&apos;'
    }[char]));
}

function slugifyFilename(value) {
    return String(value || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';
}

function safeParseJson(value) {
    if (!value) return null;
    try { return JSON.parse(value); } catch { return null; }
}

module.exports = router;
