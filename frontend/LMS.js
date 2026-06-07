/* =====================================================
   LMS SMKN 1 TERISI — v2.0 (Real API)
   Menggantikan semua dummy data dengan fetch ke backend
   ===================================================== */
'use strict';

const API = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api'
    : '/api';

/* ── Auth helper (dari auth-guard.js) ──────────────────────── */
function getToken() {
    return localStorage.getItem('studentAccessToken')
        || localStorage.getItem('smkn_token')
        || localStorage.getItem('accessToken')
        || '';
}
function getUser()  {
    try { return JSON.parse(localStorage.getItem('studentUserData') || localStorage.getItem('smkn_user') || localStorage.getItem('userData') || 'null'); } catch { return null; }
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
    forumScope:     'school',
    forumUserClass: null,
    forumRecorder:  null,
    forumAudioChunks: [],
    privateContacts: [],
    activePrivateUserId: null,
    privateMessages: [],
    tugasData:      [],
    taskProgress:   [],
    nilaiData:      [],
    jadwalData:     {},
    profileData:    null,
    schoolClasses:  [],
    targetNisn:     null,
    unreadNotif:    0,
    notifikasiData: [],
    cbtSessions:    [],
    staffStudents:  [],
    staffDetail:    null,
    staffSelectedNisn: null,
    staffFetchTimer: null,
};

const LMS_FEATURES = {
    forumAttachment: true,
    forumVideoAttachment: true,
    forumAudioAttachment: true,
    forumChat: true,
    forumVoiceNote: false,
    localVideoUpload: true,
    kantin: true,
    cbtCameraMonitor: true,
};

const ATTACHMENT_TYPES = {
    image: {
        label: 'Foto',
        hint: 'JPG, JPEG, PNG, WEBP, GIF',
        icon: 'fa-image',
        accept: '.jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif',
        mimes: ['image/jpeg','image/png','image/webp','image/gif'],
        max: 1 * 1024 * 1024,
    },
    document: {
        label: 'Dokumen',
        hint: 'PDF, DOC, PPT, XLS, TXT',
        icon: 'fa-file-lines',
        accept: '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain',
        mimes: ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain'],
        max: 3 * 1024 * 1024,
    },
    video: {
        label: 'Video',
        hint: 'MP4, WEBM, MOV',
        icon: 'fa-video',
        accept: '.mp4,.webm,.mov,video/mp4,video/webm,video/quicktime',
        mimes: ['video/mp4','video/webm','video/quicktime'],
        max: 5 * 1024 * 1024,
    },
    audio: {
        label: 'Audio',
        hint: 'MP3, WAV, OGG',
        icon: 'fa-microphone',
        accept: '.mp3,.wav,.ogg,.webm,audio/mpeg,audio/wav,audio/ogg,audio/webm',
        mimes: ['audio/mpeg','audio/wav','audio/ogg','audio/webm'],
        max: 3 * 1024 * 1024,
    },
};

const ATTACHMENT_EXTENSIONS = {
    image: ['.jpg','.jpeg','.png','.webp','.gif'],
    document: ['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.txt'],
    video: ['.mp4','.webm','.mov'],
    audio: ['.mp3','.wav','.ogg','.webm'],
};

const attachmentPreviewUrls = { forum: null, kantinChat: null, staffMateri: null, tugas: null };
const STUDENT_BIODATA_REQUIRED = [
    ['pf-email', 'Email'],
    ['pf-phone', 'No. HP'],
    ['pf-kelas', 'Kelas'],
    ['pf-tempat', 'Tempat lahir'],
    ['pf-tanggal', 'Tanggal lahir'],
    ['pf-gender', 'Jenis kelamin'],
    ['pf-agama', 'Agama'],
    ['pf-alamat', 'Alamat'],
    ['pf-kelurahan', 'Kelurahan'],
    ['pf-kecamatan', 'Kecamatan'],
    ['pf-ayah', 'Nama ayah'],
    ['pf-pekerjaan-ayah', 'Pekerjaan ayah'],
    ['pf-ibu', 'Nama ibu'],
    ['pf-pekerjaan-ibu', 'Pekerjaan ibu'],
    ['pf-hp-ortu', 'No. HP orang tua'],
    ['pf-email-ortu', 'Email orang tua'],
];

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
        openInitialHashPage();

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
        : '<i class="fas fa-envelope"></i> Email';
    const inp = document.getElementById('lf-user');
    if (inp) inp.placeholder = role === 'siswa' ? 'Masukkan NISN kamu' : 'Masukkan email akun sekolah';
}

/* ── Init Dashboard (fetch semua data dari API) ─────────────── */
async function initDashboard() {
    const u = lmsState.user || getUser();
    if (!u) return;
    lmsState.user = u;
    await loadLmsFeatures();

    // Update UI user info
    const firstName = (u.nama || u.nama_lengkap || '').split(' ')[0] || (canEditBiodata() ? 'Staff' : 'Siswa');
    document.getElementById('tb-user-name').textContent      = firstName;
    document.getElementById('tb-avatar-circle').textContent  = (u.nama || u.nama_lengkap || 'S').charAt(0);
    document.getElementById('pd-avatar').textContent         = (u.nama || u.nama_lengkap || 'S').charAt(0);
    document.getElementById('pd-name').textContent           = u.nama || u.nama_lengkap || '-';
    document.getElementById('pd-role').textContent           = u.role === 'siswa' ? 'Siswa Aktif' : 'Guru / Staf';
    document.getElementById('wb-greeting').textContent       = `${getGreeting()}, ${firstName} 👋`;
    const fcAv = document.getElementById('fc-avatar');
    if (fcAv) fcAv.textContent = (u.nama || u.nama_lengkap || 'S').charAt(0);
    configureDashboardForRole();

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
        fetchPrivateContacts(),
        fetchNilai(),
        fetchJadwal(),
        fetchNotifikasi(),
        fetchStudentCbtSessions(),
        fetchProfil(),
        loadSchoolClasses(),
        fetchStaffStudents(),
        fetchTaskProgress(),
    ]);

    await fetchKelas();
    syncStaffTaskTargetMode();
}

function openInitialHashPage() {
    const target = (location.hash || '').replace('#', '').trim();
    const allowed = ['beranda','kelas','tugas','materi','forum','nilai','profil','kantin','staff'];
    if (!target || !allowed.includes(target)) return;
    if (target === 'staff' && !canEditBiodata()) return;
    navigate(target, document.querySelector(`[data-page="${target}"]`));
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
            'sc-nilai':    d.nilai_stats?.jumlah ? Number(d.nilai_stats.rata || 0).toFixed(1) : '-',
            'sc-kehadiran': d.persen_hadir !== undefined ? `${d.persen_hadir}%` : '-',
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
        const options = lmsState.schoolClasses.map(k =>
            `<option value="${escHtml(k.kelas)}">${escHtml(k.kelas)} - ${escHtml(k.jurusan)}</option>`
        ).join('');
        if (select) {
            select.innerHTML = '<option value="">Pilih kelas</option>' + options;
            if (lmsState.profileData?.profil?.kelas) select.value = lmsState.profileData.profil.kelas;
        }
        ['staff-class-filter','staff-task-kelas','staff-task-classes','staff-materi-kelas','forum-kelas'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const label = id === 'staff-class-filter' ? 'Semua kelas' : 'Pilih kelas';
            const current = el.value;
            el.innerHTML = id === 'staff-task-classes' ? options : `<option value="">${label}</option>${options}`;
            if (current && id !== 'staff-task-classes') el.value = current;
        });
    } catch(e) { console.warn('[Classes]', e.message); }
}

function canEditBiodata() {
    return ['guru','tata_usaha','kepala_sekolah','wakil_kepala_sekolah','super_admin'].includes(lmsState.user?.role);
}

function canEditProfileBiodata() {
    return canEditBiodata() || lmsState.user?.role === 'siswa';
}

function toggleCbtNav() {
    document.getElementById('snav-cbt-menu')?.classList.toggle('open');
}

async function loadLmsFeatures() {
    try {
        const res = await fetch(`${API}/features`);
        const json = await res.json();
        if (json.success && json.data) Object.assign(LMS_FEATURES, json.data);
    } catch {
        // Pakai default lokal jika endpoint konfigurasi belum tersedia.
    }
}

function configureDashboardForRole() {
    const staff = canEditBiodata();
    const role = lmsState.user?.role || '';
    const isWali = role === 'wali_murid';
    const isStudent = role === 'siswa';
    document.body.classList.toggle('staff-mode', staff);
    document.querySelectorAll('.staff-only').forEach(el => el.classList.toggle('hidden', !staff));
    document.querySelectorAll('[data-page="forum"]').forEach(el => el.classList.toggle('hidden', isWali || !LMS_FEATURES.forumChat));
    document.querySelectorAll('[data-page="kantin"]').forEach(el => el.classList.toggle('hidden', !isStudent || !LMS_FEATURES.kantin));
    document.querySelectorAll('[data-page="kelas"]').forEach(el => el.classList.toggle('hidden', isWali));
    document.querySelectorAll('[onclick*="chooseForumAttachment"][onclick*="video"]').forEach(el => el.classList.toggle('hidden', !LMS_FEATURES.forumVideoAttachment));
    document.querySelectorAll('[onclick*="chooseForumAttachment"][onclick*="audio"]').forEach(el => el.classList.toggle('hidden', !LMS_FEATURES.forumAudioAttachment));
    document.querySelectorAll('[onclick*="chooseKantinChatAttachment"][onclick*="video"]').forEach(el => el.classList.toggle('hidden', !LMS_FEATURES.forumVideoAttachment));
    document.querySelectorAll('[onclick*="chooseKantinChatAttachment"][onclick*="audio"]').forEach(el => el.classList.toggle('hidden', !LMS_FEATURES.forumAudioAttachment));
    document.querySelectorAll('#forum-vn-btn').forEach(el => el.classList.toggle('hidden', !LMS_FEATURES.forumVoiceNote));
    document.querySelectorAll('[onclick*="chooseStaffMateriAttachment"][onclick*="video"]').forEach(el => el.classList.toggle('hidden', !LMS_FEATURES.localVideoUpload));

    const welcome = document.querySelector('.wb-text p');
    if (welcome) {
        welcome.innerHTML = staff
            ? 'Pantau administrasi kelas, profil siswa, materi, tugas, nilai, dan absensi dari satu dashboard.'
            : 'Yuk lanjutkan belajar hari ini. Cek tugas, CBT, materi, dan pengumuman terbaru kamu.';
    }

    const roleLabels = {
        kelas: staff ? 'Kelas / Siswa' : 'Kelas Saya',
        tugas: staff ? 'Tugas Kelas' : 'Tugas',
        nilai: staff ? 'Nilai Siswa' : 'Nilai Saya',
        profil: staff ? 'Profil Siswa' : isWali ? 'Profil Anak' : 'Profil & Biodata',
    };
    Object.entries(roleLabels).forEach(([page, label]) => {
        const span = document.querySelector(`[data-page="${page}"] span`);
        if (span) span.textContent = label;
    });
    document.getElementById('forum-kelas')?.classList.toggle('hidden', !(staff && lmsState.forumScope === 'class'));
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
    if (el) el.textContent = value === undefined || value === null || value === '' ? '-' : value;
}

