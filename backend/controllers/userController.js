// controllers/userController.js
'use strict';

const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const getDB   = require('../config/database');
const { log } = require('../middleware/auditLog');

const nowISO = () => new Date().toISOString();

/* ── GET semua user ──────────────────────────────────── */
function getAllUsers(req, res) {
    const db = getDB();
    const {
        role, search, is_active,
        page  = 1,
        limit = 20,
        sort  = 'created_at',
        order = 'DESC'
    } = req.query;

    const offset     = (parseInt(page) - 1) * parseInt(limit);
    const validSort  = ['nama_lengkap','email','role','created_at','last_login'];
    const sortField  = validSort.includes(sort) ? sort : 'created_at';
    const sortOrder  = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause — sql.js tidak support named params di dynamic SQL
    // jadi kita build string SQL lalu pass array params
    const conditions = [];
    const params     = [];

    if (role) {
        conditions.push(`role = ?`);
        params.push(role);
    }
    if (is_active !== undefined && is_active !== '') {
        conditions.push(`is_active = ?`);
        params.push(parseInt(is_active));
    }
    if (search) {
        conditions.push(`(nama_lengkap LIKE ? OR email LIKE ? OR nisn LIKE ? OR nip LIKE ?)`);
        const s = `%${search}%`;
        params.push(s, s, s, s);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // sql.js exec dengan array params
    const userSQL  = `SELECT id,nama_lengkap,email,role,nisn,nip,no_hp,foto_profil,is_active,is_verified,last_login,created_at FROM users ${where} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    const countSQL = `SELECT COUNT(*) as c FROM users ${where}`;

    try {
        const users = db.prepare(userSQL).all(...params, parseInt(limit), offset);
        const total = db.prepare(countSQL).get(...params)?.c || 0;

        return res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    total,
                    page:       parseInt(page),
                    limit:      parseInt(limit),
                    totalPages: Math.ceil(total / parseInt(limit))
                }
            }
        });
    } catch (err) {
        console.error('[GetAllUsers]', err);
        return res.status(500).json({ success:false, message:'Gagal mengambil data user.' });
    }
}

/* ── GET user by ID ──────────────────────────────────── */
function getUserById(req, res) {
    const db   = getDB();
    const user = db.prepare(`
        SELECT id,nama_lengkap,email,role,nisn,nip,no_hp,
               foto_profil,is_active,is_verified,last_login,created_at,updated_at
        FROM users WHERE id = :id
    `).get({ id: req.params.id });

    if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan.' });
    return res.status(200).json({ success:true, data:user });
}

/* ── CREATE user (oleh admin) ────────────────────────── */
async function createUser(req, res) {
    const db = getDB();
    const { nama_lengkap, email, password, role, nisn, nip, no_hp } = req.body;

    try {
        // Cek duplikat
        if (email) {
            const ex = db.prepare('SELECT id FROM users WHERE email = :e').get({ e:email.toLowerCase() });
            if (ex) return res.status(409).json({ success:false, message:'Email sudah terdaftar.' });
        }
        if (nisn) {
            const ex = db.prepare('SELECT id FROM users WHERE nisn = :n').get({ n:nisn });
            if (ex) return res.status(409).json({ success:false, message:'NISN sudah terdaftar.' });
        }
        if (nip) {
            const ex = db.prepare('SELECT id FROM users WHERE nip = :n').get({ n:nip });
            if (ex) return res.status(409).json({ success:false, message:'NIP sudah terdaftar.' });
        }

        const hash   = await bcrypt.hash(password, 12);
        const userId = uuidv4();
        const now    = nowISO();

        db.prepare(`
            INSERT INTO users
            (id,nama_lengkap,email,password_hash,role,nisn,nip,no_hp,is_active,is_verified,created_at,updated_at)
            VALUES (:id,:nama,:email,:hash,:role,:nisn,:nip,:hp,1,1,:now,:now)
        `).run({
            id:userId, nama:nama_lengkap.trim(),
            email:email?.toLowerCase()||null,
            hash, role,
            nisn:nisn||null, nip:nip||null, hp:no_hp||null, now
        });

        log(req.user.sub, 'USER_CREATED', 'users', userId, { role, email }, req.ip);

        return res.status(201).json({
            success: true,
            message: 'Akun berhasil dibuat.',
            data:    { id:userId, nama_lengkap, role }
        });
    } catch (err) {
        console.error('[CreateUser]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── UPDATE user ─────────────────────────────────────── */
async function updateUser(req, res) {
    const db = getDB();
    const { id } = req.params;
    const { nama_lengkap, email, role, nisn, nip, no_hp, is_active, password } = req.body;

    try {
        const user = db.prepare('SELECT * FROM users WHERE id=:id').get({ id });
        if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan.' });

        // Super admin only untuk assign role restricted
        const restrictedRoles = ['super_admin','kepala_sekolah'];
        if (role && restrictedRoles.includes(role) && req.user.role !== 'super_admin') {
            return res.status(403).json({ success:false, message:'Tidak bisa assign role ini.' });
        }

        // Cek duplikat email
        if (email && email.toLowerCase() !== user.email) {
            const ex = db.prepare('SELECT id FROM users WHERE email=:e AND id != :id').get({ e:email.toLowerCase(), id });
            if (ex) return res.status(409).json({ success:false, message:'Email sudah digunakan.' });
        }

        // Cek duplikat NISN
        if (nisn && nisn !== user.nisn) {
            const ex = db.prepare('SELECT id FROM users WHERE nisn=:n AND id != :id').get({ n:nisn, id });
            if (ex) return res.status(409).json({ success:false, message:'NISN sudah digunakan.' });
        }

        // Build update fields
        const fields = [];
        const vals   = {};

        if (nama_lengkap)            { fields.push('nama_lengkap=:nama');  vals.nama  = nama_lengkap.trim(); }
        if (email)                   { fields.push('email=:email');        vals.email = email.toLowerCase(); }
        if (role)                    { fields.push('role=:role');          vals.role  = role; }
        if (nisn !== undefined)      { fields.push('nisn=:nisn');          vals.nisn  = nisn||null; }
        if (nip  !== undefined)      { fields.push('nip=:nip');            vals.nip   = nip||null; }
        if (no_hp !== undefined)     { fields.push('no_hp=:hp');           vals.hp    = no_hp||null; }
        if (is_active !== undefined) { fields.push('is_active=:active');   vals.active= parseInt(is_active); }

        if (password) {
            const hash = await bcrypt.hash(password, 12);
            fields.push('password_hash=:hash');
            vals.hash = hash;
        }

        if (!fields.length) return res.status(400).json({ success:false, message:'Tidak ada data yang diubah.' });

        fields.push('updated_at=:now');
        vals.now = nowISO();
        vals.id  = id;

        db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=:id`).run(vals);
        log(req.user.sub, 'USER_UPDATED', 'users', id, { fields }, req.ip);

        return res.status(200).json({ success:true, message:'Data user berhasil diperbarui.' });
    } catch (err) {
        console.error('[UpdateUser]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── NONAKTIFKAN user ────────────────────────────────── */
function deactivateUser(req, res) {
    const db  = getDB();
    const { id } = req.params;

    if (id === req.user.sub) {
        return res.status(400).json({ success:false, message:'Tidak bisa menonaktifkan akun sendiri.' });
    }

    const user = db.prepare('SELECT id FROM users WHERE id=:id').get({ id });
    if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan.' });

    db.prepare('UPDATE users SET is_active=0, updated_at=:now WHERE id=:id').run({ now:nowISO(), id });
    db.prepare('DELETE FROM refresh_tokens WHERE user_id=:uid').run({ uid:id });

    log(req.user.sub, 'USER_DEACTIVATED', 'users', id, null, req.ip);
    return res.status(200).json({ success:true, message:'Akun berhasil dinonaktifkan.' });
}

/* ── AKTIFKAN user ───────────────────────────────────── */
function activateUser(req, res) {
    const db  = getDB();
    const { id } = req.params;

    db.prepare('UPDATE users SET is_active=1, login_attempts=0, locked_until=NULL, updated_at=:now WHERE id=:id')
      .run({ now:nowISO(), id });

    log(req.user.sub, 'USER_ACTIVATED', 'users', id, null, req.ip);
    return res.status(200).json({ success:true, message:'Akun berhasil diaktifkan.' });
}

/* ── STATS user ──────────────────────────────────────── */
function getUserStats(req, res) {
    const db = getDB();

    const rows = db.prepare(`
        SELECT role,
               COUNT(*) as total,
               SUM(is_active) as aktif,
               SUM(CASE WHEN is_active=0 THEN 1 ELSE 0 END) as nonaktif,
               SUM(is_verified) as terverifikasi
        FROM users GROUP BY role ORDER BY total DESC
    `).all();

    const total = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0;

    return res.status(200).json({
        success: true,
        data:    { byRole:rows, total }
    });
}

/* ── AUDIT LOGS ──────────────────────────────────────── */
function getAuditLogs(req, res) {
    const db = getDB();
    const { userId, action, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    const params     = [];

    if (userId) { conditions.push('al.user_id = ?'); params.push(userId); }
    if (action)  { conditions.push('al.action LIKE ?'); params.push(`%${action}%`); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const logs  = db.prepare(`
        SELECT al.id, al.action, al.entity, al.entity_id, al.detail,
               al.ip_address, al.created_at,
               u.nama_lengkap, u.role
        FROM audit_logs al
        LEFT JOIN users u ON al.user_id = u.id
        ${where}
        ORDER BY al.created_at DESC
        LIMIT ? OFFSET ?
    `).all(...params, parseInt(limit), offset);

    const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs al ${where}`).get(...params)?.c || 0;

    return res.status(200).json({
        success: true,
        data: {
            logs,
            pagination: {
                total, page:parseInt(page), limit:parseInt(limit),
                totalPages: Math.ceil(total / parseInt(limit))
            }
        }
    });
}

module.exports = {
    getAllUsers, getUserById, createUser,
    updateUser, deactivateUser, activateUser,
    getUserStats, getAuditLogs
};
