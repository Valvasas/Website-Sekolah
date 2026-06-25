// routes/siswa.js
'use strict';

const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB    = require('../config/database');
const { findSchoolClass } = require('../utils/schoolClasses');

const STAFF = ['guru','tata_usaha','kepala_sekolah','wakil_kepala_sekolah','super_admin'];
const PROFILE_STAFF = ['tata_usaha','kepala_sekolah','wakil_kepala_sekolah','content_admin','super_admin'];
const isStaffRole = (role) => STAFF.includes(role);
const isProfileStaffRole = (role) => PROFILE_STAFF.includes(role);
const cleanText = (value, max = 160) => {
    if (value === undefined) return null;
    if (value === null) return null;
    return String(value).replace(/[<>]/g, '').trim().slice(0, max) || null;
};
const cleanIncoming = (body, field, fallback = null, max = 160) => (
    body[field] === undefined ? fallback : cleanText(body[field], max)
);

/* ── Helper ambil nisn dari token atau param ── */
function getNisn(req) {
    if (['siswa','wali_murid'].includes(req.user.role)) return req.user.nisn;
    return req.params.nisn || req.query.nisn || req.user.nisn;
}

function getStaffTargetNisn(req, res) {
    const nisn = cleanText(req.params.nisn || req.query.nisn || req.body?.nisn, 20);
    if (!nisn) {
        res.status(400).json({ success:false, message:'NISN siswa wajib dipilih oleh guru/staff.' });
        return null;
    }
    return nisn;
}

function clampInt(value, fallback, min, max) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(Math.max(n, min), max);
}

function clampScore(value, fallback = 0) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(100, Math.max(0, n));
}

function gradeFinal(row) {
    return Number((
        clampScore(row.uh) * 0.2 +
        clampScore(row.uts) * 0.25 +
        clampScore(row.uas) * 0.3 +
        clampScore(row.tugas) * 0.25
    ).toFixed(2));
}

function normalizeGradeRow(row) {
    const normalized = {
        ...row,
        uh: clampScore(row.uh),
        uts: clampScore(row.uts),
        uas: clampScore(row.uas),
        tugas: clampScore(row.tugas),
        kkm: clampScore(row.kkm, 70),
    };
    const nilaiFinal = gradeFinal(normalized);
    return {
        ...normalized,
        nilai_final: nilaiFinal,
        lulus: nilaiFinal >= normalized.kkm,
    };
}

function summarizeGrades(rows) {
    const nilai = rows.map(normalizeGradeRow);
    const values = nilai.map(row => row.nilai_final);
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
        rows: nilai,
        stats: {
            rata: values.length ? Number((total / values.length).toFixed(2)) : 0,
            max: values.length ? Math.max(...values) : 0,
            min: values.length ? Math.min(...values) : 0,
            jumlah: values.length,
            lulus: nilai.filter(row => row.lulus).length,
        }
    };
}

function getGradeRows(db, nisn, semester = null) {
    if (semester) {
        return db.prepare('SELECT * FROM nilai_siswa WHERE nisn = ? AND semester = ? ORDER BY mapel')
            .all(nisn, semester);
    }
    return db.prepare('SELECT * FROM nilai_siswa WHERE nisn = ? ORDER BY semester DESC, mapel ASC')
        .all(nisn);
}

/* ══════════════════════════════════════════
   PROFIL SISWA
   ══════════════════════════════════════════ */