function renderProfil() {
    const data = lmsState.profileData;
    const staffEditable = canEditBiodata();
    const editable = canEditProfileBiodata();
    document.getElementById('staff-target')?.classList.toggle('hidden', !staffEditable);
    if (!data) {
        setText('profile-name', staffEditable ? 'Pilih siswa' : '-');
        setText('profile-meta', staffEditable ? 'Masukkan NISN untuk memuat biodata' : '-');
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
        lock.innerHTML = staffEditable
            ? '<i class="fas fa-unlock"></i> Mode staff aktif: biodata siswa bisa diperbarui.'
            : '<i class="fas fa-circle-check"></i> Lengkapi biodata sendiri. Simpan hanya jika semua data sudah benar.';
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
    const staffEditable = canEditBiodata();
    const editable = canEditProfileBiodata();
    if (staffEditable && !lmsState.targetNisn) {
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

    if (lmsState.user?.role === 'siswa') {
        const missing = STUDENT_BIODATA_REQUIRED
            .filter(([id]) => !String(document.getElementById(id)?.value || '').trim())
            .map(([, label]) => label);
        if (missing.length) {
            showToast(`Lengkapi dulu: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ', dan lainnya' : ''}.`, 'red');
            document.getElementById(STUDENT_BIODATA_REQUIRED.find(([id]) => !String(document.getElementById(id)?.value || '').trim())?.[0])?.focus();
            return;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email || '')) {
            showToast('Format email siswa belum valid.', 'red');
            document.getElementById('pf-email')?.focus();
            return;
        }
        if (!/^[0-9+\-\s]{8,24}$/.test(payload.no_hp || '') || !/^[0-9+\-\s]{8,24}$/.test(payload.no_hp_ortu || '')) {
            showToast('Nomor HP siswa dan orang tua harus valid.', 'red');
            return;
        }
        if (!confirm('Apakah kamu yakin semua biodata sudah diisi dengan benar? Data ini akan dipakai untuk administrasi sekolah.')) return;
    }

    setLoading(btn, true);
    try {
        const target = staffEditable && lmsState.targetNisn ? `?nisn=${encodeURIComponent(lmsState.targetNisn)}` : '';
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

/* ── Guru/Staff Workspace ──────────────────────────────────── */
function debouncedFetchStaffStudents() {
    clearTimeout(lmsState.staffFetchTimer);
    lmsState.staffFetchTimer = setTimeout(() => fetchStaffStudents(), 350);
}

async function fetchStaffStudents() {
    if (!canEditBiodata()) return;
    const list = document.getElementById('staff-student-list');
    if (list) list.innerHTML = '<p class="staff-empty"><i class="fas fa-spinner fa-spin"></i> Memuat daftar siswa...</p>';
    const params = new URLSearchParams({ limit: 50 });
    const search = document.getElementById('staff-search')?.value.trim();
    const kelas = document.getElementById('staff-class-filter')?.value;
    if (search) params.set('search', search);
    if (kelas) params.set('kelas', kelas);
    try {
        const data = await apiFetch(`/siswa/staff/list?${params.toString()}`);
        if (!data.success) {
            if (list) list.innerHTML = `<p class="staff-empty">${escHtml(data.message || 'Gagal memuat siswa.')}</p>`;
            return;
        }
        lmsState.staffStudents = data.data?.students || [];
        renderStaffStudents(data.data?.pagination || {});
    } catch(e) {
        if (list) list.innerHTML = '<p class="staff-empty">Gagal memuat siswa. Cek koneksi server.</p>';
    }
}

function staffStudentFlags(student) {
    const incomplete = !student.kelas || !student.no_hp || !student.email;
    const lowScore = student.last_nilai !== null && student.last_nilai !== undefined && Number(student.last_nilai) < 70;
    const noAcademic = Number(student.total_nilai || 0) === 0 && Number(student.total_ujian || 0) === 0;
    return { incomplete, lowScore, noAcademic, risk: incomplete || lowScore || noAcademic };
}

function renderStaffStudents(pagination = {}) {
    const list = document.getElementById('staff-student-list');
    if (!list) return;
    const rows = lmsState.staffStudents || [];
    const risky = rows.filter(s => staffStudentFlags(s).risk).length;
    const incomplete = rows.filter(s => staffStudentFlags(s).incomplete).length;
    const withCbt = rows.filter(s => Number(s.total_ujian || 0) > 0).length;
    setText('staff-total-students', pagination.total || rows.length);
    setText('staff-risk-students', risky);
    setText('staff-incomplete-students', incomplete);
    setText('staff-cbt-students', withCbt);

    if (!rows.length) {
        list.innerHTML = '<p class="staff-empty">Tidak ada siswa yang cocok dengan filter.</p>';
        return;
    }
    list.innerHTML = rows.map(s => {
        const flags = staffStudentFlags(s);
        const initials = (s.nama_lengkap || 'S').split(' ').slice(0,2).map(w => w.charAt(0)).join('').toUpperCase();
        return `
            <button class="staff-student-row ${lmsState.staffSelectedNisn === s.nisn ? 'active' : ''}" onclick="openStaffStudent('${escHtml(s.nisn)}')">
                <span class="staff-avatar">${initials}</span>
                <span class="staff-row-main">
                    <strong>${escHtml(s.nama_lengkap || '-')}</strong>
                    <small>${escHtml(s.nisn || '-')} · ${escHtml(s.kelas || 'Kelas belum diisi')}</small>
                </span>
                <span class="staff-row-tags">
                    ${flags.lowScore ? '<em class="danger">Nilai rendah</em>' : ''}
                    ${flags.incomplete ? '<em>Profil</em>' : ''}
                    ${Number(s.total_ujian || 0) ? `<em>${Number(s.total_ujian)} CBT</em>` : ''}
                </span>
            </button>
        `;
    }).join('');
}

async function openStaffStudent(nisn) {
    if (!nisn) return;
    lmsState.staffSelectedNisn = nisn;
    ['staff-grade-nisn','staff-att-nisn','profile-target-nisn'].forEach(id => setVal(id, nisn));
    renderStaffStudents();
    const empty = document.getElementById('staff-detail-empty');
    const panel = document.getElementById('staff-detail-panel');
    if (empty) empty.classList.add('hidden');
    if (panel) panel.classList.remove('hidden');
    document.getElementById('staff-detail-body').innerHTML = '<p class="staff-empty"><i class="fas fa-spinner fa-spin"></i> Memuat detail siswa...</p>';
    try {
        const data = await apiFetch(`/siswa/staff/${encodeURIComponent(nisn)}/detail`);
        if (!data.success) {
            document.getElementById('staff-detail-body').innerHTML = `<p class="staff-empty">${escHtml(data.message || 'Detail siswa tidak ditemukan.')}</p>`;
            return;
        }
        lmsState.staffDetail = data.data;
        renderStaffStudentDetail(data.data);
    } catch(e) {
        document.getElementById('staff-detail-body').innerHTML = '<p class="staff-empty">Gagal memuat detail siswa.</p>';
    }
}

function renderStaffStudentDetail(data) {
    const s = data.student || {};
    const nilai = data.nilai || [];
    const tugas = data.tugas || [];
    const cbt = data.cbt || [];
    const hadir = data.kehadiranSummary || {};
    const serverSummary = data.nilaiSummary || {};
    const gradeSummary = Number(serverSummary.jumlah || 0) ? {
        total: Number(serverSummary.jumlah || 0),
        avg: Number(serverSummary.rata || 0).toFixed(1),
        high: Number(serverSummary.max || 0).toFixed(1),
        low: Number(serverSummary.min || 0).toFixed(1),
        pass: Number(serverSummary.lulus || 0),
    } : null;
    const avg = gradeSummary ? gradeSummary.avg : '-';
    setText('staff-detail-name', s.nama_lengkap || '-');
    setText('staff-detail-meta', `${s.nisn || '-'} · ${s.kelas || 'Kelas belum diisi'} · ${s.jurusan || '-'}`);
    document.getElementById('staff-detail-quick').innerHTML = `
        <span><strong>${avg}</strong><small>Rata nilai</small></span>
        <span><strong>${hadir.hadir || 0}</strong><small>Hadir</small></span>
        <span><strong>${tugas.length}</strong><small>Submission</small></span>
        <span><strong>${cbt.length}</strong><small>CBT</small></span>
    `;
    document.getElementById('staff-detail-body').innerHTML = `
        <div class="staff-detail-section">
            <h4>Rekap Nilai Lengkap</h4>
            ${gradeSummary ? `
                <div class="staff-grade-summary">
                    <span><strong>${gradeSummary.avg}</strong><small>Rata-rata</small></span>
                    <span><strong>${gradeSummary.high}</strong><small>Tertinggi</small></span>
                    <span><strong>${gradeSummary.low}</strong><small>Terendah</small></span>
                    <span><strong>${gradeSummary.pass}/${gradeSummary.total}</strong><small>Lulus KKM</small></span>
                </div>
            ` : '<p class="staff-empty">Belum ada nilai.</p>'}
            ${nilai.map(n => `<div class="staff-mini-row"><span>${escHtml(n.mapel)} · ${escHtml(n.semester)} · KKM ${escHtml(n.kkm ?? 70)}</span><strong>${escHtml(n.nilai_final ?? '-')}</strong></div>`).join('')}
        </div>
        <div class="staff-detail-section">
            <h4>Tugas Dikumpulkan</h4>
            ${tugas.slice(0, 5).map(t => `<div class="staff-mini-row"><span>${escHtml(t.judul || 'Tugas')} · ${formatRelativeTime(t.submitted_at)}</span><strong>${escHtml(t.nilai ?? t.status ?? '-')}</strong></div>`).join('') || '<p class="staff-empty">Belum ada submission tugas.</p>'}
        </div>
        <div class="staff-detail-section">
            <h4>Histori CBT</h4>
            ${cbt.slice(0, 5).map(c => `<div class="staff-mini-row"><span>${escHtml(c.exam_title || c.mapel || 'CBT')} · ${formatRelativeTime(c.selesai_at)}</span><strong>${escHtml(c.nilai ?? '-')}</strong></div>`).join('') || '<p class="staff-empty">Belum ada histori CBT.</p>'}
        </div>
    `;
}

function syncStaffTaskTargetMode() {
    const mode = document.querySelector('input[name="staff-task-target"]:checked')?.value || 'class';
    const classSelect = document.getElementById('staff-task-classes');
    const nisnList = document.getElementById('staff-task-nisn-list');
    const nisnField = nisnList?.closest('.staff-field');
    if (classSelect) {
        classSelect.style.display = mode === 'student' ? 'none' : '';
        classSelect.setAttribute('aria-hidden', mode === 'student' ? 'true' : 'false');
    }
    if (nisnList) {
        nisnList.style.display = mode === 'class' ? 'none' : '';
        nisnList.setAttribute('aria-hidden', mode === 'class' ? 'true' : 'false');
    }
    if (nisnField) {
        nisnField.style.display = mode === 'class' ? 'none' : '';
    }
}

async function createStaffTask() {
    const mode = document.querySelector('input[name="staff-task-target"]:checked')?.value || 'class';
    const selectedClasses = Array.from(document.getElementById('staff-task-classes')?.selectedOptions || [])
        .map(opt => opt.value)
        .filter(Boolean);
    const legacyClass = document.getElementById('staff-task-kelas')?.value;
    const mapelList = String(document.getElementById('staff-task-mapel')?.value || '')
        .split(/[,;\n]/)
        .map(v => v.trim())
        .filter(Boolean);
    const targetNisnList = String(document.getElementById('staff-task-nisn-list')?.value || '')
        .split(/[,;\n\s]+/)
        .map(v => v.replace(/\D/g, '').slice(0, 10))
        .filter(v => v.length === 10);
    const payload = {
        judul: document.getElementById('staff-task-title')?.value.trim(),
        mapel_list: mapelList,
        kelas_list: mode === 'student' ? [] : (selectedClasses.length ? selectedClasses : (legacyClass ? [legacyClass] : [])),
        target_nisn_list: mode === 'class' ? [] : targetNisnList,
        deadline: document.getElementById('staff-task-deadline')?.value || null,
        deskripsi: document.getElementById('staff-task-desc')?.value.trim() || null,
        show_score: document.getElementById('staff-task-show-score')?.checked ? 1 : 0,
    };
    if (!payload.judul || !payload.mapel_list.length || (!payload.kelas_list.length && !payload.target_nisn_list.length)) {
        return showToast('Judul, minimal 1 mapel, dan target kelas atau NISN siswa wajib diisi.', 'red');
    }
    try {
        const res = await apiFetch('/lms/tugas', { method:'POST', body:JSON.stringify(payload) });
        showToast(res.message || (res.success ? 'Tugas diterbitkan.' : 'Gagal membuat tugas.'), res.success ? 'green' : 'red');
        if (res.success) {
            ['staff-task-title','staff-task-mapel','staff-task-deadline','staff-task-desc'].forEach(id => setVal(id, ''));
            setVal('staff-task-nisn-list', '');
            const showScore = document.getElementById('staff-task-show-score');
            if (showScore) showScore.checked = true;
            Array.from(document.getElementById('staff-task-classes')?.options || []).forEach(opt => { opt.selected = false; });
            await fetchTugas();
            await fetchTaskProgress();
        }
    } catch(e) { showToast('Gagal membuat tugas.', 'red'); }
}

async function fetchTaskProgress() {
    if (!canEditBiodata()) return;
    const el = document.getElementById('task-progress-list');
    if (el) el.innerHTML = '<p class="staff-empty"><i class="fas fa-spinner fa-spin"></i> Memuat progress tugas...</p>';
    try {
        const data = await apiFetch('/lms/tugas/progress');
        if (!data.success) {
            if (el) el.innerHTML = `<p class="staff-empty">${escHtml(data.message || 'Gagal memuat progress tugas.')}</p>`;
            return;
        }
        lmsState.taskProgress = data.data || [];
        renderTaskProgress();
    } catch(e) {
        if (el) el.innerHTML = '<p class="staff-empty">Gagal memuat progress tugas.</p>';
    }
}

function renderTaskProgress() {
    const el = document.getElementById('task-progress-list');
    if (!el) return;
    if (!lmsState.taskProgress.length) {
        el.innerHTML = '<p class="staff-empty">Belum ada tugas aktif dari akun guru ini.</p>';
        return;
    }
    el.innerHTML = lmsState.taskProgress.map(t => {
        const total = Number(t.total_siswa || 0);
        const done = Number(t.total_selesai || 0);
        const reviewed = Number(t.total_direview || 0);
        const pct = total ? Math.round((done / total) * 100) : 0;
        const reviewPct = done ? Math.round((reviewed / done) * 100) : 0;
        const scoreVisible = Number(t.show_score ?? 1) !== 0;
        const belum = Array.isArray(t.belum) ? t.belum : [];
        return `
            <article class="task-progress-card">
                <div class="task-progress-head">
                    <div>
                        <strong>${escHtml(t.judul)}</strong>
                        <span>${t.target_nisn ? 'Individu ' + escHtml(t.target_nisn) + ' · ' : ''}${escHtml(t.kelas)} · ${escHtml(t.mapel)}</span>
                    </div>
                    <b>${done}/${total}</b>
                </div>
                <div class="task-progress-bar" aria-label="${pct}% selesai">
                    <span style="width:${pct}%"></span>
                </div>
                <div class="task-progress-meta">
                    <span>${pct}% selesai</span>
                    <span>${reviewed}/${done} direview (${reviewPct}%)</span>
                    <span>${t.deadline ? 'DL ' + new Date(t.deadline).toLocaleDateString('id-ID') : 'Tanpa deadline'}</span>
                </div>
                <div class="task-status-row">
                    <span class="task-status-chip submitted"><i class="fas fa-inbox"></i>${done} terkumpul</span>
                    <span class="task-status-chip ${reviewed ? 'reviewed' : 'pending'}"><i class="fas fa-pen-to-square"></i>${reviewed} direview</span>
                    <span class="task-status-chip ${scoreVisible ? 'visible' : 'private'}"><i class="fas ${scoreVisible ? 'fa-eye' : 'fa-eye-slash'}"></i>${scoreVisible ? 'Nilai tampil' : 'Nilai rahasia'}</span>
                </div>
                <button type="button" class="staff-mini-btn" onclick="fetchTaskSubmissions('${escAttr(t.id)}')"><i class="fas fa-eye"></i> Tinjau Jawaban</button>
                ${belum.length ? `<details class="task-missing"><summary>Belum mengumpulkan (${Math.max(0, total - done)})</summary><p>${belum.map(escHtml).join('<br>')}</p></details>` : '<p class="task-complete">Semua siswa aktif sudah mengumpulkan.</p>'}
            </article>
        `;
    }).join('');
}

async function fetchTaskSubmissions(taskId) {
    const panel = document.getElementById('task-review-panel');
    if (!panel || !taskId) return;
    panel.innerHTML = '<p class="staff-empty"><i class="fas fa-spinner fa-spin"></i> Memuat jawaban siswa...</p>';
    try {
        const data = await apiFetch(`/lms/tugas/${encodeURIComponent(taskId)}/submissions`);
        if (!data.success) {
            panel.innerHTML = `<p class="staff-empty">${escHtml(data.message || 'Gagal memuat jawaban siswa.')}</p>`;
            return;
        }
        const rows = data.data?.submissions || [];
        const task = data.data?.task || {};
        const scoreVisible = Number(task.show_score ?? 1) !== 0;
        if (!rows.length) {
            panel.innerHTML = `<div class="task-review-head"><strong>${escHtml(task.judul || 'Tugas')}</strong><span>Belum ada submission.</span></div>`;
            return;
        }
        panel.innerHTML = `
            <div class="task-review-head">
                <strong>${escHtml(task.judul || 'Tugas')}</strong>
                <span>${escHtml(task.kelas || '-')} · ${escHtml(task.mapel || '-')} · ${rows.length} submission · ${scoreVisible ? 'nilai tampil ke siswa' : 'nilai rahasia'}</span>
            </div>
            ${rows.map(row => `
                <article class="task-review-card">
                    <div class="task-review-meta">
                        <strong>${escHtml(row.nama_lengkap || row.nisn || 'Siswa')}</strong>
                        <span>${escHtml(row.nisn || '-')} · ${row.submitted_at ? new Date(row.submitted_at).toLocaleString('id-ID') : '-'}</span>
                    </div>
                    <div class="task-status-row">
                        <span class="task-status-chip submitted"><i class="fas fa-circle-check"></i> Tugas terkumpul</span>
                        <span class="task-status-chip ${row.status === 'dinilai' ? 'reviewed' : 'pending'}"><i class="fas ${row.status === 'dinilai' ? 'fa-check-double' : 'fa-hourglass-half'}"></i> ${row.status === 'dinilai' ? 'Sudah direview' : 'Belum direview'}</span>
                        <span class="task-status-chip ${scoreVisible ? 'visible' : 'private'}"><i class="fas ${scoreVisible ? 'fa-eye' : 'fa-eye-slash'}"></i> ${scoreVisible ? 'Nilai tampil' : 'Nilai rahasia'}</span>
                    </div>
                    ${row.jawaban ? `<p>${escHtml(row.jawaban)}</p>` : '<p class="muted">Tidak ada jawaban teks.</p>'}
                    ${row.file_url ? renderAttachmentPreview({ url: row.file_url, name: row.file_url.split('/').pop(), type: '' }, { compact:true }) : ''}
                    <div class="task-grade-row">
                        <input type="number" min="0" max="100" value="${row.nilai ?? ''}" placeholder="Nilai" id="task-grade-${escAttr(row.nisn)}">
                        <input type="text" value="${escAttr(row.feedback || '')}" placeholder="Feedback singkat" id="task-feedback-${escAttr(row.nisn)}">
                        <button type="button" onclick="saveTaskSubmissionGrade('${escAttr(task.id)}','${escAttr(row.nisn)}')"><i class="fas fa-save"></i> ${scoreVisible ? 'Simpan Review & Rekap' : 'Simpan Review Internal'}</button>
                    </div>
                </article>
            `).join('')}
        `;
    } catch(e) {
        panel.innerHTML = '<p class="staff-empty">Gagal memuat jawaban siswa.</p>';
    }
}

async function saveTaskSubmissionGrade(taskId, nisn) {
    const nilai = document.getElementById(`task-grade-${nisn}`)?.value;
    const feedback = document.getElementById(`task-feedback-${nisn}`)?.value.trim();
    if (nilai === '' || Number(nilai) < 0 || Number(nilai) > 100) return showToast('Nilai harus 0-100.', 'red');
    try {
        const res = await apiFetch(`/lms/tugas/${encodeURIComponent(taskId)}/nilai/${encodeURIComponent(nisn)}`, {
            method:'PATCH',
            body:JSON.stringify({ nilai:Number(nilai), feedback }),
        });
        showToast(res.message || 'Nilai tersimpan.', res.success ? 'green' : 'red');
        if (res.success) {
            await fetchTaskProgress();
            await fetchTaskSubmissions(taskId);
            if (lmsState.staffSelectedNisn === nisn) await openStaffStudent(nisn);
        }
    } catch(e) {
        showToast('Gagal menyimpan nilai tugas.', 'red');
    }
}

async function uploadStaffMateri() {
    const file = document.getElementById('staff-materi-file')?.files?.[0];
    const kelas = document.getElementById('staff-materi-kelas')?.value;
    if (!file || !kelas) return showToast('Pilih kelas dan file materi dulu.', 'red');
    const form = new FormData();
    form.append('file', file);
    form.append('kelas', kelas);
    try {
        const res = await fetch(`${API}/upload/materi`, {
            method:'POST',
            headers:{ Authorization:`Bearer ${getToken()}` },
            body:form,
        });
        const json = await res.json();
        showToast(json.message || (json.success ? 'Materi diupload.' : 'Upload gagal.'), json.success ? 'green' : 'red');
        if (json.success) {
            clearStaffMateriAttachment();
            await fetchMateri();
        }
    } catch(e) { showToast('Upload materi gagal.', 'red'); }
}

function chooseStaffMateriAttachment(kind) {
    chooseAttachmentFile('staff-materi-file', kind);
}

function previewStaffMateriAttachment() {
    const input = document.getElementById('staff-materi-file');
    const preview = document.getElementById('staff-materi-preview');
    const file = input?.files?.[0];
    if (!file) return clearStaffMateriAttachment();
    if (!validateStudentAttachment(file)) return clearStaffMateriAttachment();
    if (preview) preview.innerHTML = renderSelectedAttachmentPreview(file, 'staffMateri');
}

function clearStaffMateriAttachment() {
    revokeAttachmentPreview('staffMateri');
    const input = document.getElementById('staff-materi-file');
    const preview = document.getElementById('staff-materi-preview');
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
}

async function saveStaffGrade() {
    const payload = {
        nisn: document.getElementById('staff-grade-nisn')?.value.trim(),
        semester: document.getElementById('staff-grade-semester')?.value,
        mapel: document.getElementById('staff-grade-mapel')?.value.trim(),
        uh: Number(document.getElementById('staff-grade-uh')?.value || 0),
        uts: Number(document.getElementById('staff-grade-uts')?.value || 0),
        uas: Number(document.getElementById('staff-grade-uas')?.value || 0),
        tugas: Number(document.getElementById('staff-grade-tugas')?.value || 0),
        kkm: Number(document.getElementById('staff-grade-kkm')?.value || 70),
    };
    if (!payload.nisn || !payload.mapel) return showToast('NISN dan mapel wajib diisi.', 'red');
    try {
        const res = await apiFetch('/siswa/nilai', { method:'POST', body:JSON.stringify(payload) });
        showToast(res.message || 'Nilai tersimpan.', res.success ? 'green' : 'red');
        if (res.success && payload.nisn === lmsState.staffSelectedNisn) await openStaffStudent(payload.nisn);
    } catch(e) { showToast('Gagal menyimpan nilai.', 'red'); }
}

async function saveStaffAttendance() {
    const tanggal = document.getElementById('staff-att-date')?.value || new Date().toISOString().slice(0, 10);
    const payload = {
        nisn: document.getElementById('staff-att-nisn')?.value.trim(),
        tanggal,
        hari: new Date(tanggal).toLocaleDateString('id-ID', { weekday:'long' }),
        status: document.getElementById('staff-att-status')?.value,
        keterangan: document.getElementById('staff-att-note')?.value.trim(),
    };
    if (!payload.nisn || !payload.tanggal || !payload.status) return showToast('NISN, tanggal, dan status wajib diisi.', 'red');
    try {
        const res = await apiFetch('/siswa/kehadiran', { method:'POST', body:JSON.stringify(payload) });
        showToast(res.message || 'Absensi tersimpan.', res.success ? 'green' : 'red');
        if (res.success && payload.nisn === lmsState.staffSelectedNisn) await openStaffStudent(payload.nisn);
    } catch(e) { showToast('Gagal menyimpan absensi.', 'red'); }
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
        const belum = canEditBiodata()
            ? lmsState.tugasData.length
            : lmsState.tugasData.filter(t => !t.submission_id).length;
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
        el.innerHTML = '<div class="empty-state"><i class="fas fa-clipboard-check"></i><strong>Tidak ada tugas</strong><span>Filter ini sedang kosong. Mantap, area kerja kamu bersih.</span></div>';
        return;
    }

    el.innerHTML = list.map(t => {
        const staffView = canEditBiodata();
        const isDone     = !!t.submission_id;
        const isLate     = t.deadline && new Date(t.deadline) < new Date() && !isDone;
        const prioritas  = isLate ? 'red' : isDone ? 'green' : 'orange';
        const totalSiswa = Number(t.total_siswa || 0);
        const totalSelesai = Number(t.total_selesai || 0);
        const progressPct = totalSiswa ? Math.round((totalSelesai / totalSiswa) * 100) : 0;
        const deadlineFmt = t.deadline
            ? new Date(t.deadline).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })
            : 'Tidak ada deadline';
        const deadlineDetail = t.deadline
            ? new Date(t.deadline).toLocaleString('id-ID', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
            : 'Fleksibel';
        const reviewed = t.submission_status === 'dinilai';
        const scoreHidden = Number(t.show_score ?? 1) === 0;
        const hasVisibleScore = t.submission_nilai !== null && t.submission_nilai !== undefined && t.submission_nilai !== '';
        const statusLabel = staffView
            ? `${progressPct}% terkumpul`
            : reviewed ? (scoreHidden ? 'Selesai, nilai tidak ditampilkan' : 'Sudah direview')
            : isDone ? 'Terkumpul, menunggu review'
            : isLate ? 'Lewat deadline'
            : 'Perlu dikerjakan';

        return `
        <div class="tugas-item ${isDone ? 'done' : ''}" id="tugas-item-${t.id}">
            <div class="ti-icon" style="background:${getMapelColor(t.mapel)}20;">
                <i class="${getMapelIcon(t.mapel)}" style="color:${getMapelColor(t.mapel)};"></i>
            </div>
            <div class="ti-info">
                <div class="ti-title-row">
                    <h4>${escHtml(t.judul)}</h4>
                    <span class="status-pill ${staffView ? 'info' : prioritas}">${escHtml(statusLabel)}</span>
                </div>
                <div class="ti-meta">
                    <span><i class="fas fa-book"></i>${escHtml(t.mapel || 'Mapel')}</span>
                    <span><i class="fas fa-users"></i>${t.target_nisn ? `Individu ${escHtml(t.target_nisn)}` : escHtml(t.kelas || 'Kelas')}</span>
                    <span><i class="fas fa-clock"></i>${escHtml(deadlineDetail)}</span>
                </div>
                ${hasVisibleScore ? `<p class="ti-score">Nilai: ${escHtml(t.submission_nilai)}</p>` : ''}
                ${reviewed && scoreHidden ? '<p class="ti-score muted">Tugas sudah selesai dan direview. Nilai tidak ditampilkan untuk tugas ini.</p>' : ''}
                ${staffView ? `<p class="task-inline-progress">${totalSelesai}/${totalSiswa} siswa selesai · ${progressPct}%</p>` : ''}
            </div>
            <span class="ti-deadline ${staffView ? 'green' : reviewed ? 'green' : prioritas}">${staffView ? `${progressPct}%` : reviewed ? (scoreHidden ? 'Selesai' : 'Direview') : isDone ? 'Terkumpul' : isLate ? 'Terlambat' : deadlineFmt}</span>
            ${!staffView && !isDone ? `<button onclick="bukaSubmitTugas('${t.id}')"
                class="task-submit-btn">
                <i class="fas fa-paper-plane"></i> Kumpulkan
            </button>` : ''}
        </div>`;
    }).join('');
    updateLearningOverview();
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
        if (!lmsState.user) return;

        const mapels = new Set([
            ...lmsState.tugasData.map(t => t.mapel).filter(Boolean),
            ...lmsState.allMateri.map(m => m.mapel).filter(Boolean),
            ...lmsState.nilaiData.map(n => n.mapel).filter(Boolean),
        ]);

        const kelasList = [...mapels].sort((a, b) => a.localeCompare(b, 'id')).map((mapel, i) => {
            const tasks = lmsState.tugasData.filter(t => t.mapel === mapel);
            const doneTasks = tasks.filter(t => t.submission_id);
            const materials = lmsState.allMateri.filter(m => m.mapel === mapel);
            const grade = lmsState.nilaiData.find(n => n.mapel === mapel);
            const final = grade
                ? Number(grade.nilai_final ?? (Number(grade.uh || 0) * 0.2 + Number(grade.uts || 0) * 0.25 + Number(grade.uas || 0) * 0.3 + Number(grade.tugas || 0) * 0.25)).toFixed(1)
                : null;
            const taskProgress = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
            const materialBoost = materials.length && !tasks.length ? 35 : Math.min(35, materials.length * 8);
            const gradeBoost = grade ? 20 : 0;
            const progress = Math.min(100, Math.max(0, Math.round((tasks.length ? taskProgress * 0.65 : 0) + materialBoost + gradeBoost)));
            return {
                id: i,
                nama: mapel,
                guru: grade?.guru_nama || tasks.find(t => t.guru_nama)?.guru_nama || 'Guru Pengampu',
                progress,
                color: getMapelColor(mapel),
                icon: getMapelIcon(mapel),
                tugasTotal: tasks.length,
                tugasSelesai: doneTasks.length,
                materiTotal: materials.length,
                nilaiFinal: final,
                nextDeadline: tasks.filter(t => !t.submission_id && t.deadline).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0]?.deadline || null,
            };
        });

        renderKelas(kelasList);
        renderMiniKelas(kelasList);
    } catch(e) { console.warn('[Fetch kelas]', e.message); }
}

