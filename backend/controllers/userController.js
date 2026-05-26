// controllers/userController.js
'use strict';

const bcrypt  = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const getDB   = require('../config/database');
const { log } = require('../middleware/auditLog');
const { findSchoolClass } = require('../utils/schoolClasses');

const nowISO = () => new Date().toISOString();

// FIX: Whitelist ketat untuk ORDER BY — inject via template string tidak mungkin
const VALID_SORT_FIELDS = new Set(['nama_lengkap','email','role','created_at','last_login']);
const VALID_SORT_ORDERS = new Set(['ASC','DESC']);

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

    // FIX: Validasi sort field pakai Set, bukan array includes
    // Jika tidak ada di whitelist, SELALU fallback ke created_at — tidak pakai nilai user
    const sortField = VALID_SORT_FIELDS.has(sort) ? sort : 'created_at';
    const sortOrder = VALID_SORT_ORDERS.has(order?.toUpperCase()) ? order.toUpperCase() : 'DESC';

    const limitInt  = Math.min(Math.max(parseInt(limit) || 20, 1), 100); // clamp 1–100
    const pageInt   = Math.max(parseInt(page) || 1, 1);
    const offset    = (pageInt - 1) * limitInt;

    const conditions = [];
    const params     = [];

    if (role) {
        // FIX: Validasi role value sebelum masuk query
        const validRoles = ['super_admin','kepala_sekolah','guru','tata_usaha','siswa','wali_murid','calon_siswa'];
        if (!validRoles.includes(role)) {
            return res.status(400).json({ success: false, message: 'Role tidak valid.' });
        }
        conditions.push('role = ?');
        params.push(role);
    }
    if (is_active !== undefined && is_active !== '') {
        conditions.push('is_active = ?');
        params.push(parseInt(is_active) === 1 ? 1 : 0);
    }
    if (search) {
        // FIX: Sanitasi karakter khusus LIKE (%, _) agar tidak jadi wildcard yang tidak diinginkan
        const s = `%${search.replace(/[%_\\]/g, '\\$&')}%`;
        conditions.push('(nama_lengkap LIKE ? OR email LIKE ? OR nisn LIKE ? OR nip LIKE ? OR bidang LIKE ? OR jabatan_detail LIKE ?)');
        params.push(s, s, s, s, s, s);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    // FIX: sortField dan sortOrder sudah divalidasi via whitelist Set di atas
    // Aman dipakai di template string karena nilainya tidak berasal dari input mentah
    const userSQL  = `SELECT id,nama_lengkap,email,role,nisn,nip,no_hp,foto_profil,bidang,jabatan_detail,is_active,is_verified,last_login,created_at FROM users ${where} ORDER BY ${sortField} ${sortOrder} LIMIT ? OFFSET ?`;
    const countSQL = `SELECT COUNT(*) as c FROM users ${where}`;

    try {
        const users = db.prepare(userSQL).all(...params, limitInt, offset);
        const total = db.prepare(countSQL).get(...params)?.c || 0;

        return res.status(200).json({
            success: true,
            data: {
                users,
                pagination: {
                    total,
                    page:       pageInt,
                    limit:      limitInt,
                    totalPages: Math.ceil(total / limitInt)
                }
            }
        });
    } catch (err) {
        // FIX: Log di server, generic message ke client
        console.error('[GetAllUsers]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data user.' });
    }
}

/* ── GET user by ID ──────────────────────────────────── */
function getUserById(req, res) {
    const db   = getDB();
    try {
        const user = db.prepare(`
            SELECT u.id,u.nama_lengkap,u.email,u.role,u.nisn,u.nip,u.no_hp,
                   u.foto_profil,u.bidang,u.jabatan_detail,u.is_active,u.is_verified,u.last_login,u.created_at,u.updated_at,
                   sp.kelas, sp.jurusan
            FROM users u
            LEFT JOIN siswa_profil sp ON sp.nisn = u.nisn
            WHERE u.id = :id
        `).get({ id: req.params.id });

        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        return res.status(200).json({ success: true, data: user });
    } catch (err) {
        console.error('[GetUserById]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil data user.' });
    }
}

