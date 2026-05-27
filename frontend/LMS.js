/* =====================================================
   LMS SMKN 1 TERISI — v2.0 (Real API)
   Menggantikan semua dummy data dengan fetch ke backend
   ===================================================== */
'use strict';

const API = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

/* ── Auth helper (dari auth-guard.js) ──────────────────────── */
function getToken() { return localStorage.getItem('accessToken') || ''; }
function getUser()  {
    try { return JSON.parse(localStorage.getItem('userData') || 'null'); } catch { return null; }
}

async function apiFetch(endpoint, opts = {}) {
    const res = await fetch(`${API}${endpoint}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
            ...(opts.headers || {}),
        },
    });
    if (res.status === 401) {
        lmsLogout();
        throw new Error('Sesi berakhir.');
    }
    return res.json();
}

/* ── State ──────────────────────────────────────────────────── */
const lmsState = {
    user:           null,
    currentTugasId: null,
    allMateri:      [],
    forumPosts:     [],
    tugasData:      [],
    nilaiData:      [],
    jadwalData:     {},
    profileData:    null,
    schoolClasses:  [],
    targetNisn:     null,
    unreadNotif:    0,
    notifikasiData: [],
    cbtSessions:    [],
};

/* ── Utils ──────────────────────────────────────────────────── */
function showLmsScreen(id) {
    document.querySelectorAll('.lms-screen').forEach(s => {
        s.classList.remove('active'); s.style.display = 'none';
    });
    const el = document.getElementById(id);
    if (el) { el.style.display = 'block'; el.classList.add('active'); window.scrollTo(0,0); }
}

function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

function getGreeting() {
    const h = new Date().getHours();
    if (h < 11) return 'Selamat Pagi';
    if (h < 15) return 'Selamat Siang';
    if (h < 18) return 'Selamat Sore';
    return 'Selamat Malam';
}

function setLoading(el, loading, text = '') {
    if (!el) return;
    el.disabled = loading;
    if (loading) el.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memuat...';
    else if (text) el.innerHTML = text;
}

/* ── Login ──────────────────────────────────────────────────── */
const lfToggle = document.getElementById('lf-toggle');
if (lfToggle) {
    lfToggle.addEventListener('click', () => {
        const inp = document.getElementById('lf-pass');
        const icon = lfToggle.querySelector('i');
        inp.type = inp.type === 'password' ? 'text' : 'password';
        icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    });
}

async function lmsLogin() {
    const user    = document.getElementById('lf-user').value.trim();
    const pass    = document.getElementById('lf-pass').value.trim();
    const role    = document.querySelector('.role-btn.active')?.dataset?.role || 'siswa';
    const err     = document.getElementById('lms-err');
    const errMsg  = document.getElementById('lms-err-msg');
    const btn     = document.querySelector('.lms-login-btn');

    if (!user || !pass) {
        errMsg.textContent = 'Harap isi semua kolom.';
        err.classList.remove('hidden');
        return;
    }

    setLoading(btn, true);
    err.classList.add('hidden');

    try {
        const data = await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ identifier: user, password: pass, role }),
        });

        if (!data.success) {
            errMsg.textContent = data.message || 'Login gagal.';
            err.classList.remove('hidden');
            return;
        }

        // Simpan token
        localStorage.setItem('accessToken', data.data.accessToken);
        localStorage.setItem('refreshToken', data.data.refreshToken);
        localStorage.setItem('userRole', data.data.user.role);
        localStorage.setItem('userData', JSON.stringify(data.data.user));

        lmsState.user = data.data.user;
        err.classList.add('hidden');
        await initDashboard();
        showLmsScreen('lms-dashboard');

    } catch (e) {
        errMsg.textContent = 'Koneksi gagal. Pastikan server berjalan.';
        err.classList.remove('hidden');
    } finally {
        setLoading(btn, false, '<i class="fas fa-sign-in-alt"></i> Masuk ke LMS');
    }
}

function setRole(role, btn) {
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const label = document.getElementById('lf-label-user');
    if (label) label.innerHTML = role === 'siswa'
        ? '<i class="fas fa-id-card"></i> NISN'
        : '<i class="fas fa-id-badge"></i> NIP / Email';
    const inp = document.getElementById('lf-user');
    if (inp) inp.placeholder = role === 'siswa' ? 'Masukkan NISN kamu' : 'Masukkan NIP/Email';
}

/* ── Init Dashboard (fetch semua data dari API) ─────────────── */
async function initDashboard() {
    const u = lmsState.user || getUser();
    if (!u) return;
    lmsState.user = u;

    // Update UI user info
    const firstName = u.nama?.split(' ')[0] || 'Siswa';
    document.getElementById('tb-user-name').textContent      = firstName;
    document.getElementById('tb-avatar-circle').textContent  = u.nama?.charAt(0) || 'S';
    document.getElementById('pd-avatar').textContent         = u.nama?.charAt(0) || 'S';
    document.getElementById('pd-name').textContent           = u.nama || '-';
    document.getElementById('pd-role').textContent           = u.role === 'siswa' ? 'Siswa Aktif' : 'Guru / Staf';
    document.getElementById('wb-greeting').textContent       = `${getGreeting()}, ${firstName} 👋`;
    const fcAv = document.getElementById('fc-avatar');
    if (fcAv) fcAv.textContent = u.nama?.charAt(0) || 'S';

    // Update foto profil jika ada
    if (u.foto) {
        const avatarEls = document.querySelectorAll('.avatar-circle, #tb-avatar-circle, #pd-avatar');
        avatarEls.forEach(el => {
            if (el) el.style.backgroundImage = `url(${u.foto})`;
        });
    }

    // Fetch semua data paralel agar lebih cepat
    await Promise.allSettled([
        fetchDashboardStats(),
        fetchTugas(),
        fetchMateri(),
        fetchForum(),
        fetchNilai(),
        fetchJadwal(),
        fetchNotifikasi(),
        fetchStudentCbtSessions(),
        fetchProfil(),
        loadSchoolClasses(),
    ]);

    await fetchKelas();
}

/* ── Fetch: Dashboard stats ─────────────────────────────────── */
async function fetchDashboardStats() {
    try {
        const data = await apiFetch('/siswa/dashboard');
        if (!data.success) return;
        const d = data.data;
        if (d.kelas || d.jurusan) {
            lmsState.user = { ...lmsState.user, kelas: d.kelas, jurusan: d.jurusan };
            localStorage.setItem('userData', JSON.stringify(lmsState.user));
        }

        // Update stat cards
        const statMap = {
            'sc-nilai':    d.nilai_rata ? d.nilai_rata.toFixed(0) : '-',
            'sc-kehadiran': d.persen_hadir ? `${d.persen_hadir}%` : '-',
        };
        Object.entries(statMap).forEach(([id, val]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        });
    } catch(e) { console.warn('[Dashboard stats]', e.message); }
}

async function loadSchoolClasses() {
    try {
        const data = await apiFetch('/auth/classes');
        if (!data.success) return;
        lmsState.schoolClasses = data.data || [];
        const select = document.getElementById('pf-kelas');
        if (!select) return;
        select.innerHTML = '<option value="">Pilih kelas</option>' + lmsState.schoolClasses.map(k =>
            `<option value="${escHtml(k.kelas)}">${escHtml(k.kelas)} - ${escHtml(k.jurusan)}</option>`
        ).join('');
        if (lmsState.profileData?.profil?.kelas) select.value = lmsState.profileData.profil.kelas;
    } catch(e) { console.warn('[Classes]', e.message); }
}

function canEditBiodata() {
    return ['guru','tata_usaha','kepala_sekolah','wakil_kepala_sekolah','super_admin'].includes(lmsState.user?.role);
}

async function fetchProfil(nisn = '') {
    try {
        const target = nisn || lmsState.targetNisn || '';
        if (!target && canEditBiodata() && !lmsState.user?.nisn) {
            lmsState.profileData = null;
            renderProfil();
            return;
        }
        const query = target && canEditBiodata() ? `?nisn=${encodeURIComponent(target)}` : '';
        const data = await apiFetch('/siswa/profil' + query);
        if (!data.success) {
            showToast(data.message || 'Profil tidak ditemukan.', 'red');
            return;
        }
        lmsState.profileData = data.data;
        lmsState.targetNisn = data.data.nisn || null;
        renderProfil();
    } catch(e) {
        console.warn('[Profil]', e.message);
        showToast('Gagal memuat profil.', 'red');
    }
}

function setVal(id, value) {
    const el = document.getElementById(id);
    if (el) el.value = value || '';
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value || '-';
}

function renderProfil() {
    const data = lmsState.profileData;
    const editable = canEditBiodata();
    document.getElementById('staff-target')?.classList.toggle('hidden', !editable);
    if (!data) {
        setText('profile-name', editable ? 'Pilih siswa' : '-');
        setText('profile-meta', editable ? 'Masukkan NISN untuk memuat biodata' : '-');
        setText('profile-nisn', '-');
        setText('profile-kelas', '-');
        setText('profile-jurusan', '-');
        setText('profile-phone', '-');
        document.getElementById('profile-form')?.reset();
        return;
    }
    const p = data.profil || {};

    setText('profile-name', data.nama_lengkap || data.nama || '-');
    setText('profile-meta', `${data.role || 'siswa'}${p.kelas ? ' · ' + p.kelas : ''}`);
    setText('profile-nisn', data.nisn);
    setText('profile-kelas', p.kelas);
    setText('profile-jurusan', p.jurusan);
    setText('profile-phone', data.no_hp);

    const avatarText = (data.nama_lengkap || data.nama || 'S').charAt(0).toUpperCase();
    ['profile-avatar','tb-avatar-circle','pd-avatar','fc-avatar'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = avatarText;
        if (data.foto_profil) el.style.backgroundImage = `url(${data.foto_profil})`;
    });
    document.getElementById('pd-name').textContent = data.nama_lengkap || data.nama || '-';

    setVal('pf-email', data.email);
    setVal('pf-phone', data.no_hp);
    setVal('pf-kelas', p.kelas);
    setVal('pf-jurusan', p.jurusan);
    setVal('pf-tempat', p.tempat_lahir);
    setVal('pf-tanggal', p.tanggal_lahir);
    setVal('pf-gender', p.jenis_kelamin);
    setVal('pf-agama', p.agama);
    setVal('pf-alamat', p.alamat);
    setVal('pf-kelurahan', p.kelurahan);
    setVal('pf-kecamatan', p.kecamatan);
    setVal('pf-ayah', p.nama_ayah);
    setVal('pf-pekerjaan-ayah', p.pekerjaan_ayah);
    setVal('pf-ibu', p.nama_ibu);
    setVal('pf-pekerjaan-ibu', p.pekerjaan_ibu);
    setVal('pf-hp-ortu', p.no_hp_ortu);
    setVal('pf-email-ortu', p.email_ortu);

    const lock = document.getElementById('biodata-lock');
    if (lock) {
        lock.classList.toggle('editable', editable);
        lock.innerHTML = editable
            ? '<i class="fas fa-unlock"></i> Mode staff aktif: biodata siswa bisa diperbarui.'
            : '<i class="fas fa-lock"></i> Biodata di bawah ini hanya bisa diubah oleh guru atau staff.';
    }

    ['pf-kelas','pf-tempat','pf-tanggal','pf-gender','pf-agama','pf-alamat','pf-kelurahan','pf-kecamatan','pf-ayah','pf-pekerjaan-ayah','pf-ibu','pf-pekerjaan-ibu','pf-hp-ortu','pf-email-ortu']
        .forEach(id => {
            const el = document.getElementById(id);
            if (el) el.disabled = !editable;
        });
    const jurusanInput = document.getElementById('pf-jurusan');
    if (jurusanInput) jurusanInput.disabled = true;
}

async function saveProfil(event) {
    event.preventDefault();
    const btn = document.getElementById('profile-save-btn');
    const editable = canEditBiodata();
    if (editable && !lmsState.targetNisn) {
        showToast('Masukkan NISN siswa dulu.', 'red');
        return;
    }
    const kelas = document.getElementById('pf-kelas')?.value || '';
    const foundClass = lmsState.schoolClasses.find(k => k.kelas === kelas);
    const payload = {
        email: document.getElementById('pf-email')?.value.trim() || null,
        no_hp: document.getElementById('pf-phone')?.value.trim() || null,
    };

    if (editable) {
        Object.assign(payload, {
            kelas,
            jurusan: foundClass?.jurusan || document.getElementById('pf-jurusan')?.value.trim() || null,
            tempat_lahir: document.getElementById('pf-tempat')?.value.trim() || null,
            tanggal_lahir: document.getElementById('pf-tanggal')?.value || null,
            jenis_kelamin: document.getElementById('pf-gender')?.value || null,
            agama: document.getElementById('pf-agama')?.value.trim() || null,
            alamat: document.getElementById('pf-alamat')?.value.trim() || null,
            kelurahan: document.getElementById('pf-kelurahan')?.value.trim() || null,
            kecamatan: document.getElementById('pf-kecamatan')?.value.trim() || null,
            nama_ayah: document.getElementById('pf-ayah')?.value.trim() || null,
            pekerjaan_ayah: document.getElementById('pf-pekerjaan-ayah')?.value.trim() || null,
            nama_ibu: document.getElementById('pf-ibu')?.value.trim() || null,
            pekerjaan_ibu: document.getElementById('pf-pekerjaan-ibu')?.value.trim() || null,
            no_hp_ortu: document.getElementById('pf-hp-ortu')?.value.trim() || null,
            email_ortu: document.getElementById('pf-email-ortu')?.value.trim() || null,
        });
    }

    setLoading(btn, true);
    try {
        const target = editable && lmsState.targetNisn ? `?nisn=${encodeURIComponent(lmsState.targetNisn)}` : '';
        const res = await apiFetch('/siswa/profil' + target, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        if (!res.success) {
            showToast(res.message || 'Gagal menyimpan profil.', 'red');
            return;
        }
        showToast('Profil berhasil disimpan.', 'green');
        await fetchProfil(lmsState.targetNisn || '');
    } catch(e) {
        showToast('Gagal menyimpan profil.', 'red');
    } finally {
        setLoading(btn, false, '<i class="fas fa-save"></i> Simpan Profil');
    }
}

/* ── Fetch & Render: Tugas ──────────────────────────────────── */
async function fetchTugas() {
    try {
        const data = await apiFetch('/lms/tugas');
        if (!data.success) return;
        lmsState.tugasData = data.data || [];
        renderTugas('semua');
        renderMiniTugas();
        // Update badge
        const belum = lmsState.tugasData.filter(t => !t.submission_id).length;
        document.querySelectorAll('.snav-badge.red').forEach(b => { b.textContent = belum; });
    } catch(e) { console.warn('[Fetch tugas]', e.message); }
}

function renderTugas(filter) {
    const el = document.getElementById('tugas-list');
    if (!el) return;

    let list = lmsState.tugasData;
    if (filter === 'belum')   list = list.filter(t => !t.submission_id);
    if (filter === 'selesai') list = list.filter(t => !!t.submission_id);

    if (!list.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Tidak ada tugas.</p>';
        return;
    }

    el.innerHTML = list.map(t => {
        const isDone     = !!t.submission_id;
        const isLate     = t.deadline && new Date(t.deadline) < new Date() && !isDone;
        const prioritas  = isLate ? 'red' : isDone ? 'green' : 'orange';
        const deadlineFmt = t.deadline
            ? new Date(t.deadline).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
            : 'Tidak ada deadline';

        return `
        <div class="tugas-item ${isDone ? 'done' : ''}" id="tugas-item-${t.id}">
            <div class="ti-icon" style="background:${getMapelColor(t.mapel)}20;">
                <i class="${getMapelIcon(t.mapel)}" style="color:${getMapelColor(t.mapel)};"></i>
            </div>
            <div class="ti-info">
                <h4>${escHtml(t.judul)}</h4>
                <p>${escHtml(t.mapel)} · Deadline: ${deadlineFmt}</p>
                ${t.submission_nilai ? `<p style="color:#10b981;font-size:.75rem;font-weight:700;">Nilai: ${t.submission_nilai}</p>` : ''}
            </div>
            <span class="ti-deadline ${prioritas}">${isDone ? '✓ Selesai' : isLate ? 'Terlambat' : deadlineFmt}</span>
            ${!isDone ? `<button onclick="bukaSubmitTugas('${t.id}')"
                style="padding:8px 16px;background:var(--navy);color:white;border:none;border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;"
                onmouseover="this.style.background='var(--gold)';this.style.color='var(--navy)'"
                onmouseout="this.style.background='var(--navy)';this.style.color='white'">
                Kumpulkan
            </button>` : ''}
        </div>`;
    }).join('');
}

function filterTugas(filter, btn) {
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTugas(filter);
}

function renderMiniTugas() {
    const el = document.getElementById('mini-tugas-list');
    if (!el) return;
    const belum = lmsState.tugasData.filter(t => !t.submission_id).slice(0, 4);
    if (!belum.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:20px 0;font-size:.85rem;">Semua tugas sudah selesai 🎉</p>';
        return;
    }
    el.innerHTML = belum.map(t => {
        const isLate = t.deadline && new Date(t.deadline) < new Date();
        return `
        <div class="mini-tugas-item">
            <div class="mt-dot" style="background:${isLate ? '#ef4444' : '#f59e0b'};"></div>
            <div class="mt-info">
                <h4>${escHtml(t.judul)}</h4>
                <p>${escHtml(t.mapel)} · ${t.deadline ? new Date(t.deadline).toLocaleDateString('id-ID') : '-'}</p>
            </div>
            <span class="mt-chip" style="background:${isLate ? '#fee2e2' : '#fef3c7'};color:${isLate ? '#ef4444' : '#f59e0b'};">
                ${isLate ? 'Terlambat' : 'Segera'}
            </span>
        </div>`;
    }).join('');
}

async function fetchKelas() {
    try {
        const user = lmsState.user;
        if (!user) return;

        const mapelSet = new Set(lmsState.tugasData.map(t => t.mapel).filter(Boolean));
        const kelasList = [...mapelSet].map((mapel, i) => ({
            id: i,
            nama: mapel,
            guru: 'Guru Pengampu',
            progress: Math.min(100, Math.max(0, Math.round(
                (lmsState.tugasData.filter(t => t.mapel === mapel && t.submission_id).length /
                Math.max(1, lmsState.tugasData.filter(t => t.mapel === mapel).length)) * 100
            ))),
            color: getMapelColor(mapel),
            icon: getMapelIcon(mapel)
        }));

        renderKelas(kelasList);
        renderMiniKelas(kelasList);
    } catch(e) { console.warn('[Fetch kelas]', e.message); }
}

function renderKelas(kelasList) {
    const el = document.getElementById('kelas-grid');
    if (!el) return;
    if (!kelasList.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Belum ada kelas terdaftar.</p>';
        return;
    }
    el.innerHTML = kelasList.map(k => `
        <div class="kelas-card">
            <div class="kc-banner" style="background:linear-gradient(135deg,${k.color},${k.color}cc);">
                <i class="${k.icon}"></i>
                <span class="kc-badge">Aktif</span>
            </div>
            <div class="kc-body">
                <h3>${escHtml(k.nama)}</h3>
                <p>${escHtml(k.guru)}</p>
                <div class="kc-progress">
                    <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--muted);">
                        <span>Progress</span><span>${k.progress}%</span>
                    </div>
                    <div class="kc-prog-bar">
                        <div class="kc-prog-fill" style="width:${k.progress}%"></div>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderMiniKelas(kelasList) {
    const el = document.getElementById('mini-kelas-list');
    if (!el) return;
    if (!kelasList.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:20px 0;font-size:.85rem;">Belum ada kelas.</p>';
        return;
    }
    el.innerHTML = kelasList.slice(0, 4).map(k => `
        <div class="mini-kelas-item">
            <div class="mk-icon" style="background:${k.color}20;">
                <i class="${k.icon}" style="color:${k.color};font-size:1.2rem;"></i>
            </div>
            <div class="mk-info">
                <h4>${escHtml(k.nama)}</h4>
                <p>${k.progress}% selesai</p>
            </div>
            <i class="fas fa-chevron-right mk-arrow"></i>
        </div>
    `).join('');
}

function bukaSubmitTugas(id) {
    lmsState.currentTugasId = id;
    const t = lmsState.tugasData.find(x => x.id === id);
    if (t) document.getElementById('modal-tugas-title').textContent = `Kumpulkan: ${t.judul}`;
    document.getElementById('modal-tugas-text').value = '';
    document.getElementById('file-preview').textContent = '';
    openModal('modal-tugas');
}

async function submitTugas() {
    const btn  = document.getElementById('submit-tugas-btn');
    const text = document.getElementById('modal-tugas-text').value.trim();
    const fileInput = document.getElementById('file-input');

    if (!text && !fileInput?.files?.[0]) {
        showToast('Harap isi jawaban atau lampirkan file.', 'red');
        return;
    }

    setLoading(btn, true);

    try {
        let fileUrl = null;

        // Upload file dulu jika ada
        if (fileInput?.files?.[0]) {
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('tugas_id', lmsState.currentTugasId);

            const uploadRes = await fetch(`${API}/upload/tugas`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: formData,
            });
            const uploadData = await uploadRes.json();
            if (uploadData.success) fileUrl = uploadData.data.fileUrl;
        }

        // Submit tugas
        const res = await apiFetch(`/lms/tugas/${lmsState.currentTugasId}/submit`, {
            method: 'POST',
            body: JSON.stringify({ jawaban: text, file_url: fileUrl }),
        });

        if (res.success) {
            closeModal('modal-tugas');
            showToast('Tugas berhasil dikumpulkan! ✓', 'green');
            await fetchTugas(); // Refresh list
        } else {
            showToast(res.message || 'Gagal mengumpulkan tugas.', 'red');
        }
    } catch(e) {
        showToast('Koneksi gagal. Coba lagi.', 'red');
    } finally {
        setLoading(btn, false, '<i class="fas fa-paper-plane"></i> Kumpulkan Tugas');
    }
}

