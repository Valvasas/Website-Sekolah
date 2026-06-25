// routes/ppdb.js
'use strict';

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB   = require('../config/database');

const STAFF = ['tata_usaha','kepala_sekolah','wakil_kepala_sekolah','super_admin'];
const VALID_JALUR = ['Zonasi', 'Prestasi', 'Afirmasi'];
const VALID_STATUS = ['pending','diterima','ditolak','cadangan'];

function cleanText(value, max = 160) {
    if (value === undefined || value === null) return null;
    return String(value).replace(/[<>]/g, '').trim().slice(0, max) || null;
}

function cleanNisn(value) {
    const text = String(value || '').replace(/\D/g, '').slice(0, 10);
    return text.length === 10 ? text : null;
}

function cleanPhone(value) {
    const text = String(value || '').replace(/[^\d+]/g, '').slice(0, 16);
    return /^(\+62|62|0)\d{8,13}$/.test(text) ? text : null;
}

function cleanDate(value) {
    const text = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
    const time = new Date(`${text}T00:00:00Z`).getTime();
    return Number.isFinite(time) ? text : null;
}

function cleanDistance(value) {
    if (value === undefined || value === null || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(num, 999)).toFixed(2);
}

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
        const jalur = cleanText(req.body.jalur, 40);
        const nama_lengkap = cleanText(req.body.nama_lengkap, 120);
        const nisn = cleanNisn(req.body.nisn);
        const tempat_lahir = cleanText(req.body.tempat_lahir, 80);
        const tanggal_lahir = cleanDate(req.body.tanggal_lahir);
        const jenis_kelamin = cleanText(req.body.jenis_kelamin, 20);
        const asal_sekolah = cleanText(req.body.asal_sekolah, 120);
        const jurusan_pilihan = cleanText(req.body.jurusan_pilihan, 120);
        const nama_ayah = cleanText(req.body.nama_ayah, 120);
        const pekerjaan_ayah = cleanText(req.body.pekerjaan_ayah, 100);
        const nama_ibu = cleanText(req.body.nama_ibu, 120);
        const pekerjaan_ibu = cleanText(req.body.pekerjaan_ibu, 100);
        const no_hp = cleanPhone(req.body.no_hp);
        const alamat = cleanText(req.body.alamat, 400);
        const jarak_km = cleanDistance(req.body.jarak_km);

        if (!VALID_JALUR.includes(jalur) || !nama_lengkap || !no_hp) {
            return res.status(400).json({ success:false, message:'Jalur, nama lengkap, dan nomor HP valid wajib diisi.' });
        }
        if (req.body.nisn && !nisn) {
            return res.status(400).json({ success:false, message:'NISN harus 10 digit angka.' });
        }
        if (req.body.tanggal_lahir && !tanggal_lahir) {
            return res.status(400).json({ success:false, message:'Tanggal lahir tidak valid.' });
        }

        const id           = uuidv4();
        const nomor_daftar = genNomor();

        db.prepare(`INSERT INTO ppdb_pendaftaran
            (id,nomor_daftar,jalur,nama_lengkap,nisn,tempat_lahir,tanggal_lahir,
             jenis_kelamin,asal_sekolah,jurusan_pilihan,nama_ayah,pekerjaan_ayah,
             nama_ibu,pekerjaan_ibu,no_hp,alamat,jarak_km,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
            id, nomor_daftar, jalur, nama_lengkap, nisn,
            tempat_lahir, tanggal_lahir, jenis_kelamin,
            asal_sekolah, jurusan_pilihan,
            nama_ayah, pekerjaan_ayah,
            nama_ibu, pekerjaan_ibu,
            no_hp, alamat, jarak_km,
            'pending', now, now
        );

        res.status(201).json({
            success : true,
            message : 'Pendaftaran berhasil! Catat nomor pendaftaran Anda.',
            data    : { nomor_daftar, status: 'pending' },
        });
    } catch(e) {
        console.error('[PPDB create]', e.message);
        res.status(500).json({ success:false, message:'Gagal menyimpan pendaftaran.' });
    }
});

/* ── GET /api/ppdb/cek?nomor= — cek status (publik) ── */
router.get('/cek', (req, res) => {
    try {
        const db    = getDB();
        const nomor = cleanText(req.query.nomor, 32);
        if (!/^PPDB-\d{4}-[A-Z0-9]{6}$/.test(nomor || '')) {
            return res.status(400).json({ success:false, message:'Nomor pendaftaran tidak valid.' });
        }

        const row = db.prepare(
            `SELECT nomor_daftar,nama_lengkap,jalur,jurusan_pilihan,status,catatan,created_at
             FROM ppdb_pendaftaran WHERE nomor_daftar=?`
        ).get(nomor);

        if (!row) return res.status(404).json({ success:false, message:'Nomor pendaftaran tidak ditemukan.' });

        res.json({ success:true, data: row });
    } catch(e) {
        console.error('[PPDB cek]', e.message);
        res.status(500).json({ success:false, message:'Gagal mengecek pendaftaran.' });
    }
});

/* ── GET /api/ppdb — list semua (staff) ── */
router.get('/', authenticate, authorize(...STAFF), (req, res) => {
    try {
        const db     = getDB();
        const status = cleanText(req.query.status, 20);
        const jalur  = cleanText(req.query.jalur, 40);
        const page   = parseInt(req.query.page) || 1;
        const limit  = parseInt(req.query.limit) || 20;
        const offset = (page-1)*limit;

        let sql    = 'SELECT * FROM ppdb_pendaftaran WHERE 1=1';
        const params = [];
        if (status && VALID_STATUS.includes(status)) { sql += ' AND status=?'; params.push(status); }
        if (jalur && VALID_JALUR.includes(jalur))  { sql += ' AND jalur=?';  params.push(jalur); }
        sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const rows  = db.prepare(sql).all(...params);
        const total = db.prepare('SELECT COUNT(*) as c FROM ppdb_pendaftaran').get().c;

        res.json({ success:true, data:rows, total, page, limit });
    } catch(e) {
        console.error('[PPDB list]', e.message);
        res.status(500).json({ success:false, message:'Gagal mengambil data PPDB.' });
    }
});

/* ── PATCH /api/ppdb/:id/status — update status (staff) ── */
router.patch('/:id/status', authenticate, authorize(...STAFF), (req, res) => {
    try {
        const db  = getDB();
        const now = new Date().toISOString();
        const status = cleanText(req.body.status, 20);
        const catatan = cleanText(req.body.catatan, 500);
        if (!VALID_STATUS.includes(status)) {
            return res.status(400).json({ success:false, message:'Status tidak valid.' });
        }

        db.prepare('UPDATE ppdb_pendaftaran SET status=?,catatan=?,updated_at=? WHERE id=?')
          .run(status, catatan, now, req.params.id);

        res.json({ success:true, message:'Status pendaftaran diperbarui.' });
    } catch(e) {
        console.error('[PPDB status]', e.message);
        res.status(500).json({ success:false, message:'Gagal memperbarui status PPDB.' });
    }
});

/* ── DELETE /api/ppdb/:id — hapus (admin) ── */
router.delete('/:id', authenticate, authorize('super_admin'), (req, res) => {
    try {
        const db = getDB();
        db.prepare('DELETE FROM ppdb_pendaftaran WHERE id=?').run(req.params.id);
        res.json({ success:true, message:'Data pendaftaran dihapus.' });
    } catch(e) {
        console.error('[PPDB delete]', e.message);
        res.status(500).json({ success:false, message:'Gagal menghapus data PPDB.' });
    }
});

module.exports = router;
