// config/passport.js

'use strict';

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// Hanya setup Google Strategy jika credentials ada
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_ID !== 'your_google_client_id_here') {
    passport.use(new GoogleStrategy({
        clientID:     process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL:  process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3001/api/auth/google/callback',
        passReqToCallback: false,
    },
    async (accessToken, refreshToken, profile, done) => {
        // Teruskan profile ke controller
        return done(null, profile);
    }));
} else {
    console.warn('⚠️  Google OAuth tidak dikonfigurasi (opsional).');
}

module.exports = passport;