/* ── Fetch & Render: Materi ─────────────────────────────────── */
async function fetchMateri(query = '') {
    try {
        const endpoint = query ? `/lms/materi?search=${encodeURIComponent(query)}` : '/lms/materi';
        const data = await apiFetch(endpoint);
        if (!data.success) return;
        lmsState.allMateri = data.data || [];
        renderMateri();
    } catch(e) { console.warn('[Fetch materi]', e.message); }
}

function renderMateri() {
    const el = document.getElementById('materi-list');
    if (!el) return;
    if (!lmsState.allMateri.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Belum ada materi.</p>';
        return;
    }
    el.innerHTML = lmsState.allMateri.map(m => `
        <div class="materi-item" onclick="downloadMateri('${m.file_url}', '${escHtml(m.original_name)}')">
            <div class="mi-icon" style="background:${getFileBg(m.tipe)};">
                <i class="${getFileIcon(m.tipe)}" style="color:${getFileColor(m.tipe)};"></i>
            </div>
            <div class="mi-info">
                <h4>${escHtml(m.original_name)}</h4>
                <p>${escHtml(m.mapel || '-')} · ${m.ukuran || '-'}</p>
            </div>
            <span class="mi-type ${m.tipe}">${m.jenis}</span>
            <i class="fas fa-download mi-dl"></i>
        </div>
    `).join('');
}