function renderKelas(kelasList) {
    const el = document.getElementById('kelas-grid');
    if (!el) return;
    if (!kelasList.length) {
        el.innerHTML = '<div class="empty-state"><i class="fas fa-book-open"></i><strong>Belum ada kelas</strong><span>Kelas akan muncul otomatis setelah ada tugas atau materi mapel.</span></div>';
        return;
    }
    el.innerHTML = kelasList.map(k => `
        <article class="kelas-card learning-card">
            <div class="kc-banner" style="background:linear-gradient(135deg,${k.color},${k.color}cc);">
                <i class="${k.icon}"></i>
                <span class="kc-badge">${k.nextDeadline ? 'Ada Deadline' : 'Aktif'}</span>
            </div>
            <div class="kc-body">
                <h3>${escHtml(k.nama)}</h3>
                <p>${escHtml(k.guru)}</p>
                <div class="learning-facts">
                    <span><i class="fas fa-folder-open"></i><strong>${k.materiTotal}</strong> Materi</span>
                    <span><i class="fas fa-list-check"></i><strong>${k.tugasSelesai}/${k.tugasTotal}</strong> Tugas</span>
                    <span><i class="fas fa-star"></i><strong>${k.nilaiFinal || '-'}</strong> Nilai</span>
                </div>
                <div class="kc-progress">
                    <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--muted);">
                        <span>Progress</span><span>${k.progress}%</span>
                    </div>
                    <div class="kc-prog-bar">
                        <div class="kc-prog-fill" style="width:${k.progress}%"></div>
                    </div>
                </div>
                ${k.nextDeadline ? `<p class="learning-deadline"><i class="fas fa-clock"></i> Deadline terdekat ${new Date(k.nextDeadline).toLocaleDateString('id-ID', { day:'numeric', month:'short', year:'numeric' })}</p>` : ''}
                <div class="learning-actions">
                    <button type="button" onclick="searchMateri(decodeURIComponent('${encodeURIComponent(k.nama)}'));navigate('materi', document.querySelector('[data-page=materi]'))"><i class="fas fa-book-open"></i> Materi</button>
                    <button type="button" onclick="navigate('tugas', document.querySelector('[data-page=tugas]'))"><i class="fas fa-clipboard-check"></i> Tugas</button>
                </div>
            </div>
        </article>
    `).join('');
    updateLearningOverview(kelasList);
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
    clearTugasAttachment();
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
            clearTugasAttachment();
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
        el.innerHTML = '<div class="empty-state"><i class="fas fa-folder-open"></i><strong>Belum ada materi</strong><span>Materi yang diunggah guru akan tampil di sini.</span></div>';
        return;
    }
    el.innerHTML = lmsState.allMateri.map(m => `
        <div class="materi-item" onclick="downloadMateri('${m.file_url}', '${escHtml(m.original_name)}')">
            <div class="mi-icon" style="background:${getFileBg(m.tipe)};">
                <i class="${getFileIcon(m.tipe)}" style="color:${getFileColor(m.tipe)};"></i>
            </div>
            <div class="mi-info">
                <h4>${escHtml(m.title || m.original_name)}</h4>
                <div class="mi-meta">
                    <span><i class="fas fa-book"></i>${escHtml(m.mapel || '-')}</span>
                    <span><i class="fas fa-user-group"></i>${escHtml(m.target_label || 'Materi LMS')}</span>
                    <span><i class="fas fa-hard-drive"></i>${escHtml(m.ukuran || '-')}</span>
                </div>
                ${m.deskripsi ? `<p>${escHtml(m.deskripsi)}</p>` : ''}
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
        const scope = lmsState.forumScope || 'school';
        const data = await apiFetch(`/lms/forum?scope=${encodeURIComponent(scope)}`);
        if (!data.success) return;
        lmsState.forumPosts = data.data || [];
        lmsState.forumUserClass = data.user_class || null;
        renderForum();
    } catch(e) { console.warn('[Fetch forum]', e.message); }
}

function setForumScope(scope) {
    lmsState.forumScope = scope === 'class' ? 'class' : 'school';
    document.querySelectorAll('[data-forum-scope]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.forumScope === lmsState.forumScope);
    });
    const composeScope = document.getElementById('forum-scope');
    if (composeScope) composeScope.value = lmsState.forumScope;
    const classSelect = document.getElementById('forum-kelas');
    if (classSelect) classSelect.classList.toggle('hidden', !(canEditBiodata() && lmsState.forumScope === 'class'));
    fetchForum();
}

function renderForum() {
    const el = document.getElementById('forum-list');
    if (!el) return;
    if (!lmsState.forumPosts.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Belum ada diskusi.</p>';
        return;
    }
    el.innerHTML = lmsState.forumPosts.map(p => {
        const isAdmin = ['super_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha'].includes(p.role);
        const canPin = canEditBiodata();
        const replies = Array.isArray(p.replies) ? p.replies : [];
        return `
        <div class="forum-post ${isAdmin ? 'admin-post' : ''} ${p.is_pinned ? 'pinned' : ''}" id="fp-${p.id}">
            <div class="fp-header">
                <div class="fp-avatar" style="background:var(--navy);color:var(--gold);">
                    ${(p.nama_lengkap || 'U').charAt(0)}
                </div>
                <div class="fp-meta">
                    <h4>${escHtml(p.nama_lengkap || 'Unknown')} ${isAdmin ? '<span class="admin-chip">Administrator</span>' : ''} ${p.is_pinned ? '<span class="pin-chip"><i class="fas fa-thumbtack"></i> Dipin</span>' : ''}</h4>
                    <p>${escHtml(formatRoleLabel(p.role))} · ${formatRelativeTime(p.created_at)}</p>
                </div>
                ${p.visibility === 'class' ? `<span class="fp-tag class"><i class="fas fa-users"></i> ${escHtml(p.kelas || 'Kelas')}</span>` : (p.mapel ? `<span class="fp-tag">${escHtml(p.mapel)}</span>` : '')}
            </div>
            <p class="fp-body">${escHtml(p.konten)}</p>
            ${renderForumAttachment(p)}
            ${replies.length ? `<div class="forum-replies">${replies.map(r => `
                <div class="forum-reply ${['super_admin','kepala_sekolah','wakil_kepala_sekolah','guru','tata_usaha'].includes(r.role) ? 'admin-reply' : ''}">
                    <strong>${escHtml(r.nama_lengkap || 'User')}</strong>
                    <span>${escHtml(r.konten)}</span>
                    ${renderForumAttachment(r)}
                </div>
            `).join('')}</div>` : ''}
            <div class="fp-actions">
                <button class="fp-btn ${p.sudah_like ? 'liked' : ''}" onclick="toggleLike('${p.id}')">
                    <i class="${p.sudah_like ? 'fas' : 'far'} fa-heart"></i> ${p.likes || 0}
                </button>
                <button class="fp-btn" onclick="replyForum('${p.id}')">
                    <i class="far fa-comment"></i> ${p.total_balasan || 0} Balasan
                </button>
                ${canPin ? `<button class="fp-btn ${p.is_pinned ? 'liked' : ''}" onclick="toggleForumPin('${p.id}', ${p.is_pinned ? 'false' : 'true'})">
                    <i class="fas fa-thumbtack"></i> ${p.is_pinned ? 'Lepas Pin' : 'Pin'}
                </button>` : ''}
            </div>
        </div>
    `; }).join('');
}

function getAttachmentKind(type = '', name = '') {
    const mime = String(type || '').toLowerCase();
    const lowerName = String(name || '').toLowerCase();
    if (mime.startsWith('image/') || ATTACHMENT_EXTENSIONS.image.some(ext => lowerName.endsWith(ext))) return 'image';
    if (mime.startsWith('video/') || ATTACHMENT_EXTENSIONS.video.some(ext => lowerName.endsWith(ext))) return 'video';
    if (mime.startsWith('audio/') || ATTACHMENT_EXTENSIONS.audio.some(ext => lowerName.endsWith(ext))) return 'audio';
    return 'document';
}

function getAttachmentConfig(kind) {
    return ATTACHMENT_TYPES[kind] || ATTACHMENT_TYPES.document;
}

function formatFileSize(bytes = 0) {
    const value = Number(bytes || 0);
    if (!value) return '';
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

function chooseAttachmentFile(inputId, kind) {
    const input = document.getElementById(inputId);
    if (!input) return;
    if (kind === 'video' && !LMS_FEATURES.forumVideoAttachment) return showToast('Upload video sedang dibatasi oleh konfigurasi server.', 'orange');
    if (kind === 'audio' && !LMS_FEATURES.forumAudioAttachment) return showToast('Upload audio sedang dibatasi oleh konfigurasi server.', 'orange');
    const config = getAttachmentConfig(kind);
    input.accept = config.accept;
    input.dataset.kind = kind;
    input.value = '';
    input.click();
}

function chooseForumAttachment(kind) {
    chooseAttachmentFile('forum-file', kind);
}

function chooseKantinChatAttachment(kind) {
    chooseAttachmentFile('kantin-chat-file', kind);
    document.getElementById('kantin-attachment-tray')?.classList.remove('open');
}

function toggleKantinAttachmentTray() {
    document.getElementById('kantin-attachment-tray')?.classList.toggle('open');
}

function revokeAttachmentPreview(scope) {
    const url = attachmentPreviewUrls[scope];
    if (url) URL.revokeObjectURL(url);
    attachmentPreviewUrls[scope] = null;
}

function getPdfPreviewUrl(url) {
    return String(url || '').includes('#') ? String(url || '') : `${url}#toolbar=0&navpanes=0`;
}

