// controllers/authController.js
'use strict';

const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const { v4: uuidv4 } = require('uuid');
const getDB   = require('../config/database');
const jwtCfg  = require('../config/jwt');
const mailer  = require('../config/mailer');
const sms     = require('../config/sms');
const { log } = require('../middleware/auditLog');
const { getSchoolClasses, findSchoolClass } = require('../utils/schoolClasses');
const { setAuthCookies, clearAuthCookies, getCookie, REFRESH_COOKIE } = require('../utils/sessionCookies');
const ENV = require('../config/env');

/* ── Helpers ─────────────────────────────────────────── */
const generateToken = () => crypto.randomBytes(32).toString('hex');
const generateOTP   = () => Math.floor(100000 + Math.random() * 900000).toString();
const tokenExpiry   = (mins = 15) => new Date(Date.now() + mins * 60_000).toISOString();
const nowISO        = () => new Date().toISOString();
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const OTP_MAX_ATTEMPTS = 5;
const STAFF_ROLES = ['super_admin','content_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha'];

function ensureStaffProfileSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS staff_profiles (
            user_id TEXT PRIMARY KEY,
            tempat_lahir TEXT,
            tanggal_lahir TEXT,
            jenis_kelamin TEXT,
            alamat TEXT,
            pendidikan TEXT,
            bio TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )
    `);
}

function cleanProfileText(value, max = 500) {
    return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function normalizedStaffName(value) {
    return String(value || '')
        .split(',')[0]
        .normalize('NFKD')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase();
}

function findOrganizationForUser(db, user) {
    let organization = db.prepare('SELECT * FROM organization_staff WHERE user_id = ?').get(user.id);
    if (organization) return organization;
    if (user.nip) {
        organization = db.prepare(`
            SELECT * FROM organization_staff
            WHERE REPLACE(REPLACE(REPLACE(COALESCE(nip,''),' ',''),'.',''),'-','') =
                  REPLACE(REPLACE(REPLACE(?,' ',''),'.',''),'-','')
            LIMIT 1
        `).get(user.nip);
    }
    if (!organization) {
        const targetName = normalizedStaffName(user.nama_lengkap);
        organization = db.prepare('SELECT * FROM organization_staff WHERE user_id IS NULL').all()
            .find(row => normalizedStaffName(row.nama) === targetName);
    }
    if (organization) {
        db.prepare('UPDATE organization_staff SET user_id = ? WHERE id = ?').run(user.id, organization.id);
    }
    return organization || null;
}

function hashOTP(challengeId, otp) {
    return crypto.createHmac('sha256', ENV.JWT_SECRET || 'development-only-otp-secret')
        .update(`${challengeId}:${otp}`)
        .digest('hex');
}

function safeEqualHex(left, right) {
    const a = Buffer.from(String(left || ''), 'hex');
    const b = Buffer.from(String(right || ''), 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function maskDestination(channel, destination) {
    if (channel === 'phone') {
        const phone = String(destination);
        return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
    }
    const [name, domain] = String(destination).split('@');
    return `${name.slice(0, 2)}***@${domain || ''}`;
}

async function sendRegistrationCode(channel, destination, name, otp) {
    if (channel === 'phone') return sms.sendOTP(destination, otp);
    if (!mailer.isConfigured()) throw new Error('Layanan email belum dikonfigurasi.');
    return mailer.sendOTPEmail(destination, name, otp);
}

function identifierField(role) {
    return role === 'siswa' ? 'nisn' : 'email';
}

function findLoginUser(db, identifier, role) {
    const normalized = String(identifier || '').trim();

    // Kompatibilitas untuk form lama yang masih mengirim role.
    if (role) {
        const field = identifierField(role);
        return {
            field,
            user: field === 'nisn'
                ? db.prepare('SELECT * FROM users WHERE nisn = :id AND role = :role').get({ id: normalized, role })
                : db.prepare('SELECT * FROM users WHERE email = :id AND role = :role').get({ id: normalized.toLowerCase(), role }),
        };
    }

    // Form terpadu: akun dicari dari identitas, role tetap berasal dari database.
    if (normalized.includes('@')) {
        return {
            field: 'email',
            user: db.prepare('SELECT * FROM users WHERE email = :id').get({ id: normalized.toLowerCase() }),
        };
    }

    const matches = db.prepare(`
        SELECT * FROM users
        WHERE nisn = :id OR nip = :id
        LIMIT 2
    `).all({ id: normalized });

    return {
        field: 'identifier',
        user: matches.length === 1 ? matches[0] : null,
    };
}

function getStudentProfile(db, nisn) {
    if (!nisn) return null;
    return db.prepare('SELECT kelas, jurusan FROM siswa_profil WHERE nisn = ?').get(nisn) || null;
}

function publicUserPayload(db, user) {
    const studentProfile = getStudentProfile(db, user.nisn);
    return {
        id: user.id,
        nama: user.nama_lengkap,
        email: user.email,
        role: user.role,
        nisn: user.nisn,
        nip: user.nip,
        no_hp: user.no_hp || null,
        kelas: studentProfile?.kelas || null,
        jurusan: studentProfile?.jurusan || null,
        bidang: user.bidang || null,
        foto: user.foto_profil || null,
        isVerified: !!user.is_verified
    };
}

function exposeTokens() {
    return process.env.AUTH_RESPONSE_TOKENS === 'true' || process.env.NODE_ENV !== 'production';
}

function sessionResponseData({ accessToken, refreshToken, expiresIn, user, redirectTo }) {
    return {
        ...(exposeTokens() ? { accessToken, refreshToken } : {}),
        sessionMode: 'httpOnlyCookie',
        expiresIn,
        user,
        redirectTo,
    };
}

/* ── REGISTER ────────────────────────────────────────── */
async function register(req, res) {
    const db = getDB();
    const {
        nama_lengkap, email, password,
        role = 'siswa', nisn, nip, no_hp,
        bidang, jabatan_detail, mata_pelajaran,
        kelas, verification_method = 'email'
    } = req.body;

    try {
        const selfRegisterRoles = ['siswa', 'wali_murid', 'calon_siswa'];
        if (!selfRegisterRoles.includes(role)) {
            return res.status(403).json({
                success: false,
                message: 'Pendaftaran mandiri hanya tersedia untuk siswa, calon siswa, dan wali murid.'
            });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const normalizedPhone = no_hp ? sms.normalizePhone(no_hp) : null;
        if (verification_method === 'phone' && !normalizedPhone) {
            return res.status(422).json({ success: false, message: 'Nomor telepon wajib diisi untuk verifikasi telepon.' });
        }
        if (verification_method === 'phone' && !sms.isConfigured()) {
            return res.status(503).json({ success: false, message: 'Verifikasi nomor telepon belum tersedia. Gunakan verifikasi email.' });
        }
        if (verification_method === 'email' && !mailer.isConfigured()) {
            return res.status(503).json({ success: false, message: 'Layanan email belum dikonfigurasi. Hubungi administrator.' });
        }

        const ex = db.prepare('SELECT id FROM users WHERE email = :e').get({ e: normalizedEmail });
        if (ex) return res.status(409).json({ success: false, message: 'Email sudah terdaftar.' });
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

        const password_hash = await bcrypt.hash(password, 12);
        const challengeId = uuidv4();
        const otp = generateOTP();
        const now = nowISO();
        const bidangFinal = bidang || jabatan_detail || mata_pelajaran || null;
        const destination = verification_method === 'phone' ? normalizedPhone : normalizedEmail;
        const payload = {
            nama_lengkap: nama_lengkap.trim(),
            email: normalizedEmail,
            password_hash,
            role,
            nisn: nisn || null,
            nip: nip || null,
            no_hp: normalizedPhone,
            bidang: bidangFinal,
            jabatan_detail: jabatan_detail || null,
            kelas: classInfo?.kelas || null,
            jurusan: classInfo?.jurusan || null,
        };

        db.prepare(`
            UPDATE registration_verifications
            SET consumed = 1, updated_at = :now
            WHERE destination = :destination AND consumed = 0
        `).run({ destination, now });
        db.prepare(`
            INSERT INTO registration_verifications
            (id,email,phone,channel,destination,code_hash,payload_json,expires_at,resend_available_at,
             attempts,max_attempts,send_count,consumed,ip_address,created_at,updated_at)
            VALUES (:id,:email,:phone,:channel,:destination,:codeHash,:payload,:expiresAt,:resendAt,
                    0,:maxAttempts,1,0,:ip,:now,:now)
        `).run({
            id: challengeId,
            email: normalizedEmail,
            phone: normalizedPhone,
            channel: verification_method,
            destination,
            codeHash: hashOTP(challengeId, otp),
            payload: JSON.stringify(payload),
            expiresAt: tokenExpiry(OTP_EXPIRY_MINUTES),
            resendAt: new Date(Date.now() + OTP_RESEND_SECONDS * 1000).toISOString(),
            maxAttempts: OTP_MAX_ATTEMPTS,
            ip: req.ip,
            now,
        });

        try {
            await sendRegistrationCode(verification_method, destination, nama_lengkap, otp);
        } catch (sendError) {
            db.prepare('DELETE FROM registration_verifications WHERE id = :id').run({ id: challengeId });
            console.warn('[Register OTP]', sendError.message);
            return res.status(503).json({
                success: false,
                message: 'Kode verifikasi gagal dikirim. Periksa konfigurasi layanan atau coba lagi nanti.'
            });
        }

        log(null, 'REGISTRATION_OTP_SENT', 'registration_verifications', challengeId, {
            role, channel: verification_method
        }, req.ip);
        db.prepare(`
            DELETE FROM registration_verifications
            WHERE (consumed = 1 OR expires_at < :old) AND created_at < :old
        `).run({ old: new Date(Date.now() - 24 * 60 * 60_000).toISOString() });

        return res.status(202).json({
            success: true,
            message: `Kode verifikasi telah dikirim ke ${maskDestination(verification_method, destination)}.`,
            data: {
                challengeId,
                channel: verification_method,
                destination: maskDestination(verification_method, destination),
                expiresIn: OTP_EXPIRY_MINUTES * 60,
                resendAfter: OTP_RESEND_SECONDS,
            }
        });
    } catch (err) {
        console.error('[Register]', err);
        return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
}

async function verifyRegistration(req, res) {
    const db = getDB();
    const { challengeId, code } = req.body;
    const now = nowISO();

    try {
        const challenge = db.prepare(`
            SELECT * FROM registration_verifications
            WHERE id = :id AND consumed = 0
        `).get({ id: challengeId });
        if (!challenge) {
            return res.status(400).json({ success: false, message: 'Sesi verifikasi tidak valid atau sudah digunakan.' });
        }
        if (challenge.expires_at <= now) {
            return res.status(410).json({ success: false, message: 'Kode telah kedaluwarsa. Kirim ulang kode untuk melanjutkan.' });
        }
        if (challenge.attempts >= challenge.max_attempts) {
            return res.status(429).json({ success: false, message: 'Batas percobaan OTP tercapai. Mulai ulang pendaftaran.' });
        }

        const valid = safeEqualHex(challenge.code_hash, hashOTP(challengeId, code));
        if (!valid) {
            const attempts = challenge.attempts + 1;
            db.prepare(`
                UPDATE registration_verifications
                SET attempts = :attempts, consumed = CASE WHEN :attempts >= max_attempts THEN 1 ELSE consumed END,
                    updated_at = :now
                WHERE id = :id
            `).run({ attempts, now, id: challengeId });
            const remaining = Math.max(0, challenge.max_attempts - attempts);
            return res.status(400).json({
                success: false,
                message: remaining
                    ? `Kode OTP salah. Sisa percobaan: ${remaining}.`
                    : 'Kode OTP salah dan batas percobaan tercapai. Mulai ulang pendaftaran.'
            });
        }

        const payload = JSON.parse(challenge.payload_json);
        const userId = uuidv4();
        const createAccount = db.transaction(() => {
            const emailExists = db.prepare('SELECT id FROM users WHERE email = :email').get({ email: payload.email });
            if (emailExists) throw Object.assign(new Error('Email sudah terdaftar.'), { code: 'DUPLICATE_ACCOUNT' });
            if (payload.nisn) {
                const nisnExists = db.prepare('SELECT id FROM users WHERE nisn = :nisn').get({ nisn: payload.nisn });
                if (nisnExists) throw Object.assign(new Error('NISN sudah terdaftar.'), { code: 'DUPLICATE_ACCOUNT' });
            }

            db.prepare(`
                INSERT INTO users
                (id,nama_lengkap,email,password_hash,role,nisn,nip,no_hp,bidang,jabatan_detail,
                 is_active,is_verified,created_at,updated_at)
                VALUES (:id,:nama,:email,:hash,:role,:nisn,:nip,:phone,:bidang,:jabatan,1,1,:now,:now)
            `).run({
                id: userId,
                nama: payload.nama_lengkap,
                email: payload.email,
                hash: payload.password_hash,
                role: payload.role,
                nisn: payload.nisn,
                nip: payload.nip,
                phone: payload.no_hp,
                bidang: payload.bidang,
                jabatan: payload.jabatan_detail,
                now,
            });

            if (payload.role === 'siswa' && payload.nisn) {
                db.prepare(`
                    INSERT INTO siswa_profil (id,user_id,nisn,kelas,jurusan,updated_at)
                    VALUES (:id,:uid,:nisn,:kelas,:jurusan,:now)
                `).run({
                    id: uuidv4(),
                    uid: userId,
                    nisn: payload.nisn,
                    kelas: payload.kelas,
                    jurusan: payload.jurusan,
                    now,
                });
            }
            db.prepare(`
                UPDATE registration_verifications SET consumed = 1, updated_at = :now WHERE id = :id
            `).run({ now, id: challengeId });
        });
        createAccount();

        log(userId, 'USER_REGISTER_VERIFIED', 'users', userId, {
            role: payload.role, channel: challenge.channel
        }, req.ip);
        return res.status(201).json({
            success: true,
            message: 'Verifikasi berhasil. Akun sudah dibuat dan siap digunakan.',
            data: { id: userId, role: payload.role, email: payload.email }
        });
    } catch (err) {
        if (err.code === 'DUPLICATE_ACCOUNT' || String(err.code || '').startsWith('SQLITE_CONSTRAINT')) {
            db.prepare('UPDATE registration_verifications SET consumed = 1, updated_at = :now WHERE id = :id')
                .run({ now, id: challengeId });
            return res.status(409).json({ success: false, message: err.message || 'Akun sudah terdaftar.' });
        }
        console.error('[VerifyRegistration]', err);
        return res.status(500).json({ success: false, message: 'Verifikasi gagal diproses.' });
    }
}

async function resendRegistrationOTP(req, res) {
    const db = getDB();
    const { challengeId } = req.body;
    const now = nowISO();

    try {
        const challenge = db.prepare(`
            SELECT * FROM registration_verifications WHERE id = :id AND consumed = 0
        `).get({ id: challengeId });
        if (!challenge) {
            return res.status(400).json({ success: false, message: 'Sesi verifikasi tidak valid.' });
        }
        if (challenge.resend_available_at > now) {
            const wait = Math.ceil((new Date(challenge.resend_available_at) - Date.now()) / 1000);
            return res.status(429).json({ success: false, message: `Tunggu ${wait} detik sebelum mengirim ulang kode.` });
        }
        if (challenge.send_count >= 5) {
            return res.status(429).json({ success: false, message: 'Batas kirim ulang kode tercapai. Mulai ulang pendaftaran nanti.' });
        }

        const otp = generateOTP();
        const payload = JSON.parse(challenge.payload_json);
        const expiresAt = tokenExpiry(OTP_EXPIRY_MINUTES);
        const resendAt = new Date(Date.now() + OTP_RESEND_SECONDS * 1000).toISOString();
        db.prepare(`
            UPDATE registration_verifications
            SET code_hash = :hash, expires_at = :expiresAt, resend_available_at = :resendAt,
                attempts = 0, send_count = send_count + 1, updated_at = :now
            WHERE id = :id
        `).run({ hash: hashOTP(challengeId, otp), expiresAt, resendAt, now, id: challengeId });

        try {
            await sendRegistrationCode(challenge.channel, challenge.destination, payload.nama_lengkap, otp);
        } catch (sendError) {
            db.prepare('UPDATE registration_verifications SET consumed = 1, updated_at = :now WHERE id = :id')
                .run({ now: nowISO(), id: challengeId });
            console.warn('[Resend OTP]', sendError.message);
            return res.status(503).json({ success: false, message: 'Kode gagal dikirim. Mulai ulang pendaftaran.' });
        }

        return res.json({
            success: true,
            message: `Kode baru dikirim ke ${maskDestination(challenge.channel, challenge.destination)}.`,
            data: { expiresIn: OTP_EXPIRY_MINUTES * 60, resendAfter: OTP_RESEND_SECONDS }
        });
    } catch (err) {
        console.error('[ResendRegistrationOTP]', err);
        return res.status(500).json({ success: false, message: 'Gagal mengirim ulang kode.' });
    }
}

function getVerificationMethods(_req, res) {
    return res.json({
        success: true,
        data: {
            email: mailer.isConfigured(),
            phone: sms.isConfigured(),
        }
    });
}

/* ── LOGIN ───────────────────────────────────────────── */
async function login(req, res) {
    const db = getDB();
    const { identifier, password, role, portal, rememberMe = false } = req.body;

    try {
        const { field, user } = findLoginUser(db, identifier, role);

        if (!user) {
            const label = field === 'nisn' ? 'NISN' : field === 'email' ? 'Email' : 'Email, NISN, atau NIP';
            return res.status(401).json({ success:false, message:`${label} atau password salah.` });
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            return res.status(423).json({ success:false, message:`Akun terkunci ${mins} menit lagi.` });
        }

        if (!user.is_active) {
            const isStaff = ['guru', 'tata_usaha'].includes(user.role);
            return res.status(403).json({
                success: false,
                message: isStaff
                    ? 'Akun staf Anda sedang menunggu persetujuan administrator.'
                    : 'Akun dinonaktifkan. Hubungi administrator.'
            });
        }

        const match = await bcrypt.compare(password, user.password_hash || '');
        if (!match) {
            const attempts    = (user.login_attempts || 0) + 1;
            const maxAttempts = parseInt(process.env.LOGIN_MAX_ATTEMPTS) || 5;
            const lockMins    = parseInt(process.env.LOGIN_WINDOW_MINUTES) || 15;

            if (attempts >= maxAttempts) {
                const lockedUntil = new Date(Date.now() + lockMins * 60000).toISOString();
                db.prepare('UPDATE users SET login_attempts=:a, locked_until=:l, updated_at=:now WHERE id=:id')
                  .run({ a:attempts, l:lockedUntil, now:nowISO(), id:user.id });
                log(user.id, 'ACCOUNT_LOCKED', 'users', user.id, { attempts }, req.ip);
                return res.status(423).json({ success:false, message:`Akun terkunci ${lockMins} menit.` });
            }

            db.prepare('UPDATE users SET login_attempts=:a, updated_at=:now WHERE id=:id')
              .run({ a:attempts, now:nowISO(), id:user.id });
            return res.status(401).json({ success:false, message:`Password salah. Sisa percobaan: ${maxAttempts - attempts}.` });
        }

        const staffRoles = ['guru', 'tata_usaha', 'kepala_sekolah', 'wakil_kepala_sekolah', 'super_admin', 'content_admin'];
        if (portal === 'staff' && !staffRoles.includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Akun ini bukan akun staf. Silakan masuk melalui portal siswa.'
            });
        }

        if (!user.is_verified) {
            return res.status(403).json({
                success: false,
                message: 'Akun belum diverifikasi. Selesaikan verifikasi pendaftaran terlebih dahulu.'
            });
        }

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
        setAuthCookies(req, res, { accessToken, refreshToken, refreshDays });

        log(user.id, 'USER_LOGIN', 'users', user.id, { role:user.role }, req.ip);

        const redirectMap = {
            super_admin:'/admin-panel/dashboard.html', content_admin:'/admin-panel/dashboard.html',
            kepala_sekolah:'/admin-panel/dashboard.html',
            wakil_kepala_sekolah:'/admin-panel/dashboard.html',
            guru:'/admin-panel/dashboard.html',        tata_usaha:'/admin-panel/dashboard.html',
            siswa:'/LMS.html',                         wali_murid:'/LMS.html',
            calon_siswa:'/ppdb.html',
        };

        return res.status(200).json({
            success: true,
            message: `Selamat datang, ${user.nama_lengkap}!`,
            data: sessionResponseData({
                accessToken,
                refreshToken,
                expiresIn: process.env.JWT_EXPIRES_IN || '8h',
                user: publicUserPayload(db, user),
                redirectTo: redirectMap[user.role] || '/'
            })
        });
    } catch (err) {
        console.error('[Login]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
}

/* ── LOGOUT ──────────────────────────────────────────── */
function logout(req, res) {
    const db = getDB();
    const refreshToken = req.body.refreshToken || getCookie(req, REFRESH_COOKIE);
    if (refreshToken) db.prepare('DELETE FROM refresh_tokens WHERE token = :t').run({ t:refreshToken });
    if (req.query.allDevices === 'true' && req.user?.sub) {
        db.prepare('DELETE FROM refresh_tokens WHERE user_id = :uid').run({ uid:req.user.sub });
    }
    clearAuthCookies(req, res);
    log(req.user?.sub, 'USER_LOGOUT', 'users', req.user?.sub, null, req.ip);
    return res.status(200).json({ success:true, message:'Berhasil logout.' });
}

/* ── REFRESH TOKEN ───────────────────────────────────── */
function refreshToken(req, res) {
    const db  = getDB();
    const tok = req.body.refreshToken || getCookie(req, REFRESH_COOKIE);
    if (!tok) return res.status(401).json({ success:false, message:'Refresh token tidak ditemukan.' });

    const { valid, decoded } = jwtCfg.verifyToken(tok, true);
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
    setAuthCookies(req, res, { accessToken: newToken });
    return res.status(200).json({ success:true, data:{ ...(exposeTokens() ? { accessToken:newToken } : {}), sessionMode:'httpOnlyCookie' } });
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
        SELECT evt.*, u.id as uid, u.role FROM email_verification_tokens evt
        JOIN users u ON evt.user_id = u.id
        WHERE evt.token = :tok AND evt.used = 0 AND evt.expires_at > :now
    `).get({ tok, now:nowISO() });

    if (!record) {
        return res.redirect('/login.html?error=invalid_token');
    }

    db.prepare('UPDATE users SET is_verified=1, updated_at=:now WHERE id=:id').run({ now:nowISO(), id:record.uid });
    db.prepare('UPDATE email_verification_tokens SET used=1 WHERE id=:id').run({ id:record.id });
    log(record.uid, 'EMAIL_VERIFIED', 'users', record.uid, null, req.ip);

    const isStaff = ['guru', 'tata_usaha'].includes(record.role);
    if (isStaff) {
        return res.redirect('/login.html?verified=true&msg=Email+terverifikasi.+Tunggu+aktivasi+admin+untuk+login.');
    }
    return res.redirect('/login.html?verified=true');
}