function searchMateri(query) { fetchMateri(query); }

function downloadMateri(url, nama) {
    if (!url) return showToast('URL file tidak valid.', 'red');
    const a = document.createElement('a');
    a.href = url; a.download = nama; a.target = '_blank';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    showToast(`Mengunduh: ${nama}`, 'blue');
}

/* ── Fetch & Render: Forum ──────────────────────────────────── */
async function fetchForum() {
    try {
        const data = await apiFetch('/lms/forum');
        if (!data.success) return;
        lmsState.forumPosts = data.data || [];
        renderForum();
    } catch(e) { console.warn('[Fetch forum]', e.message); }
}

function renderForum() {
    const el = document.getElementById('forum-list');
    if (!el) return;
    if (!lmsState.forumPosts.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Belum ada diskusi.</p>';
        return;
    }
    el.innerHTML = lmsState.forumPosts.map(p => `
        <div class="forum-post" id="fp-${p.id}">
            <div class="fp-header">
                <div class="fp-avatar" style="background:var(--navy);color:var(--gold);">
                    ${(p.nama_lengkap || 'U').charAt(0)}
                </div>
                <div class="fp-meta">
                    <h4>${escHtml(p.nama_lengkap || 'Unknown')}</h4>
                    <p>${formatRelativeTime(p.created_at)}</p>
                </div>
                ${p.mapel ? `<span class="fp-tag">${escHtml(p.mapel)}</span>` : ''}
            </div>
            <p class="fp-body">${escHtml(p.konten)}</p>
            <div class="fp-actions">
                <button class="fp-btn ${p.sudah_like ? 'liked' : ''}" onclick="toggleLike('${p.id}')">
                    <i class="${p.sudah_like ? 'fas' : 'far'} fa-heart"></i> ${p.likes || 0}
                </button>
                <button class="fp-btn">
                    <i class="far fa-comment"></i> ${p.total_balasan || 0} Balasan
                </button>
            </div>
        </div>
    `).join('');
}