function renderAttachmentPreview(item = {}, options = {}) {
    const url = item.attachment_url || item.url;
    if (!url) return '';
    const name = item.attachment_name || item.name || 'Lampiran';
    const type = item.attachment_type || item.type || '';
    const kind = getAttachmentKind(type, name);
    const config = getAttachmentConfig(kind);
    const size = item.size ? formatFileSize(item.size) : '';
    const compact = options.compact ? ' compact' : '';
    const title = escAttr(name);
    const meta = [config.label, size].filter(Boolean).join(' · ');

    if (kind === 'image') {
        return `<a class="attachment-preview-card attachment-image${compact}" href="${escAttr(url)}" target="_blank" rel="noopener" title="${title}">
            <img src="${escAttr(url)}" alt="${title}" loading="lazy">
            <span><i class="fas ${config.icon}"></i>${escHtml(name)}</span>
        </a>`;
    }
    if (kind === 'video') {
        return `<div class="attachment-preview-card attachment-video${compact}">
            <video controls preload="metadata" src="${escAttr(url)}"></video>
            <a href="${escAttr(url)}" target="_blank" rel="noopener"><i class="fas ${config.icon}"></i>${escHtml(name)}</a>
        </div>`;
    }
    if (kind === 'audio') {
        return `<div class="attachment-preview-card attachment-audio${compact}">
            <div class="attachment-doc-icon"><i class="fas ${config.icon}"></i></div>
            <div class="attachment-doc-meta"><strong>${escHtml(name)}</strong><small>${escHtml(meta)}</small><audio controls preload="metadata" src="${escAttr(url)}"></audio></div>
        </div>`;
    }
    if (String(type).includes('pdf') || /\.pdf($|\?)/i.test(name) || /\.pdf($|\?)/i.test(url)) {
        return `<div class="attachment-preview-card attachment-pdf${compact}">
            <iframe src="${escAttr(getPdfPreviewUrl(url))}" title="Preview ${title}" loading="lazy"></iframe>
            <a href="${escAttr(url)}" target="_blank" rel="noopener"><i class="fas fa-file-pdf"></i>${escHtml(name)}</a>
        </div>`;
    }
    return `<a class="attachment-preview-card attachment-doc${compact}" href="${escAttr(url)}" target="_blank" rel="noopener" title="${title}">
        <div class="attachment-doc-icon"><i class="fas ${config.icon}"></i></div>
        <div class="attachment-doc-meta"><strong>${escHtml(name)}</strong><small>${escHtml(meta || config.hint)}</small></div>
    </a>`;
}

