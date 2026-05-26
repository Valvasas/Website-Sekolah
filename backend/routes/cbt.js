// routes/cbt.js — NEW FILE
// FIX: Token ujian sekarang di-generate server-side, bukan 'ujian' + 4 digit NISN
'use strict';

const express  = require('express');
const router   = express.Router();
const crypto   = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB    = require('../config/database');

const STAFF = ['guru', 'tata_usaha', 'kepala_sekolah', 'super_admin'];

// ── Helper: generate token acak 32 karakter ──────────────────────
function generateCbtToken() {
    return crypto.randomBytes(16).toString('hex'); // 32 char hex
}

// ── Helper: hitung expiry (default 3 jam dari sekarang) ──────────
function getExpiry(jamTambah = 3) {
    const d = new Date();
    d.setHours(d.getHours() + jamTambah);
    return d.toISOString();
}

/* ──────────────────────────────────────────────────────────────────
   POST /api/cbt/token/generate
   Guru/staff generate token ujian untuk satu siswa atau bulk (batch)
   Body: { nisn: '0012345678', mapel: 'matematika', durasi_menit: 90 }
   atau bulk: { siswa: ['0012345678', '0023456789'], mapel: 'matematika' }
   ────────────────────────────────────────────────────────────────── */
router.post('/token/generate', authenticate, authorize(...STAFF), (req, res) => {
    const db  = getDB();
    const now = new Date().toISOString();
    const { nisn, siswa: bulkNisn, mapel, durasi_menit = 90 } = req.body;

    if (!mapel) {
        return res.status(400).json({ success: false, message: 'mapel wajib diisi.' });
    }

    // Validasi mapel
    const validMapel = ['matematika', 'bindo', 'basing', 'pkk', 'sejarah', 'produktif'];
    if (!validMapel.includes(mapel)) {
        return res.status(400).json({
            success: false,
            message: `mapel tidak valid. Pilihan: ${validMapel.join(', ')}`
        });
    }

    try {
        // Mode bulk (array NISN)
        if (Array.isArray(bulkNisn) && bulkNisn.length > 0) {
            if (bulkNisn.length > 100) {
                return res.status(400).json({ success: false, message: 'Maksimal 100 siswa per batch.' });
            }

            const results = [];
            const expiry  = getExpiry(durasi_menit / 60 + 1); // durasi ujian + 1 jam buffer

            for (const n of bulkNisn) {
                // Invalidate token lama untuk mapel yang sama
                db.prepare(
                    `UPDATE cbt_sessions SET used = 1 WHERE nisn = ? AND mapel = ? AND used = 0`
                ).run(n, mapel);

                const token = generateCbtToken();
                db.prepare(`
                    INSERT INTO cbt_sessions (id, nisn, mapel, token, used, durasi_menit, expires_at, created_at)
                    VALUES (?, ?, ?, ?, 0, ?, ?, ?)
                `).run(uuidv4(), n, mapel, token, durasi_menit, expiry, now);

                results.push({ nisn: n, token, expires_at: expiry });
            }

            return res.status(201).json({
                success: true,
                message: `${results.length} token berhasil di-generate.`,
                data:    results
            });
        }

        // Mode single NISN
        if (!nisn) {
            return res.status(400).json({ success: false, message: 'nisn atau siswa (array) wajib diisi.' });
        }

        // Cek siswa ada di DB
        const user = db.prepare('SELECT id FROM users WHERE nisn = ? AND role = ?').get(nisn, 'siswa');
        if (!user) {
            return res.status(404).json({ success: false, message: `Siswa dengan NISN ${nisn} tidak ditemukan.` });
        }

        // Invalidate token lama
        db.prepare(
            `UPDATE cbt_sessions SET used = 1 WHERE nisn = ? AND mapel = ? AND used = 0`
        ).run(nisn, mapel);

        const token  = generateCbtToken();
        const expiry = getExpiry(durasi_menit / 60 + 1);

        db.prepare(`
            INSERT INTO cbt_sessions (id, nisn, mapel, token, used, durasi_menit, expires_at, created_at)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?)
        `).run(uuidv4(), nisn, mapel, token, durasi_menit, expiry, now);

        return res.status(201).json({
            success: true,
            message: 'Token ujian berhasil di-generate.',
            data:    { nisn, mapel, token, expires_at: expiry, durasi_menit }
        });

    } catch (err) {
        console.error('[CBT generate token]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal generate token ujian.' });
    }
});

/* ──────────────────────────────────────────────────────────────────
   POST /api/cbt/token/validate
   Dipanggil dari cbt.html sebelum ujian dimulai — validasi token
   Body: { nisn, token }
   Return: { valid: true, mapel, durasi_menit, siswa_nama }
   ────────────────────────────────────────────────────────────────── */