async function toggleLike(id) {
    try {
        const data = await apiFetch(`/lms/forum/${id}/like`, { method: 'POST' });
        if (data.success) {
            // Update lokal tanpa re-fetch
            const post = lmsState.forumPosts.find(p => p.id === id);
            if (post) {
                post.sudah_like = data.liked;
                post.likes += data.liked ? 1 : -1;
                renderForum();
            }
        }
    } catch(e) { console.warn('[Like]', e.message); }
}

async function postForum() {
    const text  = document.getElementById('forum-input').value.trim();
    const mapel = document.getElementById('forum-mapel').value;
    if (!text) return showToast('Tulis konten dulu ya!', 'orange');

    try {
        const data = await apiFetch('/lms/forum', {
            method: 'POST',
            body: JSON.stringify({ konten: text, mapel: mapel.split('—')[0].trim() }),
        });
        if (data.success) {
            document.getElementById('forum-input').value = '';
            showToast('Postingan berhasil dikirim!', 'green');
            await fetchForum();
        } else {
            showToast(data.message || 'Gagal posting.', 'red');
        }
    } catch(e) { showToast('Koneksi gagal.', 'red'); }
}

/* ── Fetch & Render: Nilai ──────────────────────────────────── */
async function fetchNilai() {
    try {
        const data = await apiFetch('/siswa/nilai?semester=genap');
        if (!data.success) return;
        lmsState.nilaiData = data.data || [];
        renderNilai();
    } catch(e) { console.warn('[Fetch nilai]', e.message); }
}