function renderSelectedAttachmentPreview(file, scope) {
    revokeAttachmentPreview(scope);
    attachmentPreviewUrls[scope] = URL.createObjectURL(file);
    const kind = getAttachmentKind(file.type, file.name);
    const config = getAttachmentConfig(kind);
    const clearAction = {
        forum: 'clearForumAttachment()',
        kantinChat: 'clearKantinChatAttachment()',
        staffMateri: 'clearStaffMateriAttachment()',
        tugas: 'clearTugasAttachment()',
    }[scope] || '';
    return `<div class="selected-attachment-head">
        <span><i class="fas ${config.icon}"></i> ${escHtml(config.label)} siap dikirim</span>
        <button type="button" onclick="${clearAction}" aria-label="Hapus lampiran"><i class="fas fa-times"></i></button>
    </div>
    ${renderAttachmentPreview({ url: attachmentPreviewUrls[scope], name: file.name, type: file.type, size: file.size }, { compact: scope !== 'forum' })}`;
}

function renderForumAttachment(item = {}) {
    return renderAttachmentPreview(item, { compact: false });
}

function validateStudentAttachment(file) {
    if (!file) return null;
    const kind = getAttachmentKind(file.type, file.name);
    const config = getAttachmentConfig(kind);
    const allowedMimes = Object.values(ATTACHMENT_TYPES).flatMap(cfg => cfg.mimes);
    const allowedExts = Object.values(ATTACHMENT_EXTENSIONS).flat();
    const fileName = String(file.name || '').toLowerCase();
    const isAllowed = allowedMimes.includes(file.type) || allowedExts.some(ext => fileName.endsWith(ext));
    if (!isAllowed) {
        showToast('Format file belum didukung. Pakai foto, PDF/dokumen, video, atau audio sesuai konfigurasi.', 'orange');
        return null;
    }
    if (file.size > config.max) {
        showToast(`${config.label} maksimal ${formatFileSize(config.max)}.`, 'orange');
        return null;
    }
    return file;
}

function previewForumAttachment() {
    const file = document.getElementById('forum-file')?.files?.[0];
    const target = document.getElementById('forum-file-preview');
    if (!target) return;
    if (!file) {
        clearForumAttachment();
        return;
    }
    if (!validateStudentAttachment(file)) {
        clearForumAttachment();
        return;
    }
    target.innerHTML = renderSelectedAttachmentPreview(file, 'forum');
}

function clearForumAttachment() {
    revokeAttachmentPreview('forum');
    const input = document.getElementById('forum-file');
    const target = document.getElementById('forum-file-preview');
    if (input) input.value = '';
    if (target) target.innerHTML = '';
}

async function toggleForumVoiceNote() {
    if (!LMS_FEATURES.forumVoiceNote) {
        showToast('Voice note forum sedang dimatikan oleh konfigurasi server.', 'orange');
        return;
    }
    if (lmsState.forumRecorder?.state === 'recording') return stopForumVoiceNote();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        showToast('Browser belum mendukung rekam VN langsung.', 'orange');
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        lmsState.forumAudioChunks = [];
        const recorder = new MediaRecorder(stream);
        lmsState.forumRecorder = recorder;
        recorder.ondataavailable = event => {
            if (event.data?.size) lmsState.forumAudioChunks.push(event.data);
        };
        recorder.onstop = () => {
            stream.getTracks().forEach(track => track.stop());
            const blob = new Blob(lmsState.forumAudioChunks, { type: recorder.mimeType || 'audio/webm' });
            if (!blob.size) return showToast('VN kosong, coba rekam ulang.', 'orange');
            const file = new File([blob], `vn-${Date.now()}.webm`, { type: blob.type || 'audio/webm' });
            attachForumVoiceFile(file);
        };
        recorder.start();
        const btn = document.getElementById('forum-vn-btn');
        if (btn) btn.classList.add('recording');
        showToast('VN mulai direkam. Klik VN lagi untuk berhenti.', 'blue');
    } catch(e) {
        showToast('Izin mikrofon ditolak atau tidak tersedia.', 'red');
    }
}

function stopForumVoiceNote() {
    const recorder = lmsState.forumRecorder;
    if (recorder?.state === 'recording') recorder.stop();
    document.getElementById('forum-vn-btn')?.classList.remove('recording');
}

function attachForumVoiceFile(file) {
    if (!validateStudentAttachment(file)) return;
    const input = document.getElementById('forum-file');
    if (!input) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    previewForumAttachment();
}

