// routes/auth.js
'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/authController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const {
    loginLimiter, registerLimiter, verificationLimiter,
    resendVerificationLimiter, passwordResetLimiter
} = require('../middleware/rateLimiter');
const {
    registerRules, verifyRegistrationRules, resendRegistrationRules,
    loginRules, forgotPasswordRules, resetPasswordRules,
    changePasswordRules, handleValidation
} = require('../middleware/validate');

// Register two-step: kirim OTP, lalu buat akun setelah OTP valid
router.post('/register',        registerLimiter,      registerRules,       handleValidation, ctrl.register);
router.post('/register/verify', verificationLimiter,  verifyRegistrationRules, handleValidation, ctrl.verifyRegistration);
router.post('/register/resend', resendVerificationLimiter, resendRegistrationRules, handleValidation, ctrl.resendRegistrationOTP);
router.get('/verification-methods', ctrl.getVerificationMethods);
// Login
router.post('/login',           loginLimiter,         loginRules,          handleValidation, ctrl.login);
// Logout
router.post('/logout',          optionalAuth,                                                ctrl.logout);
// Refresh token
router.post('/refresh',                                                                      ctrl.refreshToken);
// Forgot password
router.post('/forgot-password', passwordResetLimiter, forgotPasswordRules, handleValidation, ctrl.forgotPassword);
// Reset password
router.post('/reset-password',                        resetPasswordRules,  handleValidation, ctrl.resetPassword);
// Change password (logged in)
router.post('/change-password', authenticate,         changePasswordRules, handleValidation, ctrl.changePassword);
// Verify email
router.get('/verify-email',                                                                  ctrl.verifyEmail);
// Get profile
router.get('/me',               authenticate,                                                ctrl.getProfile);
router.put('/me',               authenticate,                                                ctrl.updateOwnProfile);
// Auth check
router.get('/check',            authenticate,                                                ctrl.checkAuth);
// Public class list for registration dropdown
router.get('/classes',                                                                       ctrl.getClasses);

// Google OAuth — hanya aktif jika credentials dikonfigurasi
const googleConfigured = Boolean(
    process.env.GOOGLE_CLIENT_ID &&
    process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here' &&
    process.env.GOOGLE_CLIENT_SECRET &&
    process.env.GOOGLE_CLIENT_SECRET !== 'your_google_client_secret_here'
);

router.get('/google/status', (_req, res) => {
    res.json({ success:true, configured:googleConfigured });
});

if (googleConfigured) {
    const passport = require('passport');
    router.get('/google', passport.authenticate('google', { scope:['profile','email'], session:false }));
    router.get('/google/callback',
        passport.authenticate('google', { failureRedirect:'/login.html?error=google_failed', session:false }),
        ctrl.googleCallback
    );
} else {
    router.get('/google', (_req, res) => res.redirect('/login.html?error=google_not_configured'));
    router.get('/google/callback', (_req, res) => res.redirect('/login.html?error=google_not_configured'));
}

module.exports = router;