function renderNilai() {
    const el = document.getElementById('nilai-grid');
    if (!el) return;
    if (!lmsState.nilaiData.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Belum ada data nilai.</p>';
        return;
    }
    el.innerHTML = lmsState.nilaiData.map(n => {
        const final  = n.nilai_final ?? ((n.uh*0.2 + n.uts*0.25 + n.uas*0.3 + n.tugas*0.25)).toFixed(1);
        const lulus  = parseFloat(final) >= (n.kkm || 70);
        const color  = getMapelColor(n.mapel);
        return `
        <div class="nilai-card" style="border-top-color:${color};">
            <div class="nc-header">
                <div class="nc-icon" style="background:${color}20;">
                    <i class="${getMapelIcon(n.mapel)}" style="color:${color};"></i>
                </div>
                <div class="nc-info">
                    <h3>${escHtml(n.mapel)}</h3>
                    <p>Semester Genap · KKM ${n.kkm || 70}</p>
                </div>
            </div>
            <div class="nc-body">
                ${[
                    { label:'UH (20%)',    val: n.uh    },
                    { label:'UTS (25%)',   val: n.uts   },
                    { label:'UAS (30%)',   val: n.uas   },
                    { label:'Tugas (25%)', val: n.tugas },
                ].map(r => `
                    <div class="nilai-row">
                        <span class="nr-label">${r.label}</span>
                        <span class="nr-val ${r.val >= (n.kkm||70) ? 'lulus' : 'remedial'}">${r.val ?? '-'}</span>
                    </div>
                `).join('')}
            </div>
            <div class="nc-avg">
                <span>Nilai Akhir</span>
                <strong style="color:${lulus ? 'var(--green)' : 'var(--red)'};">${final}</strong>
            </div>
        </div>`;
    }).join('');
}