async function uploadForumAttachment() {
    const input = document.getElementById('forum-file');
    const file = validateStudentAttachment(input?.files?.[0]);
    if (!file) return null;
    const form = new FormData();
    form.append('file', file);
    form.append('entity_type', 'forum_posts');
    const res = await fetch(`${API}/upload/forum`, {
        method: 'POST',
        headers: { Authorization:`Bearer ${getToken()}` },
        body: form
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Upload lampiran gagal.');
    return data.data;
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

async function toggleForumPin(id, pinned) {
    try {
        const data = await apiFetch(`/lms/forum/${id}/pin`, {
            method: 'PATCH',
            body: JSON.stringify({ pinned: !!pinned }),
        });
        showToast(data.message || 'Pin diskusi diperbarui.', data.success ? 'green' : 'red');
        if (data.success) await fetchForum();
    } catch(e) {
        showToast('Gagal mengubah pin diskusi.', 'red');
    }
}

async function postForum() {
    const text  = document.getElementById('forum-input').value.trim();
    const mapel = document.getElementById('forum-mapel').value;
    const visibility = document.getElementById('forum-scope')?.value || lmsState.forumScope || 'school';
    const kelas = document.getElementById('forum-kelas')?.value || '';
    const hasFile = !!document.getElementById('forum-file')?.files?.[0];
    if (!text && !hasFile) return showToast('Tulis konten atau lampirkan file dulu ya!', 'orange');
    if (canEditBiodata() && visibility === 'class' && !kelas) return showToast('Pilih kelas target diskusi dulu.', 'orange');

    try {
        const attachment = hasFile ? await uploadForumAttachment() : null;
        const data = await apiFetch('/lms/forum', {
            method: 'POST',
            body: JSON.stringify({
                konten: text,
                mapel: mapel.split('—')[0].trim(),
                visibility,
                kelas,
                attachment_url: attachment?.fileUrl || null,
                attachment_name: attachment?.originalName || attachment?.fileName || null,
                attachment_type: attachment?.mimeType || null
            }),
        });
        if (data.success) {
            document.getElementById('forum-input').value = '';
            clearForumAttachment();
            showToast('Postingan berhasil dikirim!', 'green');
            await fetchForum();
        } else {
            showToast(data.message || 'Gagal posting.', 'red');
        }
    } catch(e) { showToast('Koneksi gagal.', 'red'); }
}

async function fetchPrivateContacts() {
    const list = document.getElementById('private-contact-list');
    if (list) list.innerHTML = '<div class="staff-empty">Memuat kontak...</div>';
    try {
        const data = await apiFetch('/lms/contacts');
        if (!data.success) return;
        lmsState.privateContacts = data.data || [];
        renderPrivateContacts();
    } catch(e) {
        if (list) list.innerHTML = '<div class="staff-empty">Kontak chat belum bisa dimuat.</div>';
    }
}

function renderPrivateContacts() {
    const list = document.getElementById('private-contact-list');
    if (!list) return;
    const contacts = lmsState.privateContacts || [];
    if (!contacts.length) {
        list.innerHTML = '<div class="staff-empty">Belum ada kontak siswa di kelas kamu.</div>';
        return;
    }
    list.innerHTML = contacts.map(c => `
        <button type="button" class="private-contact ${lmsState.activePrivateUserId === c.id ? 'active' : ''}" onclick="openPrivateChat('${escAttr(c.id)}')">
            <span class="private-contact-avatar">${escHtml((c.nama_lengkap || 'S').charAt(0).toUpperCase())}</span>
            <span>
                <strong>${escHtml(c.nama_lengkap || 'Siswa')}</strong>
                <small>${escHtml(c.kelas || 'Kelas belum diisi')}</small>
                ${Number(c.unread || 0) ? `<em>${Number(c.unread)}</em>` : ''}
            </span>
        </button>
    `).join('');
}

async function openPrivateChat(userId) {
    lmsState.activePrivateUserId = userId;
    renderPrivateContacts();
    const room = document.getElementById('private-chat-room');
    if (room) room.innerHTML = '<div class="staff-empty">Memuat chat...</div>';
    try {
        const data = await apiFetch(`/lms/private-chat/${encodeURIComponent(userId)}`);
        if (!data.success) return showToast(data.message || 'Gagal memuat chat.', 'red');
        lmsState.privateMessages = data.data?.messages || [];
        renderPrivateChat(data.data);
        await fetchPrivateContacts();
    } catch(e) {
        if (room) room.innerHTML = '<div class="staff-empty">Gagal memuat chat.</div>';
    }
}

function renderPrivateChat(data = {}) {
    const room = document.getElementById('private-chat-room');
    if (!room) return;
    const messages = data.messages || lmsState.privateMessages || [];
    const currentUserId = data.current_user_id || lmsState.user?.id;
    if (!messages.length) {
        room.innerHTML = '<div class="staff-empty">Belum ada pesan. Mulai obrolan dengan sopan.</div>';
        return;
    }
    room.innerHTML = messages.map(msg => {
        const mine = msg.sender_id === currentUserId;
        return `<div class="chat-bubble ${mine ? 'mine' : ''}">
            <b>${mine ? 'Saya' : escHtml(msg.sender_name || 'Siswa')}</b>
            <p>${escHtml(msg.message || '')}</p>
            <small>${formatRelativeTime(msg.created_at)}</small>
        </div>`;
    }).join('');
    room.scrollTop = room.scrollHeight;
}

async function sendPrivateMessage(event) {
    event.preventDefault();
    if (!lmsState.activePrivateUserId) return showToast('Pilih kontak chat dulu.', 'orange');
    const input = document.getElementById('private-chat-message');
    const message = input?.value.trim();
    if (!message) return;
    try {
        const data = await apiFetch(`/lms/private-chat/${encodeURIComponent(lmsState.activePrivateUserId)}`, {
            method: 'POST',
            body: JSON.stringify({ message }),
        });
        if (!data.success) return showToast(data.message || 'Gagal mengirim pesan.', 'red');
        input.value = '';
        await openPrivateChat(lmsState.activePrivateUserId);
    } catch(e) {
        showToast('Koneksi chat gagal.', 'red');
    }
}

async function replyForum(parentId) {
    const text = prompt('Tulis balasan diskusi:');
    if (!text || !text.trim()) return;
    try {
        const data = await apiFetch('/lms/forum', {
            method: 'POST',
            body: JSON.stringify({ konten: text.trim(), parent_id: parentId }),
        });
        showToast(data.success ? 'Balasan terkirim.' : (data.message || 'Gagal membalas.'), data.success ? 'green' : 'red');
        if (data.success) await fetchForum();
    } catch {
        showToast('Koneksi gagal.', 'red');
    }
}

function formatRoleLabel(role) {
    const labels = {
        super_admin: 'Super Admin',
        kepala_sekolah: 'Kepala Sekolah',
        wakil_kepala_sekolah: 'Wakasek',
        guru: 'Guru',
        tata_usaha: 'Tata Usaha',
        siswa: 'Siswa',
        wali_murid: 'Wali Murid',
    };
    return labels[role] || 'Pengguna';
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
        el.innerHTML = '<div class="empty-state"><i class="fas fa-chart-line"></i><strong>Belum ada data nilai</strong><span>Nilai akan tampil setelah guru menginput komponen penilaian.</span></div>';
        return;
    }
    const nilaiRows = lmsState.nilaiData.map(n => {
        const final = Number(n.nilai_final ?? ((Number(n.uh || 0) * 0.2 + Number(n.uts || 0) * 0.25 + Number(n.uas || 0) * 0.3 + Number(n.tugas || 0) * 0.25))).toFixed(1);
        return { ...n, final: Number(final), finalText: final, kkmValue: Number(n.kkm || 70) };
    });
    const totalFinal = nilaiRows.reduce((sum, n) => sum + n.final, 0);
    const avgFinal = nilaiRows.length ? (totalFinal / nilaiRows.length).toFixed(1) : '0.0';
    const highest = Math.max(...nilaiRows.map(n => n.final));
    const lowest = Math.min(...nilaiRows.map(n => n.final));
    const passed = nilaiRows.filter(n => n.final >= n.kkmValue).length;
    const cards = nilaiRows.map(n => {
        const lulus  = n.final >= n.kkmValue;
        const color  = getMapelColor(n.mapel);
        return `
        <div class="nilai-card" style="border-top-color:${color};">
            <div class="nc-header">
                <div class="nc-icon" style="background:${color}20;">
                    <i class="${getMapelIcon(n.mapel)}" style="color:${color};"></i>
                </div>
                <div class="nc-info">
                    <h3>${escHtml(n.mapel)}</h3>
                    <p>Semester Genap · KKM ${n.kkmValue}</p>
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
                        <span class="nr-val ${Number(r.val ?? 0) >= n.kkmValue ? 'lulus' : 'remedial'}">${r.val ?? '-'}</span>
                    </div>
                `).join('')}
            </div>
            <div class="nc-avg">
                <span>Nilai Akhir</span>
                <strong style="color:${lulus ? 'var(--green)' : 'var(--red)'};">${n.finalText}</strong>
            </div>
        </div>`;
    }).join('');
    el.innerHTML = `
        ${cards}
        <section class="nilai-summary-panel" aria-label="Total nilai keseluruhan">
            <div>
                <span class="summary-eyebrow">Total Keseluruhan</span>
                <h3>Rata-rata akhir semua mapel</h3>
                <p>Detail komponen tetap ditampilkan per mapel di atas. Angka ini hanya rangkuman akhir, bukan pengganti detail nilai.</p>
            </div>
            <div class="nilai-total-final">${avgFinal}</div>
            <div class="nilai-summary-grid">
                <span><strong>${nilaiRows.length}</strong><small>Mapel</small></span>
                <span><strong>${passed}/${nilaiRows.length}</strong><small>Lulus KKM</small></span>
                <span><strong>${highest.toFixed(1)}</strong><small>Tertinggi</small></span>
                <span><strong>${lowest.toFixed(1)}</strong><small>Terendah</small></span>
            </div>
        </section>
    `;
    updateLearningOverview();
}

function updateLearningOverview(kelasList = null) {
    const mapelCount = kelasList?.length
        ?? new Set([
            ...lmsState.tugasData.map(t => t.mapel).filter(Boolean),
            ...lmsState.allMateri.map(m => m.mapel).filter(Boolean),
            ...lmsState.nilaiData.map(n => n.mapel).filter(Boolean),
        ]).size;
    const activeTasks = canEditBiodata()
        ? lmsState.tugasData.length
        : lmsState.tugasData.filter(t => !t.submission_id).length;

    const mapelEl = document.getElementById('sc-mapel');
    const tugasEl = document.getElementById('sc-tugas');
    if (mapelEl) mapelEl.textContent = mapelCount || '0';
    if (tugasEl) tugasEl.textContent = activeTasks || '0';
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

function debounce(fn, wait = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}
const debouncedFetchKantinProductsHandler = debounce(() => fetchKantinProducts().catch(() => {}), 350);
function debouncedFetchKantinProducts() {
    debouncedFetchKantinProductsHandler();
}

/* ── Kantin ku ─────────────────────────────────────────────── */
const kantinState = { profile: null, seller: null, products: [], orders: [], currentChatOrder: null, currentChat: null, pendingChatAttachment: null, currentProductDetail: null };

function switchKantinTab(tab) {
    document.querySelectorAll('[data-kantin-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.kantinTab === tab));
    document.querySelectorAll('.kantin-section').forEach(section => section.classList.remove('active'));
    document.getElementById(`kantin-section-${tab}`)?.classList.add('active');
    if (tab === 'seller') {
        fetchKantinProfile().catch(() => {});
        fetchKantinSellerDashboard().catch(() => {});
    }
    if (tab === 'orders') fetchKantinOrders().catch(() => {});
}

async function fetchKantinProducts() {
    const el = document.getElementById('kantin-products');
    if (!el) return;
    el.innerHTML = '<div class="staff-empty">Memuat produk kantin...</div>';
    try {
        const params = new URLSearchParams();
        const search = document.getElementById('kantin-search')?.value.trim() || '';
        const category = document.getElementById('kantin-category-filter')?.value || '';
        if (search) params.set('search', search);
        if (category) params.set('category', category);
        const data = await apiFetch(`/kantin/products${params.toString() ? `?${params}` : ''}`);
        const products = data.success ? (data.data || []) : [];
        kantinState.products = products;
        kantinState.profile = data.profile || kantinState.profile;
        if (!products.length) {
            el.innerHTML = '<div class="staff-empty">Belum ada dagangan siswa. Jadilah penjual pertama.</div>';
            return;
        }
        el.innerHTML = products.map(p => `
            <article class="kantin-card" role="button" tabindex="0" onclick="openKantinProductDetail('${escAttr(p.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openKantinProductDetail('${escAttr(p.id)}')}">
                ${renderKantinBadges(p)}
                <button class="kantin-photo" type="button" onclick="event.stopPropagation();openKantinProductDetail('${escAttr(p.id)}')" style="${p.image_url ? `background-image:url('${escAttr(p.image_url)}')` : ''}">
                    ${p.image_url ? '' : '<i class="fas fa-bowl-food"></i>'}
                </button>
                <div class="kantin-info">
                    <strong>${escHtml(p.name)}</strong>
                    <span>${escHtml(p.description || 'Tanpa deskripsi')}</span>
                    <small>${escHtml(p.category || 'produk')} ${p.tags ? `· ${escHtml(p.tags)}` : ''}</small>
                    <small class="rating-line">${renderStars(p.avg_rating || 0)} <b>${Number(p.avg_rating || 0).toFixed(1)}</b> (${Number(p.review_count || 0)} review)</small>
                    <small>Penjual: ${escHtml(p.seller_name || 'Siswa')} ${p.seller_class ? `· ${escHtml(p.seller_class)}` : ''}</small>
                    ${p.preference_score ? '<small><i class="fas fa-wand-magic-sparkles"></i> Cocok dengan minatmu</small>' : ''}
                </div>
                <div class="kantin-foot">
                    <b>${formatRupiah(p.price)}</b>
                    <span>Stok ${Number(p.stock || 0)}</span>
                </div>
                <div class="kantin-actions">
                    <button class="small-action" onclick="event.stopPropagation();openKantinProductDetail('${escAttr(p.id)}')"><i class="fas fa-circle-info"></i> Detail</button>
                    <button class="small-action primary" onclick="event.stopPropagation();openKantinProductDetail('${escAttr(p.id)}', true)"><i class="fas fa-cart-shopping"></i> Pesan</button>
                </div>
                <p class="kantin-pay">${escHtml(p.emoney_provider || 'e-money')}: ${escHtml(p.emoney_account || 'konfirmasi via chat')}</p>
            </article>
        `).join('');
    } catch (e) {
        el.innerHTML = '<div class="staff-empty">Gagal memuat Kantin ku.</div>';
    }
}

async function fetchKantinProfile() {
    const data = await apiFetch('/kantin/profile');
    const profile = data.success ? (data.data || {}) : {};
    kantinState.profile = profile;
    document.getElementById('kantin-focus').value = profile.selling_focus || '';
    document.getElementById('kantin-target').value = profile.target_market || '';
    document.getElementById('kantin-hobbies').value = profile.hobbies || '';
    document.getElementById('kantin-preferences').value = profile.preferences || '';
    const payments = String(profile.payment_methods || '').split(',').map(v => v.trim());
    document.querySelectorAll('#kantin-payment-checks input[type="checkbox"]').forEach(input => {
        input.checked = payments.includes(input.value);
    });
}

async function saveKantinProfile(event) {
    event.preventDefault();
    const payment_methods = [...document.querySelectorAll('#kantin-payment-checks input:checked')].map(i => i.value).join(', ');
    const payload = {
        selling_focus: document.getElementById('kantin-focus').value.trim(),
        payment_methods,
        target_market: document.getElementById('kantin-target').value.trim(),
        hobbies: document.getElementById('kantin-hobbies').value.trim(),
        preferences: document.getElementById('kantin-preferences').value.trim(),
    };
    const data = await apiFetch('/kantin/profile', { method:'PUT', body:JSON.stringify(payload) });
    showToast(data.message || 'Profil Kantin diproses.', data.success ? 'green' : 'red');
    if (data.success) fetchKantinProducts().catch(() => {});
}

async function fetchKantinSellerDashboard() {
    const statsEl = document.getElementById('kantin-seller-stats');
    const listEl = document.getElementById('kantin-my-products');
    const orderEl = document.getElementById('kantin-seller-orders');
    if (statsEl) statsEl.innerHTML = '<div class="staff-empty">Memuat statistik...</div>';
    if (listEl) listEl.innerHTML = '<div class="staff-empty">Memuat postingan...</div>';
    if (orderEl) orderEl.innerHTML = '<div class="staff-empty">Memuat pesanan masuk...</div>';
    try {
        const data = await apiFetch('/kantin/seller/dashboard');
        const dashboard = data.success ? data.data : { products:[], orders:[], stats:{} };
        kantinState.seller = dashboard;
        const s = dashboard.stats || {};
        const avgOrder = s.total_orders ? Number(s.gross_profit || 0) / Number(s.total_orders || 1) : 0;
        const completed = (dashboard.orders || []).filter(o => ['completed','selesai','paid'].includes(String(o.status || '').toLowerCase())).length;
        if (statsEl) statsEl.innerHTML = [
            ['Omzet', formatRupiah(s.gross_profit || 0), 'fa-wallet', 'green'],
            ['Pesanan', s.total_orders || 0, 'fa-receipt', 'blue'],
            ['Pending', s.pending_orders || 0, 'fa-hourglass-half', 'orange'],
            ['Produk Aktif', s.active_products || 0, 'fa-box-open', 'purple'],
            ['Rata-rata Order', formatRupiah(avgOrder), 'fa-chart-line', 'cyan'],
            ['Selesai', completed, 'fa-circle-check', 'green']
        ].map(([label, value, icon, tone]) => `<div class="kantin-stat seller-kpi ${tone}">
            <i class="fas ${icon}"></i>
            <b>${escHtml(value)}</b>
            <span>${escHtml(label)}</span>
        </div>`).join('');
        renderKantinSellerCharts(dashboard);
        renderKantinSellerOrders(dashboard.orders || []);
        if (!dashboard.products?.length) {
            if (listEl) listEl.innerHTML = '<div class="staff-empty">Belum ada postingan jualan.</div>';
            return;
        }
        if (listEl) listEl.innerHTML = dashboard.products.map(p => `
            <div class="kantin-order">
                <strong>${escHtml(p.name)}</strong>
                <span>${formatRupiah(p.price)} · Stok ${Number(p.stock || 0)} · ${escHtml(p.status || 'active')}</span>
                <small>${escHtml(p.category || 'produk')} ${p.tags ? `· ${escHtml(p.tags)}` : ''}</small>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="small-action" onclick="editKantinProduct('${escAttr(p.id)}')"><i class="fas fa-pen"></i> Edit</button>
                    <button class="small-action" onclick="archiveKantinProduct('${escAttr(p.id)}')"><i class="fas fa-box-archive"></i> Arsip</button>
                </div>
            </div>
        `).join('');
    } catch {
        if (statsEl) statsEl.innerHTML = '<div class="staff-empty">Gagal memuat dashboard pedagang.</div>';
        if (listEl) listEl.innerHTML = '<div class="staff-empty">Gagal memuat postingan.</div>';
        if (orderEl) orderEl.innerHTML = '<div class="staff-empty">Gagal memuat pesanan masuk.</div>';
    }
}

function renderKantinSellerOrders(orders = []) {
    const el = document.getElementById('kantin-seller-orders');
    if (!el) return;
    if (!orders.length) {
        el.innerHTML = '<div class="staff-empty">Belum ada pesanan masuk.</div>';
        return;
    }
    el.innerHTML = orders.slice(0, 30).map(order => {
        const status = String(order.status || 'pending').toLowerCase();
        const canFinalize = !['completed', 'cancelled'].includes(status);
        return `
            <div class="kantin-order seller-inbox-order">
                <strong>${escHtml(order.product_name || 'Produk')}</strong>
                <span>${Number(order.quantity || 1)} item · ${formatRupiah(order.total_price)} · ${escHtml(status)}</span>
                <small>Pembeli: ${escHtml(order.buyer_name || '-')} ${order.buyer_class ? `· ${escHtml(order.buyer_class)}` : ''}</small>
                <div class="seller-order-actions">
                    <button class="small-action" onclick="openKantinChat('${escAttr(order.id)}')"><i class="fas fa-message"></i> Chat</button>
                    ${canFinalize ? `
                        <button class="small-action primary" onclick="updateKantinOrderStatus('${escAttr(order.id)}','completed')"><i class="fas fa-circle-check"></i> Pesanan selesai</button>
                        <button class="small-action danger" onclick="updateKantinOrderStatus('${escAttr(order.id)}','cancelled')"><i class="fas fa-ban"></i> Pesanan batal</button>
                    ` : '<span class="status-pill done">Status final</span>'}
                </div>
            </div>
        `;
    }).join('');
}

function renderKantinSellerCharts(dashboard = {}) {
    const orders = dashboard.orders || [];
    renderKantinSalesChart(orders);
    renderKantinStatusDonut(orders);
    renderKantinBuyerInsights(orders);
}

function renderKantinSalesChart(orders = []) {
    const el = document.getElementById('kantin-sales-chart');
    if (!el) return;
    const days = Array.from({ length: 7 }, (_, offset) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - offset));
        const key = date.toISOString().slice(0, 10);
        return { key, label: date.toLocaleDateString('id-ID', { weekday:'short' }), sales:0, count:0 };
    });
    orders.forEach(order => {
        const key = String(order.created_at || '').slice(0, 10);
        const row = days.find(day => day.key === key);
        if (!row) return;
        row.sales += Number(order.total_price || 0);
        row.count += 1;
    });
    const maxSales = Math.max(...days.map(day => day.sales), 1);
    el.innerHTML = days.map(day => {
        const height = Math.max(8, Math.round((day.sales / maxSales) * 100));
        return `<div class="seller-bar-item" title="${escAttr(formatRupiah(day.sales))} dari ${day.count} pesanan">
            <div class="seller-bar-track"><span style="height:${height}%"></span></div>
            <strong>${escHtml(day.label)}</strong>
            <small>${day.count}</small>
        </div>`;
    }).join('');
}

function renderKantinStatusDonut(orders = []) {
    const donut = document.getElementById('kantin-status-donut');
    const legend = document.getElementById('kantin-status-legend');
    if (!donut || !legend) return;
    const colors = { pending:'#f59e0b', paid:'#2563eb', completed:'#16a34a', cancelled:'#dc2626', other:'#64748b' };
    const labels = { pending:'Pending', paid:'Dibayar', completed:'Selesai', cancelled:'Batal', other:'Lainnya' };
    const counts = { pending:0, paid:0, completed:0, cancelled:0, other:0 };
    orders.forEach(order => {
        const status = String(order.status || 'other').toLowerCase();
        counts[counts[status] === undefined ? 'other' : status] += 1;
    });
    const total = Math.max(orders.length, 1);
    let cursor = 0;
    const segments = Object.entries(counts).filter(([, count]) => count > 0).map(([key, count]) => {
        const start = cursor;
        const end = cursor + (count / total) * 100;
        cursor = end;
        return `${colors[key]} ${start}% ${end}%`;
    });
    donut.style.background = segments.length ? `conic-gradient(${segments.join(',')})` : '#e2e8f0';
    donut.innerHTML = `<b>${orders.length}</b><span>Order</span>`;
    legend.innerHTML = Object.entries(counts).map(([key, count]) => `<div>
        <i style="background:${colors[key]}"></i>
        <span>${labels[key]}</span>
        <strong>${count}</strong>
    </div>`).join('');
}

function renderKantinBuyerInsights(orders = []) {
    const el = document.getElementById('kantin-buyer-insights');
    if (!el) return;
    if (!orders.length) {
        el.innerHTML = '<div class="staff-empty">Belum ada histori pembeli.</div>';
        return;
    }
    const classes = {};
    const buyers = {};
    orders.forEach(order => {
        const kelas = order.buyer_class || 'Belum ada kelas';
        classes[kelas] = (classes[kelas] || 0) + 1;
        const name = order.buyer_name || 'Pembeli';
        buyers[name] = (buyers[name] || 0) + Number(order.total_price || 0);
    });
    const classRows = Object.entries(classes).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const buyerRows = Object.entries(buyers).sort((a, b) => b[1] - a[1]).slice(0, 3);
    el.innerHTML = `
        <div class="buyer-section-title">Asal pembeli teratas</div>
        ${classRows.map(([kelas, count]) => `<div class="buyer-insight-row"><span>${escHtml(kelas)}</span><b>${count}x</b></div>`).join('')}
        <div class="buyer-section-title">Pembeli bernilai tinggi</div>
        ${buyerRows.map(([name, total]) => `<div class="buyer-insight-row"><span>${escHtml(name)}</span><b>${formatRupiah(total)}</b></div>`).join('')}
    `;
}

async function fetchKantinOrders() {
    const el = document.getElementById('kantin-orders');
    if (!el) return;
    try {
        const data = await apiFetch('/kantin/orders');
        const orders = data.success ? (data.data || []) : [];
        kantinState.orders = orders;
        if (!orders.length) {
            el.innerHTML = '<div class="staff-empty">Belum ada pesanan.</div>';
            return;
        }
        el.innerHTML = orders.map(o => `
            <div class="kantin-order">
                <strong>${escHtml(o.product_name)}</strong>
                <span>${Number(o.quantity || 1)} item · ${formatRupiah(o.total_price)} · ${escHtml(o.status)}</span>
                <small>Pembeli: ${escHtml(o.buyer_name || '-')} · Penjual: ${escHtml(o.seller_name || '-')}</small>
                ${(o.chats || []).length ? `
                    <div class="kantin-chat-preview">
                        ${(o.chats || []).map(chat => `
                            <p><b>${escHtml(chat.sender_name || 'Pengguna')}</b> ${escHtml(chat.message || '')}${chat.attachment_url ? ' · mengirim lampiran' : ''}</p>
                        `).join('')}
                    </div>
                ` : ''}
                <button class="small-action" onclick="openKantinChat('${escAttr(o.id)}')"><i class="fas fa-message"></i> Buka room chat</button>
            </div>
        `).join('');
    } catch {
        el.innerHTML = '<div class="staff-empty">Gagal memuat pesanan.</div>';
    }
}

async function updateKantinOrderStatus(orderId, status) {
    const label = status === 'completed' ? 'menyelesaikan' : 'membatalkan';
    if (!confirm(`Yakin ${label} pesanan ini?`)) return;
    try {
        const data = await apiFetch(`/kantin/orders/${encodeURIComponent(orderId)}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        showToast(data.message || 'Status pesanan diperbarui.', data.success ? 'green' : 'red');
        if (data.success) {
            await fetchKantinSellerDashboard();
            await fetchKantinOrders();
            if (kantinState.currentChatOrder === orderId) await loadKantinChatRoom(orderId);
        }
    } catch (e) {
        showToast(e.message || 'Gagal memperbarui status pesanan.', 'red');
    }
}

async function createKantinProduct(event) {
    event.preventDefault();
    const editId = document.getElementById('kantin-product-id')?.value || '';
    const payload = {
        name: document.getElementById('kantin-name').value.trim(),
        description: document.getElementById('kantin-desc').value.trim(),
        category: document.getElementById('kantin-category').value,
        tags: document.getElementById('kantin-tags').value.trim(),
        price: Number(document.getElementById('kantin-price').value || 0),
        stock: Number(document.getElementById('kantin-stock').value || 0),
        chat_contact: document.getElementById('kantin-chat').value.trim(),
        emoney_provider: document.getElementById('kantin-emoney').value,
        emoney_account: document.getElementById('kantin-emoney-id').value.trim(),
        image_url: document.getElementById('kantin-image').value.trim(),
    };
    if (!payload.name || payload.price < 500) return showToast('Nama produk dan harga minimal Rp500 wajib diisi.', 'orange');
    try {
        const data = await apiFetch(editId ? `/kantin/products/${encodeURIComponent(editId)}` : '/kantin/products', { method: editId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
        showToast(data.message || 'Produk diproses.', data.success ? 'green' : 'red');
        if (data.success) {
            resetKantinProductForm();
            await fetchKantinProducts();
            await fetchKantinSellerDashboard();
        }
    } catch {
        showToast('Gagal menerbitkan produk.', 'red');
    }
}

function editKantinProduct(id) {
    const p = kantinState.seller?.products?.find(item => item.id === id);
    if (!p) return;
    document.getElementById('kantinPostFold')?.setAttribute('open', '');
    document.getElementById('kantin-product-id').value = p.id;
    document.getElementById('kantin-name').value = p.name || '';
    document.getElementById('kantin-desc').value = p.description || '';
    document.getElementById('kantin-category').value = p.category || 'makanan';
    document.getElementById('kantin-tags').value = p.tags || '';
    document.getElementById('kantin-price').value = Number(p.price || 0);
    document.getElementById('kantin-stock').value = Number(p.stock || 0);
    document.getElementById('kantin-chat').value = p.chat_contact || '';
    document.getElementById('kantin-emoney').value = p.emoney_provider || 'DANA';
    document.getElementById('kantin-emoney-id').value = p.emoney_account || '';
    document.getElementById('kantin-image').value = p.image_url || '';
    document.getElementById('kantin-submit-btn').innerHTML = '<i class="fas fa-save"></i> Update Produk';
    previewKantinImage();
}

async function archiveKantinProduct(id) {
    if (!confirm('Arsipkan produk ini dari pasar siswa?')) return;
    const data = await apiFetch(`/kantin/products/${encodeURIComponent(id)}`, { method:'DELETE' });
    showToast(data.message || 'Produk diproses.', data.success ? 'green' : 'red');
    if (data.success) {
        fetchKantinProducts().catch(() => {});
        fetchKantinSellerDashboard().catch(() => {});
    }
}

function resetKantinProductForm() {
    document.getElementById('kantin-form')?.reset();
    document.getElementById('kantin-product-id').value = '';
    document.getElementById('kantin-submit-btn').innerHTML = '<i class="fas fa-cloud-arrow-up"></i> Terbitkan Produk';
    const imageLabel = document.getElementById('kantin-image-file-label');
    if (imageLabel) imageLabel.textContent = 'JPG, JPEG, PNG, WEBP - maks. 5MB';
    previewKantinImage();
}

async function uploadKantinImage() {
    const input = document.getElementById('kantin-image-file');
    const label = document.getElementById('kantin-image-file-label');
    const file = input?.files?.[0];
    if (!file) return;
    if (!validateKantinImageFile(file)) {
        if (input) input.value = '';
        return;
    }
    const form = new FormData();
    form.append('image', file);
    form.append('entity_type', 'kantin_product');
    if (label) label.textContent = `Mengupload ${file.name}...`;
    try {
        const res = await fetch(`${API}/upload/kantin`, {
            method:'POST',
            headers:{ Authorization:`Bearer ${getToken()}` },
            body:form
        });
        const data = await res.json();
        if (!data.success) return showToast(data.message || 'Upload foto gagal.', 'red');
        document.getElementById('kantin-image').value = data.data.fileUrl;
        previewKantinImage();
        if (label) label.textContent = file.name;
        showToast('Foto produk berhasil di-upload.', 'green');
    } catch {
        showToast('Upload foto gagal.', 'red');
        if (label) label.textContent = 'JPG, JPEG, PNG, WEBP - maks. 5MB';
    } finally {
        if (input) input.value = '';
    }
}

function validateKantinImageFile(file) {
    const allowed = ['image/jpeg','image/png','image/webp'];
    const fileName = String(file.name || '').toLowerCase();
    const ok = allowed.includes(file.type) || ['.jpg','.jpeg','.png','.webp'].some(ext => fileName.endsWith(ext));
    if (!ok) {
        showToast('Foto produk harus JPG, JPEG, PNG, atau WEBP.', 'orange');
        return false;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('Foto produk maksimal 5MB.', 'orange');
        return false;
    }
    return true;
}

function previewKantinImage() {
    const img = document.getElementById('kantin-image-preview');
    if (!img) return;
    const url = document.getElementById('kantin-image')?.value.trim();
    if (!url) {
        img.style.display = 'none';
        img.removeAttribute('src');
        return;
    }
    img.src = url;
    img.style.display = 'block';
}

function previewKantinPhoto(url, title = 'Foto produk') {
    if (!url) return;
    document.getElementById('modal-preview-title').textContent = title || 'Foto produk';
    document.getElementById('modal-preview-body').innerHTML = `<img src="${escAttr(url)}" alt="${escAttr(title)}" style="width:100%;max-height:72vh;object-fit:contain;border-radius:12px;background:#f8fafc;">`;
    openModal('modal-preview-media');
}

function previewKantinProduct(id) {
    const product = kantinState.products.find(item => item.id === id) || kantinState.seller?.products?.find(item => item.id === id);
    if (!product?.image_url) return;
    previewKantinPhoto(product.image_url, product.name || 'Foto produk');
}

function renderStars(value = 0) {
    const rating = Number(value || 0);
    return `<span class="star-rating" aria-label="${rating.toFixed(1)} dari 5">${[1,2,3,4,5].map(i => `<i class="${rating >= i - .25 ? 'fas' : 'far'} fa-star"></i>`).join('')}</span>`;
}

function renderKantinBadges(product = {}) {
    const badges = product.achievements || [];
    if (!badges.length) return '';
    return `<div class="kantin-achievement-stack">${badges.slice(0, 2).map(b => `<span><i class="fas ${escAttr(b.icon || 'fa-trophy')}"></i>${escHtml(b.label || 'Achievement')}</span>`).join('')}</div>`;
}

async function openKantinProductDetail(id, focusOrder = false) {
    const body = document.getElementById('kantin-product-modal-body');
    const title = document.getElementById('kantin-product-modal-title');
    if (!body) return;
    body.innerHTML = '<div class="staff-empty">Memuat detail produk...</div>';
    openModal('modal-kantin-product');
    try {
        const data = await apiFetch(`/kantin/products/${encodeURIComponent(id)}`);
        if (!data.success) {
            body.innerHTML = `<div class="staff-empty">${escHtml(data.message || 'Produk tidak ditemukan.')}</div>`;
            return;
        }
        kantinState.currentProductDetail = data.data;
        if (title) title.textContent = data.data.product?.name || 'Detail Produk';
        renderKantinProductDetail(focusOrder);
    } catch {
        body.innerHTML = '<div class="staff-empty">Gagal memuat detail produk.</div>';
    }
}

function renderKantinProductDetail(focusOrder = false) {
    const body = document.getElementById('kantin-product-modal-body');
    const detail = kantinState.currentProductDetail;
    if (!body || !detail) return;
    const p = detail.product || {};
    const seller = detail.seller || {};
    body.innerHTML = `
        <div class="product-detail-grid">
            <div class="product-detail-media">
                ${renderKantinBadges(p)}
                ${p.image_url ? `<img src="${escAttr(p.image_url)}" alt="${escAttr(p.name || 'Produk')}">` : '<div class="product-empty-photo"><i class="fas fa-bowl-food"></i></div>'}
            </div>
            <div class="product-detail-info">
                <div class="product-detail-head">
                    <span>${escHtml(p.category || 'produk')}</span>
                    <h3>${escHtml(p.name || 'Produk Kantin')}</h3>
                    <div>${renderStars(p.avg_rating || 0)} <b>${Number(p.avg_rating || 0).toFixed(1)}</b> <small>${Number(p.review_count || 0)} review</small></div>
                </div>
                <p>${escHtml(p.description || 'Belum ada deskripsi produk.')}</p>
                <div class="product-facts">
                    <div><span>Harga</span><b>${formatRupiah(p.price)}</b></div>
                    <div><span>Stok</span><b>${Number(p.stock || 0)}</b></div>
                    <div><span>Pembayaran</span><b>${escHtml(p.emoney_provider || 'e-money')}</b></div>
                </div>
                <div class="seller-mini-card">
                    <div><strong>${escHtml(seller.name || 'Pedagang')}</strong><span>${escHtml(seller.class || 'Siswa')} · ${Number(seller.achievement_count || 0)} review bagus terkumpul</span></div>
                    <p>${escHtml(seller.selling_focus || 'Belum ada fokus jualan.')}</p>
                    <small>Pasar utama: ${escHtml(seller.target_market || '-')} · Pembayaran: ${escHtml(seller.payment_methods || '-')}</small>
                </div>
                <form class="product-order-box" onsubmit="submitKantinOrder(event)">
                    <h4>Pesan produk</h4>
                    <div class="form-grid">
                        <label>Jumlah<input id="detail-order-qty" type="number" min="1" max="${Number(p.stock || 1)}" value="1"></label>
                        <label>Metode<select id="detail-order-payment"><option value="e-money">e-money</option><option value="DANA">DANA</option><option value="OVO">OVO</option><option value="GoPay">GoPay</option><option value="QRIS">QRIS</option><option value="Tunai">Tunai</option></select></label>
                    </div>
                    <label>Catatan pembayaran / pesanan<textarea id="detail-order-note" rows="2" maxlength="400" placeholder="Contoh: bayar QRIS saat istirahat, ambil di kelas X TKJ 1"></textarea></label>
                    <button class="small-action primary" type="submit"><i class="fas fa-cart-shopping"></i> Buat Pesanan</button>
                </form>
            </div>
        </div>
        <div class="product-social-grid">
            <section>
                <h4>Produk lain dari pedagang ini</h4>
                <div class="seller-products-mini">
                    ${(detail.seller_products || []).map(item => `<button type="button" onclick="openKantinProductDetail('${escAttr(item.id)}')">
                        ${item.image_url ? `<img src="${escAttr(item.image_url)}" alt="">` : '<i class="fas fa-bowl-food"></i>'}
                        <span>${escHtml(item.name)}</span><small>${formatRupiah(item.price)} · ${renderStars(item.avg_rating || 0)}</small>
                    </button>`).join('') || '<div class="staff-empty">Belum ada produk lain.</div>'}
                </div>
            </section>
            <section>
                <h4>Review dan komentar</h4>
                <form class="review-form" onsubmit="submitKantinReview(event)">
                    <select id="review-rating"><option value="5">★★★★★ - Sangat bagus</option><option value="4">★★★★ - Bagus</option><option value="3">★★★ - Cukup</option><option value="2">★★ - Kurang</option><option value="1">★ - Buruk</option></select>
                    <textarea id="review-comment" rows="2" maxlength="500" placeholder="${detail.can_review ? 'Tulis komentar singkat setelah membeli...' : 'Kamu perlu memesan produk ini dulu untuk review.'}" ${detail.can_review ? '' : 'disabled'}></textarea>
                    <button class="small-action" type="submit" ${detail.can_review ? '' : 'disabled'}><i class="fas fa-star"></i> Kirim Review</button>
                </form>
                <div class="review-list">
                    ${(detail.reviews || []).map(r => `<div class="review-item"><div>${renderStars(r.rating)} <strong>${escHtml(r.reviewer_name || 'Siswa')}</strong><small>${escHtml(r.reviewer_class || '')}</small></div><p>${escHtml(r.comment || 'Tanpa komentar.')}</p></div>`).join('') || '<div class="staff-empty">Belum ada review.</div>'}
                </div>
            </section>
        </div>
    `;
    if (focusOrder) body.querySelector('.product-order-box')?.scrollIntoView({ behavior:'smooth', block:'center' });
}

async function submitKantinOrder(event) {
    event.preventDefault();
    const detail = kantinState.currentProductDetail;
    const id = detail?.product?.id;
    if (!id) return;
    const quantity = Math.max(1, Number(document.getElementById('detail-order-qty')?.value || 1));
    const payment_method = document.getElementById('detail-order-payment')?.value || 'e-money';
    const payment_reference = document.getElementById('detail-order-note')?.value || '';
    try {
        const data = await apiFetch(`/kantin/products/${encodeURIComponent(id)}/order`, {
            method: 'POST',
            body: JSON.stringify({ quantity, payment_reference, note: payment_reference, payment_method }),
        });
        showToast(data.message || 'Pesanan diproses.', data.success ? 'green' : 'red');
        if (data.success) {
            await fetchKantinProducts();
            await fetchKantinOrders();
            await openKantinProductDetail(id);
        }
    } catch {
        showToast('Gagal membuat pesanan.', 'red');
    }
}

async function orderKantinProduct(id) {
    return openKantinProductDetail(id, true);
}

async function submitKantinReview(event) {
    event.preventDefault();
    const detail = kantinState.currentProductDetail;
    const id = detail?.product?.id;
    if (!id) return;
    try {
        const data = await apiFetch(`/kantin/products/${encodeURIComponent(id)}/reviews`, {
            method:'POST',
            body:JSON.stringify({
                rating: document.getElementById('review-rating')?.value || 5,
                comment: document.getElementById('review-comment')?.value || ''
            })
        });
        showToast(data.message || 'Review diproses.', data.success ? 'green' : 'red');
        if (data.success) {
            await fetchKantinProducts();
            await openKantinProductDetail(id);
        }
    } catch {
        showToast('Gagal mengirim review.', 'red');
    }
}

async function openKantinChat(id) {
    kantinState.currentChatOrder = id;
    document.getElementById('kantin-chat-title').textContent = 'Room Chat Kantin';
    document.getElementById('kantin-chat-room').innerHTML = '<div class="staff-empty">Memuat chat...</div>';
    document.getElementById('kantin-chat-message').value = '';
    clearKantinChatAttachment();
    document.getElementById('kantin-attachment-tray')?.classList.remove('open');
    kantinState.pendingChatAttachment = null;
    openModal('modal-kantin-chat');
    await loadKantinChatRoom(id);
}

async function loadKantinChatRoom(id = kantinState.currentChatOrder) {
    if (!id) return;
    try {
        const data = await apiFetch(`/kantin/orders/${encodeURIComponent(id)}/chat`);
        if (!data.success) return showToast(data.message || 'Gagal memuat room chat.', 'red');
        kantinState.currentChat = data.data;
        renderKantinChatRoom(data.data);
    } catch {
        showToast('Gagal memuat room chat.', 'red');
    }
}

function renderKantinChatRoom(data) {
    const room = document.getElementById('kantin-chat-room');
    if (!room) return;
    const order = data.order || {};
    document.getElementById('kantin-chat-title').textContent = `${order.product_name || 'Pesanan Kantin'} · ${formatRupiah(order.total_price || 0)}`;
    const chats = data.chats || [];
    if (!chats.length) {
        room.innerHTML = '<div class="staff-empty">Belum ada chat. Mulai komunikasi dengan pembeli/penjual di sini.</div>';
        return;
    }
    room.innerHTML = chats.map(chat => {
        const mine = chat.sender_id === data.current_user_id;
        return `
            <div class="chat-bubble ${mine ? 'mine' : ''}">
                <b>${mine ? 'Saya' : escHtml(chat.sender_name || 'Pengguna')}</b>
                ${chat.message ? `<p>${escHtml(chat.message)}</p>` : ''}
                ${renderChatAttachment(chat)}
                <small>${formatRelativeTime(chat.created_at)}</small>
            </div>
        `;
    }).join('');
    room.scrollTop = room.scrollHeight;
}

function renderChatAttachment(chat = {}) {
    return renderAttachmentPreview(chat, { compact: true });
}

function previewKantinChatAttachment() {
    const input = document.getElementById('kantin-chat-file');
    const preview = document.getElementById('kantin-chat-file-preview');
    const file = input?.files?.[0];
    kantinState.pendingChatAttachment = null;
    if (!file) {
        clearKantinChatAttachment();
        return;
    }
    if (!validateStudentAttachment(file)) {
        clearKantinChatAttachment();
        return;
    }
    if (preview) preview.innerHTML = renderSelectedAttachmentPreview(file, 'kantinChat');
}

function clearKantinChatAttachment() {
    revokeAttachmentPreview('kantinChat');
    const input = document.getElementById('kantin-chat-file');
    const preview = document.getElementById('kantin-chat-file-preview');
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
}

async function uploadKantinChatAttachment() {
    const input = document.getElementById('kantin-chat-file');
    const file = validateStudentAttachment(input?.files?.[0]);
    if (!file) return null;
    const form = new FormData();
    form.append('file', file);
    form.append('entity_type', 'kantin_chats');
    const res = await fetch(`${API}/upload/kantin-chat`, {
        method: 'POST',
        headers: { Authorization:`Bearer ${getToken()}` },
        body: form
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Upload lampiran gagal.');
    return data.data;
}

async function sendKantinChatMessage() {
    const id = kantinState.currentChatOrder;
    const input = document.getElementById('kantin-chat-message');
    const message = input?.value.trim() || '';
    const hasFile = !!document.getElementById('kantin-chat-file')?.files?.[0];
    if (!id || (!message && !hasFile)) return showToast('Tulis pesan atau pilih lampiran dulu.', 'orange');
    try {
        const attachment = hasFile ? await uploadKantinChatAttachment() : null;
        const data = await apiFetch(`/kantin/orders/${encodeURIComponent(id)}/chat`, {
            method:'POST',
            body:JSON.stringify({
                message,
                attachment_url: attachment?.fileUrl || null,
                attachment_name: attachment?.originalName || attachment?.fileName || null,
                attachment_type: attachment?.mimeType || null
            })
        });
        showToast(data.message || 'Pesan diproses.', data.success ? 'green' : 'red');
        if (data.success) {
            input.value = '';
            clearKantinChatAttachment();
            await loadKantinChatRoom(id);
            await fetchKantinOrders();
        }
    } catch(e) {
        showToast(e.message || 'Gagal mengirim chat.', 'red');
    }
}

function formatRupiah(value) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0')) return '62' + digits.slice(1);
    return digits;
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
        profil:'Profil & Biodata', kantin:'Kantin ku', staff:'Ruang Staff'
    }[pageId] || 'Dashboard';

    if (pageId === 'profil') fetchProfil(lmsState.targetNisn || '').catch(() => {});
    if (pageId === 'forum') {
        fetchForum().catch(() => {});
        fetchPrivateContacts().catch(() => {});
    }
    if (pageId === 'kantin') {
        fetchKantinProducts().catch(() => {});
        fetchKantinProfile().catch(() => {});
        fetchKantinSellerDashboard().catch(() => {});
        fetchKantinOrders().catch(() => {});
    }
    if (pageId === 'staff') {
        fetchStaffStudents().catch(() => {});
        fetchTaskProgress().catch(() => {});
    }
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
    const rt = localStorage.getItem('studentRefreshToken') || localStorage.getItem('smkn_refresh') || localStorage.getItem('refreshToken');
    if (rt) {
        fetch(`${API}/auth/logout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ refreshToken: rt }),
        }).catch(() => {});
    }
    const studentToken = localStorage.getItem('studentAccessToken') || localStorage.getItem('smkn_token');
    if (!studentToken || localStorage.getItem('accessToken') === studentToken) {
        ['accessToken','refreshToken','userRole','userData'].forEach(k => localStorage.removeItem(k));
    }
    ['studentAccessToken','studentRefreshToken','studentUserData','smkn_token','smkn_refresh','smkn_user'].forEach(k => localStorage.removeItem(k));
    lmsState.user = null;
    window.location.replace('/login.html?msg=' + encodeURIComponent('Kamu sudah keluar dari LMS.'));
}

/* ── Helper functions ───────────────────────────────────────── */
function escHtml(str) {
    return String(str === undefined || str === null ? '' : str).replace(/[&<>"']/g, c =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c])
    );
}
function escAttr(str) {
    return escHtml(str).replace(/`/g, '&#096;');
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
    if (!f) return clearTugasAttachment();
    if (!validateTugasAttachment(f)) return clearTugasAttachment();
    const preview = document.getElementById('file-preview');
    if (preview) {
        preview.innerHTML = renderSelectedAttachmentPreview(f, 'tugas');
    }
}

function validateTugasAttachment(file) {
    const allowedMimes = [
        'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain',
        'image/jpeg','image/png','image/webp','image/gif'
    ];
    const allowedExts = ['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.txt','.jpg','.jpeg','.png','.webp','.gif'];
    const fileName = String(file.name || '').toLowerCase();
    const isAllowed = allowedMimes.includes(file.type) || allowedExts.some(ext => fileName.endsWith(ext));
    if (!isAllowed) {
        showToast('Lampiran tugas harus dokumen atau foto.', 'orange');
        return false;
    }
    if (file.size > 3 * 1024 * 1024) {
        showToast('Lampiran tugas maksimal 3MB.', 'orange');
        return false;
    }
    return true;
}

function clearTugasAttachment() {
    revokeAttachmentPreview('tugas');
    const input = document.getElementById('file-input');
    const preview = document.getElementById('file-preview');
    if (input) input.value = '';
    if (preview) preview.innerHTML = '';
}

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
    // Cek apakah sudah login (dari auth-guard atau session sebelumnya)
    const existingUser = getUser();
    const token        = getToken();

    if (existingUser && token) {
        lmsState.user = existingUser;
        initDashboard().then(() => {
            showLmsScreen('lms-dashboard');
            openInitialHashPage();
        });
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
                if (!validateTugasAttachment(f)) return clearTugasAttachment();
                const inp = document.getElementById('file-input');
                if (inp) {
                    const dt = new DataTransfer();
                    dt.items.add(f);
                    inp.files = dt.files;
                    handleFileUpload(inp);
                }
            }
        });
    }

    document.getElementById('profile-form')?.addEventListener('submit', saveProfil);
    syncStaffTaskTargetMode();
    document.getElementById('pf-kelas')?.addEventListener('change', (e) => {
        const found = lmsState.schoolClasses.find(k => k.kelas === e.target.value);
        const jurusan = document.getElementById('pf-jurusan');
        if (jurusan) jurusan.value = found?.jurusan || '';
    });
});
