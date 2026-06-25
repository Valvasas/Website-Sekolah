(function EduGateSecurity() {
    'use strict';

    if (window.__edugateSecurityLoaded) return;
    window.__edugateSecurityLoaded = true;

    const nativeFetch = window.fetch.bind(window);
    const unsafeMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
    const csrfByOrigin = new Map();

    function requestMethod(input, init) {
        return String(init?.method || input?.method || 'GET').toUpperCase();
    }

    function toUrl(input) {
        const raw = typeof input === 'string' ? input : input?.url;
        if (!raw) return null;
        try {
            return new URL(raw, window.location.href);
        } catch {
            return null;
        }
    }

    function isApiUrl(url) {
        if (!url) return false;
        if (!url.pathname.startsWith('/api/')) return false;
        if (url.origin === window.location.origin) return true;
        return /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
    }

    async function getCsrfTokenFor(url) {
        const base = url.origin === 'null' ? 'http://localhost:3001' : url.origin;
        if (csrfByOrigin.has(base)) return csrfByOrigin.get(base);

        const res = await nativeFetch(`${base}/api/csrf-token`, {
            credentials: 'include',
            cache: 'no-store',
            headers: { 'Accept': 'application/json' },
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.csrfToken) {
            throw new Error('Gagal mengambil token keamanan. Muat ulang halaman lalu coba lagi.');
        }
        csrfByOrigin.set(base, json.csrfToken);
        return json.csrfToken;
    }

    window.__getCsrfToken = async function __getCsrfToken(apiBase) {
        const url = new URL(apiBase || '/api/csrf-token', window.location.href);
        return getCsrfTokenFor(url);
    };

    window.fetch = async function secureFetch(input, init = {}) {
        const method = requestMethod(input, init);
        const url = toUrl(input);

        if (unsafeMethods.has(method) && isApiUrl(url)) {
            const token = await getCsrfTokenFor(url);
            const headers = new Headers(init.headers || input?.headers || {});
            if (!headers.has('X-CSRF-Token')) headers.set('X-CSRF-Token', token);
            init = { ...init, headers };
        }

        const res = await nativeFetch(input, init);
        if (res.status === 403 && unsafeMethods.has(method) && isApiUrl(url)) {
            csrfByOrigin.delete(url.origin);
        }
        return res;
    };
})();