/* ── Fetch: Jadwal ──────────────────────────────────────────── */
async function fetchJadwal() {
    try {
        const data = await apiFetch('/siswa/jadwal');
        if (!data.success) return;
        lmsState.jadwalData = data.data || {};
    } catch(e) { console.warn('[Fetch jadwal]', e.message); }
}

/* ── Fetch: Notifikasi ──────────────────────────────────────── */
async function fetchNotifikasi() {
    try {
        const data = await apiFetch('/lms/notifikasi');
        if (!data.success) return;
        lmsState.unreadNotif = data.unread || 0;
        lmsState.notifikasiData = data.data || [];
        renderNotifikasi(lmsState.notifikasiData);
        renderStudentAnnouncements(lmsState.notifikasiData);

        // Update badge
        const dot = document.querySelector('.tb-dot');
        if (dot) dot.style.display = data.unread > 0 ? '' : 'none';
    } catch(e) { console.warn('[Fetch notif]', e.message); }
}

async function fetchStudentCbtSessions() {
    const list = document.getElementById('student-cbt-sessions');
    if (!list || lmsState.user?.role !== 'siswa') return;
    try {
        const data = await apiFetch('/cbt/student/sessions');
        if (!data.success) return;
        lmsState.cbtSessions = data.data || [];
        renderStudentCbtSessions();
    } catch(e) {
        console.warn('[CBT siswa]', e.message);
        list.innerHTML = '<p style="text-align:center;color:#64748b;padding:20px 0;font-size:.85rem;">Sesi CBT belum bisa dimuat.</p>';
    }
}

function renderStudentAnnouncements(notifs = []) {
    const el = document.getElementById('student-announcements');
    if (!el) return;
    const rows = notifs.slice(0, 5);
    if (!rows.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:20px 0;font-size:.85rem;">Belum ada pengumuman baru.</p>';
        return;
    }
    el.innerHTML = rows.map(n => `
        <div class="student-announcement ${n.is_read ? '' : 'unread'}">
            <span class="sa-icon ${escHtml(n.tipe || 'info')}"><i class="fas fa-${getNotifIcon(n.tipe)}"></i></span>
            <div>
                <strong>${escHtml(n.judul)}</strong>
                <p>${escHtml(n.pesan)}</p>
                <small>${formatRelativeTime(n.created_at)}</small>
            </div>
        </div>
    `).join('');
}

function renderStudentCbtSessions() {
    const el = document.getElementById('student-cbt-sessions');
    const status = document.getElementById('svc-cbt-status');
    if (!el) return;
    const sessions = lmsState.cbtSessions || [];
    const openCount = sessions.filter(s => s.status === 'open' && !s.used).length;
    if (status) status.textContent = openCount ? `${openCount} sesi siap dikerjakan` : 'Cek sesi ujian aktif';
    if (!sessions.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:20px 0;font-size:.85rem;">Belum ada sesi CBT untuk akun kamu.</p>';
        return;
    }
    el.innerHTML = sessions.slice(0, 4).map(s => {
        const open = s.status === 'open' && !s.used;
        const done = !!s.used || s.token_status === 'finished';
        return `
        <div class="student-cbt-item">
            <div class="mt-dot" style="background:${done ? '#10b981' : open ? '#3b82f6' : '#f59e0b'};"></div>
            <div class="mt-info">
                <h4>${escHtml(s.title)}</h4>
                <p>${formatMapelLabel(s.mapel)} · ${escHtml(s.kelas || '-')} · ${s.durasi_menit || '-'} menit</p>
                <p class="cbt-token-line">Token: <code>${escHtml(s.token || '-')}</code></p>
            </div>
            <a class="mt-chip" href="cbt.html" style="background:${open ? '#dbeafe' : '#f1f5f9'};color:${open ? '#1d4ed8' : '#64748b'};">
                ${done ? 'Selesai' : open ? 'Masuk' : 'Draft'}
            </a>
        </div>`;
    }).join('');
}