/* ── CREATE user (oleh admin) ────────────────────────── */
async function createUser(req, res) {
    const db = getDB();
    const { nama_lengkap, email, password, role, nisn, nip, no_hp, bidang, jabatan_detail, kelas, jurusan } = req.body;

    try {
        if (email) {
            const ex = db.prepare('SELECT id FROM users WHERE email = :e').get({ e: email.toLowerCase() });
            if (ex) return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
        }
        if (nisn) {
            const ex = db.prepare('SELECT id FROM users WHERE nisn = :n').get({ n: nisn });
            if (ex) return res.status(409).json({ success: false, message: 'NISN sudah terdaftar.' });
        }
        if (nip) {
            const ex = db.prepare('SELECT id FROM users WHERE nip = :n').get({ n: nip });
            if (ex) return res.status(409).json({ success: false, message: 'NIP sudah terdaftar.' });
        }
        const classInfo = kelas ? findSchoolClass(kelas) : null;
        if (role === 'siswa' && !classInfo) {
            return res.status(400).json({ success: false, message: 'Kelas siswa wajib dipilih dan harus valid.' });
        }

        const hash   = await bcrypt.hash(password, 12);
        const userId = uuidv4();
        const now    = nowISO();

        db.prepare(`
            INSERT INTO users
            (id,nama_lengkap,email,password_hash,role,nisn,nip,no_hp,bidang,jabatan_detail,is_active,is_verified,created_at,updated_at)
            VALUES (:id,:nama,:email,:hash,:role,:nisn,:nip,:hp,:bidang,:jabatan,1,1,:now,:now)
        `).run({
            id: userId, nama: nama_lengkap.trim(),
            email: email?.toLowerCase() || null,
            hash, role,
            nisn: nisn || null, nip: nip || null, hp: no_hp || null,
            bidang: bidang || null, jabatan: jabatan_detail || null,
            now
        });

        if (nisn && ['siswa', 'calon_siswa'].includes(role)) {
            const finalJurusan = classInfo?.jurusan || jurusan || null;
            db.prepare(`
                INSERT OR IGNORE INTO siswa_profil (id,user_id,nisn,kelas,jurusan,updated_at)
                VALUES (?,?,?,?,?,?)
            `).run(uuidv4(), userId, nisn, classInfo?.kelas || kelas || null, finalJurusan, now);
            db.prepare(`
                UPDATE siswa_profil SET user_id=?, kelas=?, jurusan=?, updated_at=? WHERE nisn=?
            `).run(userId, classInfo?.kelas || kelas || null, finalJurusan, now, nisn);
        }

        log(req.user.sub, 'USER_CREATED', 'users', userId, { role, email }, req.ip);

        return res.status(201).json({
            success: true,
            message: 'Akun berhasil dibuat.',
            data:    { id: userId, nama_lengkap, role, bidang: bidang || null, jabatan_detail: jabatan_detail || null }
        });
    } catch (err) {
        console.error('[CreateUser]', err.message);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}

/* ── UPDATE user ─────────────────────────────────────── */
async function updateUser(req, res) {
    const db = getDB();
    const { id } = req.params;
    const { nama_lengkap, email, role, nisn, nip, no_hp, bidang, jabatan_detail, is_active, password, kelas, jurusan } = req.body;

    try {
        const user = db.prepare('SELECT * FROM users WHERE id=:id').get({ id });
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        const restrictedRoles = ['super_admin', 'kepala_sekolah'];
        if (role && restrictedRoles.includes(role) && req.user.role !== 'super_admin') {
            return res.status(403).json({ success: false, message: 'Tidak bisa assign role ini.' });
        }

        if (email && email.toLowerCase() !== user.email) {
            const ex = db.prepare('SELECT id FROM users WHERE email=:e AND id != :id').get({ e: email.toLowerCase(), id });
            if (ex) return res.status(409).json({ success: false, message: 'Email sudah digunakan.' });
        }
        if (nisn && nisn !== user.nisn) {
            const ex = db.prepare('SELECT id FROM users WHERE nisn=:n AND id != :id').get({ n: nisn, id });
            if (ex) return res.status(409).json({ success: false, message: 'NISN sudah digunakan.' });
        }

        const fields = [];
        const vals   = {};

        if (nama_lengkap)            { fields.push('nama_lengkap=:nama');  vals.nama   = nama_lengkap.trim(); }
        if (email)                   { fields.push('email=:email');        vals.email  = email.toLowerCase(); }
        if (role)                    { fields.push('role=:role');          vals.role   = role; }
        if (nisn !== undefined)      { fields.push('nisn=:nisn');          vals.nisn   = nisn || null; }
        if (nip  !== undefined)      { fields.push('nip=:nip');            vals.nip    = nip  || null; }
        if (no_hp !== undefined)     { fields.push('no_hp=:hp');           vals.hp     = no_hp || null; }
        if (bidang !== undefined)    { fields.push('bidang=:bidang');      vals.bidang = bidang || null; }
        if (jabatan_detail !== undefined) { fields.push('jabatan_detail=:jabatan'); vals.jabatan = jabatan_detail || null; }
        if (is_active !== undefined) { fields.push('is_active=:active');   vals.active = parseInt(is_active) === 1 ? 1 : 0; }

        if (password) {
            // FIX: Validasi password minimal sebelum hash
            if (password.length < 8) {
                return res.status(400).json({ success: false, message: 'Password minimal 8 karakter.' });
            }
            const hash = await bcrypt.hash(password, 12);
            fields.push('password_hash=:hash');
            vals.hash = hash;
        }

        const hasProfileUpdate = kelas !== undefined || jurusan !== undefined;
        const classInfo = kelas ? findSchoolClass(kelas) : null;
        const profileRole = role || user.role;
        if (profileRole === 'siswa' && kelas !== undefined && !classInfo) {
            return res.status(400).json({ success: false, message: 'Kelas siswa wajib valid.' });
        }
        if (!fields.length && !hasProfileUpdate) return res.status(400).json({ success: false, message: 'Tidak ada data yang diubah.' });

        if (fields.length) {
            fields.push('updated_at=:now');
            vals.now = nowISO();
            vals.id  = id;
            db.prepare(`UPDATE users SET ${fields.join(',')} WHERE id=:id`).run(vals);
        }

        const finalRole = role || user.role;
        const finalNisn = nisn !== undefined ? nisn : user.nisn;
        if (finalNisn && ['siswa', 'calon_siswa'].includes(finalRole) && (kelas !== undefined || jurusan !== undefined || nisn !== undefined)) {
            const finalKelas = classInfo?.kelas || kelas || null;
            const finalJurusan = classInfo?.jurusan || jurusan || null;
            const existingProfile = db.prepare('SELECT id FROM siswa_profil WHERE nisn = ?').get(finalNisn);
            if (existingProfile) {
                db.prepare(`
                    UPDATE siswa_profil
                    SET user_id=?, kelas=COALESCE(?, kelas), jurusan=COALESCE(?, jurusan), updated_at=?
                    WHERE nisn=?
                `).run(id, finalKelas, finalJurusan, nowISO(), finalNisn);
            } else {
                db.prepare(`
                    INSERT INTO siswa_profil (id,user_id,nisn,kelas,jurusan,updated_at)
                    VALUES (?,?,?,?,?,?)
                `).run(uuidv4(), id, finalNisn, finalKelas, finalJurusan, nowISO());
            }
        }
        log(req.user.sub, 'USER_UPDATED', 'users', id, { fields: fields.map(f => f.split('=')[0]) }, req.ip);

        return res.status(200).json({ success: true, message: 'Data user berhasil diperbarui.' });
    } catch (err) {
        console.error('[UpdateUser]', err.message);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}

/* ── NONAKTIFKAN user ────────────────────────────────── */
function deactivateUser(req, res) {
    const db  = getDB();
    const { id } = req.params;

    if (id === req.user.sub) {
        return res.status(400).json({ success: false, message: 'Tidak bisa menonaktifkan akun sendiri.' });
    }

    try {
        const user = db.prepare('SELECT id FROM users WHERE id=:id').get({ id });
        if (!user) return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });

        db.prepare('UPDATE users SET is_active=0, updated_at=:now WHERE id=:id').run({ now: nowISO(), id });
        db.prepare('DELETE FROM refresh_tokens WHERE user_id=:uid').run({ uid: id });

        log(req.user.sub, 'USER_DEACTIVATED', 'users', id, null, req.ip);
        return res.status(200).json({ success: true, message: 'Akun berhasil dinonaktifkan.' });
    } catch (err) {
        console.error('[DeactivateUser]', err.message);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}

/* ── AKTIFKAN user ───────────────────────────────────── */
function activateUser(req, res) {
    const db  = getDB();
    const { id } = req.params;
    try {
        db.prepare('UPDATE users SET is_active=1, login_attempts=0, locked_until=NULL, updated_at=:now WHERE id=:id')
          .run({ now: nowISO(), id });
        log(req.user.sub, 'USER_ACTIVATED', 'users', id, null, req.ip);
        return res.status(200).json({ success: true, message: 'Akun berhasil diaktifkan.' });
    } catch (err) {
        console.error('[ActivateUser]', err.message);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}

function getPendingStaff(req, res) {
    const db = getDB();
    try {
        const users = db.prepare(`
            SELECT id,nama_lengkap,email,role,bidang,jabatan_detail,no_hp,foto_profil,
                   is_active,is_verified,last_login,created_at,updated_at
            FROM users
            WHERE role IN ('guru','tata_usaha') AND is_active = 0
            ORDER BY created_at DESC
        `).all();

        return res.status(200).json({ success: true, data: users });
    } catch (err) {
        console.error('[GetPendingStaff]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil daftar staff pending.' });
    }
}

/* ── STATS user ──────────────────────────────────────── */
function getUserStats(req, res) {
    const db = getDB();
    try {
        const rows = db.prepare(`
            SELECT role,
                   COUNT(*) as total,
                   SUM(is_active) as aktif,
                   SUM(CASE WHEN is_active=0 THEN 1 ELSE 0 END) as nonaktif,
                   SUM(is_verified) as terverifikasi
            FROM users GROUP BY role ORDER BY total DESC
        `).all();

        const total = db.prepare('SELECT COUNT(*) as c FROM users').get()?.c || 0;
        const pendingStaff = db.prepare(`
            SELECT COUNT(*) as c FROM users
            WHERE role IN ('guru','tata_usaha') AND is_active = 0
        `).get()?.c || 0;

        return res.status(200).json({ success: true, data: { byRole: rows, total, pendingStaff } });
    } catch (err) {
        console.error('[GetUserStats]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil statistik.' });
    }
}

