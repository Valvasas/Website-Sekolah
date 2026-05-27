// routes/ppdb.js
'use strict';

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB   = require('../config/database');

const STAFF = ['tata_usaha','kepala_sekolah','wakil_kepala_sekolah','super_admin'];

/* Generate nomor pendaftaran: PPDB-2026-XXXX */
function genNomor() {
    const year = new Date().getFullYear();
    const rand = Math.random().toString(36).substr(2,6).toUpperCase();
    return `PPDB-${year}-${rand}`;
}

/* ── POST /api/ppdb — daftar baru (publik) ── */
router.post('/', async (req, res) => {
    try {
        const db  = getDB();
        const now = new Date().toISOString();
        const {
            jalur, nama_lengkap, nisn, tempat_lahir, tanggal_lahir,
            jenis_kelamin, asal_sekolah, jurusan_pilihan,
            nama_ayah, pekerjaan_ayah, nama_ibu, pekerjaan_ibu,
            no_hp, alamat, jarak_km,
        } = req.body;

        if (!jalur || !nama_lengkap || !no_hp) {
            return res.status(400).json({ success:false, message:'jalur, nama_lengkap, no_hp wajib diisi.' });
        }

        const id           = uuidv4();
        const nomor_daftar = genNomor();

        db.prepare(`INSERT INTO ppdb_pendaftaran
            (id,nomor_daftar,jalur,nama_lengkap,nisn,tempat_lahir,tanggal_lahir,
             jenis_kelamin,asal_sekolah,jurusan_pilihan,nama_ayah,pekerjaan_ayah,
             nama_ibu,pekerjaan_ibu,no_hp,alamat,jarak_km,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            id, nomor_daftar, jalur, nama_lengkap, nisn||null,
            tempat_lahir||null, tanggal_lahir||null, jenis_kelamin||null,
            asal_sekolah||null, jurusan_pilihan||null,
            nama_ayah||null, pekerjaan_ayah||null,
            nama_ibu||null, pekerjaan_ibu||null,
            no_hp, alamat||null, jarak_km||null,
            'pending', now, now
        );

        res.status(201).json({
            success : true,
            message : 'Pendaftaran berhasil! Catat nomor pendaftaran Anda.',
            data    : { nomor_daftar, status: 'pending' },
        });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ── GET /api/ppdb/cek?nomor= — cek status (publik) ── */
router.get('/cek', (req, res) => {
    try {
        const db    = getDB();
        const nomor = req.query.nomor?.trim();
        if (!nomor) return res.status(400).json({ success:false, message:'Nomor pendaftaran wajib.' });

        const row = db.prepare(
            `SELECT nomor_daftar,nama_lengkap,jalur,jurusan_pilihan,status,catatan,created_at
             FROM ppdb_pendaftaran WHERE nomor_daftar=?`
        ).get(nomor);

        if (!row) return res.status(404).json({ success:false, message:'Nomor pendaftaran tidak ditemukan.' });

        res.json({ success:true, data: row });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ── GET /api/ppdb — list semua (staff) ── */
router.get('/', authenticate, authorize(...STAFF), (req, res) => {
    try {
        const db     = getDB();
        const status = req.query.status;
        const jalur  = req.query.jalur;
        const page   = parseInt(req.query.page) || 1;
        const limit  = parseInt(req.query.limit) || 20;
        const offset = (page-1)*limit;

        let sql    = 'SELECT * FROM ppdb_pendaftaran WHERE 1=1';
        const params = [];
        if (status) { sql += ' AND status=?'; params.push(status); }
        if (jalur)  { sql += ' AND jalur=?';  params.push(jalur); }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const rows  = db.prepare(sql).all(...params);
        const total = db.prepare('SELECT COUNT(*) as c FROM ppdb_pendaftaran').get().c;

        res.json({ success:true, data:rows, total, page, limit });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ── PATCH /api/ppdb/:id/status — update status (staff) ── */
router.patch('/:id/status', authenticate, authorize(...STAFF), (req, res) => {
    try {
        const db  = getDB();
        const now = new Date().toISOString();
        const { status, catatan } = req.body;
        const valid = ['pending','diterima','ditolak','cadangan'];
        if (!valid.includes(status)) {
            return res.status(400).json({ success:false, message:'Status tidak valid.' });
        }

        db.prepare('UPDATE ppdb_pendaftaran SET status=?,catatan=?,updated_at=? WHERE id=?')
          .run(status, catatan||null, now, req.params.id);

        res.json({ success:true, message:'Status pendaftaran diperbarui.' });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* ── DELETE /api/ppdb/:id — hapus (admin) ── */
router.delete('/:id', authenticate, authorize('super_admin'), (req, res) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM ppdb_pendaftaran WHERE id=?').run(req.params.id);
        res.json({ success:true, message:'Data pendaftaran dihapus.' });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

module.exports = router;