router.post('/token/validate', (req, res) => {
    const db = getDB();
    const { nisn, token } = req.body;

    if (!nisn || !token) {
        return res.status(400).json({ success: false, message: 'nisn dan token wajib ada.' });
    }

    // Basic format check — token harus 32 hex chars
    if (!/^[a-f0-9]{32}$/.test(token)) {
        return res.status(400).json({ success: false, message: 'Format token tidak valid.' });
    }

    try {
        const session = db.prepare(`
            SELECT cs.*, u.nama_lengkap
            FROM cbt_sessions cs
            JOIN users u ON cs.nisn = u.nisn
            WHERE cs.token = ?
              AND cs.nisn  = ?
              AND cs.used  = 0
              AND cs.expires_at > datetime('now')
        `).get(token, nisn);

        if (!session) {
            return res.status(401).json({
                success: false,
                message: 'Token tidak valid, sudah digunakan, atau sudah kadaluarsa. Hubungi guru pengawas.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Token valid.',
            data: {
                nisn:         session.nisn,
                mapel:        session.mapel,
                durasi_menit: session.durasi_menit,
                siswa_nama:   session.nama_lengkap,
                expires_at:   session.expires_at
            }
        });

    } catch (err) {
        console.error('[CBT validate token]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memvalidasi token.' });
    }
});

/* ──────────────────────────────────────────────────────────────────
   GET /api/cbt/tokens?mapel=matematika
   Lihat semua token aktif (untuk guru di panel admin)
   ────────────────────────────────────────────────────────────────── */
router.get('/tokens', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { mapel, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        let sql    = `
            SELECT cs.nisn, cs.mapel, cs.token, cs.used, cs.durasi_menit,
                   cs.start_time, cs.end_time, cs.expires_at, cs.created_at,
                   u.nama_lengkap
            FROM cbt_sessions cs
            LEFT JOIN users u ON cs.nisn = u.nisn
            WHERE 1=1
        `;
        const params = [];

        if (mapel) { sql += ' AND cs.mapel = ?'; params.push(mapel); }

        sql += ' ORDER BY cs.created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const rows  = db.prepare(sql).all(...params);
        const total = db.prepare(`
            SELECT COUNT(*) as c FROM cbt_sessions ${mapel ? 'WHERE mapel = ?' : ''}
        `).get(...(mapel ? [mapel] : []))?.c || 0;

        return res.status(200).json({
            success: true,
            data: {
                tokens: rows,
                pagination: {
                    total, page: parseInt(page),
                    limit: parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (err) {
        console.error('[CBT get tokens]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data token.' });
    }
});

/* ──────────────────────────────────────────────────────────────────
   DELETE /api/cbt/token/:token
   Invalidate token sebelum ujian dimulai
   ────────────────────────────────────────────────────────────────── */
router.delete('/token/:token', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        db.prepare(`UPDATE cbt_sessions SET used = 1 WHERE token = ?`).run(req.params.token);
        return res.status(200).json({ success: true, message: 'Token berhasil diinvalidasi.' });
    } catch (err) {
        console.error('[CBT invalidate token]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal invalidasi token.' });
    }
});

/* ──────────────────────────────────────────────────────────────────
   GET /api/cbt/results — hasil ujian semua siswa (sudah ada di content.js)
   Ini versi yang lebih lengkap dengan join ke siswa
   ────────────────────────────────────────────────────────────────── */
router.get('/results', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { nisn, mapel, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    try {
        const conds  = [];
        const params = [];
        if (nisn)  { conds.push('cr.nisn = ?');  params.push(nisn); }
        if (mapel) { conds.push('cr.mapel = ?'); params.push(mapel); }

        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const rows  = db.prepare(`
            SELECT cr.*, u.nama_lengkap, u.no_hp
            FROM cbt_results cr
            LEFT JOIN users u ON cr.nisn = u.nisn
            ${where}
            ORDER BY cr.selesai_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, parseInt(limit), offset);

        const total = db.prepare(`
            SELECT COUNT(*) as c FROM cbt_results cr ${where}
        `).get(...params)?.c || 0;

        return res.status(200).json({
            success: true,
            data: {
                results: rows,
                pagination: { total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / parseInt(limit)) }
            }
        });

    } catch (err) {
        console.error('[CBT results]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil hasil ujian.' });
    }
});

/* ──────────────────────────────────────────────────────────────────
   GET /api/cbt/soal/ujian/:mapel
   Ambil soal aktif dari bank_soal untuk client CBT.
   ────────────────────────────────────────────────────────────────── */
router.get('/soal/ujian/:mapel', (req, res) => {
    const db    = getDB();
    const mapel = req.params.mapel;

    const validMapel = ['matematika', 'bindo', 'basing', 'pkk', 'sejarah', 'produktif'];
    if (!validMapel.includes(mapel)) {
        return res.status(400).json({ success: false, message: 'Mapel tidak valid.' });
    }

    try {
        const soal = db.prepare(`
            SELECT id, soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, jawaban
            FROM bank_soal
            WHERE mapel = ? AND is_active = 1
            ORDER BY RANDOM()
            LIMIT 40
        `).all(mapel);

        if (!soal.length) {
            return res.status(404).json({
                success: false,
                message: 'Soal belum tersedia di database. Menggunakan soal lokal.'
            });
        }

        const formatted = soal.map(s => ({
            soal:    s.soal,
            opsi:    [s.opsi_a, s.opsi_b, s.opsi_c, s.opsi_d, s.opsi_e].filter(Boolean),
            jawaban: s.jawaban,
        }));

        return res.json({ success: true, data: formatted });
    } catch (err) {
        console.error('[CBT soal]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil soal.' });
    }
});

module.exports = router;