/* ── AUDIT LOGS ──────────────────────────────────────── */
function getAuditLogs(req, res) {
    const db = getDB();
    const { userId, action, page = 1, limit = 50 } = req.query;
    const limitInt = Math.min(parseInt(limit) || 50, 200);
    const offset   = (Math.max(parseInt(page) || 1, 1) - 1) * limitInt;

    const conditions = [];
    const params     = [];

    if (userId) { conditions.push('al.user_id = ?'); params.push(userId); }
    if (action) {
        // FIX: Sanitasi karakter LIKE
        const safeAction = `%${action.replace(/[%_\\]/g, '\\$&')}%`;
        conditions.push('al.action LIKE ?');
        params.push(safeAction);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    try {
        const logs = db.prepare(`
            SELECT al.id, al.action, al.entity, al.entity_id, al.detail,
                   al.ip_address, al.created_at,
                   u.nama_lengkap, u.role
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ${where}
            ORDER BY al.created_at DESC
            LIMIT ? OFFSET ?
        `).all(...params, limitInt, offset);

        const total = db.prepare(`SELECT COUNT(*) as c FROM audit_logs al ${where}`).get(...params)?.c || 0;

        return res.status(200).json({
            success: true,
            data: {
                logs,
                pagination: {
                    total, page: parseInt(page), limit: limitInt,
                    totalPages: Math.ceil(total / limitInt)
                }
            }
        });
    } catch (err) {
        console.error('[GetAuditLogs]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal mengambil audit log.' });
    }
}

module.exports = {
    getAllUsers, getUserById, createUser,
    updateUser, deactivateUser, activateUser, getPendingStaff,
    getUserStats, getAuditLogs
};