function renderNotifikasi(notifs) {
    const list = document.getElementById('nd-list') || document.querySelector('.nd-list');
    if (!list) return;
    if (!notifs.length) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#64748b;font-size:.85rem;">Tidak ada notifikasi.</div>';
        return;
    }
    list.innerHTML = notifs.slice(0, 10).map(n => `
        <div class="nd-item ${n.is_read ? '' : 'unread'}">
            <i class="fas fa-${n.tipe === 'tugas' ? 'tasks' : n.tipe === 'nilai' ? 'star' : 'bell'}"
               style="color:${n.tipe === 'tugas' ? '#3b82f6' : n.tipe === 'nilai' ? '#f59e0b' : '#10b981'};"></i>
            <div>
                <strong>${escHtml(n.judul)}</strong>
                <span>${escHtml(n.pesan)}</span>
                <span style="display:block;font-size:.7rem;color:#94a3b8;">${formatRelativeTime(n.created_at)}</span>
            </div>
        </div>
    `).join('');
}

function getNotifIcon(tipe) {
    return {
        tugas: 'tasks',
        nilai: 'star',
        cbt: 'laptop-code',
        warning: 'triangle-exclamation',
        success: 'circle-check',
    }[tipe] || 'bullhorn';
}

/* ── Sidebar navigasi ───────────────────────────────────────── */
function navigate(pageId, btn) {
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.snav-item').forEach(s => s.classList.remove('active'));
    document.getElementById('page-' + pageId)?.classList.add('active');
    if (btn) btn.classList.add('active');
    else document.querySelector(`[data-page="${pageId}"]`)?.classList.add('active');

    document.getElementById('tb-page-name').textContent = {
        beranda:'Beranda', kelas:'Kelas Saya', tugas:'Tugas',
        materi:'Materi', forum:'Forum Diskusi', nilai:'Nilai Saya',
        profil:'Profil & Biodata'
    }[pageId] || 'Dashboard';

    if (pageId === 'profil') fetchProfil(lmsState.targetNisn || '').catch(() => {});
    closeSidebar();
    window.scrollTo(0, 0);
}

function toggleSidebar() {
    document.getElementById('lms-sidebar')?.classList.toggle('open');
    document.getElementById('sb-overlay')?.classList.toggle('open');
}
function closeSidebar() {
    document.getElementById('lms-sidebar')?.classList.remove('open');
    document.getElementById('sb-overlay')?.classList.remove('open');
}

/* ── Dropdown ───────────────────────────────────────────────── */
function toggleNotif() {
    const nd = document.getElementById('notif-dropdown');
    const pd = document.getElementById('profile-dropdown');
    pd?.classList.remove('open');
    nd?.classList.toggle('open');
    // Mark as read
    if (nd?.classList.contains('open') && lmsState.unreadNotif > 0) {
        apiFetch('/lms/notifikasi/read-all', { method: 'PATCH' }).catch(() => {});
        lmsState.unreadNotif = 0;
        const dot = document.querySelector('.tb-dot');
        if (dot) dot.style.display = 'none';
    }
}
function toggleProfile() {
    document.getElementById('notif-dropdown')?.classList.remove('open');
    document.getElementById('profile-dropdown')?.classList.toggle('open');
}
document.addEventListener('click', e => {
    const nd = document.getElementById('notif-dropdown');
    const pd = document.getElementById('profile-dropdown');
    if (nd && !nd.contains(e.target) && !e.target.closest('#notif-btn')) nd.classList.remove('open');
    if (pd && !pd.contains(e.target) && !e.target.closest('.tb-avatar'))  pd.classList.remove('open');
});

/* ── Toast ──────────────────────────────────────────────────── */
function showToast(msg, type = 'green') {
    const colors = { green:'#10b981', blue:'#3b82f6', red:'#ef4444', orange:'#f59e0b' };
    const toast  = document.createElement('div');
    toast.style.cssText = `
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(60px);
        background:${colors[type]||colors.green};color:white;padding:12px 24px;
        border-radius:50px;font-family:inherit;font-size:.88rem;font-weight:700;
        box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:9999;
        display:flex;align-items:center;gap:8px;
        transition:transform .4s cubic-bezier(.25,1,.5,1),opacity .4s;
        opacity:0;pointer-events:none;
    `;
    const icon = document.createElement('i');
    icon.className = type === 'red' ? 'fas fa-circle-exclamation' : 'fas fa-check-circle';
    toast.append(icon, document.createTextNode(String(msg || '')));
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; });
    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(60px)'; toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