/* ── GET PROFILE ─────────────────────────────────────── */
function getProfile(req, res) {
    const db   = getDB();
    ensureStaffProfileSchema(db);
    const user = db.prepare(`
        SELECT id,nama_lengkap,email,role,nisn,nip,no_hp,foto_profil,bidang,jabatan_detail,
               is_verified,last_login,created_at
        FROM users WHERE id=:id
    `).get({ id:req.user.sub });

    if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan.' });
    const staffProfile = STAFF_ROLES.includes(user.role)
        ? db.prepare('SELECT tempat_lahir,tanggal_lahir,jenis_kelamin,alamat,pendidikan,bio,updated_at FROM staff_profiles WHERE user_id = ?').get(user.id)
        : null;
    const organization = STAFF_ROLES.includes(user.role) ? findOrganizationForUser(db, user) : null;
    return res.status(200).json({ success:true, data:{ ...user, ...getStudentProfile(db, user.nisn), ...(staffProfile || {}), organization:organization || null } });
}

function updateOwnProfile(req, res) {
    const db = getDB();
    ensureStaffProfileSchema(db);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.sub);
    if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan.' });
    if (!STAFF_ROLES.includes(user.role)) {
        return res.status(403).json({ success:false, message:'Profil staff hanya tersedia untuk akun staff sekolah.' });
    }

    const nama = cleanProfileText(req.body.nama_lengkap ?? user.nama_lengkap, 160);
    const noHp = cleanProfileText(req.body.no_hp ?? user.no_hp, 24);
    const bidang = cleanProfileText(req.body.bidang ?? user.bidang, 140);
    const jabatan = cleanProfileText(req.body.jabatan_detail ?? user.jabatan_detail, 140);
    const tempatLahir = cleanProfileText(req.body.tempat_lahir, 120);
    const tanggalLahir = cleanProfileText(req.body.tanggal_lahir, 10);
    const jenisKelamin = cleanProfileText(req.body.jenis_kelamin, 20);
    const alamat = cleanProfileText(req.body.alamat, 600);
    const pendidikan = cleanProfileText(req.body.pendidikan, 140);
    const bio = cleanProfileText(req.body.bio, 1600);

    if (!nama) return res.status(400).json({ success:false, message:'Nama lengkap wajib diisi.' });
    if (noHp && !/^[0-9+\-\s]{8,24}$/.test(noHp)) {
        return res.status(400).json({ success:false, message:'Format nomor HP tidak valid.' });
    }
    if (tanggalLahir && !/^\d{4}-\d{2}-\d{2}$/.test(tanggalLahir)) {
        return res.status(400).json({ success:false, message:'Format tanggal lahir tidak valid.' });
    }
    if (jenisKelamin && !['Laki-laki','Perempuan'].includes(jenisKelamin)) {
        return res.status(400).json({ success:false, message:'Jenis kelamin tidak valid.' });
    }

    const now = nowISO();
    const tx = db.transaction(() => {
        db.prepare(`
            UPDATE users SET nama_lengkap=?,no_hp=?,bidang=?,jabatan_detail=?,updated_at=? WHERE id=?
        `).run(nama, noHp || null, bidang || null, jabatan || null, now, user.id);
        db.prepare(`
            INSERT INTO staff_profiles (user_id,tempat_lahir,tanggal_lahir,jenis_kelamin,alamat,pendidikan,bio,updated_at)
            VALUES (?,?,?,?,?,?,?,?)
            ON CONFLICT(user_id) DO UPDATE SET
                tempat_lahir=excluded.tempat_lahir,tanggal_lahir=excluded.tanggal_lahir,
                jenis_kelamin=excluded.jenis_kelamin,alamat=excluded.alamat,
                pendidikan=excluded.pendidikan,bio=excluded.bio,updated_at=excluded.updated_at
        `).run(user.id, tempatLahir || null, tanggalLahir || null, jenisKelamin || null, alamat || null, pendidikan || null, bio || null, now);

        const organization = findOrganizationForUser(db, user);
        if (organization) {
            db.prepare(`
                UPDATE organization_staff
                SET nama=?,jabatan=COALESCE(NULLIF(?,''),jabatan),mapel=COALESCE(NULLIF(?,''),mapel),
                    nip=COALESCE(NULLIF(?,''),nip),pendidikan=COALESCE(NULLIF(?,''),pendidikan),
                    foto=COALESCE(NULLIF(?,''),foto),updated_at=?
                WHERE id=?
            `).run(nama, jabatan, bidang, user.nip || '', pendidikan, user.foto_profil || '', now, organization.id);
        }
    });
    tx();
    log(user.id, 'STAFF_PROFILE_UPDATED', 'users', user.id, { syncedOrganization:true }, req.ip);
    return getProfile(req, res);
}

