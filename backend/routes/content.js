// routes/content.js
// API publik untuk konten website: SKL, pengumuman, CBT results

'use strict';

const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const getDB   = require('../config/database');
const { authenticate, isAdmin, isContentAdmin, isStaff, isTU, authorize } = require('../middleware/auth');
const { log } = require('../middleware/auditLog');
const { sklSearchLimiter } = require('../middleware/rateLimiter');

const nowISO = () => new Date().toISOString();
const cleanText = (value, max = 500) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
const cleanNisn = (value) => String(value || '').replace(/\D/g, '').slice(0, 10);
const cleanYear = (value) => String(value || '').replace(/\D/g, '').slice(0, 4);
const VALID_CONTENT_TYPES = ['berita', 'galeri', 'ppdb_info', 'info'];
const VALID_CONTENT_STATUSES = ['draft', 'scheduled', 'published', 'archived'];
const VALID_GALLERY_CATEGORIES = ['akademik', 'eskul', 'prestasi', 'fasilitas', 'umum'];
const VALID_ORG_TYPES = ['pimpinan', 'guru', 'tu'];
const ORG_MANAGERS = ['super_admin', 'content_admin', 'kepala_sekolah', 'wakil_kepala_sekolah', 'tata_usaha'];
const WEBSITE_CONTENT_MANAGERS = ['super_admin', 'content_admin', 'tata_usaha'];
const isOrgManager = authorize(...ORG_MANAGERS);
const isWebsiteContentManager = authorize(...WEBSITE_CONTENT_MANAGERS);

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
    if (body.status !== undefined || !partial) {
        const fallbackStatus = body.is_active === false || parseInt(body.is_active ?? 1) === 0 ? 'draft' : 'published';
        const status = cleanText(body.status || fallbackStatus, 20);
        if (!VALID_CONTENT_STATUSES.includes(status)) return { ok:false, message:'Status konten tidak valid.' };
        payload.status = status;
        payload.is_active = ['published', 'scheduled'].includes(status) ? 1 : 0;
    } else if (body.is_active !== undefined) {
        payload.is_active = body.is_active === false ? 0 : parseInt(body.is_active ?? 1) ? 1 : 0;
    }
    if (body.publish_at !== undefined || !partial) payload.publish_at = normalizeDateTime(body.publish_at);
    if (body.expires_at !== undefined || !partial) payload.expires_at = normalizeDateTime(body.expires_at);
    if (payload.status === 'scheduled' && !payload.publish_at) {
        return { ok:false, message:'Tanggal tayang wajib diisi untuk konten terjadwal.' };
    }
    if (payload.publish_at && payload.expires_at && payload.expires_at <= payload.publish_at) {
        return { ok:false, message:'Tanggal selesai tayang harus setelah tanggal mulai tayang.' };
    }
    if (body.category !== undefined || !partial) {
        payload.category = category || (payload.type === 'galeri' ? 'umum' : null);
        if ((payload.type || body.type) === 'galeri' && !VALID_GALLERY_CATEGORIES.includes(payload.category)) {
            payload.category = 'umum';
        }
    }
    return { ok:true, data:payload };
}

