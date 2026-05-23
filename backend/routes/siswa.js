// routes/siswa.js
'use strict';

const express  = require('express');
const router   = express.Router();
const { v4: uuidv4 } = require('uuid');
const { authenticate, authorize } = require('../middleware/auth');
const getDB    = require('../config/database');

const STAFF = ['guru','tata_usaha','kepala_sekolah','super_admin'];

/* ── Helper ambil nisn dari token atau param ── */
function getNisn(req) {
    if (['siswa','wali_murid'].includes(req.user.role)) return req.user.nisn;
    return req.params.nisn || req.query.nisn || req.user.nisn;
}

/* ══════════════════════════════════════════
   PROFIL SISWA
   ══════════════════════════════════════════ */

/* GET /api/siswa/profil — ambil profil sendiri atau by nisn (staff) */
router.get('/profil', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = getNisn(req);
        if (!nisn) return res.status(400).json({ success:false, message:'NISN tidak ditemukan.' });

        /* Gabung dari tabel users + siswa_profil */
        const user = db.prepare(
            `SELECT u.id, u.nama_lengkap, u.nisn, u.email, u.no_hp, u.role
             FROM users u WHERE u.nisn = ?`
        ).get(nisn);

        if (!user) return res.status(404).json({ success:false, message:'Siswa tidak ditemukan.' });

        const profil = db.prepare('SELECT * FROM siswa_profil WHERE nisn = ?').get(nisn);

        res.json({ success:true, data: { ...user, profil: profil || null } });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

/* PUT /api/siswa/profil — update profil sendiri */
router.put('/profil', authenticate, (req, res) => {
    try {
        const db   = getDB();
        const nisn = getNisn(req);
        const now  = new Date().toISOString();
        const {
            kelas, jurusan, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
            alamat, kelurahan, kecamatan, nama_ayah, pekerjaan_ayah,
            nama_ibu, pekerjaan_ibu, no_hp_ortu, email_ortu,
        } = req.body;

        const exists = db.prepare('SELECT id FROM siswa_profil WHERE nisn = ?').get(nisn);

        if (exists) {
            db.prepare(`UPDATE siswa_profil SET
                kelas=?,jurusan=?,tempat_lahir=?,tanggal_lahir=?,jenis_kelamin=?,agama=?,
                alamat=?,kelurahan=?,kecamatan=?,nama_ayah=?,pekerjaan_ayah=?,
                nama_ibu=?,pekerjaan_ibu=?,no_hp_ortu=?,email_ortu=?,updated_at=?
                WHERE nisn=?`).run(
                kelas,jurusan,tempat_lahir,tanggal_lahir,jenis_kelamin,agama,
                alamat,kelurahan,kecamatan,nama_ayah,pekerjaan_ayah,
                nama_ibu,pekerjaan_ibu,no_hp_ortu,email_ortu,now,nisn
            );
        } else {
            db.prepare(`INSERT INTO siswa_profil
                (id,user_id,nisn,kelas,jurusan,tempat_lahir,tanggal_lahir,jenis_kelamin,agama,
                 alamat,kelurahan,kecamatan,nama_ayah,pekerjaan_ayah,nama_ibu,pekerjaan_ibu,
                 no_hp_ortu,email_ortu,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                uuidv4(), req.user.sub, nisn,
                kelas,jurusan,tempat_lahir,tanggal_lahir,jenis_kelamin,agama,
                alamat,kelurahan,kecamatan,nama_ayah,pekerjaan_ayah,
                nama_ibu,pekerjaan_ibu,no_hp_ortu,email_ortu,now
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
        const nisn     = getNisn(req);
        const semester = req.query.semester || 'genap';

        const rows = db.prepare(
            'SELECT * FROM nilai_siswa WHERE nisn = ? AND semester = ? ORDER BY mapel'
        ).all(nisn, semester);

        /* Hitung statistik */
        let total = 0;
        const data = rows.map(r => {
            const final = parseFloat(((r.uh*0.2 + r.uts*0.25 + r.uas*0.3 + r.tugas*0.25)).toFixed(2));
            total += final;
            return { ...r, nilai_final: final, lulus: final >= r.kkm };
        });

        const rata = data.length ? parseFloat((total / data.length).toFixed(2)) : 0;
        const max  = data.length ? Math.max(...data.map(d => d.nilai_final)) : 0;
        const min  = data.length ? Math.min(...data.map(d => d.nilai_final)) : 0;

        res.json({ success:true, data, stats: { rata, max, min, jumlah: data.length } });
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

        const exists = db.prepare('SELECT id FROM nilai_siswa WHERE nisn=? AND semester=? AND mapel=?').get(nisn,semester,mapel);
        if (exists) {
            db.prepare('UPDATE nilai_siswa SET uh=?,uts=?,uas=?,tugas=?,kkm=? WHERE id=?')
              .run(uh||0,uts||0,uas||0,tugas||0,kkm||70,exists.id);
        } else {
            db.prepare(`INSERT INTO nilai_siswa (id,nisn,semester,mapel,uh,uts,uas,tugas,kkm,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`)
              .run(uuidv4(),nisn,semester,mapel,uh||0,uts||0,uas||0,tugas||0,kkm||70,now);
        }
        res.json({ success:true, message:'Nilai berhasil disimpan.' });
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

        /* Nilai rata-rata */
        const nilaiRows = db.prepare(
            'SELECT uh,uts,uas,tugas FROM nilai_siswa WHERE nisn=? AND semester=?'
        ).all(nisn, 'genap');

        let totalNilai = 0;
        nilaiRows.forEach(r => {
            totalNilai += r.uh*0.2 + r.uts*0.25 + r.uas*0.3 + r.tugas*0.25;
        });
        const rataRata = nilaiRows.length ? parseFloat((totalNilai/nilaiRows.length).toFixed(2)) : 0;

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
                nilai_rata: rataRata,
                kehadiran : kh.hadir,
                absen_total: kh.sakit + kh.izin + kh.alpha,
                persen_hadir: totalKh ? Math.round((kh.hadir/totalKh)*100) : 100,
            }
        });
    } catch(e) {
        res.status(500).json({ success:false, message:e.message });
    }
});

module.exports = router;
