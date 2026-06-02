/**
 * auth-guard.js — EduGate SMKN 1 Terisi
 * =======================================
 * Pasang di <head> SEBELUM script utama di setiap halaman yang butuh auth.
 *
 * Cara pakai di HTML:
 *   <meta name="auth-required" content="true">
 *   <meta name="auth-roles"    content="siswa,guru,wali_murid">
 *   <script src="/auth-guard.js"></script>
 *
 * Jika tidak ada meta "auth-required", guard tidak jalan (halaman publik).
 * =======================================
 */

(function EduGateAuthGuard() {
  'use strict';

  /* ── Config ── */
  const API_BASE   = window.location.hostname === 'localhost'
    ? 'http://localhost:3001' : '';
  const CHECK_URL  = API_BASE + '/api/auth/check';
  const LOGIN_PAGE = '/login.html';

  /* ── Redirect map by role ── */
  const REDIRECT_MAP = {
    super_admin:     '/admin-panel/dashboard.html',
    content_admin:   '/admin-panel/dashboard.html',
    kepala_sekolah:  '/admin-panel/dashboard.html',
    wakil_kepala_sekolah: '/admin-panel/dashboard.html',
    guru:            '/admin-panel/dashboard.html',
    tata_usaha:      '/admin-panel/dashboard.html',
    siswa:           '/DATA.html',
    wali_murid:      '/DATA.html',
    calon_siswa:     '/ppdb.html',
  };

  /* ── Read meta tags ── */
  function getMeta(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    return el ? el.getAttribute('content') : null;
  }

  /* ── Token helpers ── */
  function getToken(allowedRoles = []) {
    const wantsStaff = allowedRoles.some(role => [
      'super_admin','content_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha'
    ].includes(role));
    const wantsStudent = allowedRoles.some(role => ['siswa','wali_murid','calon_siswa'].includes(role));

    if (wantsStaff) {
      return localStorage.getItem('adminAccessToken')
          || (allowedRoles.includes(localStorage.getItem('userRole')) ? localStorage.getItem('accessToken') : '')
          || '';
    }
    if (wantsStudent) {
      return localStorage.getItem('studentAccessToken')
          || localStorage.getItem('smkn_token')
          || (allowedRoles.includes(localStorage.getItem('userRole')) ? localStorage.getItem('accessToken') : '')
          || '';
    }
    return localStorage.getItem('accessToken') || localStorage.getItem('smkn_token') || '';
  }

  function clearSession() {
    const keys = [
      'accessToken','refreshToken','userRole','userData',
      'smkn_token','smkn_refresh','smkn_user',
      'studentAccessToken','studentRefreshToken','studentUserData',
      'adminAccessToken','adminRefreshToken','adminUserData'
    ];
    keys.forEach(k => localStorage.removeItem(k));
  }

  /* ── Decode JWT payload (no verify — server will verify) ── */
  function decodeJwt(token) {
    try {
      const b64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
      return JSON.parse(atob(b64));
    } catch { return null; }
  }

  /* ── Check if token is locally expired ── */
  function isExpiredLocally(token) {
    const payload = decodeJwt(token);
    if (!payload || !payload.exp) return false;
    return Math.floor(Date.now() / 1000) >= payload.exp;
  }

  /* ── Try to refresh the access token ── */
  async function tryRefresh() {
    const rt = localStorage.getItem('studentRefreshToken')
        || localStorage.getItem('adminRefreshToken')
        || localStorage.getItem('refreshToken')
        || localStorage.getItem('smkn_refresh');
    if (!rt) return null;
    try {
      const res  = await fetch(API_BASE + '/api/auth/refresh', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken: rt })
      });
      const json = await res.json();
      if (json.success && json.data?.accessToken) {
        localStorage.setItem('accessToken', json.data.accessToken);
        localStorage.setItem('smkn_token',  json.data.accessToken);
        return json.data.accessToken;
      }
      return null;
    } catch { return null; }
  }

  /* ── Show loading overlay so there's no flash ── */
  function showOverlay() {
    const el = document.createElement('div');
    el.id = '__ag_overlay';
    el.style.cssText = [
      'position:fixed','inset:0','z-index:999999',
      'background:#001529',
      'display:flex','align-items:center','justify-content:center',
      'flex-direction:column','gap:14px',
      'font-family:Plus Jakarta Sans,Sora,sans-serif',
    ].join(';');
    el.innerHTML = `
      <div style="width:40px;height:40px;border-radius:50%;
        border:3px solid rgba(212,175,55,0.2);
        border-top-color:#D4AF37;
        animation:__ag_spin 0.7s linear infinite"></div>
      <span style="color:rgba(255,255,255,0.4);font-size:0.78rem;font-weight:600">Memverifikasi sesi...</span>
      <style>@keyframes __ag_spin{to{transform:rotate(360deg)}}</style>
    `;
    document.documentElement.appendChild(el);
    return el;
  }

  function hideOverlay(el) {
    if (!el) return;
    el.style.transition = 'opacity 0.3s';
    el.style.opacity    = '0';
    setTimeout(() => el.remove(), 350);
  }

  /* ══════════════════════════════════════
     MAIN GUARD FUNCTION
  ══════════════════════════════════════ */
  async function guard() {
    const authRequired = getMeta('auth-required');
    if (!authRequired || authRequired !== 'true') return; // public page

    const allowedRolesRaw = getMeta('auth-roles') || '';
    const allowedRoles    = allowedRolesRaw
      ? allowedRolesRaw.split(',').map(r => r.trim()).filter(Boolean)
      : [];

    const overlay = showOverlay();
    let   token   = getToken(allowedRoles);

    /* 1. No token → redirect to login */
    if (!token) {
      hideOverlay(overlay);
      const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.replace(`${LOGIN_PAGE}?msg=Silakan+login+terlebih+dahulu&return=${returnTo}`);
      return;
    }

    /* 2. Locally expired → try refresh first */
    if (isExpiredLocally(token)) {
      const newToken = await tryRefresh();
      if (!newToken) {
        clearSession();
        hideOverlay(overlay);
        window.location.replace(`${LOGIN_PAGE}?msg=Sesi+berakhir,+silakan+login+kembali`);
        return;
      }
      token = newToken;
    }

    /* 3. Verify with server */
    try {
      const res  = await fetch(CHECK_URL, {
        headers: { Authorization: `Bearer ${token}` },
        cache:   'no-store',
      });
      const json = await res.json();

      if (!json.success || !json.user) {
        clearSession();
        hideOverlay(overlay);
        window.location.replace(`${LOGIN_PAGE}?msg=Sesi+tidak+valid,+silakan+login+kembali`);
        return;
      }

      const user = json.user;
      const role = user.role;

      /* 4. Role check */
      if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
        hideOverlay(overlay);
        // Redirect to correct home for their role
        const correct = REDIRECT_MAP[role] || LOGIN_PAGE;
        if (window.location.pathname !== correct) {
          window.location.replace(correct + '?msg=Akses+tidak+diizinkan+untuk+role+' + encodeURIComponent(role));
        } else {
          hideOverlay(overlay);
        }
        return;
      }

      /* 5. All good — sync user data to localStorage & continue */
      localStorage.setItem('userRole', role);
      localStorage.setItem('userData', JSON.stringify(user));
      localStorage.setItem('smkn_user', JSON.stringify(user));
      if (['siswa','wali_murid','calon_siswa'].includes(role)) {
        localStorage.setItem('studentAccessToken', token);
        localStorage.setItem('studentUserData', JSON.stringify(user));
      } else if (['super_admin','content_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha'].includes(role)) {
        localStorage.setItem('adminAccessToken', token);
        localStorage.setItem('adminUserData', JSON.stringify(user));
      }

      /* Expose globally for the page scripts */
      window.__edugate = { user, token, role };

      hideOverlay(overlay);

    } catch (err) {
      /* Network error: allow if token looks locally valid */
      console.warn('[AuthGuard] Network error, using cached session:', err.message);
      const cached = localStorage.getItem('userData');
      if (cached) {
        try {
          const u = JSON.parse(cached);
          window.__edugate = { user: u, token, role: u.role };
          if (allowedRoles.length && !allowedRoles.includes(u.role)) {
            hideOverlay(overlay);
            window.location.replace(REDIRECT_MAP[u.role] || LOGIN_PAGE);
            return;
          }
          hideOverlay(overlay);
          return;
        } catch { /* fall through */ }
      }
      clearSession();
      hideOverlay(overlay);
      window.location.replace(`${LOGIN_PAGE}?msg=Koneksi+server+bermasalah,+silakan+coba+lagi`);
    }
  }

  /* Run on DOM ready */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', guard);
  } else {
    guard();
  }

})();