function normalizeDateTime(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function ensureWebsiteContentSchema(db) {
    const columns = db.prepare('PRAGMA table_info(website_contents)').all().map(row => row.name);
    if (!columns.includes('status')) db.exec("ALTER TABLE website_contents ADD COLUMN status TEXT NOT NULL DEFAULT 'published'");
    if (!columns.includes('publish_at')) db.exec('ALTER TABLE website_contents ADD COLUMN publish_at TEXT');
    if (!columns.includes('expires_at')) db.exec('ALTER TABLE website_contents ADD COLUMN expires_at TEXT');
    if (!columns.includes('updated_by')) db.exec('ALTER TABLE website_contents ADD COLUMN updated_by TEXT');
    db.exec(`
        UPDATE website_contents
        SET status = CASE WHEN is_active = 1 THEN 'published' ELSE 'draft' END
        WHERE status IS NULL OR status = '' OR (status = 'published' AND is_active = 0)
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_website_content_workflow ON website_contents(status, placement, publish_at, expires_at)');
}

function normalizeOrgPayload(body = {}, partial = false) {
    const code = cleanText(body.code, 24).replace(/\s+/g, '').toUpperCase();
    const nama = cleanText(body.nama, 160);
    const jabatan = cleanText(body.jabatan, 140);
    const tipe = cleanText(body.tipe || 'guru', 24);
    const tier = Math.min(Math.max(parseInt(body.tier ?? 3) || 3, 1), 5);
    const tugasText = Array.isArray(body.tugas)
        ? body.tugas.map(item => cleanText(item, 220)).filter(Boolean).join('\n')
        : cleanText(body.tugas, 2200);
    const payload = {};
    if (body.user_id !== undefined || !partial) payload.user_id = cleanText(body.user_id, 64) || null;

    if (!partial || body.code !== undefined) {
        if (!/^[A-Z0-9_-]{2,24}$/.test(code)) return { ok:false, message:'Kode struktur wajib 2-24 karakter, gunakan huruf/angka tanpa spasi.' };
        payload.code = code;
    }
    if (!partial || body.nama !== undefined) {
        if (!nama) return { ok:false, message:'Nama wajib diisi.' };
        payload.nama = nama;
    }
    if (!partial || body.jabatan !== undefined) {
        if (!jabatan) return { ok:false, message:'Jabatan wajib diisi.' };
        payload.jabatan = jabatan;
    }
    if (!partial || body.tipe !== undefined) {
        if (!VALID_ORG_TYPES.includes(tipe)) return { ok:false, message:'Tipe struktur tidak valid.' };
        payload.tipe = tipe;
    }
    if (body.mapel !== undefined || !partial) payload.mapel = cleanText(body.mapel, 140) || '-';
    if (body.icon !== undefined || !partial) payload.icon = cleanText(body.icon || 'fa-user', 60) || 'fa-user';
    if (body.tier !== undefined || !partial) payload.tier = tier;
    if (body.nip !== undefined || !partial) payload.nip = cleanText(body.nip, 80);
    if (body.pendidikan !== undefined || !partial) payload.pendidikan = cleanText(body.pendidikan, 140);
    if (body.tugas !== undefined || !partial) payload.tugas = tugasText || '';
    if (body.atasan !== undefined || !partial) payload.atasan = cleanText(body.atasan, 24).replace(/\s+/g, '').toUpperCase() || null;
    if (body.foto !== undefined || !partial) payload.foto = cleanUrl(body.foto, 500);
    if (body.sort_order !== undefined || !partial) payload.sort_order = parseInt(body.sort_order) || 0;
    if (body.is_active !== undefined || !partial) payload.is_active = body.is_active === false ? 0 : parseInt(body.is_active ?? 1) ? 1 : 0;
    return { ok:true, data:payload };
}

function ensureOrganizationSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS organization_staff (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            code TEXT UNIQUE NOT NULL,
            nama TEXT NOT NULL,
            jabatan TEXT NOT NULL,
            mapel TEXT,
            tipe TEXT NOT NULL DEFAULT 'guru',
            icon TEXT DEFAULT 'fa-user',
            tier INTEGER NOT NULL DEFAULT 3,
            nip TEXT,
            pendidikan TEXT,
            tugas TEXT,
            atasan TEXT,
            foto TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_org_staff_active ON organization_staff(is_active, tipe, tier, sort_order);
        CREATE INDEX IF NOT EXISTS idx_org_staff_atasan ON organization_staff(atasan, sort_order);
    `);
    const columns = db.prepare('PRAGMA table_info(organization_staff)').all().map(row => row.name);
    if (!columns.includes('user_id')) db.exec('ALTER TABLE organization_staff ADD COLUMN user_id TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_org_staff_user ON organization_staff(user_id) WHERE user_id IS NOT NULL');
}

function wouldCreateOrganizationCycle(db, currentCode, nextParent) {
    if (!nextParent) return false;
    let cursor = nextParent;
    const visited = new Set();
    while (cursor) {
        if (cursor === currentCode) return true;
        if (visited.has(cursor)) return true;
        visited.add(cursor);
        cursor = db.prepare('SELECT atasan FROM organization_staff WHERE code = ?').get(cursor)?.atasan || null;
    }
    return false;
}

function orgRowToClient(row) {
    return {
        id: row.code,
        db_id: row.id,
        user_id: row.user_id || null,
        code: row.code,
        nama: row.nama,
        jabatan: row.jabatan,
        mapel: row.mapel || '-',
        tipe: row.tipe,
        icon: row.icon || 'fa-user',
        tier: Number(row.tier || 3),
        nip: row.nip || '',
        pendidikan: row.pendidikan || '',
        tugas: String(row.tugas || '').split(/\r?\n/).map(v => v.trim()).filter(Boolean),
        atasan: row.atasan || null,
        bawahan: [],
        foto: row.foto || '',
        sort_order: Number(row.sort_order || 0),
        is_active: Number(row.is_active) ? 1 : 0,
        created_at: row.created_at,
        updated_at: row.updated_at
    };
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
   ORGANIZATION STRUCTURE ROUTES
   ════════════════════════════════════════ */

// GET /api/content/organization — publik: struktur aktif untuk profil.html
router.get('/organization', (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const rows = db.prepare(`
        SELECT * FROM organization_staff
        WHERE is_active = 1
        ORDER BY tier ASC, sort_order ASC, tipe ASC, nama ASC
    `).all();
    const data = rows.map(orgRowToClient);
    const byCode = new Map(data.map(row => [row.code, row]));
    data.forEach(row => {
        if (row.atasan && byCode.has(row.atasan)) byCode.get(row.atasan).bawahan.push(row.code);
    });
    return res.status(200).json({ success:true, data });
});

// GET /api/content/organization/all — admin/TU/kepsek/wakasek: semua struktur
router.get('/organization/all', authenticate, isOrgManager, (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const { search = '', tipe = '', status = '' } = req.query;
    const conds = [];
    const params = {};
    if (search) {
        conds.push('(nama LIKE @search OR jabatan LIKE @search OR mapel LIKE @search OR nip LIKE @search OR code LIKE @search)');
        params.search = `%${cleanText(search, 120)}%`;
    }
    if (tipe && VALID_ORG_TYPES.includes(tipe)) {
        conds.push('tipe = @tipe');
        params.tipe = tipe;
    }
    if (status === 'active') conds.push('is_active = 1');
    if (status === 'inactive') conds.push('is_active = 0');
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = db.prepare(`
        SELECT * FROM organization_staff
        ${where}
        ORDER BY tier ASC, sort_order ASC, tipe ASC, nama ASC
        LIMIT 300
    `).all(params);
    return res.status(200).json({ success:true, data:rows.map(orgRowToClient) });
});

router.get('/organization/staff-options', authenticate, isOrgManager, (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const rows = db.prepare(`
        SELECT u.id,u.nama_lengkap,u.email,u.role,u.nip,u.no_hp,u.bidang,u.jabatan_detail,u.foto_profil,
               sp.pendidikan,
               os.code AS organization_code
        FROM users u
        LEFT JOIN staff_profiles sp ON sp.user_id = u.id
        LEFT JOIN organization_staff os ON os.user_id = u.id
        WHERE u.role IN ('super_admin','content_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha')
          AND u.is_active = 1
        ORDER BY u.nama_lengkap ASC
    `).all();
    return res.status(200).json({ success:true, data:rows });
});

// POST /api/content/organization — tambah personel struktur
router.post('/organization', authenticate, isOrgManager, (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const normalized = normalizeOrgPayload(req.body);
    if (!normalized.ok) return res.status(400).json({ success:false, message:normalized.message });
    if (normalized.data.atasan && normalized.data.atasan === normalized.data.code) {
        return res.status(400).json({ success:false, message:'Atasan tidak boleh dirinya sendiri.' });
    }
    if (normalized.data.atasan) {
        const parent = db.prepare('SELECT code FROM organization_staff WHERE code = ?').get(normalized.data.atasan);
        if (!parent) return res.status(400).json({ success:false, message:'Kode atasan tidak ditemukan.' });
    }
    if (normalized.data.user_id) {
        const account = db.prepare(`
            SELECT id FROM users
            WHERE id = ? AND role IN ('super_admin','content_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha')
        `).get(normalized.data.user_id);
        if (!account) return res.status(400).json({ success:false, message:'Akun staff yang dipilih tidak valid.' });
        const linked = db.prepare('SELECT code FROM organization_staff WHERE user_id = ?').get(normalized.data.user_id);
        if (linked) return res.status(409).json({ success:false, message:`Akun sudah terhubung ke struktur ${linked.code}.` });
    }
    const dup = db.prepare('SELECT id FROM organization_staff WHERE code = ?').get(normalized.data.code);
    if (dup) return res.status(409).json({ success:false, message:'Kode struktur sudah dipakai.' });

    const id = uuidv4();
    const now = nowISO();
    db.prepare(`
        INSERT INTO organization_staff
        (id,user_id,code,nama,jabatan,mapel,tipe,icon,tier,nip,pendidikan,tugas,atasan,foto,sort_order,is_active,created_by,created_at,updated_at)
        VALUES (@id,@user_id,@code,@nama,@jabatan,@mapel,@tipe,@icon,@tier,@nip,@pendidikan,@tugas,@atasan,@foto,@sort_order,@is_active,@created_by,@now,@now)
    `).run({ id, ...normalized.data, created_by:req.user.sub, now });
    log(req.user.sub, 'ORGANIZATION_CREATED', 'organization_staff', id, { code:normalized.data.code, nama:normalized.data.nama }, req.ip);
    return res.status(201).json({ success:true, message:'Struktur sekolah berhasil ditambahkan.', data:{ id, code:normalized.data.code } });
});

// PUT /api/content/organization/:id — edit personel struktur
router.put('/organization/:id', authenticate, isOrgManager, (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const current = db.prepare('SELECT * FROM organization_staff WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
    if (!current) return res.status(404).json({ success:false, message:'Data struktur tidak ditemukan.' });
    const normalized = normalizeOrgPayload(req.body, true);
    if (!normalized.ok) return res.status(400).json({ success:false, message:normalized.message });
    const nextCode = normalized.data.code || current.code;
    const nextParent = normalized.data.atasan === undefined ? current.atasan : normalized.data.atasan;
    if (nextParent && nextParent === nextCode) {
        return res.status(400).json({ success:false, message:'Atasan tidak boleh dirinya sendiri.' });
    }
    if (wouldCreateOrganizationCycle(db, current.code, nextParent)) {
        return res.status(400).json({ success:false, message:'Perpindahan ditolak karena akan membuat struktur berputar/saling membawahi.' });
    }
    if (normalized.data.code && normalized.data.code !== current.code) {
        const dup = db.prepare('SELECT id FROM organization_staff WHERE code = ? AND id != ?').get(normalized.data.code, current.id);
        if (dup) return res.status(409).json({ success:false, message:'Kode struktur sudah dipakai.' });
    }
    if (nextParent) {
        const parent = db.prepare('SELECT code FROM organization_staff WHERE code = ?').get(nextParent);
        if (!parent) return res.status(400).json({ success:false, message:'Kode atasan tidak ditemukan.' });
    }
    if (normalized.data.user_id) {
        const account = db.prepare(`
            SELECT id FROM users
            WHERE id = ? AND role IN ('super_admin','content_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha')
        `).get(normalized.data.user_id);
        if (!account) return res.status(400).json({ success:false, message:'Akun staff yang dipilih tidak valid.' });
        const linked = db.prepare('SELECT code FROM organization_staff WHERE user_id = ? AND id != ?').get(normalized.data.user_id, current.id);
        if (linked) return res.status(409).json({ success:false, message:`Akun sudah terhubung ke struktur ${linked.code}.` });
    }

    const fields = [];
    const vals = { id: current.id, now:nowISO() };
    for (const [key, value] of Object.entries(normalized.data)) {
        fields.push(`${key} = @${key}`);
        vals[key] = value;
    }
    if (!fields.length) return res.status(400).json({ success:false, message:'Tidak ada perubahan.' });
    fields.push('updated_at = @now');
    db.prepare(`UPDATE organization_staff SET ${fields.join(', ')} WHERE id = @id`).run(vals);
    if (normalized.data.code && normalized.data.code !== current.code) {
        db.prepare('UPDATE organization_staff SET atasan = ? WHERE atasan = ?').run(normalized.data.code, current.code);
    }
    log(req.user.sub, 'ORGANIZATION_UPDATED', 'organization_staff', current.id, { code:nextCode }, req.ip);
    return res.status(200).json({ success:true, message:'Struktur sekolah berhasil diperbarui.' });
});

// POST /api/content/organization/:id/move — geser urutan di dalam parent yang sama
router.post('/organization/:id/move', authenticate, isOrgManager, (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const current = db.prepare('SELECT * FROM organization_staff WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
    if (!current) return res.status(404).json({ success:false, message:'Data struktur tidak ditemukan.' });
    const direction = req.body?.direction;
    if (!['up', 'down'].includes(direction)) {
        return res.status(400).json({ success:false, message:'Arah perpindahan tidak valid.' });
    }
    const siblings = db.prepare(`
        SELECT id, code, sort_order FROM organization_staff
        WHERE COALESCE(atasan, '') = COALESCE(?, '')
        ORDER BY sort_order ASC, nama ASC
    `).all(current.atasan);
    const index = siblings.findIndex(row => row.id === current.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
        return res.status(200).json({ success:true, message:'Posisi sudah berada di batas urutan.' });
    }
    const target = siblings[targetIndex];
    const currentOrder = Number(current.sort_order || index);
    const targetOrder = Number(target.sort_order || targetIndex);
    const tx = db.transaction(() => {
        db.prepare('UPDATE organization_staff SET sort_order = ?, updated_at = ? WHERE id = ?')
            .run(targetOrder, nowISO(), current.id);
        db.prepare('UPDATE organization_staff SET sort_order = ?, updated_at = ? WHERE id = ?')
            .run(currentOrder, nowISO(), target.id);
    });
    tx();
    log(req.user.sub, 'ORGANIZATION_REORDERED', 'organization_staff', current.id, { direction, parent:current.atasan || null }, req.ip);
    return res.status(200).json({ success:true, message:`Posisi ${current.nama} berhasil digeser.` });
});

// POST /api/content/organization/:id/reparent — pindahkan ke atasan lain/root
router.post('/organization/:id/reparent', authenticate, isOrgManager, (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const current = db.prepare('SELECT * FROM organization_staff WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
    if (!current) return res.status(404).json({ success:false, message:'Data struktur tidak ditemukan.' });
    const nextParent = cleanText(req.body?.atasan, 24).replace(/\s+/g, '').toUpperCase() || null;
    if (nextParent) {
        const parent = db.prepare('SELECT code,tier FROM organization_staff WHERE code = ?').get(nextParent);
        if (!parent) return res.status(400).json({ success:false, message:'Atasan tujuan tidak ditemukan.' });
    }
    if (wouldCreateOrganizationCycle(db, current.code, nextParent)) {
        return res.status(400).json({ success:false, message:'Perpindahan ditolak karena akan membuat struktur berputar/saling membawahi.' });
    }
    const nextTier = nextParent
        ? Math.min(5, Number(db.prepare('SELECT tier FROM organization_staff WHERE code = ?').get(nextParent)?.tier || 2) + 1)
        : 1;
    const maxOrder = db.prepare(`
        SELECT COALESCE(MAX(sort_order), -1) AS max_order
        FROM organization_staff WHERE COALESCE(atasan, '') = COALESCE(?, '')
    `).get(nextParent)?.max_order ?? -1;
    db.prepare(`
        UPDATE organization_staff
        SET atasan = ?, tier = ?, sort_order = ?, updated_at = ?
        WHERE id = ?
    `).run(nextParent, nextTier, Number(maxOrder) + 1, nowISO(), current.id);
    log(req.user.sub, 'ORGANIZATION_REPARENTED', 'organization_staff', current.id, { parent:nextParent }, req.ip);
    return res.status(200).json({ success:true, message:`${current.nama} berhasil dipindahkan dalam struktur.` });
});

// DELETE /api/content/organization/:id — hapus personel struktur
router.delete('/organization/:id', authenticate, isOrgManager, (req, res) => {
    const db = getDB();
    ensureOrganizationSchema(db);
    const current = db.prepare('SELECT * FROM organization_staff WHERE id = ? OR code = ?').get(req.params.id, req.params.id);
    if (!current) return res.status(404).json({ success:false, message:'Data struktur tidak ditemukan.' });
    const children = db.prepare('SELECT COUNT(*) as c FROM organization_staff WHERE atasan = ?').get(current.code)?.c || 0;
    if (children) {
        return res.status(409).json({ success:false, message:`Tidak bisa dihapus karena masih membawahi ${children} personel. Pindahkan bawahannya dulu.` });
    }
    db.prepare('DELETE FROM organization_staff WHERE id = ?').run(current.id);
    log(req.user.sub, 'ORGANIZATION_DELETED', 'organization_staff', current.id, { code:current.code, nama:current.nama }, req.ip);
    return res.status(200).json({ success:true, message:'Struktur sekolah berhasil dihapus.' });
});

/* ════════════════════════════════════════
   WEBSITE CONTENT ROUTES (berita, galeri, PPDB info, info umum)
   ════════════════════════════════════════ */

// GET /api/content/website — publik: konten aktif
router.get('/website', (req, res) => {
    const db = getDB();
    ensureWebsiteContentSchema(db);
    const { type, placement, category, limit = 20 } = req.query;
    const conds = [
        'is_active = 1',
        "status IN ('published','scheduled')",
        '(publish_at IS NULL OR publish_at <= @now)',
        '(expires_at IS NULL OR expires_at > @now)'
    ];
    const params = { now:nowISO() };

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
router.get('/website/all', authenticate, isWebsiteContentManager, (req, res) => {
    const db = getDB();
    ensureWebsiteContentSchema(db);
    const { type = '', placement = '', status = '', search = '', page = 1, limit = 30 } = req.query;
    const pageInt = Math.max(parseInt(page) || 1, 1);
    const limitInt = Math.min(Math.max(parseInt(limit) || 30, 1), 100);
    const offset = (pageInt - 1) * limitInt;
    const conds = [];
    const params = {};

    if (type) {
        if (!VALID_CONTENT_TYPES.includes(type)) return res.status(400).json({ success:false, message:'Tipe konten tidak valid.' });
        conds.push('wc.type = @type');
        params.type = type;
    }
    if (placement) {
        conds.push('wc.placement = @placement');
        params.placement = cleanText(placement, 80);
    }
    if (status) {
        if (!VALID_CONTENT_STATUSES.includes(status)) return res.status(400).json({ success:false, message:'Status konten tidak valid.' });
        conds.push('wc.status = @status');
        params.status = status;
    }
    if (search) {
        conds.push('(wc.title LIKE @search OR wc.excerpt LIKE @search OR wc.body LIKE @search)');
        params.search = `%${cleanText(search, 120)}%`;
    }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const rows = db.prepare(`
        SELECT wc.*, creator.nama_lengkap AS created_by_name, updater.nama_lengkap AS updated_by_name
        FROM website_contents wc
        LEFT JOIN users creator ON creator.id = wc.created_by
        LEFT JOIN users updater ON updater.id = wc.updated_by
        ${where}
        ORDER BY
            CASE wc.status WHEN 'scheduled' THEN 1 WHEN 'published' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END,
            wc.publish_at ASC, wc.sort_order ASC, wc.created_at DESC
        LIMIT @limit OFFSET @offset
    `).all({ ...params, limit:limitInt, offset });
    const total = db.prepare(`SELECT COUNT(*) as c FROM website_contents wc ${where}`).get(params)?.c || 0;
    const summary = db.prepare(`
        SELECT status, COUNT(*) AS total FROM website_contents GROUP BY status
    `).all().reduce((acc, row) => ({ ...acc, [row.status]:row.total }), { draft:0, scheduled:0, published:0, archived:0 });
    return res.status(200).json({ success:true, data:{ rows, summary, pagination:{ total, page:pageInt, limit:limitInt, totalPages:Math.ceil(total / limitInt) } } });
});

// POST /api/content/website — admin: tambah konten
router.post('/website', authenticate, isWebsiteContentManager, (req, res) => {
    const db = getDB();
    ensureWebsiteContentSchema(db);
    const normalized = normalizeContentPayload(req.body);
    if (!normalized.ok) return res.status(400).json({ success:false, message:normalized.message });
    const id = uuidv4();
    const now = nowISO();
    db.prepare(`
        INSERT INTO website_contents
        (id,type,placement,title,excerpt,body,image_url,link_url,category,icon,is_active,status,publish_at,expires_at,sort_order,created_by,updated_by,created_at,updated_at)
        VALUES (@id,@type,@placement,@title,@excerpt,@body,@image_url,@link_url,@category,@icon,@is_active,@status,@publish_at,@expires_at,@sort_order,@created_by,@updated_by,@now,@now)
    `).run({ id, ...normalized.data, created_by:req.user.sub, updated_by:req.user.sub, now });
    log(req.user.sub, 'WEBSITE_CONTENT_CREATED', 'website_contents', id, { type:normalized.data.type, title:normalized.data.title }, req.ip);
    return res.status(201).json({ success:true, message:'Konten website berhasil ditambahkan.', data:{ id } });
});

// PUT /api/content/website/:id — admin: edit konten
router.put('/website/:id', authenticate, isWebsiteContentManager, (req, res) => {
    const db = getDB();
    ensureWebsiteContentSchema(db);
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
    fields.push('updated_by = @updated_by');
    vals.updated_by = req.user.sub;

    db.prepare(`UPDATE website_contents SET ${fields.join(', ')} WHERE id = @id`).run(vals);
    log(req.user.sub, 'WEBSITE_CONTENT_UPDATED', 'website_contents', id, null, req.ip);
    return res.status(200).json({ success:true, message:'Konten website berhasil diperbarui.' });
});

// DELETE /api/content/website/:id — admin: hapus konten
router.delete('/website/:id', authenticate, isWebsiteContentManager, (req, res) => {
    const db = getDB();
    ensureWebsiteContentSchema(db);
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

module.exports = router;