async function changePassword() {
    const currentPassword = document.getElementById('pw-current')?.value || '';
    const newPassword = document.getElementById('pw-new')?.value || '';
    const confirmPassword = document.getElementById('pw-confirm')?.value || '';
    const btn = document.getElementById('password-save-btn');

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('Semua kolom password wajib diisi.', 'red');
        return;
    }
    if (newPassword !== confirmPassword) {
        showToast('Konfirmasi password tidak cocok.', 'red');
        return;
    }

    setLoading(btn, true);
    try {
        const res = await apiFetch('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
        });
        if (!res.success) {
            showToast(res.message || 'Gagal mengganti password.', 'red');
            return;
        }
        ['pw-current','pw-new','pw-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        closeModal('modal-password');
        showToast('Password berhasil diganti.', 'green');
    } catch(e) {
        showToast('Gagal mengganti password.', 'red');
    } finally {
        setLoading(btn, false, '<i class="fas fa-key"></i> Simpan Password');
    }
}

/* ── Logout ─────────────────────────────────────────────────── */
function lmsLogout() {
    // Notify server
    const rt = localStorage.getItem('refreshToken');
    if (rt) {
        fetch(`${API}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ refreshToken: rt }),
        }).catch(() => {});
    }
    ['accessToken','refreshToken','userRole','userData','smkn_token','smkn_refresh'].forEach(k => localStorage.removeItem(k));
    lmsState.user = null;
    window.location.replace('/login.html?msg=' + encodeURIComponent('Kamu sudah keluar dari LMS.'));
}

/* ── Helper functions ───────────────────────────────────────── */
function escHtml(str) {
    return String(str || '').replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c])
    );
}

function formatRelativeTime(iso) {
    if (!iso) return '-';
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return 'Baru saja';
    if (diff < 3600)  return `${Math.floor(diff/60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff/3600)} jam lalu`;
    return new Date(iso).toLocaleDateString('id-ID');
}

function getMapelColor(mapel = '') {
    const m = mapel.toLowerCase();
    if (m.includes('komputer') || m.includes('tkj') || m.includes('jaringan')) return '#002244';
    if (m.includes('matematika')) return '#7c3aed';
    if (m.includes('indonesia'))  return '#059669';
    if (m.includes('inggris'))    return '#0891b2';
    if (m.includes('pkk') || m.includes('kewirausahaan')) return '#b45309';
    if (m.includes('sejarah'))    return '#dc2626';
    return '#64748b';
}

function getMapelIcon(mapel = '') {
    const m = mapel.toLowerCase();
    if (m.includes('komputer') || m.includes('tkj') || m.includes('jaringan')) return 'fas fa-network-wired';
    if (m.includes('matematika')) return 'fas fa-square-root-alt';
    if (m.includes('indonesia'))  return 'fas fa-book';
    if (m.includes('inggris'))    return 'fas fa-language';
    if (m.includes('pkk') || m.includes('kewirausahaan')) return 'fas fa-lightbulb';
    return 'fas fa-book-open';
}

function formatMapelLabel(mapel = '') {
    const m = {
        matematika: 'Matematika',
        bindo: 'Bahasa Indonesia',
        basing: 'Bahasa Inggris',
        pkk: 'PKK',
        sejarah: 'Sejarah Indonesia',
        produktif: 'Kompetensi Keahlian',
    };
    return m[mapel] || mapel || '-';
}

function getFileBg(tipe) {
    return { pdf:'#fee2e2', video:'#dbeafe', ppt:'#fef3c7', doc:'#ede9fe', img:'#d1fae5' }[tipe] || '#f1f5f9';
}
function getFileIcon(tipe) {
    return { pdf:'fas fa-file-pdf', video:'fas fa-play-circle', ppt:'fas fa-file-powerpoint', doc:'fas fa-file-word', img:'fas fa-image' }[tipe] || 'fas fa-file';
}
function getFileColor(tipe) {
    return { pdf:'#ef4444', video:'#3b82f6', ppt:'#f59e0b', doc:'#8b5cf6', img:'#10b981' }[tipe] || '#64748b';
}

function handleFileUpload(input) {
    const f = input.files[0];
    if (f) {
        document.getElementById('file-preview').innerHTML =
            `<span><i class="fas fa-paperclip"></i> ${escHtml(f.name)} (${(f.size/1024).toFixed(1)} KB)</span>`;
    }
}

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Cek apakah sudah login (dari auth-guard atau session sebelumnya)
    const existingUser = getUser();
    const token        = localStorage.getItem('accessToken');

    if (existingUser && token) {
        lmsState.user = existingUser;
        initDashboard().then(() => showLmsScreen('lms-dashboard'));
    } else {
        showLmsScreen('lms-login');
    }

    // Drag & drop untuk file upload
    const drop = document.getElementById('file-drop');
    if (drop) {
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.style.borderColor = 'var(--gold)'; });
        drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
        drop.addEventListener('drop', e => {
            e.preventDefault(); drop.style.borderColor = '';
            const f = e.dataTransfer.files[0];
            if (f) {
                document.getElementById('file-preview').innerHTML =
                    `<span><i class="fas fa-paperclip"></i> ${escHtml(f.name)} (${(f.size/1024).toFixed(1)} KB)</span>`;
                // Inject ke input
                const inp = document.getElementById('file-input');
                if (inp) {
                    const dt = new DataTransfer();
                    dt.items.add(f);
                    inp.files = dt.files;
                }
            }
        });
    }

    document.getElementById('profile-form')?.addEventListener('submit', saveProfil);
    document.getElementById('pf-kelas')?.addEventListener('change', (e) => {
        const found = lmsState.schoolClasses.find(k => k.kelas === e.target.value);
        const jurusan = document.getElementById('pf-jurusan');
        if (jurusan) jurusan.value = found?.jurusan || '';
    });
});