/* GET /api/siswa/staff/list — daftar biodata siswa untuk TU sampai admin, bukan guru */
router.get('/staff/list', authenticate, authorize(...PROFILE_STAFF), (req, res) => {
    const db = getDB();
    const { search = '', kelas = '', page = 1, limit = 20 } = req.query;
    const pageInt = clampInt(page, 1, 1, 9999);
    const limitInt = clampInt(limit, 20, 1, 100);
    const offset = (pageInt - 1) * limitInt;
    const conds = ["u.role = 'siswa'"];
    const params = [];

    if (kelas) {
        conds.push('sp.kelas = ?');
        params.push(cleanText(kelas, 50));
    }
    if (search) {
        const s = `%${String(search).replace(/[%_\\]/g, '\\$&').trim()}%`;
        conds.push('(u.nama_lengkap LIKE ? OR u.nisn LIKE ? OR u.email LIKE ? OR sp.kelas LIKE ?)');
        params.push(s, s, s, s);
    }

    const where = `WHERE ${conds.join(' AND ')}`;
    try {
        const rows = db.prepare(`
            SELECT u.id, u.nama_lengkap, u.nisn, u.email, u.no_hp, u.foto_profil,
                   u.is_active, u.last_login, u.created_at,
                   sp.kelas, sp.jurusan, sp.jenis_kelamin, sp.tanggal_lahir,
                   COALESCE(ns.total_nilai, 0) as total_nilai,
                   COALESCE(cr.total_ujian, 0) as total_ujian,
                   cr.last_nilai
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            LEFT JOIN (
                SELECT nisn, COUNT(*) as total_nilai
                FROM nilai_siswa
                GROUP BY nisn
            ) ns ON ns.nisn = u.nisn
            LEFT JOIN (
                SELECT nisn, COUNT(*) as total_ujian, MAX(nilai) as last_nilai
                FROM cbt_results
                GROUP BY nisn
            ) cr ON cr.nisn = u.nisn
            ${where}
            ORDER BY COALESCE(sp.kelas, ''), u.nama_lengkap ASC
            LIMIT ? OFFSET ?
        `).all(...params, limitInt, offset);
        const total = db.prepare(`
            SELECT COUNT(*) as c
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            ${where}
        `).get(...params)?.c || 0;

        res.json({
            success: true,
            data: {
                students: rows,
                pagination: { total, page: pageInt, limit: limitInt, totalPages: Math.ceil(total / limitInt) }
            }
        });
    } catch(e) {
        console.error('[Siswa staff list]', e.message);
        res.status(500).json({ success:false, message:'Gagal mengambil daftar siswa.' });
    }
});

/* GET /api/siswa/staff/:nisn/detail — profil + histori akademik siswa */
router.get('/staff/:nisn/detail', authenticate, authorize(...PROFILE_STAFF), (req, res) => {
    const db = getDB();
    const nisn = cleanText(req.params.nisn, 20);
    if (!nisn) return res.status(400).json({ success:false, message:'NISN wajib diisi.' });

    try {
        const student = db.prepare(`
            SELECT u.id, u.nama_lengkap, u.nisn, u.email, u.no_hp, u.role,
                   u.foto_profil, u.is_active, u.last_login, u.created_at,
                   sp.*
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE u.nisn = ? AND u.role = 'siswa'
        `).get(nisn);

        if (!student) return res.status(404).json({ success:false, message:'Siswa tidak ditemukan.' });

        const gradeData = summarizeGrades(getGradeRows(db, nisn));
        const nilai = gradeData.rows;

        const kehadiran = db.prepare(`
            SELECT * FROM kehadiran
            WHERE nisn = ?
            ORDER BY tanggal DESC
            LIMIT 80
        `).all(nisn);
        const kehadiranSummary = { hadir:0, sakit:0, izin:0, alpha:0 };
        kehadiran.forEach(r => {
            if (kehadiranSummary[r.status] !== undefined) kehadiranSummary[r.status] += 1;
        });

        const tugas = db.prepare(`
            SELECT st.id, st.tugas_id, st.jawaban, st.file_url, st.nilai, st.feedback,
                   st.status, st.submitted_at,
                   tk.judul, tk.mapel, tk.kelas, tk.deadline
            FROM submission_tugas st
            LEFT JOIN tugas_kelas tk ON tk.id = st.tugas_id
            WHERE st.nisn = ?
            ORDER BY st.submitted_at DESC
            LIMIT 80
        `).all(nisn);

        const cbt = db.prepare(`
            SELECT cr.id, cr.exam_id, cr.session_id, cr.mapel, cr.benar, cr.salah,
                   cr.kosong, cr.nilai, cr.selesai_at,
                   e.title as exam_title, e.kelas,
                   cs.violation_count, cs.camera_status, cs.screen_status
            FROM cbt_results cr
            LEFT JOIN cbt_exams e ON e.id = cr.exam_id
            LEFT JOIN cbt_sessions cs ON cs.id = cr.session_id
            WHERE cr.nisn = ?
            ORDER BY cr.selesai_at DESC
            LIMIT 80
        `).all(nisn);

        const raporMetadata = db.prepare('SELECT * FROM rapor_metadata WHERE nisn = ?').all(nisn);

        res.json({
            success: true,
            data: { student, nilai, nilaiSummary: gradeData.stats, kehadiran, kehadiranSummary, tugas, cbt, raporMetadata }
        });
    } catch(e) {
        console.error('[Siswa staff detail]', e.message);
        res.status(500).json({ success:false, message:'Gagal mengambil detail siswa.' });
    }
});

