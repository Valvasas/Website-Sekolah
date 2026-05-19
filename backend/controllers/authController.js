// controllers/authController.js
'use strict';

const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const getDB   = require('../config/database');
const jwtCfg  = require('../config/jwt');
const mailer  = require('../config/mailer');
const { log } = require('../middleware/auditLog');

/* ── Helpers ─────────────────────────────────────────── */
const generateToken = () => crypto.randomBytes(32).toString('hex');
const generateOTP   = () => Math.floor(100000 + Math.random() * 900000).toString();
const tokenExpiry   = (mins = 15) => new Date(Date.now() + mins * 60_000).toISOString();
const nowISO        = () => new Date().toISOString();

function identifierField(role) {
    return role === 'siswa' ? 'nisn' : 'email';
}

/* ── REGISTER ────────────────────────────────────────── */
async function register(req, res) {
    const db = getDB();
    const { nama_lengkap, email, password, role = 'siswa', nisn, nip, no_hp } = req.body;

    try {
        // Hanya peran ini yang boleh daftar sendiri
        const selfRegisterRoles = ['siswa','wali_murid','calon_siswa'];
        if (!selfRegisterRoles.includes(role) && req.user?.role !== 'super_admin') {
            return res.status(403).json({ success:false, message:'Pendaftaran role ini harus oleh Administrator.' });
        }

        // Cek duplikat email
        if (email) {
            const ex = db.prepare('SELECT id FROM users WHERE email = :e').get({ e: email.toLowerCase() });
            if (ex) return res.status(409).json({ success:false, message:'Email sudah terdaftar.' });
        }
        // Cek duplikat NISN
        if (nisn) {
            const ex = db.prepare('SELECT id FROM users WHERE nisn = :n').get({ n: nisn });
            if (ex) return res.status(409).json({ success:false, message:'NISN sudah terdaftar.' });
        }
        // Cek duplikat NIP
        if (nip) {
            const ex = db.prepare('SELECT id FROM users WHERE nip = :n').get({ n: nip });
            if (ex) return res.status(409).json({ success:false, message:'NIP sudah terdaftar.' });
        }

        const password_hash = await bcrypt.hash(password, 12);
        const userId        = uuidv4();
        const isVerified    = selfRegisterRoles.includes(role) ? 0 : 1;
        const now           = nowISO();

        db.prepare(`
            INSERT INTO users
            (id,nama_lengkap,email,password_hash,role,nisn,nip,no_hp,is_active,is_verified,created_at,updated_at)
            VALUES (:id,:nama,:email,:hash,:role,:nisn,:nip,:hp,1,:v,:now,:now)
        `).run({
            id:   userId, nama: nama_lengkap.trim(),
            email: email?.toLowerCase() || null,
            hash: password_hash, role, nisn: nisn||null,
            nip: nip||null, hp: no_hp||null, v: isVerified, now
        });

        // Kirim email verifikasi
        let verSent = false;
        if (!isVerified && email) {
            try {
                const tok = generateToken();
                db.prepare(`
                    INSERT INTO email_verification_tokens (id,user_id,token,expires_at,used,created_at)
                    VALUES (:id,:uid,:tok,:exp,0,:now)
                `).run({ id:uuidv4(), uid:userId, tok, exp:tokenExpiry(24*60), now });
                await mailer.sendVerificationEmail(email, nama_lengkap, tok);
                verSent = true;
            } catch(e) { console.warn('[Register] Email gagal:', e.message); }
        }

        log(userId, 'USER_REGISTER', 'users', userId, { role, email }, req.ip);

        return res.status(201).json({
            success: true,
            message: verSent ? 'Akun berhasil dibuat! Cek email untuk verifikasi.' : 'Akun berhasil dibuat! Silakan login.',
            data: { id:userId, nama:nama_lengkap, role, email:email||null, nisn:nisn||null, verificationRequired:!isVerified }
        });
    } catch (err) {
        console.error('[Register]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── LOGIN ───────────────────────────────────────────── */
async function login(req, res) {
    const db = getDB();
    const { identifier, password, role, rememberMe = false } = req.body;

    try {
        const field = identifierField(role);
        const user  = field === 'nisn'
            ? db.prepare('SELECT * FROM users WHERE nisn = :id AND role = :role').get({ id: identifier.trim(), role })
            : db.prepare('SELECT * FROM users WHERE email = :id AND role = :role').get({ id: identifier.toLowerCase().trim(), role });

        if (!user) {
            return res.status(401).json({ success:false, message:`${field==='nisn'?'NISN':'Email'} atau password salah.` });
        }

        // Cek lock
        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(423).json({ success:false, message:`Akun terkunci ${mins} menit lagi.` });
        }

        // Cek aktif
        if (!user.is_active) {
            return res.status(403).json({ success:false, message:'Akun dinonaktifkan. Hubungi administrator.' });
        }

        // Cek password
        const match = await bcrypt.compare(password, user.password_hash || '');
        if (!match) {
            const attempts    = (user.login_attempts || 0) + 1;
            const maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS) || 5;
            const lockMins    = parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15;
            const now         = nowISO();

            if (attempts >= maxAttempts) {
                const lockedUntil = new Date(Date.now() + lockMins * 60000).toISOString();
                db.prepare('UPDATE users SET login_attempts=:a, locked_until=:l, updated_at=:now WHERE id=:id')
                  .run({ a:attempts, l:lockedUntil, now, id:user.id });
                log(user.id, 'ACCOUNT_LOCKED', 'users', user.id, { attempts }, req.ip);
                return res.status(423).json({ success:false, message:`Akun terkunci ${lockMins} menit.` });
            }

            db.prepare('UPDATE users SET login_attempts=:a, updated_at=:now WHERE id=:id')
              .run({ a:attempts, now, id:user.id });
            return res.status(401).json({ success:false, message:`Password salah. Sisa percobaan: ${maxAttempts - attempts}.` });
        }

        // Login sukses — reset attempts
        db.prepare('UPDATE users SET login_attempts=0, locked_until=NULL, last_login=:now, updated_at=:now WHERE id=:id')
          .run({ now:nowISO(), id:user.id });

        const payload      = jwtCfg.createPayload(user);
        const accessToken  = jwtCfg.generateAccessToken(payload);
        const refreshToken = jwtCfg.generateRefreshToken(payload);
        const refreshDays  = rememberMe ? 30 : 7;
        const refreshExp   = new Date(Date.now() + refreshDays * 86400_000).toISOString();

        db.prepare(`
            INSERT INTO refresh_tokens (id,user_id,token,expires_at,created_at)
            VALUES (:id,:uid,:tok,:exp,:now)
        `).run({ id:uuidv4(), uid:user.id, tok:refreshToken, exp:refreshExp, now:nowISO() });

        log(user.id, 'USER_LOGIN', 'users', user.id, { role:user.role }, req.ip);

        const redirectMap = {
            super_admin:'/admin-panel/dashboard.html', kepala_sekolah:'/admin-panel/dashboard.html',
            guru:'/admin-panel/dashboard.html',        tata_usaha:'/admin-panel/dashboard.html',
            siswa:'/DATA.html',                        wali_murid:'/DATA.html',
            calon_siswa:'/ppdb.html',
        };

        return res.status(200).json({
            success: true,
            message: `Selamat datang, ${user.nama_lengkap}!`,
            data: {
                accessToken, refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '8h',
                user: {
                    id:user.id, nama:user.nama_lengkap, email:user.email,
                    role:user.role, nisn:user.nisn, nip:user.nip,
                    foto:user.foto_profil, isVerified:!!user.is_verified
                },
                redirectTo: redirectMap[user.role] || '/'
            }
        });
    } catch (err) {
        console.error('[Login]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── LOGOUT ──────────────────────────────────────────── */
function logout(req, res) {
    const db = getDB();
    const { refreshToken } = req.body;
    if (refreshToken) db.prepare('DELETE FROM refresh_tokens WHERE token = :t').run({ t:refreshToken });
    if (req.query.allDevices === 'true' && req.user?.sub) {
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = :uid').run({ uid:req.user.sub });
    }
    log(req.user?.sub, 'USER_LOGOUT', 'users', req.user?.sub, null, req.ip);
    return res.status(200).json({ success:true, message:'Berhasil logout.' });
}

/* ── REFRESH TOKEN ───────────────────────────────────── */
function refreshToken(req, res) {
    const db  = getDB();
    const tok = req.body.refreshToken;
    if (!tok) return res.status(401).json({ success:false, message:'Refresh token tidak ditemukan.' });

    const { valid, decoded } = jwtCfg.verifyToken(tok);
    if (!valid) return res.status(401).json({ success:false, message:'Token tidak valid.' });

    const stored = db.prepare(`
        SELECT rt.*, u.is_active FROM refresh_tokens rt
        JOIN users u ON rt.user_id = u.id
        WHERE rt.token = :t AND rt.expires_at > :now
    `).get({ t:tok, now:nowISO() });

    if (!stored || !stored.is_active) {
        return res.status(401).json({ success:false, message:'Sesi tidak valid.' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = :id').get({ id:decoded.sub });
    if (!user) return res.status(401).json({ success:false, message:'User tidak ditemukan.' });

    const newToken = jwtCfg.generateAccessToken(jwtCfg.createPayload(user));
    return res.status(200).json({ success:true, data:{ accessToken:newToken } });
}

/* ── FORGOT PASSWORD ─────────────────────────────────── */
async function forgotPassword(req, res) {
    const db    = getDB();
    const email = req.body.email?.toLowerCase().trim();
    const msg   = 'Jika email terdaftar, link reset akan dikirimkan dalam beberapa menit.';

    try {
        const user = db.prepare('SELECT * FROM users WHERE email = :e AND is_active = 1').get({ e:email });
        if (!user) return res.status(200).json({ success:true, message:msg });

        // Invalidasi token lama
        db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE user_id = :uid AND used = 0').run({ uid:user.id });

        const token  = generateToken();
        const expiry = tokenExpiry(parseInt(process.env.RESET_TOKEN_EXPIRY) || 15);
        const now    = nowISO();

        db.prepare(`
            INSERT INTO password_reset_tokens (id,user_id,token,type,expires_at,used,created_at)
            VALUES (:id,:uid,:tok,'email',:exp,0,:now)
        `).run({ id:uuidv4(), uid:user.id, tok:token, exp:expiry, now });

        try {
            await mailer.sendPasswordResetEmail(email, user.nama_lengkap, token);
        } catch(e) { console.warn('[ForgotPw] Email gagal:', e.message); }

        log(user.id, 'PASSWORD_RESET_REQUEST', 'users', user.id, { method:'email' }, req.ip);
        return res.status(200).json({ success:true, message:msg });
    } catch (err) {
        console.error('[ForgotPw]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── RESET PASSWORD ──────────────────────────────────── */
async function resetPassword(req, res) {
    const db = getDB();
    const { token, password } = req.body;

    try {
        const record = db.prepare(`
            SELECT prt.*, u.id as uid FROM password_reset_tokens prt
            JOIN users u ON prt.user_id = u.id
            WHERE prt.token = :tok AND prt.used = 0 AND prt.expires_at > :now
        `).get({ tok:token, now:nowISO() });

        if (!record) {
            return res.status(400).json({ success:false, message:'Token tidak valid atau sudah kadaluarsa.' });
        }

        const newHash = await bcrypt.hash(password, 12);
        const now     = nowISO();

        db.prepare('UPDATE users SET password_hash=:h, login_attempts=0, locked_until=NULL, updated_at=:now WHERE id=:id')
          .run({ h:newHash, now, id:record.uid });
        db.prepare('UPDATE password_reset_tokens SET used=1 WHERE id=:id').run({ id:record.id });
        db.prepare('DELETE FROM refresh_tokens WHERE user_id=:uid').run({ uid:record.uid });

        log(record.uid, 'PASSWORD_RESET_SUCCESS', 'users', record.uid, null, req.ip);
        return res.status(200).json({ success:true, message:'Password berhasil direset! Silakan login dengan password baru.' });
    } catch (err) {
        console.error('[ResetPw]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── CHANGE PASSWORD ─────────────────────────────────── */
async function changePassword(req, res) {
    const db = getDB();
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.sub;

    try {
        const user = db.prepare('SELECT * FROM users WHERE id=:id').get({ id:userId });
        const match = await bcrypt.compare(currentPassword, user.password_hash || '');
        if (!match) return res.status(400).json({ success:false, message:'Password lama tidak benar.' });

        const newHash = await bcrypt.hash(newPassword, 12);
        db.prepare('UPDATE users SET password_hash=:h, updated_at=:now WHERE id=:id')
          .run({ h:newHash, now:nowISO(), id:userId });

        log(userId, 'PASSWORD_CHANGED', 'users', userId, null, req.ip);
        return res.status(200).json({ success:true, message:'Password berhasil diubah.' });
    } catch (err) {
        console.error('[ChangePw]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── VERIFY EMAIL ────────────────────────────────────── */
function verifyEmail(req, res) {
    const db  = getDB();
    const tok = req.query.token;
    if (!tok) return res.status(400).json({ success:false, message:'Token tidak ditemukan.' });

    const record = db.prepare(`
        SELECT evt.*, u.id as uid FROM email_verification_tokens evt
        JOIN users u ON evt.user_id = u.id
        WHERE evt.token = :tok AND evt.used = 0 AND evt.expires_at > :now
    `).get({ tok, now:nowISO() });

    if (!record) {
        return res.redirect('/admin-panel/login.html?error=invalid_token');
    }

    db.prepare('UPDATE users SET is_verified=1, updated_at=:now WHERE id=:id').run({ now:nowISO(), id:record.uid });
    db.prepare('UPDATE email_verification_tokens SET used=1 WHERE id=:id').run({ id:record.id });
    log(record.uid, 'EMAIL_VERIFIED', 'users', record.uid, null, req.ip);

    return res.redirect('/admin-panel/login.html?verified=true');
}

/* ── GET PROFILE ─────────────────────────────────────── */
function getProfile(req, res) {
    const db   = getDB();
    const user = db.prepare(`
        SELECT id,nama_lengkap,email,role,nisn,nip,no_hp,foto_profil,
               is_verified,last_login,created_at
        FROM users WHERE id=:id
    `).get({ id:req.user.sub });

    if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan.' });
    return res.status(200).json({ success:true, data:user });
}

/* ── CHECK AUTH ──────────────────────────────────────── */
function checkAuth(req, res) {
    return res.status(200).json({ success:true, authenticated:true, user:req.user });
}

/* ── GOOGLE OAUTH CALLBACK ───────────────────────────── */
async function googleCallback(req, res) {
    const db    = getDB();
    const gUser = req.user;

    try {
        const gEmail = gUser.emails?.[0]?.value;
        let user = db.prepare('SELECT * FROM users WHERE google_id=:gid').get({ gid:gUser.id });

        if (!user && gEmail) {
            user = db.prepare('SELECT * FROM users WHERE email=:e').get({ e:gEmail });
            if (user) {
                db.prepare('UPDATE users SET google_id=:gid WHERE id=:id').run({ gid:gUser.id, id:user.id });
            } else {
                const newId = uuidv4();
                const now   = nowISO();
                db.prepare(`
                    INSERT INTO users (id,nama_lengkap,email,google_id,role,is_active,is_verified,created_at,updated_at)
                    VALUES (:id,:nama,:email,:gid,'siswa',1,1,:now,:now)
                `).run({ id:newId, nama:gUser.displayName, email:gEmail, gid:gUser.id, now });
                user = db.prepare('SELECT * FROM users WHERE id=:id').get({ id:newId });
            }
        }

        if (!user || !user.is_active) return res.redirect('/admin-panel/login.html?error=account_disabled');

        const payload      = jwtCfg.createPayload(user);
        const accessToken  = jwtCfg.generateAccessToken(payload);
        const refreshToken = jwtCfg.generateRefreshToken(payload);
        const refreshExp   = new Date(Date.now() + 7 * 86400_000).toISOString();

        db.prepare(`
            INSERT INTO refresh_tokens (id,user_id,token,expires_at,created_at)
            VALUES (:id,:uid,:tok,:exp,:now)
        `).run({ id:uuidv4(), uid:user.id, tok:refreshToken, exp:refreshExp, now:nowISO() });

        log(user.id, 'GOOGLE_LOGIN', 'users', user.id, null, req.ip);

        return res.redirect(`/login.html?token=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}&role=${encodeURIComponent(user.role)}`);
    } catch (err) {
        console.error('[GoogleOAuth]', err);
        return res.redirect('/admin-panel/login.html?error=oauth_failed');
    }
}

module.exports = {
    register, login, logout, refreshToken,
    forgotPassword, resetPassword, changePassword,
    verifyEmail, getProfile, checkAuth, googleCallback
};
