// config/mailer.js

'use strict';

const nodemailer = require('nodemailer');

// Buat transporter — gunakan Gmail atau SMTP lain
const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: { rejectUnauthorized: false }
});

const FROM = process.env.EMAIL_FROM || '"SMK Negeri 1 Terisi" <noreply@smkn1terisi.sch.id>';
const BASE = process.env.BASE_URL   || 'http://localhost:3001';

// ── Template email reset password ─────────────────────────
async function sendPasswordResetEmail(toEmail, namaUser, token) {
    const resetUrl = `${BASE}/reset-password?token=${token}`;

    await transporter.sendMail({
        from:    FROM,
        to:      toEmail,
        subject: '🔑 Reset Password — Portal SMK Negeri 1 Terisi',
        html: `
        <!DOCTYPE html>
        <html lang="id">
        <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
        <body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',sans-serif;">
            <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.10);">
                <div style="background:linear-gradient(135deg,#002244,#003366);padding:32px 36px;text-align:center;">
                    <h1 style="color:#D4AF37;font-size:1.6rem;margin:0;font-family:Georgia,serif;">SMK Negeri 1 Terisi</h1>
                    <p style="color:rgba(255,255,255,.6);font-size:.85rem;margin:8px 0 0;">Portal EduGate — Sistem Informasi Terpadu</p>
                </div>
                <div style="padding:36px;">
                    <h2 style="color:#002244;margin:0 0 16px;font-size:1.3rem;">Reset Password</h2>
                    <p style="color:#475569;line-height:1.7;">Halo <strong>${namaUser}</strong>,</p>
                    <p style="color:#475569;line-height:1.7;">Kami menerima permintaan reset password untuk akun Anda. Klik tombol di bawah untuk membuat password baru.</p>
                    <div style="text-align:center;margin:32px 0;">
                        <a href="${resetUrl}" style="display:inline-block;background:#D4AF37;color:#002244;padding:14px 36px;border-radius:8px;font-weight:700;text-decoration:none;font-size:1rem;">🔑 Reset Password Saya</a>
                    </div>
                    <p style="color:#94a3b8;font-size:.82rem;line-height:1.6;">Link ini hanya berlaku selama <strong>15 menit</strong>. Jika Anda tidak merasa meminta reset password, abaikan email ini.</p>
                    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
                    <p style="color:#94a3b8;font-size:.75rem;">Jika tombol tidak bisa diklik, salin link berikut ke browser:<br><span style="color:#3b82f6;word-break:break-all;">${resetUrl}</span></p>
                </div>
                <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e2e8f0;">
                    <p style="color:#94a3b8;font-size:.75rem;margin:0;">© 2026 SMK Negeri 1 Terisi Indramayu. Jl. Raya Terisi, Kec. Terisi.</p>
                </div>
            </div>
        </body>
        </html>
        `
    });
}

// ── Template email verifikasi akun baru ───────────────────
async function sendVerificationEmail(toEmail, namaUser, token) {
    const verifyUrl = `${BASE}/api/auth/verify-email?token=${token}`;

    await transporter.sendMail({
        from:    FROM,
        to:      toEmail,
        subject: '✅ Verifikasi Email — Portal SMK Negeri 1 Terisi',
        html: `
        <!DOCTYPE html>
        <html lang="id">
        <body style="margin:0;padding:0;background:#f0f4f8;font-family:'Segoe UI',sans-serif;">
            <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.10);">
                <div style="background:linear-gradient(135deg,#002244,#003366);padding:32px 36px;text-align:center;">
                    <h1 style="color:#D4AF37;font-size:1.6rem;margin:0;font-family:Georgia,serif;">SMK Negeri 1 Terisi</h1>
                    <p style="color:rgba(255,255,255,.6);font-size:.85rem;margin:8px 0 0;">Portal EduGate</p>
                </div>
                <div style="padding:36px;">
                    <h2 style="color:#002244;margin:0 0 16px;">Verifikasi Email Anda</h2>
                    <p style="color:#475569;line-height:1.7;">Halo <strong>${namaUser}</strong>, selamat datang!</p>
                    <p style="color:#475569;line-height:1.7;">Akun Anda telah berhasil dibuat. Klik tombol di bawah untuk mengaktifkan akun.</p>
                    <div style="text-align:center;margin:32px 0;">
                        <a href="${verifyUrl}" style="display:inline-block;background:#059669;color:#fff;padding:14px 36px;border-radius:8px;font-weight:700;text-decoration:none;font-size:1rem;">✅ Verifikasi Akun Saya</a>
                    </div>
                    <p style="color:#94a3b8;font-size:.82rem;">Link berlaku selama <strong>24 jam</strong>.</p>
                </div>
                <div style="background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e2e8f0;">
                    <p style="color:#94a3b8;font-size:.75rem;margin:0;">© 2026 SMK Negeri 1 Terisi Indramayu.</p>
                </div>
            </div>
        </body>
        </html>
        `
    });
}

// ── Template email OTP ─────────────────────────────────────
async function sendOTPEmail(toEmail, namaUser, otp) {
    await transporter.sendMail({
        from:    FROM,
        to:      toEmail,
        subject: `🔐 Kode OTP Anda: ${otp} — Portal SMK Negeri 1 Terisi`,
        html: `
        <div style="max-width:400px;margin:40px auto;background:#fff;border-radius:16px;padding:36px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.10);font-family:'Segoe UI',sans-serif;">
            <h2 style="color:#002244;">Kode OTP Anda</h2>
            <p style="color:#475569;">Halo <strong>${namaUser}</strong>, gunakan kode berikut untuk reset password:</p>
            <div style="background:#f0f4f8;border-radius:12px;padding:24px;margin:24px 0;">
                <span style="font-size:2.8rem;font-weight:900;letter-spacing:12px;color:#D4AF37;">${otp}</span>
            </div>
            <p style="color:#94a3b8;font-size:.82rem;">Berlaku <strong>15 menit</strong>. Jangan bagikan ke siapapun.</p>
        </div>
        `
    });
}

// Test koneksi email (panggil saat startup jika diperlukan)
async function verifyConnection() {
    try {
        await transporter.verify();
        console.log('✅ Email server terhubung');
        return true;
    } catch (err) {
        console.warn('⚠️  Email server tidak terhubung:', err.message);
        console.warn('    (Fitur email tidak akan berfungsi — pastikan konfigurasi .env benar)');
        return false;
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendOTPEmail,
    verifyConnection,
};