/* GET /api/siswa/profil — ambil profil sendiri atau by nisn (staff) */
router.get('/profil', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = getNisn(req);
        if (!nisn) return res.status(400).json({ success:false, message:'NISN tidak ditemukan.' });

        /* Gabung dari tabel users + siswa_profil */
        const user = db.prepare(
            `SELECT u.id, u.nama_lengkap, u.nisn, u.email, u.no_hp, u.role, u.foto_profil
             FROM users u WHERE u.nisn = ?`
        ).get(nisn);

        if (!user) return res.status(404).json({ success:false, message:'Siswa tidak ditemukan.' });

        const profil = db.prepare('SELECT * FROM siswa_profil WHERE nisn = ?').get(nisn);

        res.json({ success:true, data: { ...user, profil: profil || null } });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* PUT /api/siswa/profil — siswa isi biodata sendiri, staff bisa koreksi data siswa */
router.put('/profil', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = getNisn(req);
        const now  = new Date().toISOString();
        const isStaff = isProfileStaffRole(req.user.role);
        if (!nisn) return res.status(400).json({ success:false, message:'NISN tidak ditemukan.' });

        const targetUser = db.prepare('SELECT id, role, email, no_hp FROM users WHERE nisn = ?').get(nisn);
        if (!targetUser) return res.status(404).json({ success:false, message:'Siswa tidak ditemukan.' });

        const {
            kelas, jurusan, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
            alamat, kelurahan, kecamatan, nama_ayah, pekerjaan_ayah,
            nama_ibu, pekerjaan_ibu, no_hp_ortu, email_ortu,
            email, no_hp,
        } = req.body;

        const restrictedTouched = [
            'kelas','jurusan','tempat_lahir','tanggal_lahir','jenis_kelamin','agama',
            'alamat','kelurahan','kecamatan','nama_ayah','pekerjaan_ayah',
            'nama_ibu','pekerjaan_ibu','no_hp_ortu','email_ortu'
        ].some(field => req.body[field] !== undefined);

        if (restrictedTouched && !isStaff && req.user.role !== 'siswa') {
            return res.status(403).json({ success:false, message:'Biodata hanya bisa diubah oleh siswa terkait atau staff.' });
        }

        if (!isStaff) {
            const requiredInput = {
                kelas, jurusan, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
                alamat, kelurahan, kecamatan, nama_ayah, pekerjaan_ayah,
                nama_ibu, pekerjaan_ibu, no_hp_ortu, email_ortu,
                email: email === undefined ? targetUser.email : email,
                no_hp: no_hp === undefined ? targetUser.no_hp : no_hp,
            };
            const missingInput = Object.entries(requiredInput)
                .filter(([, value]) => !String(value || '').trim())
                .map(([key]) => key);
            if (missingInput.length) {
                return res.status(400).json({ success:false, message:`Lengkapi biodata wajib: ${missingInput.slice(0, 5).join(', ')}.` });
            }
            if (kelas && !findSchoolClass(kelas)) return res.status(400).json({ success:false, message:'Kelas tidak valid.' });
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(requiredInput.email)) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(requiredInput.email_ortu))) {
                return res.status(400).json({ success:false, message:'Format email siswa atau orang tua tidak valid.' });
            }
            if (!/^[0-9+\-\s]{8,24}$/.test(String(requiredInput.no_hp)) || !/^[0-9+\-\s]{8,24}$/.test(String(requiredInput.no_hp_ortu))) {
                return res.status(400).json({ success:false, message:'Nomor HP siswa atau orang tua tidak valid.' });
            }
        }

        const userFields = [];
        const userVals = { id: targetUser.id, now };
        if (email !== undefined) {
            const emailClean = cleanText(email, 120);
            if (emailClean) {
                const used = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(emailClean.toLowerCase(), targetUser.id);
                if (used) return res.status(409).json({ success:false, message:'Email sudah digunakan.' });
            }
            userFields.push('email=:email');
            userVals.email = emailClean ? emailClean.toLowerCase() : null;
        }
        if (no_hp !== undefined) {
            userFields.push('no_hp=:hp');
            userVals.hp = cleanText(no_hp, 24);
        }
        if (userFields.length) {
            userFields.push('updated_at=:now');
            db.prepare(`UPDATE users SET ${userFields.join(',')} WHERE id=:id`).run(userVals);
        }

        if (!restrictedTouched) {
            return res.json({ success:true, message:'Profil berhasil diperbarui.' });
        }

        const classInfo = kelas ? findSchoolClass(kelas) : null;
        if (kelas && !classInfo) {
            return res.status(400).json({ success:false, message:'Kelas tidak valid.' });
        }

        const finalKelas = classInfo?.kelas || cleanText(kelas, 50);
        const finalJurusan = classInfo?.jurusan || cleanText(jurusan, 100);
        const exists = db.prepare('SELECT * FROM siswa_profil WHERE nisn = ?').get(nisn);
        const finalProfile = {
            kelas: kelas === undefined ? exists?.kelas || null : finalKelas,
            jurusan: jurusan === undefined && kelas === undefined ? exists?.jurusan || null : finalJurusan,
            tempat_lahir: cleanIncoming(req.body, 'tempat_lahir', exists?.tempat_lahir || null, 80),
            tanggal_lahir: cleanIncoming(req.body, 'tanggal_lahir', exists?.tanggal_lahir || null, 20),
            jenis_kelamin: cleanIncoming(req.body, 'jenis_kelamin', exists?.jenis_kelamin || null, 20),
            agama: cleanIncoming(req.body, 'agama', exists?.agama || null, 40),
            alamat: cleanIncoming(req.body, 'alamat', exists?.alamat || null, 300),
            kelurahan: cleanIncoming(req.body, 'kelurahan', exists?.kelurahan || null, 80),
            kecamatan: cleanIncoming(req.body, 'kecamatan', exists?.kecamatan || null, 80),
            nama_ayah: cleanIncoming(req.body, 'nama_ayah', exists?.nama_ayah || null, 120),
            pekerjaan_ayah: cleanIncoming(req.body, 'pekerjaan_ayah', exists?.pekerjaan_ayah || null, 100),
            nama_ibu: cleanIncoming(req.body, 'nama_ibu', exists?.nama_ibu || null, 120),
            pekerjaan_ibu: cleanIncoming(req.body, 'pekerjaan_ibu', exists?.pekerjaan_ibu || null, 100),
            no_hp_ortu: cleanIncoming(req.body, 'no_hp_ortu', exists?.no_hp_ortu || null, 24),
            email_ortu: cleanIncoming(req.body, 'email_ortu', exists?.email_ortu || null, 120),
        };

        if (!isStaff) {
            const required = {
                kelas: finalProfile.kelas,
                jurusan: finalProfile.jurusan,
                tempat_lahir: finalProfile.tempat_lahir,
                tanggal_lahir: finalProfile.tanggal_lahir,
                jenis_kelamin: finalProfile.jenis_kelamin,
                agama: finalProfile.agama,
                alamat: finalProfile.alamat,
                kelurahan: finalProfile.kelurahan,
                kecamatan: finalProfile.kecamatan,
                nama_ayah: finalProfile.nama_ayah,
                pekerjaan_ayah: finalProfile.pekerjaan_ayah,
                nama_ibu: finalProfile.nama_ibu,
                pekerjaan_ibu: finalProfile.pekerjaan_ibu,
                no_hp_ortu: finalProfile.no_hp_ortu,
                email_ortu: finalProfile.email_ortu,
                email: email === undefined ? targetUser.email : userVals.email,
                no_hp: no_hp === undefined ? targetUser.no_hp : userVals.hp,
            };
            const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
            if (missing.length) {
                return res.status(400).json({ success:false, message:`Lengkapi biodata wajib: ${missing.slice(0, 5).join(', ')}.` });
            }
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(required.email) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(required.email_ortu)) {
                return res.status(400).json({ success:false, message:'Format email siswa atau orang tua tidak valid.' });
            }
            if (!/^[0-9+\-\s]{8,24}$/.test(required.no_hp) || !/^[0-9+\-\s]{8,24}$/.test(required.no_hp_ortu)) {
                return res.status(400).json({ success:false, message:'Nomor HP siswa atau orang tua tidak valid.' });
            }
        }

        if (exists) {
            db.prepare(`UPDATE siswa_profil SET
                kelas=?,jurusan=?,tempat_lahir=?,tanggal_lahir=?,jenis_kelamin=?,agama=?,
                alamat=?,kelurahan=?,kecamatan=?,nama_ayah=?,pekerjaan_ayah=?,
                nama_ibu=?,pekerjaan_ibu=?,no_hp_ortu=?,email_ortu=?,updated_at=?
                WHERE nisn=?`).run(
                finalProfile.kelas,finalProfile.jurusan,finalProfile.tempat_lahir,finalProfile.tanggal_lahir,finalProfile.jenis_kelamin,finalProfile.agama,
                finalProfile.alamat,finalProfile.kelurahan,finalProfile.kecamatan,finalProfile.nama_ayah,finalProfile.pekerjaan_ayah,
                finalProfile.nama_ibu,finalProfile.pekerjaan_ibu,finalProfile.no_hp_ortu,finalProfile.email_ortu,now,nisn
            );
        } else {
            db.prepare(`INSERT INTO siswa_profil
                (id,user_id,nisn,kelas,jurusan,tempat_lahir,tanggal_lahir,jenis_kelamin,agama,
                 alamat,kelurahan,kecamatan,nama_ayah,pekerjaan_ayah,nama_ibu,pekerjaan_ibu,
                 no_hp_ortu,email_ortu,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                uuidv4(), targetUser.id, nisn,
                finalProfile.kelas,finalProfile.jurusan,finalProfile.tempat_lahir,finalProfile.tanggal_lahir,finalProfile.jenis_kelamin,finalProfile.agama,
                finalProfile.alamat,finalProfile.kelurahan,finalProfile.kecamatan,finalProfile.nama_ayah,finalProfile.pekerjaan_ayah,
                finalProfile.nama_ibu,finalProfile.pekerjaan_ibu,finalProfile.no_hp_ortu,finalProfile.email_ortu,now
            );
        }

        res.json({ success:true, message:'Profil berhasil diperbarui.' });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ══════════════════════════════════════════
   NILAI
   ══════════════════════════════════════════ */

router.get('/nilai', authenticate, (req, res) => {
    try {
        const db       = getDB();
        const nisn     = isStaffRole(req.user.role)
            ? getStaffTargetNisn(req, res)
            : req.user.role === 'siswa'
                ? cleanText(req.user.nisn, 20)
                : null;
        if (!nisn && !res.headersSent) {
            return res.status(403).json({ success:false, message:'Akses nilai hanya tersedia untuk siswa terkait atau guru/staff.' });
        }
        if (!nisn) return;
        const semester = req.query.semester || 'genap';

        const gradeData = summarizeGrades(getGradeRows(db, nisn, semester));
        res.json({ success:true, data: gradeData.rows, stats: gradeData.stats });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* POST /api/siswa/nilai — input nilai (guru/staff) */
router.post('/nilai', authenticate, authorize(...STAFF), (req, res) => {
    try {
        const db  = getDB();
        const now = new Date().toISOString();
        const { nisn, semester, mapel, uh, uts, uas, tugas, kkm } = req.body;
        if (!nisn || !semester || !mapel) return res.status(400).json({ success:false, message:'nisn, semester, mapel wajib.' });

        const scores = {
            uh: clampScore(uh),
            uts: clampScore(uts),
            uas: clampScore(uas),
            tugas: clampScore(tugas),
            kkm: clampScore(kkm, 70),
        };

        const exists = db.prepare('SELECT id FROM nilai_siswa WHERE nisn=? AND semester=? AND mapel=?').get(nisn,semester,mapel);
        if (exists) {
            db.prepare('UPDATE nilai_siswa SET uh=?,uts=?,uas=?,tugas=?,kkm=? WHERE id=?')
              .run(scores.uh,scores.uts,scores.uas,scores.tugas,scores.kkm,exists.id);
        } else {
            db.prepare(`INSERT INTO nilai_siswa (id,nisn,semester,mapel,uh,uts,uas,tugas,kkm,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
              .run(uuidv4(),nisn,semester,mapel,scores.uh,scores.uts,scores.uas,scores.tugas,scores.kkm,now);
        }
        const saved = normalizeGradeRow({ nisn, semester, mapel, ...scores });
        res.json({ success:true, message:'Nilai berhasil disimpan dan ringkasan dashboard diperbarui.', data: saved });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ══════════════════════════════════════════
   KEHADIRAN
   ══════════════════════════════════════════ */

router.get('/kehadiran', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = getNisn(req);

        const riwayat = db.prepare(
            'SELECT * FROM kehadiran WHERE nisn=? ORDER BY tanggal DESC LIMIT 50'
        ).all(nisn);

        /* Hitung summary */
        const all = db.prepare('SELECT status, COUNT(*) as cnt FROM kehadiran WHERE nisn=? GROUP BY status').all(nisn);
        const summary = { hadir:0, sakit:0, izin:0, alpha:0 };
        all.forEach(r => { if (summary[r.status] !== undefined) summary[r.status] = r.cnt; });
        const total = Object.values(summary).reduce((a,b)=>a+b,0);
        summary.persen = total ? Math.round((summary.hadir/total)*100) : 100;

        res.json({ success:true, data: riwayat, summary });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* POST /api/siswa/kehadiran — input kehadiran (guru/staff) */
router.post('/kehadiran', authenticate, authorize(...STAFF), (req, res) => {
    try {
        const db  = getDB();
        const now = new Date().toISOString();
        const rows = Array.isArray(req.body) ? req.body : [req.body];

        for (const r of rows) {
            const { nisn, tanggal, hari, status, keterangan } = r;
            if (!nisn || !tanggal || !status) continue;
            const exists = db.prepare('SELECT id FROM kehadiran WHERE nisn=? AND tanggal=?').get(nisn, tanggal);
            if (exists) {
                db.prepare('UPDATE kehadiran SET status=?,keterangan=?,hari=? WHERE id=?')
                  .run(status, keterangan||'', hari||'', exists.id);
            } else {
                db.prepare(`INSERT INTO kehadiran (id,nisn,tanggal,hari,status,keterangan,created_at)
                    VALUES (?,?,?,?,?,?,?)`)
                  .run(uuidv4(),nisn,tanggal,hari||'',status,keterangan||'',now);
            }
        }
        res.json({ success:true, message:'Kehadiran berhasil disimpan.' });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ══════════════════════════════════════════
   JADWAL
   ══════════════════════════════════════════ */

router.get('/jadwal', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = getNisn(req);

        /* Ambil kelas dari profil */
        let kelas = req.query.kelas;
        if (!kelas) {
            const profil = db.prepare('SELECT kelas FROM siswa_profil WHERE nisn=?').get(nisn);
            kelas = profil?.kelas || 'XI TKJ 1';
        }

        const rows = db.prepare(
            `SELECT * FROM jadwal WHERE kelas=?
             ORDER BY CASE hari
                WHEN 'senin' THEN 1 WHEN 'selasa' THEN 2 WHEN 'rabu' THEN 3
                WHEN 'kamis' THEN 4 WHEN 'jumat' THEN 5 ELSE 6 END, jam`
        ).all(kelas);

        /* Kelompokkan per hari */
        const grouped = {};
        rows.forEach(r => {
            if (!grouped[r.hari]) grouped[r.hari] = [];
            grouped[r.hari].push(r);
        });

        res.json({ success:true, data: grouped, kelas });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ══════════════════════════════════════════
   DASHBOARD SUMMARY (beranda portal siswa)
   ══════════════════════════════════════════ */

router.get('/dashboard', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = getNisn(req);
        if (!nisn) return res.status(400).json({ success:false, message:'NISN tidak ditemukan.' });
        const canSeeGrades = isStaffRole(req.user.role);
        const gradeData = canSeeGrades
            ? summarizeGrades(getGradeRows(db, nisn, 'genap'))
            : { stats: { rata: null, max: null, min: null, jumlah: 0, lulus: 0 } };

        /* Kehadiran */
        const khRows = db.prepare('SELECT status, COUNT(*) as cnt FROM kehadiran WHERE nisn=? GROUP BY status').all(nisn);
        const kh = { hadir:0, sakit:0, izin:0, alpha:0 };
        khRows.forEach(r => { if (kh[r.status]!==undefined) kh[r.status]=r.cnt; });
        const totalKh = Object.values(kh).reduce((a,b)=>a+b,0);

        /* Profil */
        const profil = db.prepare('SELECT kelas, jurusan FROM siswa_profil WHERE nisn=?').get(nisn);

        res.json({
            success: true,
            data: {
                nisn,
                kelas    : profil?.kelas   || '-',
                jurusan  : profil?.jurusan || '-',
                nilai_rata: canSeeGrades ? gradeData.stats.rata : null,
                nilai_stats: canSeeGrades ? gradeData.stats : null,
                kehadiran : kh.hadir,
                absen_total: kh.sakit + kh.izin + kh.alpha,
                persen_hadir: totalKh ? Math.round((kh.hadir/totalKh)*100) : 100,
            }
        });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* GET /api/siswa/rapor — Ambil data E-Rapor lengkap */
router.get('/rapor', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = isStaffRole(req.user.role)
            ? getStaffTargetNisn(req, res)
            : req.user.role === 'siswa'
                ? cleanText(req.user.nisn, 20)
                : null;
        if (!nisn && !res.headersSent) {
            return res.status(403).json({ success:false, message:'Akses rapor hanya tersedia untuk siswa terkait atau guru/staff.' });
        }
        if (!nisn) return;

        const semester = req.query.semester || 'genap';
        const tahun_ajaran = req.query.tahun_ajaran || '2025/2026';

        // 1. Ambil data profil siswa
        const student = db.prepare(`
            SELECT u.nama_lengkap, u.nisn, u.email, sp.kelas, sp.jurusan, sp.tempat_lahir, sp.tanggal_lahir, sp.jenis_kelamin, sp.agama, sp.alamat
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE u.nisn = ?
        `).get(nisn);

        if (!student) return res.status(404).json({ success:false, message:'Data siswa tidak ditemukan.' });

        // 2. Ambil nilai & rekap
        const gradesData = summarizeGrades(getGradeRows(db, nisn, semester));

        // 3. Ambil kehadiran
        const khRows = db.prepare('SELECT status, COUNT(*) as cnt FROM kehadiran WHERE nisn=? GROUP BY status').all(nisn);
        const kehadiran = { hadir:0, sakit:0, izin:0, alpha:0 };
        khRows.forEach(r => { if (kehadiran[r.status] !== undefined) kehadiran[r.status] = r.cnt; });

        // 4. Ambil rapor metadata (catatan & status kenaikan)
        const metadata = db.prepare('SELECT catatan, kenaikan_kelas FROM rapor_metadata WHERE nisn = ? AND semester = ? AND tahun_ajaran = ?')
            .get(nisn, semester, tahun_ajaran) || { catatan: '', kenaikan_kelas: '' };

        res.json({
            success: true,
            data: {
                student,
                grades: gradesData.rows,
                stats: gradesData.stats,
                kehadiran,
                metadata,
                semester,
                tahun_ajaran
            }
        });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* POST /api/siswa/rapor/catatan — Input Catatan Wali Kelas & Kenaikan Kelas */
router.post('/rapor/catatan', authenticate, authorize(...STAFF), (req, res) => {
    try {
        const db  = getDB();
        const now = new Date().toISOString();
        const { nisn, semester, tahun_ajaran, catatan, kenaikan_kelas } = req.body;

        if (!nisn || !semester || !tahun_ajaran) {
            return res.status(400).json({ success:false, message:'nisn, semester, dan tahun_ajaran wajib diisi.' });
        }

        const exists = db.prepare('SELECT id FROM rapor_metadata WHERE nisn = ? AND semester = ? AND tahun_ajaran = ?').get(nisn, semester, tahun_ajaran);
        if (exists) {
            db.prepare('UPDATE rapor_metadata SET catatan = ?, kenaikan_kelas = ? WHERE id = ?')
              .run(cleanText(catatan, 1000), cleanText(kenaikan_kelas, 100), exists.id);
        } else {
            db.prepare('INSERT INTO rapor_metadata (id, nisn, semester, tahun_ajaran, catatan, kenaikan_kelas, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
              .run(uuidv4(), nisn, semester, cleanText(tahun_ajaran, 20), cleanText(catatan, 1000), cleanText(kenaikan_kelas, 100), now);
        }

        res.json({ success:true, message:'Catatan E-Rapor berhasil disimpan.' });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

module.exports = router;
