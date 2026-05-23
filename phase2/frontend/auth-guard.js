/**
 * auth-guard.js — SMKN 1 Terisi
 * Proteksi halaman dari akses tanpa login.
 *
 * CARA PAKAI — tambahkan di <head> SEBELUM script lain:
 *   <script src="/auth-guard.js"></script>
 *
 * Konfigurasi per halaman (opsional, taruh sebelum tag script):
 *   <meta name="auth-required" content="true">
 *   <meta name="auth-roles" content="siswa,wali_murid">
 *   <meta name="auth-redirect" content="/login.html">
 */
(function AuthGuard() {
    'use strict';

    const API_BASE    = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';
    const LOGIN_URL   = '/login.html';
    const TOKEN_KEY   = 'accessToken';
    const REFRESH_KEY = 'refreshToken';
    const USER_KEY    = 'userData';
    const ROLE_KEY    = 'userRole';

    // ── Baca konfigurasi dari meta tag ──────────────────────────────
    const metaRequired  = document.querySelector('meta[name="auth-required"]');
    const metaRoles     = document.querySelector('meta[name="auth-roles"]');
    const metaRedirect  = document.querySelector('meta[name="auth-redirect"]');

    const isRequired    = metaRequired?.content !== 'false'; // default: true
    const allowedRoles  = metaRoles?.content ? metaRoles.content.split(',').map(r => r.trim()) : null;
    const redirectTo    = metaRedirect?.content || LOGIN_URL;

    if (!isRequired) return; // Halaman publik, skip

    // ── Helper ──────────────────────────────────────────────────────
    function getToken()    { return localStorage.getItem(TOKEN_KEY); }
    function getRole()     { return localStorage.getItem(ROLE_KEY); }
    function getUserData() {
        try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
    }

    function clearSession() {
        [TOKEN_KEY, REFRESH_KEY, USER_KEY, ROLE_KEY, 'smkn_token', 'smkn_refresh', 'smkn_user'].forEach(k => localStorage.removeItem(k));
    }

    function redirectToLogin(reason) {
        console.warn('[AuthGuard]', reason);
        clearSession();
        const current = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.replace(`${redirectTo}?redirect=${current}`);
    }

    // ── Cek token lokal dulu (sinkron, cepat) ──────────────────────
    const token = getToken();
    if (!token) {
        redirectToLogin('Tidak ada token — redirect ke login.');
        return;
    }

    // ── Cek role lokal ─────────────────────────────────────────────
    const role = getRole();
    if (allowedRoles && role && !allowedRoles.includes(role)) {
        redirectToLogin(`Role '${role}' tidak diizinkan untuk halaman ini.`);
        return;
    }

    // ── Sembunyikan konten sampai verifikasi server selesai ────────
    document.documentElement.style.visibility = 'hidden';

    // ── Verifikasi token ke server ─────────────────────────────────
    async function verifyWithServer() {
        try {
            const res = await fetch(`${API_BASE}/api/auth/check`, {
                headers: { 'Authorization': `Bearer ${token}` },
                signal: AbortSignal.timeout(5000) // timeout 5 detik
            });

            if (res.status === 401) {
                // Token expired — coba refresh dulu
                const refreshed = await tryRefreshToken();
                if (!refreshed) {
                    redirectToLogin('Token expired & refresh gagal.');
                    return;
                }
                // Refresh berhasil, lanjut
            } else if (!res.ok) {
                redirectToLogin(`Auth check gagal: HTTP ${res.status}`);
                return;
            } else {
                const data = await res.json();
                if (!data.success) {
                    redirectToLogin('Server menolak token.');
                    return;
                }
                // Update user data dari server (always fresh)
                if (data.user) {
                    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
                    localStorage.setItem(ROLE_KEY, data.user.role);

                    // Cek role lagi dengan data server (lebih akurat)
                    if (allowedRoles && !allowedRoles.includes(data.user.role)) {
                        redirectToLogin(`Role '${data.user.role}' tidak diizinkan.`);
                        return;
                    }
                }
            }

            // ── Sukses — tampilkan halaman ─────────────────────────
            document.documentElement.style.visibility = '';

            // Expose ke window agar script lain bisa pakai
            window.__authUser = getUserData();
            window.__authRole = getRole();
            window.__authToken = getToken();

            // Dispatch event agar komponen lain tahu auth sudah selesai
            window.dispatchEvent(new CustomEvent('auth:ready', {
                detail: { user: window.__authUser, role: window.__authRole }
            }));

        } catch (err) {
            if (err.name === 'TimeoutError' || err.name === 'AbortError') {
                // Server tidak bisa dihubungi — izinkan akses offline sementara
                // dengan token lokal (toleransi untuk koneksi sekolah yang tidak stabil)
                console.warn('[AuthGuard] Server timeout — menggunakan token lokal.');
                document.documentElement.style.visibility = '';
                window.__authUser = getUserData();
                window.__authRole = getRole();
                window.__authToken = token;
                window.dispatchEvent(new CustomEvent('auth:ready', {
                    detail: { user: window.__authUser, role: window.__authRole, offline: true }
                }));
            } else {
                // Error lain — amankan
                redirectToLogin(`Error verifikasi: ${err.message}`);
            }
        }
    }

    async function tryRefreshToken() {
        const refreshToken = localStorage.getItem(REFRESH_KEY);
        if (!refreshToken) return false;

        try {
            const res = await fetch(`${API_BASE}/api/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken }),
                signal: AbortSignal.timeout(5000)
            });

            if (!res.ok) return false;

            const data = await res.json();
            if (!data.success || !data.data?.accessToken) return false;

            // Simpan token baru
            localStorage.setItem(TOKEN_KEY, data.data.accessToken);
            localStorage.setItem('smkn_token', data.data.accessToken);
            return true;

        } catch {
            return false;
        }
    }

    verifyWithServer();

    // ── Utility functions yang bisa dipakai halaman lain ───────────
    window.AuthGuard = {
        getUser:  getUserData,
        getRole:  getRole,
        getToken: getToken,
        logout() {
            clearSession();
            window.location.replace(LOGIN_URL);
        },
        hasRole(...roles) {
            return roles.includes(getRole());
        }
    };

})();
