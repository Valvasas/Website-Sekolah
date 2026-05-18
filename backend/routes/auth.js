// routes/auth.js
'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/authController');
const { authenticate }            = require('../middleware/auth');
const { loginLimiter, registerLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { registerRules, loginRules, forgotPasswordRules, resetPasswordRules, changePasswordRules, handleValidation } = require('../middleware/validate');

// Register
router.post('/register',        registerLimiter,      registerRules,       handleValidation, ctrl.register);
// Login
router.post('/login',           loginLimiter,         loginRules,          handleValidation, ctrl.login);
// Logout
router.post('/logout',          authenticate,                                                ctrl.logout);
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
// Auth check
router.get('/check',            authenticate,                                                ctrl.checkAuth);

// Google OAuth — hanya aktif jika credentials dikonfigurasi
try {
    const passport = require('passport');
    router.get('/google', passport.authenticate('google', { scope:['profile','email'], session:false }));
    router.get('/google/callback',
        passport.authenticate('google', { failureRedirect:'/admin-panel/login.html?error=google_failed', session:false }),
        ctrl.googleCallback
    );
} catch(e) {
    // Passport google tidak tersedia — skip
}

module.exports = router;