async function activateStaffAccount(req, res) {
    const db = getDB();
    const { id } = req.params;

    try {
        const user = db.prepare('SELECT id,role,email,nama_lengkap FROM users WHERE id=:id').get({ id });
        if (!user) return res.status(404).json({ success:false, message:'User tidak ditemukan.' });

        db.prepare('UPDATE users SET is_active=1, updated_at=:now WHERE id=:id').run({ now:nowISO(), id });

        if (user.email) {
            try {
                await mailer.sendStaffActivatedEmail(user.email, user.nama_lengkap);
            } catch (e) {
                console.warn('[ActivateStaff] Email gagal:', e.message);
            }
        }

        log(req.user.sub, 'STAFF_ACCOUNT_ACTIVATED', 'users', id, { role:user.role }, req.ip);
        return res.status(200).json({ success:true, message:'Akun staff berhasil diaktifkan.' });
    } catch (err) {
        console.error('[ActivateStaff]', err);
        return res.status(500).json({ success:false, message:'Terjadi kesalahan server.' });
    }
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
                if (!ENV.GOOGLE_AUTO_PROVISION) {
                    return res.redirect('/login.html?error=google_account_not_registered');
                }
                const newId = uuidv4();
                const now   = nowISO();
                db.prepare(`
                    INSERT INTO users (id,nama_lengkap,email,google_id,role,is_active,is_verified,created_at,updated_at)
                    VALUES (:id,:nama,:email,:gid,'siswa',1,1,:now,:now)
                `).run({ id:newId, nama:gUser.displayName, email:gEmail, gid:gUser.id, now });
                user = db.prepare('SELECT * FROM users WHERE id=:id').get({ id:newId });
            }
        }

        if (!user || !user.is_active) return res.redirect('/login.html?error=account_disabled');

        const payload      = jwtCfg.createPayload(user);
        const accessToken  = jwtCfg.generateAccessToken(payload);
        const refreshToken = jwtCfg.generateRefreshToken(payload);
        const refreshExp   = new Date(Date.now() + 7 * 86400_000).toISOString();

        db.prepare(`
            INSERT INTO refresh_tokens (id,user_id,token,expires_at,created_at)
            VALUES (:id,:uid,:tok,:exp,:now)
        `).run({ id:uuidv4(), uid:user.id, tok:refreshToken, exp:refreshExp, now:nowISO() });
        setAuthCookies(req, res, { accessToken, refreshToken, refreshDays: 7 });

        log(user.id, 'GOOGLE_LOGIN', 'users', user.id, null, req.ip);

        return res.redirect(`/login.html?oauth=success&role=${encodeURIComponent(user.role)}`);
    } catch (err) {
        console.error('[GoogleOAuth]', err);
        return res.redirect('/login.html?error=oauth_failed');
    }
}

function getClasses(_req, res) {
    return res.json({ success: true, data: getSchoolClasses() });
}

module.exports = {
    register, login, logout, refreshToken,
    verifyRegistration, resendRegistrationOTP, getVerificationMethods,
    forgotPassword, resetPassword, changePassword,
    verifyEmail, getProfile, updateOwnProfile, checkAuth, googleCallback,
    activateStaffAccount,
    getClasses
};
