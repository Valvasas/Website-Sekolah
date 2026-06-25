// config/mailer.js

'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    tls: {
        rejectUnauthorized: process.env.EMAIL_TLS_REJECT_UNAUTHORIZED === 'false'
            ? false
            : true,
    },
});

const FROM = process.env.EMAIL_FROM || '"SMK Negeri 1 Terisi" <noreply@smkn1terisi.sch.id>';
const BASE = process.env.BASE_URL || 'http://localhost:3001';

function isConfigured() {
    return Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[char]);
}

async function sendPasswordResetEmail(toEmail, namaUser, token) {
    const resetUrl = `${BASE}/reset-password?token=${token}`;

    await transporter.sendMail({
        from: FROM,
        to: toEmail,
        subject: 'Reset Password - Portal SMK Negeri 1 Terisi',
        html: `
        <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.10);font-family:Segoe UI,sans-serif;">
            <div style="background:#002244;padding:30px;text-align:center;">
                <h1 style="color:#D4AF37;margin:0;font-family:Georgia,serif;">SMK Negeri 1 Terisi</h1>
                <p style="color:rgba(255,255,255,.7);margin:8px 0 0;">Portal EduGate</p>
            </div>
            <div style="padding:34px;">
                <h2 style="color:#002244;margin-top:0;">Reset Password</h2>
                <p style="color:#475569;line-height:1.7;">Halo <strong>${namaUser}</strong>, klik tombol berikut untuk membuat password baru.</p>
                <p style="text-align:center;margin:30px 0;">
                    <a href="${resetUrl}" style="background:#D4AF37;color:#002244;padding:14px 30px;border-radius:8px;font-weight:700;text-decoration:none;">Reset Password Saya</a>
                </p>
                <p style="color:#94a3b8;font-size:.82rem;line-height:1.6;">Link berlaku 15 menit. Jika tombol tidak bisa diklik, buka link ini:<br>${resetUrl}</p>
            </div>
        </div>`,
    });
}

async function sendVerificationEmail(toEmail, namaUser, token) {
    const verifyUrl = `${BASE}/api/auth/verify-email?token=${token}`;

    await transporter.sendMail({
        from: FROM,
        to: toEmail,
        subject: 'Verifikasi Email - Portal SMK Negeri 1 Terisi',
        html: `
        <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.10);font-family:Segoe UI,sans-serif;">
            <div style="background:#002244;padding:30px;text-align:center;">
                <h1 style="color:#D4AF37;margin:0;font-family:Georgia,serif;">SMK Negeri 1 Terisi</h1>
                <p style="color:rgba(255,255,255,.7);margin:8px 0 0;">Portal EduGate</p>
            </div>
            <div style="padding:34px;">
                <h2 style="color:#002244;margin-top:0;">Verifikasi Email Anda</h2>
                <p style="color:#475569;line-height:1.7;">Halo <strong>${namaUser}</strong>, akun Anda berhasil dibuat. Klik tombol berikut untuk mengaktifkan akun.</p>
                <p style="text-align:center;margin:30px 0;">
                    <a href="${verifyUrl}" style="background:#059669;color:#fff;padding:14px 30px;border-radius:8px;font-weight:700;text-decoration:none;">Verifikasi Akun Saya</a>
                </p>
                <p style="color:#94a3b8;font-size:.82rem;">Link berlaku selama 24 jam.</p>
            </div>
        </div>`,
    });
}

async function sendOTPEmail(toEmail, namaUser, otp) {
    const safeName = escapeHtml(namaUser);
    const safeOtp = escapeHtml(otp);
    await transporter.sendMail({
        from: FROM,
        to: toEmail,
        subject: `Kode OTP Anda: ${otp} - Portal SMK Negeri 1 Terisi`,
        html: `
        <div style="max-width:420px;margin:40px auto;background:#fff;border-radius:16px;padding:34px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.10);font-family:Segoe UI,sans-serif;">
            <h2 style="color:#002244;">Kode OTP Anda</h2>
            <p style="color:#475569;">Halo <strong>${safeName}</strong>, gunakan kode berikut untuk menyelesaikan pendaftaran:</p>
            <div style="background:#f0f4f8;border-radius:12px;padding:22px;margin:24px 0;">
                <span style="font-size:2.5rem;font-weight:900;letter-spacing:10px;color:#D4AF37;">${safeOtp}</span>
            </div>
            <p style="color:#94a3b8;font-size:.82rem;line-height:1.6;">Kode berlaku 10 menit dan hanya dapat digunakan sekali. Abaikan email ini jika Anda tidak melakukan pendaftaran.</p>
        </div>`,
    });
}

async function sendStaffActivatedEmail(toEmail, namaUser) {
    await transporter.sendMail({
        from: FROM,
        to: toEmail,
        subject: 'Akun Anda Telah Diaktifkan - Portal SMK Negeri 1 Terisi',
        html: `
        <div style="max-width:560px;margin:40px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.10);font-family:Segoe UI,sans-serif;">
            <div style="background:#002244;padding:30px;text-align:center;">
                <h1 style="color:#D4AF37;margin:0;font-family:Georgia,serif;">SMK Negeri 1 Terisi</h1>
                <p style="color:rgba(255,255,255,.7);margin:8px 0 0;">Portal EduGate</p>
            </div>
            <div style="padding:34px;">
                <h2 style="color:#002244;margin-top:0;">Akun Anda Diaktifkan ✓</h2>
                <p style="color:#475569;line-height:1.7;">Halo <strong>${namaUser}</strong>,</p>
                <p style="color:#475569;line-height:1.7;">Akun Anda telah disetujui oleh administrator. Anda sekarang dapat masuk ke portal menggunakan email dan password Anda.</p>
                <p style="text-align:center;margin:30px 0;">
                    <a href="${BASE}/login.html" style="background:#059669;color:#fff;padding:14px 30px;border-radius:8px;font-weight:700;text-decoration:none;">Buka Portal</a>
                </p>
                <p style="color:#94a3b8;font-size:.82rem;line-height:1.6;">Jika tombol tidak bisa diklik, buka link ini: ${BASE}/login.html</p>
            </div>
        </div>`,
    });
}

async function verifyConnection() {
    try {
        await transporter.verify();
        console.log('Email server terhubung.');
        return true;
    } catch (err) {
        console.warn('Email server tidak terhubung:', err.message);
        return false;
    }
}

module.exports = {
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendOTPEmail,
    sendStaffActivatedEmail,
    verifyConnection,
    isConfigured,
};
