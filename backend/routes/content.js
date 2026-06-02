// routes/content.js
// API publik untuk konten website: SKL, pengumuman, CBT results

'use strict';

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const getDB   = require('../config/database');
const { authenticate, isAdmin, isContentAdmin, isStaff, isTU } = require('../middleware/auth');
const { log } = require('../middleware/auditLog');
const { sklSearchLimiter } = require('../middleware/rateLimiter');

const nowISO = () => new Date().toISOString();
const cleanText = (value, max = 500) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
const cleanNisn = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);
const cleanYear = (value) => String(value || '').replace(/\D/g, '').slice(0, 4);
const VALID_CONTENT_TYPES = ['berita', 'galeri', 'ppdb_info', 'info'];
const VALID_GALLERY_CATEGORIES = ['akademik', 'eskul', 'prestasi', 'fasilitas', 'umum'];

function cleanUrl(value, max = 500) {
    const input = String(value || '').trim().slice(0, max);
    if (!input) return null;
    if (input.startsWith('/uploads/') || input.startsWith('/asset/') || input.startsWith('/') || /^https?:\/\//i.test(input)) {
        return input.replace(/[<>"']/g, '');
    }
    return null;
}

function normalizeContentPayload(body = {}, partial = false) {
    const type = cleanText(body.type, 30);
    const title = cleanText(body.title, 160);
    const category = cleanText(body.category, 60);
    const payload = {};

    if (!partial || body.type !== undefined) {
        if (!VALID_CONTENT_TYPES.includes(type)) return { ok:false, message:'Tipe konten tidak valid.' };
        payload.type = type;
    }
    if (!partial || body.title !== undefined) {
        if (!title) return { ok:false, message:'Judul wajib diisi.' };
        payload.title = title;
    }
    if (body.placement !== undefined || !partial) payload.placement = cleanText(body.placement || 'general', 80) || 'general';
    if (body.excerpt !== undefined || !partial) payload.excerpt = cleanText(body.excerpt, 400);
    if (body.body !== undefined || !partial) payload.body = cleanText(body.body, 5000);
    if (body.image_url !== undefined || !partial) payload.image_url = cleanUrl(body.image_url);
    if (body.link_url !== undefined || !partial) payload.link_url = cleanUrl(body.link_url);
    if (body.icon !== undefined || !partial) payload.icon = cleanText(body.icon, 80);
    if (body.sort_order !== undefined || !partial) payload.sort_order = parseInt(body.sort_order) || 0;
    if (body.is_active !== undefined || !partial) payload.is_active = body.is_active === false ? 0 : parseInt(body.is_active ?? 1) ? 1 : 0;
    if (body.category !== undefined || !partial) {
        payload.category = category || (payload.type === 'galeri' ? 'umum' : null);
        if ((payload.type || body.type) === 'galeri' && !VALID_GALLERY_CATEGORIES.includes(payload.category)) {
            payload.category = 'umum';
        }
    }
    return { ok:true, data:payload };
}

function notifyAllStudents(db, { judul, pesan, tipe = 'info', link = '/LMS.html' }) {
    const siswa = db.prepare("SELECT id FROM users WHERE role = 'siswa' AND is_active = 1").all();
    if (!siswa.length) return 0;
    const insert = db.prepare(`
        INSERT INTO notifikasi (id,user_id,judul,pesan,tipe,link,created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const now = nowISO();
    const tx = db.transaction(() => {
        for (const s of siswa) {
            insert.run(uuidv4(), s.id, cleanText(judul, 120), cleanText(pesan, 500), tipe, link, now);
        }
    });
    tx();
    return siswa.length;
}

/* ════════════════════════════════════════
   SKL ROUTES
   ════════════════════════════════════════ */

// POST /api/content/skl/cari — publik, cari data SKL
router.post('/skl/cari', sklSearchLimiter, (req, res) => {
    const db = getDB();
    const { nama, ttl } = req.body;
    const nisn = cleanNisn(req.body.nisn);
    const tahun = cleanYear(req.body.tahun || req.body.tahun_lulus);
    const namaNormal = cleanText(nama, 120).toUpperCase();
    const ttlNormal = cleanText(ttl, 20);

    if (!nisn || nisn.length !== 10 || !namaNormal || !ttlNormal || !tahun) {
        return res.status(400).json({ success:false, message:'Semua field wajib diisi.' });
    }

    const found = db.prepare(`
        SELECT * FROM skl_data
        WHERE nisn=:nisn AND nama=:nama AND ttl=:ttl AND tahun_lulus=:tahun
    `).get({ nisn, nama: namaNormal, ttl: ttlNormal, tahun });

    if (found) {
        return res.status(200).json({ success:true, data:found });
    }
    return res.status(200).json({ success:false, message:'Data tidak dapat diverifikasi.' });
});

// GET /api/content/skl — admin: lihat semua data SKL
router.get('/skl', authenticate, isTU, (req, res) => {
    const db   = getDB();
    const { page=1, limit=30, search='' } = req.query;
    const offset = (parseInt(page)-1) * parseInt(limit);

    const where  = search ? `WHERE nisn LIKE ? OR nama LIKE ?` : '';
    const params = search ? [`%${search}%`, `%${search}%`] : [];

    const rows  = db.prepare(`SELECT * FROM skl_data ${where} ORDER BY tahun_lulus DESC, nama ASC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    const total = db.prepare(`SELECT COUNT(*) as c FROM skl_data ${where}`).get(...params)?.c || 0;

    return res.status(200).json({ success:true, data:{ rows, pagination:{ total, page:parseInt(page), limit:parseInt(limit), totalPages:Math.ceil(total/parseInt(limit)) } } });
});

// POST /api/content/skl — admin: tambah data SKL
router.post('/skl', authenticate, isTU, (req, res) => {
    const db = getDB();
    const { nisn, nama, ttl, jurusan, kelas, tahun_lulus, no_ijazah, nilai_rata } = req.body;

    if (!nisn || !nama || !ttl || !tahun_lulus) {
        return res.status(400).json({ success:false, message:'NISN, nama, TTL, dan tahun lulus wajib diisi.' });
    }

    const exists = db.prepare('SELECT id FROM skl_data WHERE nisn=:n').get({ n:nisn });
    if (exists) return res.status(409).json({ success:false, message:'NISN sudah terdaftar di data SKL.' });

    const id  = uuidv4();
    const now = nowISO();
    db.prepare(`
        INSERT INTO skl_data (id,nisn,nama,ttl,jurusan,kelas,tahun_lulus,no_ijazah,nilai_rata,created_at)
        VALUES (:id,:nisn,:nama,:ttl,:jurusan,:kelas,:tahun,:ijazah,:nilai,:now)
    `).run({ id, nisn, nama:nama.toUpperCase(), ttl, jurusan:jurusan||'', kelas:kelas||'', tahun:tahun_lulus, ijazah:no_ijazah||null, nilai:nilai_rata||0, now });

    log(req.user.sub, 'SKL_CREATED', 'skl_data', id, { nisn, nama }, req.ip);
    return res.status(201).json({ success:true, message:'Data SKL berhasil ditambahkan.', data:{ id } });
});

// PUT /api/content/skl/:id — admin: edit data SKL
router.put('/skl/:id', authenticate, isTU, (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const { nisn, nama, ttl, jurusan, kelas, tahun_lulus, no_ijazah, nilai_rata } = req.body;

    const exists = db.prepare('SELECT id FROM skl_data WHERE id=:id').get({ id });
    if (!exists) return res.status(404).json({ success:false, message:'Data SKL tidak ditemukan.' });

    db.prepare(`
        UPDATE skl_data SET nisn=:nisn,nama=:nama,ttl=:ttl,jurusan=:jurusan,
        kelas=:kelas,tahun_lulus=:tahun,no_ijazah=:ijazah,nilai_rata=:nilai
        WHERE id=:id
    `).run({ id, nisn, nama:nama?.toUpperCase()||null, ttl, jurusan, kelas, tahun:tahun_lulus, ijazah:no_ijazah||null, nilai:nilai_rata||0 });

    log(req.user.sub, 'SKL_UPDATED', 'skl_data', id, { nisn }, req.ip);
    return res.status(200).json({ success:true, message:'Data SKL berhasil diperbarui.' });
});

// DELETE /api/content/skl/:id — admin: hapus data SKL
router.delete('/skl/:id', authenticate, isAdmin, (req, res) => {
    const db  = getDB();
    const { id } = req.params;
    db.prepare('DELETE FROM skl_data WHERE id=:id').run({ id });
    log(req.user.sub, 'SKL_DELETED', 'skl_data', id, null, req.ip);
    return res.status(200).json({ success:true, message:'Data SKL berhasil dihapus.' });
});

/* ════════════════════════════════════════
   ANNOUNCEMENTS ROUTES (ticker bar website)
   ════════════════════════════════════════ */

// GET /api/content/announcements — publik
router.get('/announcements', (req, res) => {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM announcements WHERE is_active=1 ORDER BY urutan ASC, created_at DESC').all();
    return res.status(200).json({ success:true, data:rows });
});

// GET /api/content/announcements/all — admin: lihat semua termasuk nonaktif
router.get('/announcements/all', authenticate, isContentAdmin, (req, res) => {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM announcements ORDER BY urutan ASC, created_at DESC').all();
    return res.status(200).json({ success:true, data:rows });
});

// POST /api/content/announcements — admin: tambah pengumuman
router.post('/announcements', authenticate, isContentAdmin, (req, res) => {
    const db  = getDB();
    const { tipe = 'info', urutan = 0 } = req.body;
    const judul = cleanText(req.body.judul, 120);
    const isi = cleanText(req.body.isi, 500);

    if (!judul || !isi) return res.status(400).json({ success:false, message:'Judul dan isi wajib diisi.' });

    const validTipe = ['info','warning','success','urgent'];
    if (!validTipe.includes(tipe)) return res.status(400).json({ success:false, message:'Tipe tidak valid.' });

    const id  = uuidv4();
    const now = nowISO();
    db.prepare(`
        INSERT INTO announcements (id,judul,isi,tipe,is_active,urutan,created_by,created_at,updated_at)
        VALUES (:id,:judul,:isi,:tipe,1,:urutan,:by,:now,:now)
    `).run({ id, judul, isi, tipe, urutan:parseInt(urutan), by:req.user.sub, now });

    notifyAllStudents(db, { judul, pesan: isi, tipe, link: '/LMS.html' });

    log(req.user.sub, 'ANNOUNCEMENT_CREATED', 'announcements', id, { judul }, req.ip);
    return res.status(201).json({ success:true, message:'Pengumuman berhasil ditambahkan.', data:{ id } });
});

// PUT /api/content/announcements/:id
router.put('/announcements/:id', authenticate, isContentAdmin, (req, res) => {
    const db  = getDB();
    const { id } = req.params;
    const { judul, isi, tipe, is_active, urutan } = req.body;

    const exists = db.prepare('SELECT id FROM announcements WHERE id=:id').get({ id });
    if (!exists) return res.status(404).json({ success:false, message:'Pengumuman tidak ditemukan.' });

    const fields = [];
    const vals   = { id };

    if (judul !== undefined)     { fields.push('judul=:judul');       vals.judul    = cleanText(judul, 120); }
    if (isi !== undefined)       { fields.push('isi=:isi');           vals.isi      = cleanText(isi, 500); }
    if (tipe !== undefined)      { fields.push('tipe=:tipe');         vals.tipe     = tipe; }
    if (is_active !== undefined) { fields.push('is_active=:active');  vals.active   = parseInt(is_active); }
    if (urutan !== undefined)    { fields.push('urutan=:urutan');     vals.urutan   = parseInt(urutan); }

    if (!fields.length) return res.status(400).json({ success:false, message:'Tidak ada perubahan.' });

    fields.push('updated_at=:now');
    vals.now = nowISO();

    db.prepare(`UPDATE announcements SET ${fields.join(',')} WHERE id=:id`).run(vals);
    log(req.user.sub, 'ANNOUNCEMENT_UPDATED', 'announcements', id, null, req.ip);
    return res.status(200).json({ success:true, message:'Pengumuman berhasil diperbarui.' });
});

// DELETE /api/content/announcements/:id
router.delete('/announcements/:id', authenticate, isContentAdmin, (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM announcements WHERE id=:id').run({ id:req.params.id });
    log(req.user.sub, 'ANNOUNCEMENT_DELETED', 'announcements', req.params.id, null, req.ip);
    return res.status(200).json({ success:true, message:'Pengumuman berhasil dihapus.' });
});

/* ════════════════════════════════════════
   WEBSITE CONTENT ROUTES (berita, galeri, PPDB info, info umum)
   ════════════════════════════════════════ */

// GET /api/content/website — publik: konten aktif
router.get('/website', (req, res) => {
    const db = getDB();
    const { type, placement, category, limit = 20 } = req.query;
    const conds = ['is_active = 1'];
    const params = {};

    if (type) {
        if (!VALID_CONTENT_TYPES.includes(type)) return res.status(400).json({ success:false, message:'Tipe konten tidak valid.' });
        conds.push('type = @type');
        params.type = type;
    }
    if (placement) {
        conds.push('placement = @placement');
        params.placement = cleanText(placement, 80);
    }
    if (category) {
        conds.push('category = @category');
        params.category = cleanText(category, 60);
    }

    params.limit = Math.min(Math.max(parseInt(limit) || 20, 1), 60);
    const rows = db.prepare(`
        SELECT id,type,placement,title,excerpt,body,image_url,link_url,category,icon,sort_order,created_at,updated_at
        FROM website_contents
        WHERE ${conds.join(' AND ')}
        ORDER BY sort_order ASC, created_at DESC
        LIMIT @limit
    `).all(params);
    return res.status(200).json({ success:true, data:rows });
});

// GET /api/content/website/all — admin: semua konten
router.get('/website/all', authenticate, isContentAdmin, (req, res) => {
    const db = getDB();
    const { type = '', search = '', page = 1, limit = 30 } = req.query;
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 30, 1), 100);
    const offset = (pageInt - 1) * limitInt;
    const conds = [];
    const params = {};

    if (type) {
        if (!VALID_CONTENT_TYPES.includes(type)) return res.status(400).json({ success:false, message:'Tipe konten tidak valid.' });
        conds.push('type = @type');
        params.type = type;
    }
    if (search) {
        conds.push('(title LIKE @search OR excerpt LIKE @search OR body LIKE @search)');
        params.search = `%${cleanText(search, 120)}%`;
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = db.prepare(`
        SELECT *
        FROM website_contents
        ${where}
        ORDER BY type ASC, sort_order ASC, created_at DESC
        LIMIT @limit OFFSET @offset
    `).all({ ...params, limit:limitInt, offset });
    const total = db.prepare(`SELECT COUNT(*) as c FROM website_contents ${where}`).get(params)?.c || 0;
    return res.status(200).json({ success:true, data:{ rows, pagination:{ total, page:pageInt, limit:limitInt, totalPages:Math.ceil(total / limitInt) } } });
});

// POST /api/content/website — admin: tambah konten
router.post('/website', authenticate, isContentAdmin, (req, res) => {
    const db = getDB();
    const normalized = normalizeContentPayload(req.body);
    if (!normalized.ok) return res.status(400).json({ success:false, message:normalized.message });
    const id = uuidv4();
    const now = nowISO();
    db.prepare(`
        INSERT INTO website_contents
        (id,type,placement,title,excerpt,body,image_url,link_url,category,icon,is_active,sort_order,created_by,created_at,updated_at)
        VALUES (@id,@type,@placement,@title,@excerpt,@body,@image_url,@link_url,@category,@icon,@is_active,@sort_order,@created_by,@now,@now)
    `).run({ id, ...normalized.data, created_by:req.user.sub, now });
    log(req.user.sub, 'WEBSITE_CONTENT_CREATED', 'website_contents', id, { type:normalized.data.type, title:normalized.data.title }, req.ip);
    return res.status(201).json({ success:true, message:'Konten website berhasil ditambahkan.', data:{ id } });
});

// PUT /api/content/website/:id — admin: edit konten
router.put('/website/:id', authenticate, isContentAdmin, (req, res) => {
    const db = getDB();
    const { id } = req.params;
    const exists = db.prepare('SELECT * FROM website_contents WHERE id = ?').get(id);
    if (!exists) return res.status(404).json({ success:false, message:'Konten tidak ditemukan.' });

    const normalized = normalizeContentPayload(req.body, true);
    if (!normalized.ok) return res.status(400).json({ success:false, message:normalized.message });
    const fields = [];
    const vals = { id, now:nowISO() };
    for (const [key, value] of Object.entries(normalized.data)) {
        fields.push(`${key} = @${key}`);
        vals[key] = value;
    }
    if (!fields.length) return res.status(400).json({ success:false, message:'Tidak ada perubahan.' });
    fields.push('updated_at = @now');

    db.prepare(`UPDATE website_contents SET ${fields.join(', ')} WHERE id = @id`).run(vals);
    log(req.user.sub, 'WEBSITE_CONTENT_UPDATED', 'website_contents', id, null, req.ip);
    return res.status(200).json({ success:true, message:'Konten website berhasil diperbarui.' });
});

// DELETE /api/content/website/:id — admin: hapus konten
router.delete('/website/:id', authenticate, isContentAdmin, (req, res) => {
    const db = getDB();
    const info = db.prepare('DELETE FROM website_contents WHERE id = ?').run(req.params.id);
    if (!info.changes) return res.status(404).json({ success:false, message:'Konten tidak ditemukan.' });
    log(req.user.sub, 'WEBSITE_CONTENT_DELETED', 'website_contents', req.params.id, null, req.ip);
    return res.status(200).json({ success:true, message:'Konten website berhasil dihapus.' });
});

/* ════════════════════════════════════════
   CBT RESULTS ROUTES
   ════════════════════════════════════════ */

// GET /api/content/cbt-results — admin: lihat semua hasil
router.get('/cbt-results', authenticate, isStaff, (req, res) => {
    const db = getDB();
    const { nisn, mapel, page=1, limit=50 } = req.query;
    const offset = (parseInt(page)-1)*parseInt(limit);

    const conds  = [];
    const params = [];
    if (nisn)  { conds.push('nisn = ?');  params.push(nisn); }
    if (mapel) { conds.push('mapel = ?'); params.push(mapel); }

    const where = conds.length ? 'WHERE '+conds.join(' AND ') : '';
    const rows  = db.prepare(`SELECT * FROM cbt_results ${where} ORDER BY selesai_at DESC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), offset);
    const total = db.prepare(`SELECT COUNT(*) as c FROM cbt_results ${where}`).get(...params)?.c || 0;

    return res.status(200).json({ success:true, data:{ rows, pagination:{ total, page:parseInt(page), limit:parseInt(limit), totalPages:Math.ceil(total/parseInt(limit)) } } });
});

// GET /api/content/cbt-results/export — export CSV
router.get('/cbt-results/export', authenticate, isStaff, (req, res) => {
    const db   = getDB();
    const rows = db.prepare('SELECT * FROM cbt_results ORDER BY selesai_at DESC').all();

    const header = 'NISN,Mapel,Benar,Salah,Kosong,Nilai,Selesai\n';
    const csv    = rows.map(r => `${r.nisn},${r.mapel},${r.benar},${r.salah},${r.kosong},${r.nilai},${r.selesai_at}`).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="cbt_results_${new Date().toISOString().slice(0,10)}.csv"`);
    return res.send('\uFEFF' + header + csv);
});

module.exports = router;

/* ── POST /api/content/surat — simpan permohonan surat ── */
router.post('/surat', authenticate, (req, res) => {
    try {
        const db  = getDB();
        const now = new Date().toISOString();
        const { jenis, tujuan, keterangan, nisn } = req.body;
        if (!jenis || !tujuan) return res.status(400).json({ success:false, message:'jenis dan tujuan wajib.' });

        const { v4: uuidv4 } = require('uuid');
        db.prepare(`INSERT INTO audit_logs (id,user_id,action,entity,detail,created_at)
            VALUES (?,?,?,?,?,?)`).run(
            uuidv4(), req.user.sub, 'surat_ajukan', 'surat',
            JSON.stringify({ jenis, tujuan, keterangan, nisn }),
            now
        );
        res.status(201).json({ success:true, message:'Permohonan surat berhasil diajukan.' });
    } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});
