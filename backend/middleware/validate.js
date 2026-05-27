// middleware/validate.js
// Validasi input menggunakan express-validator

'use strict';

const { body, param, validationResult } = require('express-validator');

// ── Tangkap error validasi dan kirim response ─────────────
function handleValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({
            success: false,
            message: 'Data tidak valid.',
            errors:  errors.array().map(e => ({ field: e.path, message: e.msg }))
        });
    }
    next();
}

// ── Rules validasi Register ───────────────────────────────
const registerRules = [
    body('nama_lengkap')
        .trim()
        .notEmpty().withMessage('Nama lengkap wajib diisi.')
        .isLength({ min: 3, max: 100 }).withMessage('Nama 3-100 karakter.'),

    body('email')
        .trim()
        .notEmpty().withMessage('Email wajib diisi.')
        .isEmail().withMessage('Format email tidak valid.')
        .normalizeEmail(),

    body('password')
        .notEmpty().withMessage('Password wajib diisi.')
        .isLength({ min: 8 }).withMessage('Password minimal 8 karakter.')
        .matches(/[A-Z]/).withMessage('Password harus mengandung huruf kapital.')
        .matches(/[a-z]/).withMessage('Password harus mengandung huruf kecil.')
        .matches(/[0-9]/).withMessage('Password harus mengandung angka.'),

    body('role')
        .optional()
        .isIn(['siswa', 'guru', 'tata_usaha', 'wali_murid', 'calon_siswa', 'kepala_sekolah', 'wakil_kepala_sekolah', 'super_admin'])
        .withMessage('Role tidak valid.'),

    body('nisn')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ min: 10, max: 10 }).withMessage('NISN harus 10 digit.')
        .isNumeric().withMessage('NISN hanya boleh berisi angka.'),

    body('nip')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ min: 18, max: 18 }).withMessage('NIP harus 18 digit.')
        .isNumeric().withMessage('NIP hanya boleh berisi angka.'),

    body('no_hp')
        .optional({ nullable: true, checkFalsy: true })
        .matches(/^(\+62|62|0)[0-9]{8,13}$/).withMessage('Format nomor HP tidak valid.'),

    body('bidang')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 100 }).withMessage('Bidang maksimal 100 karakter.'),

    body('jabatan_detail')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 100 }).withMessage('Jabatan detail maksimal 100 karakter.'),

    body('mata_pelajaran')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 100 }).withMessage('Mata pelajaran maksimal 100 karakter.'),

    body('kelas')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 50 }).withMessage('Kelas maksimal 50 karakter.'),

    body('jurusan')
        .optional({ nullable: true, checkFalsy: true })
        .isLength({ max: 100 }).withMessage('Jurusan maksimal 100 karakter.'),
];

// ── Rules validasi Login ──────────────────────────────────
const loginRules = [
    body('identifier')
        .trim()
        .notEmpty().withMessage('Email, NISN, atau NIP wajib diisi.'),

    body('password')
        .notEmpty().withMessage('Password wajib diisi.'),

    body('role')
        .notEmpty().withMessage('Role wajib dipilih.')
        .isIn(['siswa', 'guru', 'tata_usaha', 'kepala_sekolah', 'wakil_kepala_sekolah', 'super_admin', 'wali_murid', 'calon_siswa'])
        .withMessage('Role tidak valid.'),
];

// ── Rules lupa password ───────────────────────────────────
const forgotPasswordRules = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email wajib diisi.')
        .isEmail().withMessage('Format email tidak valid.')
        .normalizeEmail(),
];

// ── Rules reset password ──────────────────────────────────
const resetPasswordRules = [
    body('token')
        .notEmpty().withMessage('Token wajib diisi.'),

    body('password')
        .notEmpty().withMessage('Password baru wajib diisi.')
        .isLength({ min: 8 }).withMessage('Password minimal 8 karakter.')
        .matches(/[A-Z]/).withMessage('Password harus mengandung huruf kapital.')
        .matches(/[a-z]/).withMessage('Password harus mengandung huruf kecil.')
        .matches(/[0-9]/).withMessage('Password harus mengandung angka.'),

    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Konfirmasi password tidak cocok.');
            }
            return true;
        }),
];

// ── Rules ganti password (saat sudah login) ───────────────
const changePasswordRules = [
    body('currentPassword')
        .notEmpty().withMessage('Password lama wajib diisi.'),

    body('newPassword')
        .notEmpty().withMessage('Password baru wajib diisi.')
        .isLength({ min: 8 }).withMessage('Password minimal 8 karakter.')
        .matches(/[A-Z]/).withMessage('Password harus mengandung huruf kapital.')
        .matches(/[a-z]/).withMessage('Password harus mengandung huruf kecil.')
        .matches(/[0-9]/).withMessage('Password harus mengandung angka.'),
];

module.exports = {
    handleValidation,
    registerRules,
    loginRules,
    forgotPasswordRules,
    resetPasswordRules,
    changePasswordRules,
};
