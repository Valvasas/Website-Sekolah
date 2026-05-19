/* =====================================================
   AUTH GUARD — SMKN 1 TERISI
   File: auth-guard.js
   Include di halaman yang butuh login:
   <script src="auth-guard.js"></script>
   ===================================================== */

(function() {
    'use strict';

    const API_BASE = window.location.hostname === 'localhost'
        ? 'http://localhost:3001' : '';

    /* ── Config per halaman ── */
    const PAGE_RULES = {
        'DATA.html'  : { roles: ['siswa','wali_murid','guru','tata_usaha','kepala_sekolah','super_admin'] },
        'LMS.html'   : { roles: ['siswa','guru','kepala_sekolah','super_admin'] },
        'cbt.html'   : { roles: ['siswa'] },
        'admin.html' : { roles: ['guru','tata_usaha','kepala_sekolah','super_admin'] },
    };

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const rule        = PAGE_RULES[currentPage];

    /* Halaman tidak butuh auth — langsung keluar */
    if (!rule) return;

    /* ── Ambil token dari localStorage ── */
    const token = localStorage.getItem('smkn_token');
    const userStr = localStorage.getItem('smkn_user');

    if (!token || !userStr) {
        redirectToLogin('Silakan login terlebih dahulu.');
        return;
    }

    let user;
    try { user = JSON.parse(userStr); } catch(e) {
        redirectToLogin('Sesi tidak valid.');
        return;
    }

    /* ── Cek apakah role diizinkan ── */
    if (!rule.roles.includes(user.role)) {
        redirectToLogin('Anda tidak memiliki akses ke halaman ini.');
        return;
    }

    /* ── Cek expiry token (client-side, bukan verifikasi) ── */
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const now     = Math.floor(Date.now() / 1000);
        if (payload.exp && payload.exp < now) {
            /* Coba refresh token dulu */
            tryRefresh();
            return;
        }
    } catch(e) {
        redirectToLogin('Token tidak valid.');
        return;
    }

    /* ── Inject user info ke halaman ── */
    window.SMKN_USER  = user;
    window.SMKN_TOKEN = token;
    window.SMKN_API   = API_BASE;

    /* ── Setup tombol logout jika ada ── */
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('[data-action="logout"], .btn-logout, #btn-logout')
            .forEach(el => el.addEventListener('click', doLogout));

        /* Tampilkan nama user jika ada elemen dengan data-user-name */
        document.querySelectorAll('[data-user-name]').forEach(el => {
            el.textContent = user.nama_lengkap || user.nama || 'User';
        });
        document.querySelectorAll('[data-user-role]').forEach(el => {
            el.textContent = formatRole(user.role);
        });
        document.querySelectorAll('[data-user-nisn]').forEach(el => {
            el.textContent = user.nisn || '-';
        });
    });

    /* ── Refresh token ── */
    async function tryRefresh() {
        const refresh = localStorage.getItem('smkn_refresh');
        if (!refresh) { redirectToLogin('Sesi habis, silakan login kembali.'); return; }

        try {
            const res  = await fetch(API_BASE + '/api/auth/refresh', {
                method : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body   : JSON.stringify({ refreshToken: refresh }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error('refresh gagal');
            localStorage.setItem('smkn_token', json.data.accessToken);
            window.location.reload();
        } catch(e) {
            redirectToLogin('Sesi habis, silakan login kembali.');
        }
    }

    /* ── Logout ── */
    async function doLogout() {
        const refresh = localStorage.getItem('smkn_refresh');
        try {
            await fetch(API_BASE + '/api/auth/logout', {
                method : 'POST',
                headers: {
                    'Content-Type' : 'application/json',
                    'Authorization': 'Bearer ' + token,
                },
                body: JSON.stringify({ refreshToken: refresh }),
            });
        } catch(e) { /* tetap logout meski request gagal */ }

        localStorage.removeItem('smkn_token');
        localStorage.removeItem('smkn_user');
        localStorage.removeItem('smkn_refresh');
        window.location.href = '/login.html';
    }

    /* ── Redirect ke login ── */
    function redirectToLogin(msg) {
        localStorage.removeItem('smkn_token');
        localStorage.removeItem('smkn_user');
        localStorage.removeItem('smkn_refresh');
        const dest = '/login.html?redirect=' + encodeURIComponent(window.location.pathname)
                   + (msg ? '&msg=' + encodeURIComponent(msg) : '');
        window.location.replace(dest);
    }

    function formatRole(role) {
        const map = {
            super_admin    : 'Administrator',
            kepala_sekolah : 'Kepala Sekolah',
            guru           : 'Guru',
            tata_usaha     : 'Tata Usaha',
            siswa          : 'Siswa',
            wali_murid     : 'Wali Murid',
            calon_siswa    : 'Calon Siswa',
        };
        return map[role] || role;
    }

    /* ── Helper global untuk fetch dengan token ── */
    window.authFetch = async function(url, options = {}) {
        const t = localStorage.getItem('smkn_token');
        return fetch(url, {
            ...options,
            headers: {
                'Content-Type' : 'application/json',
                'Authorization': 'Bearer ' + t,
                ...(options.headers || {}),
            },
        });
    };

})();
