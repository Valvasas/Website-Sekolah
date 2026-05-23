// routes/bank_soal.js — NEW FILE
// CRUD API untuk bank soal CBT
'use strict';

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB   = require('../config/database');

const STAFF = ['guru','tata_usaha','kepala_sekolah','super_admin'];
const VALID_MAPEL = ['matematika','bindo','basing','pkk','sejarah','produktif'];

const nowISO = () => new Date().toISOString();

/* ── GET /api/cbt/soal — list soal (staff + siswa saat ujian) ── */
router.get('/soal', authenticate, (req, res) => {
    const db = getDB();
    const { mapel, search, page = 1, limit = 20 } = req.query;
    const limitInt = Math.min(parseInt(limit) || 20, 100);
    const offset   = (Math.max(parseInt(page) || 1, 1) - 1) * limitInt;

    const conds  = ['is_active = 1'];
    const params = [];

    if (mapel) {
        if (!VALID_MAPEL.includes(mapel)) {
            return res.status(400).json({ success: false, message: 'mapel tidak valid.' });
        }
        conds.push('mapel = ?'); params.push(mapel);
    }
    if (search) {
        const s = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
        conds.push('soal LIKE ?'); params.push(s);
    }

    const where = 'WHERE ' + conds.join(' AND ');

    try {
        const soal  = db.prepare(`SELECT * FROM bank_soal ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limitInt, offset);
        const total = db.prepare(`SELECT COUNT(*) as c FROM bank_soal ${where}`).get(...params).c;

        return res.json({
            success: true,
            data: {
                soal,
                pagination: { total, page: parseInt(page), limit: limitInt, totalPages: Math.ceil(total / limitInt) }
            }
        });
    } catch (err) {
        console.error('[Soal GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil soal.' });
    }
});

/* ── GET /api/cbt/soal/ujian/:mapel — acak soal untuk ujian ── */
router.get('/soal/ujian/:mapel', authenticate, (req, res) => {
    const db    = getDB();
    const mapel = req.params.mapel;

    if (!VALID_MAPEL.includes(mapel)) {
        return res.status(400).json({ success: false, message: 'mapel tidak valid.' });
    }

    try {
        // Ambil semua soal aktif untuk mapel ini, acak di DB level
        const soal = db.prepare(
            `SELECT id, soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, jawaban
             FROM bank_soal
             WHERE mapel = ? AND is_active = 1
             ORDER BY RANDOM()
             LIMIT 40`
        ).all(mapel);

        if (!soal.length) {
            return res.status(404).json({
                success: false,
                message: `Belum ada soal untuk mapel ${mapel}. Tambahkan soal di panel admin.`
            });
        }

        // Format ke struktur yang dipakai cbt.js
        const formatted = soal.map(s => ({
            id:      s.id,
            soal:    s.soal,
            opsi:    [s.opsi_a, s.opsi_b, s.opsi_c, s.opsi_d, s.opsi_e].filter(Boolean),
            jawaban: s.jawaban,
        }));

        return res.json({ success: true, data: formatted });
    } catch (err) {
        console.error('[Soal ujian]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil soal ujian.' });
    }
});

/* ── POST /api/cbt/soal — tambah soal ── */
router.post('/soal', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    const { mapel, jenis_ujian = 'PAS', soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, jawaban, tingkat = 'sedang' } = req.body;

    if (!mapel || !soal || !opsi_a || !opsi_b || !opsi_c || !opsi_d || !jawaban) {
        return res.status(400).json({ success: false, message: 'mapel, soal, opsi A-D, jawaban wajib diisi.' });
    }
    if (!VALID_MAPEL.includes(mapel)) {
        return res.status(400).json({ success: false, message: 'mapel tidak valid.' });
    }
    if (!['A','B','C','D','E'].includes(jawaban.toUpperCase())) {
        return res.status(400).json({ success: false, message: 'jawaban harus A/B/C/D/E.' });
    }
    if (jawaban.toUpperCase() === 'E' && !opsi_e) {
        return res.status(400).json({ success: false, message: 'Opsi E wajib diisi jika jawaban adalah E.' });
    }

    try {
        const id  = uuidv4();
        const now = nowISO();
        db.prepare(`
            INSERT INTO bank_soal
            (id,mapel,jenis_ujian,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,tingkat,created_by,is_active,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
        `).run(id, mapel, jenis_ujian, soal.trim(), opsi_a.trim(), opsi_b.trim(), opsi_c.trim(), opsi_d.trim(),
               opsi_e?.trim() || null, jawaban.toUpperCase(), tingkat, req.user.sub, now, now);

        return res.status(201).json({ success: true, message: 'Soal berhasil ditambahkan.', data: { id } });
    } catch (err) {
        console.error('[Soal POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan soal.' });
    }
});

/* ── PUT /api/cbt/soal/:id — edit soal ── */
router.put('/soal/:id', authenticate, authorize(...STAFF), (req, res) => {
    const db  = getDB();
    const { id } = req.params;
    const { mapel, soal, opsi_a, opsi_b, opsi_c, opsi_d, opsi_e, jawaban, tingkat } = req.body;

    try {
        const existing = db.prepare('SELECT id FROM bank_soal WHERE id = ?').get(id);
        if (!existing) return res.status(404).json({ success: false, message: 'Soal tidak ditemukan.' });

        const fields = [];
        const vals   = {};

        if (mapel)   { fields.push('mapel=@mapel');     vals.mapel   = mapel; }
        if (soal)    { fields.push('soal=@soal');       vals.soal    = soal.trim(); }
        if (opsi_a)  { fields.push('opsi_a=@opsi_a');   vals.opsi_a  = opsi_a.trim(); }
        if (opsi_b)  { fields.push('opsi_b=@opsi_b');   vals.opsi_b  = opsi_b.trim(); }
        if (opsi_c)  { fields.push('opsi_c=@opsi_c');   vals.opsi_c  = opsi_c.trim(); }
        if (opsi_d)  { fields.push('opsi_d=@opsi_d');   vals.opsi_d  = opsi_d.trim(); }
        if (opsi_e !== undefined) { fields.push('opsi_e=@opsi_e'); vals.opsi_e = opsi_e?.trim() || null; }
        if (jawaban) { fields.push('jawaban=@jawaban');  vals.jawaban = jawaban.toUpperCase(); }
        if (tingkat) { fields.push('tingkat=@tingkat');  vals.tingkat = tingkat; }

        if (!fields.length) return res.status(400).json({ success: false, message: 'Tidak ada data yang diubah.' });

        fields.push('updated_at=@now');
        vals.now = nowISO();
        vals.id  = id;

        db.prepare(`UPDATE bank_soal SET ${fields.join(',')} WHERE id=@id`).run(vals);
        return res.json({ success: true, message: 'Soal berhasil diperbarui.' });
    } catch (err) {
        console.error('[Soal PUT]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui soal.' });
    }
});

/* ── DELETE /api/cbt/soal/:id — soft delete ── */
router.delete('/soal/:id', authenticate, authorize(...STAFF), (req, res) => {
    const db = getDB();
    try {
        db.prepare('UPDATE bank_soal SET is_active = 0, updated_at = ? WHERE id = ?')
          .run(nowISO(), req.params.id);
        return res.json({ success: true, message: 'Soal berhasil dihapus.' });
    } catch (err) {
        console.error('[Soal DELETE]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menghapus soal.' });
    }
});

/* ── POST /api/cbt/soal/import — import bulk soal dari JSON ── */
router.post('/soal/import', authenticate, authorize(...STAFF), (req, res) => {
    const db    = getDB();
    const { mapel, soal: soalArr } = req.body;

    if (!mapel || !Array.isArray(soalArr) || !soalArr.length) {
        return res.status(400).json({ success: false, message: 'mapel dan array soal wajib ada.' });
    }
    if (soalArr.length > 200) {
        return res.status(400).json({ success: false, message: 'Maksimal 200 soal per import.' });
    }

    const insert = db.prepare(`
        INSERT INTO bank_soal
        (id,mapel,jenis_ujian,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,tingkat,created_by,is_active,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    `);

    let saved = 0;
    const now = nowISO();
    const importAll = db.transaction(() => {
        for (const s of soalArr) {
            if (!s.soal || !s.opsi_a || !s.opsi_b || !s.jawaban) continue;
            insert.run(
                uuidv4(), mapel, s.jenis_ujian || 'PAS',
                s.soal.trim(), s.opsi_a.trim(), s.opsi_b.trim(),
                (s.opsi_c || '').trim(), (s.opsi_d || '').trim(),
                s.opsi_e?.trim() || null,
                s.jawaban.toUpperCase(), s.tingkat || 'sedang',
                req.user.sub, now, now
            );
            saved++;
        }
    });

    try {
        importAll();
        return res.status(201).json({
            success: true,
            message: `${saved} soal berhasil diimport.`,
            data: { imported: saved, skipped: soalArr.length - saved }
        });
    } catch (err) {
        console.error('[Soal import]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal import soal.' });
    }
});

module.exports = router;
