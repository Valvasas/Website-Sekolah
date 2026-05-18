/* =====================================================
   LMS SMKN 1 TERISI
   File: lms.js
   ===================================================== */

'use strict';

/* ============================================================
   DATA SIMULASI
   ============================================================ */
const DATA_KELAS = [
    { id:1, nama:'Teknik Komputer & Jaringan', guru:'Pak Deni Setiawan, S.Kom', ikon:'fas fa-network-wired', warna:'linear-gradient(135deg,#002244,#003a77)', progress:72, total:16, selesai:12, badge:'XI TKJ 1' },
    { id:2, nama:'Matematika', guru:'Bu Ratna Sari, S.Pd', ikon:'fas fa-square-root-alt', warna:'linear-gradient(135deg,#7c3aed,#a855f7)', progress:55, total:14, selesai:8, badge:'XI TKJ 1' },
    { id:3, nama:'Bahasa Indonesia', guru:'Bu Intan Permata, M.Pd', ikon:'fas fa-book', warna:'linear-gradient(135deg,#059669,#34d399)', progress:88, total:12, selesai:11, badge:'XI TKJ 1' },
    { id:4, nama:'Produk Kreatif & Kewirausahaan', guru:'Pak Hendra Wijaya, S.T', ikon:'fas fa-lightbulb', warna:'linear-gradient(135deg,#b45309,#f59e0b)', progress:40, total:18, selesai:7, badge:'XI TKJ 1' },
];

const DATA_TUGAS = [
    { id:1, judul:'Laporan Praktikum Jaringan LAN', mapel:'TKJ', deadline:'28 Apr 2026', status:'belum', warna:'#002244', ikon:'fas fa-network-wired', prioritas:'red' },
    { id:2, judul:'Resume Bab 3 — Persamaan Linear', mapel:'Matematika', deadline:'30 Apr 2026', status:'belum', warna:'#7c3aed', ikon:'fas fa-square-root-alt', prioritas:'orange' },
    { id:3, judul:'Analisis Teks Argumentasi', mapel:'Bahasa Indonesia', deadline:'2 Mei 2026', status:'belum', warna:'#059669', ikon:'fas fa-book', prioritas:'orange' },
    { id:4, judul:'Proposal Usaha Kelompok', mapel:'PKK', deadline:'5 Mei 2026', status:'belum', warna:'#b45309', ikon:'fas fa-lightbulb', prioritas:'green' },
    { id:5, judul:'Konfigurasi Mikrotik (Tugas 5)', mapel:'TKJ', deadline:'10 Apr 2026', status:'selesai', warna:'#002244', ikon:'fas fa-server', prioritas:'green' },
    { id:6, judul:'Ulangan Harian Trigonometri', mapel:'Matematika', deadline:'8 Apr 2026', status:'selesai', warna:'#7c3aed', ikon:'fas fa-calculator', prioritas:'green' },
];

const DATA_MATERI = [
    { id:1, judul:'Modul 1 — Pengantar Jaringan Komputer', mapel:'TKJ', jenis:'PDF', ukuran:'2.4 MB', ikon:'fas fa-file-pdf', tipe:'pdf', warna:'#fee2e2' },
    { id:2, judul:'Video: Konfigurasi Router MikroTik', mapel:'TKJ', jenis:'VIDEO', ukuran:'45 min', ikon:'fas fa-play-circle', tipe:'video', warna:'#dbeafe' },
    { id:3, judul:'PPT Bab 4 — Sistem Bilangan', mapel:'Matematika', jenis:'PPT', ukuran:'3.1 MB', ikon:'fas fa-file-powerpoint', tipe:'ppt', warna:'#fef3c7' },
    { id:4, judul:'Lembar Kerja Teks Eksposisi', mapel:'Bhs. Indonesia', jenis:'DOC', ukuran:'1.2 MB', ikon:'fas fa-file-word', tipe:'doc', warna:'#ede9fe' },
    { id:5, judul:'Modul Business Plan UMKM', mapel:'PKK', jenis:'PDF', ukuran:'4.7 MB', ikon:'fas fa-file-pdf', tipe:'pdf', warna:'#fee2e2' },
    { id:6, judul:'Panduan Instalasi Kabel UTP', mapel:'TKJ', jenis:'PDF', ukuran:'1.8 MB', ikon:'fas fa-file-pdf', tipe:'pdf', warna:'#fee2e2' },
    { id:7, judul:'Video: Presentasi Wirausaha', mapel:'PKK', jenis:'VIDEO', ukuran:'32 min', ikon:'fas fa-play-circle', tipe:'video', warna:'#dbeafe' },
    { id:8, judul:'Modul Kultur Jaringan Tanaman', mapel:'ATPH', jenis:'PDF', ukuran:'5.2 MB', ikon:'fas fa-file-pdf', tipe:'pdf', warna:'#fee2e2' },
];

const DATA_FORUM = [
    { id:1, nama:'Rizky Maulana', avatar:'R', warna:'#002244', tag:'TKJ', waktu:'2 jam lalu', isi:'Kak, cara setting DHCP Server di Cisco Packet Tracer yang benar gimana? Saya sudah coba tapi IP-nya tidak terdistribusi ke client.', likes:5, komentar:3, liked:false },
    { id:2, nama:'Siti Nurhaliza', avatar:'S', warna:'#059669', tag:'Matematika', waktu:'5 jam lalu', isi:'Minta bantuan soal integral substitusi nomor 5 di buku LKS halaman 78. Saya bingung cara memilih variabel u-nya 😅', likes:2, komentar:8, liked:false },
    { id:3, nama:'Andi Prasetiyo', avatar:'A', warna:'#7c3aed', tag:'PKK', waktu:'Kemarin', isi:'Share template business plan yang sudah disetujui Pak Hendra ya! Tugas kelompok minggu depan nih 🙏', likes:12, komentar:6, liked:false },
    { id:4, nama:'Bu Ratna Sari', avatar:'G', warna:'#b45309', tag:'Matematika', waktu:'Kemarin', isi:'[Pengumuman] Ulangan Harian Bab 5 akan dilaksanakan Kamis lusa. Materi: Persamaan Kuadrat dan Fungsi. Silakan pelajari ringkasan yang sudah diupload di Materi.', likes:20, komentar:4, liked:false },
];

const DATA_NILAI = [
    { mapel:'TKJ', ikon:'fas fa-network-wired', warna:'#002244', nilai:[
        { label:'UH 1 — Pengantar Jaringan', skor:88 },
        { label:'UH 2 — TCP/IP & Routing', skor:82 },
        { label:'UH 3 — Server Linux', skor:90 },
        { label:'Tugas Praktikum (Rata²)', skor:87 },
    ]},
    { mapel:'Matematika', ikon:'fas fa-square-root-alt', warna:'#7c3aed', nilai:[
        { label:'UH 1 — Fungsi Komposisi', skor:76 },
        { label:'UH 2 — Trigonometri', skor:65 },
        { label:'UH 3 — Integral Dasar', skor:72 },
        { label:'Tugas Harian (Rata²)', skor:80 },
    ]},
    { mapel:'Bahasa Indonesia', ikon:'fas fa-book', warna:'#059669', nilai:[
        { label:'UH 1 — Teks Eksposisi', skor:92 },
        { label:'UH 2 — Teks Argumentasi', skor:89 },
        { label:'UH 3 — Puisi & Prosa', skor:85 },
        { label:'Tugas Menulis (Rata²)', skor:91 },
    ]},
    { mapel:'PKK', ikon:'fas fa-lightbulb', warna:'#b45309', nilai:[
        { label:'UH 1 — Kewirausahaan Dasar', skor:78 },
        { label:'UH 2 — Business Plan', skor:70 },
        { label:'Praktik Produk', skor:83 },
        { label:'Presentasi Usaha', skor:80 },
    ]},
];

/* ============================================================
   STATE
   ============================================================ */
const lmsState = {
    user: null,
    role: 'siswa',
    currentTugasId: null,
    allMateri: [...DATA_MATERI],
    forumPosts: [...DATA_FORUM],
    tugasData: [...DATA_TUGAS],
};

/* ============================================================
   UTILS
   ============================================================ */
function showLmsScreen(id) {
    document.querySelectorAll('.lms-screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const el = document.getElementById(id);
    if (el) { el.style.display = 'block'; el.classList.add('active'); window.scrollTo(0,0); }
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}

function getGreeting() {
    const h = new Date().getHours();
    if (h < 11) return 'Selamat Pagi';
    if (h < 15) return 'Selamat Siang';
    if (h < 18) return 'Selamat Sore';
    return 'Selamat Malam';
}

function setRole(role, btn) {
    lmsState.role = role;
    document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const label = document.getElementById('lf-label-user');
    if (label) label.innerHTML = role === 'siswa'
        ? '<i class="fas fa-id-card"></i> NISN'
        : '<i class="fas fa-id-badge"></i> NIP / Email';
    const userInput = document.getElementById('lf-user');
    if (userInput) userInput.placeholder = role === 'siswa' ? 'Masukkan NISN kamu' : 'Masukkan NIP/Email';
}

/* ============================================================
   LOGIN
   ============================================================ */
const lfToggle = document.getElementById('lf-toggle');
if (lfToggle) {
    lfToggle.addEventListener('click', () => {
        const inp  = document.getElementById('lf-pass');
        const icon = lfToggle.querySelector('i');
        inp.type   = inp.type === 'password' ? 'text' : 'password';
        icon.className = inp.type === 'password' ? 'fas fa-eye' : 'fas fa-eye-slash';
    });
}

function lmsLogin() {
    const user = document.getElementById('lf-user').value.trim();
    const pass = document.getElementById('lf-pass').value.trim();
    const err  = document.getElementById('lms-err');
    const errMsg = document.getElementById('lms-err-msg');

    if (!user || !pass) {
        showLmsErr(err, errMsg, 'Harap isi semua kolom.');
        return;
    }

    // Demo credentials
    const valid =
        (user === 'demo1234' && pass === 'smkn1terisi') ||
        (user.length >= 6 && pass.length >= 4);   // Longgar untuk demo

    if (!valid) {
        showLmsErr(err, errMsg, 'Username atau password salah. Coba lagi.');
        return;
    }

    // Simpan state
    lmsState.user = {
        nama: lmsState.role === 'siswa' ? 'Ahmad Farhan' : 'Pak Budi',
        nisn: user,
        role: lmsState.role,
        kelas: 'XI TKJ 1',
        initial: lmsState.role === 'siswa' ? 'A' : 'B',
    };

    err.classList.add('hidden');
    initDashboard();
    showLmsScreen('lms-dashboard');
}

function showLmsErr(el, msgEl, msg) {
    msgEl.textContent = msg;
    el.classList.remove('hidden');
}

/* ============================================================
   INIT DASHBOARD
   ============================================================ */
function initDashboard() {
    const u = lmsState.user;

    // Update UI user
    document.getElementById('tb-user-name').textContent     = u.nama.split(' ')[0];
    document.getElementById('tb-avatar-circle').textContent = u.initial;
    document.getElementById('pd-avatar').textContent        = u.initial;
    document.getElementById('pd-name').textContent          = u.nama;
    document.getElementById('pd-role').textContent          = u.role === 'siswa' ? `Siswa — ${u.kelas}` : 'Guru / Staf';
    document.getElementById('wb-greeting').textContent      = `${getGreeting()}, ${u.nama.split(' ')[0]} 👋`;

    const fcAv = document.getElementById('fc-avatar');
    if (fcAv) { fcAv.textContent = u.initial; }

    // Render semua section
    renderMiniKelas();
    renderMiniTugas();
    renderKelas();
    renderTugas('semua');
    renderMateri('');
    renderForum();
    renderNilai();
}

/* ============================================================
   NAVIGASI SIDEBAR
   ============================================================ */
function navigate(pageId, btn) {
    // Deactivate all pages
    document.querySelectorAll('.page-content').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.snav-item').forEach(s => s.classList.remove('active'));

    // Activate target
    const page = document.getElementById('page-' + pageId);
    if (page) page.classList.add('active');

    if (btn) btn.classList.add('active');
    else {
        const snav = document.querySelector(`[data-page="${pageId}"]`);
        if (snav) snav.classList.add('active');
    }

    document.getElementById('tb-page-name').textContent = {
        beranda:'Beranda', kelas:'Kelas Saya', tugas:'Tugas',
        materi:'Materi', forum:'Forum Diskusi', nilai:'Nilai Saya'
    }[pageId] || 'Dashboard';

    closeSidebar();
    window.scrollTo(0, 0);
}

function toggleSidebar() {
    const sb  = document.getElementById('lms-sidebar');
    const ov  = document.getElementById('sb-overlay');
    sb.classList.toggle('open');
    ov.classList.toggle('open');
}

function closeSidebar() {
    const sb = document.getElementById('lms-sidebar');
    const ov = document.getElementById('sb-overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('open');
}

/* ============================================================
   RENDER: BERANDA
   ============================================================ */
function renderMiniKelas() {
    const el = document.getElementById('mini-kelas-list');
    if (!el) return;
    el.innerHTML = DATA_KELAS.slice(0,3).map(k => `
        <div class="mini-kelas-item" onclick="openKelasModal(${k.id})">
            <div class="mk-icon" style="background:${k.warna};">
                <i class="${k.ikon}" style="color:rgba(255,255,255,0.9);font-size:1.1rem;"></i>
            </div>
            <div class="mk-info">
                <h4>${k.nama}</h4>
                <p>${k.guru}</p>
            </div>
            <i class="fas fa-chevron-right mk-arrow"></i>
        </div>
    `).join('');
}

function renderMiniTugas() {
    const el = document.getElementById('mini-tugas-list');
    if (!el) return;
    const belum = DATA_TUGAS.filter(t => t.status === 'belum').slice(0,4);
    el.innerHTML = belum.map(t => `
        <div class="mini-tugas-item">
            <div class="mt-dot" style="background:${t.prioritas==='red'?'#ef4444':t.prioritas==='orange'?'#f59e0b':'#10b981'};"></div>
            <div class="mt-info">
                <h4>${t.judul}</h4>
                <p>${t.mapel} · ${t.deadline}</p>
            </div>
            <span class="mt-chip" style="background:${t.prioritas==='red'?'#fee2e2':t.prioritas==='orange'?'#fef3c7':'#d1fae5'};color:${t.prioritas==='red'?'#ef4444':t.prioritas==='orange'?'#f59e0b':'#10b981'};">
                ${t.prioritas==='red'?'Segera':'Upcoming'}
            </span>
        </div>
    `).join('');
}

/* ============================================================
   RENDER: KELAS
   ============================================================ */
function renderKelas() {
    const el = document.getElementById('kelas-grid');
    if (!el) return;
    el.innerHTML = DATA_KELAS.map(k => `
        <div class="kelas-card" onclick="openKelasModal(${k.id})">
            <div class="kc-banner" style="background:${k.warna};">
                <i class="${k.ikon}"></i>
                <span class="kc-badge">${k.badge}</span>
            </div>
            <div class="kc-body">
                <h3>${k.nama}</h3>
                <p>${k.guru}</p>
                <div class="kc-progress">
                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:#64748b;margin-bottom:4px;">
                        <span>Progress</span><span>${k.progress}%</span>
                    </div>
                    <div class="kc-prog-bar">
                        <div class="kc-prog-fill" style="width:${k.progress}%;"></div>
                    </div>
                </div>
                <div class="kc-meta">
                    <span><i class="fas fa-book-open"></i> ${k.selesai}/${k.total} Materi</span>
                    <span><i class="fas fa-tasks"></i> ${k.total - k.selesai} Tersisa</span>
                </div>
            </div>
        </div>
    `).join('');
}

function openKelasModal(id) {
    const k = DATA_KELAS.find(x => x.id === id);
    if (!k) return;

    document.getElementById('modal-kelas-title').textContent = k.nama;
    document.getElementById('modal-kelas-body').innerHTML = `
        <div style="display:flex;align-items:center;gap:14px;padding:16px;background:var(--light);border-radius:10px;margin-bottom:20px;">
            <div style="width:50px;height:50px;border-radius:12px;background:${k.warna};display:flex;align-items:center;justify-content:center;">
                <i class="${k.ikon}" style="color:white;font-size:1.3rem;"></i>
            </div>
            <div>
                <h3 style="font-size:1rem;font-weight:700;">${k.nama}</h3>
                <p style="font-size:0.82rem;color:#64748b;">${k.guru} · ${k.badge}</p>
            </div>
        </div>
        <h4 style="font-size:0.88rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;margin-bottom:12px;">Daftar Materi</h4>
        <div style="display:flex;flex-direction:column;gap:8px;">
            ${Array.from({length:k.total},(_,i)=>`
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:${i<k.selesai?'#d1fae5':'var(--light)'};border-radius:8px;border:1px solid ${i<k.selesai?'#a7f3d0':'var(--border)'};">
                <i class="${i<k.selesai?'fas fa-check-circle':'fas fa-circle'}" style="color:${i<k.selesai?'#10b981':'#cbd5e1'};font-size:1.1rem;flex-shrink:0;"></i>
                <span style="font-size:0.85rem;font-weight:${i<k.selesai?'600':'500'};color:${i<k.selesai?'#065f46':'#374151'};">
                    Pertemuan ${i+1} — ${getMaterijudul(k.id, i+1)}
                </span>
                ${i<k.selesai?'<span style="margin-left:auto;font-size:0.72rem;background:#10b981;color:white;padding:2px 8px;border-radius:50px;font-weight:700;">Selesai</span>':''}
            </div>`).join('')}
        </div>
    `;
    openModal('modal-kelas');
}

function getMaterijudul(kelasId, pertemuan) {
    const judul = {
        1: ['Pengantar Jaringan','OSI Layer','TCP/IP','Subnetting','Routing Dasar','MikroTik RouterOS','VLAN','Server DNS','Server DHCP','Server Web','Firewall','VPN','Troubleshooting','Fiber Optik','Proyek Akhir','Review'],
        2: ['Fungsi & Relasi','Fungsi Komposisi','Fungsi Invers','Trigonometri Dasar','Aturan Sinus','Aturan Kosinus','Integral Substitusi','Integral Parsial','Nilai Integral','Limit Fungsi','Turunan Dasar','Turunan Aturan Rantai','Statistika','Peluang'],
        3: ['Teks Laporan','Teks Eksposisi','Teks Argumentasi','Teks Narasi','Puisi Modern','Prosa Fiksi','Drama','Surat Resmi','Debat','Pidato','Cerpen','Novel','Review'],
        4: ['Dasar Wirausaha','Analisis Pasar','Business Plan','Produksi','Keuangan Usaha','Pemasaran Digital','Legalitas Usaha','Manajemen SDM','Presentasi Usaha','Evaluasi Usaha','Inovasi Produk','E-Commerce','Laporan Usaha','PKL','Review','Ujian Praktek','Presentasi Final','Sertifikasi'],
    };
    return (judul[kelasId]?.[pertemuan-1]) || `Materi ${pertemuan}`;
}

/* ============================================================
   RENDER: TUGAS
   ============================================================ */
function renderTugas(filter) {
    const el = document.getElementById('tugas-list');
    if (!el) return;

    const filtered = filter === 'semua'
        ? lmsState.tugasData
        : lmsState.tugasData.filter(t => t.status === filter);

    if (!filtered.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Tidak ada tugas.</p>';
        return;
    }

    el.innerHTML = filtered.map(t => `
        <div class="tugas-item ${t.status==='selesai'?'done':''}" id="tugas-item-${t.id}">
            <div class="ti-icon" style="background:${t.warna}20;">
                <i class="${t.ikon}" style="color:${t.warna};"></i>
            </div>
            <div class="ti-info">
                <h4>${t.judul}</h4>
                <p>${t.mapel} · Deadline: ${t.deadline}</p>
            </div>
            <span class="ti-deadline ${t.prioritas}">${t.status==='selesai'?'✓ Selesai':t.deadline}</span>
            ${t.status!=='selesai'?`
            <button onclick="bukaSubmitTugas(${t.id})" style="padding:8px 16px;background:var(--navy);color:white;border:none;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;white-space:nowrap;transition:background 0.2s;" onmouseover="this.style.background='var(--gold)';this.style.color='var(--navy)'" onmouseout="this.style.background='var(--navy)';this.style.color='white'">
                Kumpulkan
            </button>`:''}
        </div>
    `).join('');
}

function filterTugas(filter, btn) {
    document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTugas(filter);
}

function bukaSubmitTugas(id) {
    lmsState.currentTugasId = id;
    const t = lmsState.tugasData.find(x => x.id === id);
    if (t) document.getElementById('modal-tugas-title').textContent = `Kumpulkan: ${t.judul}`;
    document.getElementById('modal-tugas-text').value = '';
    document.getElementById('file-preview').textContent = '';
    openModal('modal-tugas');
}

function handleFileUpload(input) {
    const f = input.files[0];
    if (f) {
        document.getElementById('file-preview').innerHTML =
            `<span><i class="fas fa-paperclip"></i> ${f.name} (${(f.size/1024).toFixed(1)} KB)</span>`;
    }
}

function submitTugas() {
    const btn  = document.getElementById('submit-tugas-btn');
    const text = document.getElementById('modal-tugas-text').value;

    if (!text.trim()) {
        alert('Harap isi jawaban atau keterangan terlebih dahulu.');
        return;
    }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Mengumpulkan...';
    btn.disabled  = true;

    setTimeout(() => {
        // Update status tugas
        const idx = lmsState.tugasData.findIndex(t => t.id === lmsState.currentTugasId);
        if (idx !== -1) {
            lmsState.tugasData[idx].status   = 'selesai';
            lmsState.tugasData[idx].prioritas = 'green';
        }

        closeModal('modal-tugas');
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Kumpulkan Tugas';
        btn.disabled  = false;
        renderTugas('semua');
        renderMiniTugas();

        // Toast notification
        showToast('Tugas berhasil dikumpulkan! ✓', 'green');
    }, 1800);
}

/* ============================================================
   RENDER: MATERI
   ============================================================ */
function renderMateri(query) {
    const el = document.getElementById('materi-list');
    if (!el) return;
    const filtered = lmsState.allMateri.filter(m =>
        m.judul.toLowerCase().includes(query.toLowerCase()) ||
        m.mapel.toLowerCase().includes(query.toLowerCase())
    );

    if (!filtered.length) {
        el.innerHTML = '<p style="text-align:center;color:#64748b;padding:40px 0;">Materi tidak ditemukan.</p>';
        return;
    }

    el.innerHTML = filtered.map(m => `
        <div class="materi-item" onclick="downloadMateri('${m.judul}')">
            <div class="mi-icon" style="background:${m.warna};">
                <i class="${m.ikon}" style="color:${m.tipe==='pdf'?'#ef4444':m.tipe==='video'?'#3b82f6':m.tipe==='ppt'?'#f59e0b':'#8b5cf6'};"></i>
            </div>
            <div class="mi-info">
                <h4>${m.judul}</h4>
                <p>${m.mapel} · ${m.ukuran}</p>
            </div>
            <span class="mi-type ${m.tipe}">${m.jenis}</span>
            <i class="fas fa-download mi-dl"></i>
        </div>
    `).join('');
}

function searchMateri(query) { renderMateri(query); }

function downloadMateri(judul) {
    showToast(`Mengunduh: ${judul}`, 'blue');
}

/* ============================================================
   RENDER: FORUM
   ============================================================ */
function renderForum() {
    const el = document.getElementById('forum-list');
    if (!el) return;

    el.innerHTML = lmsState.forumPosts.map(p => `
        <div class="forum-post" id="fp-${p.id}">
            <div class="fp-header">
                <div class="fp-avatar" style="background:${p.warna};color:${p.warna==='#002244'?'var(--gold)':'white'};">
                    ${p.avatar}
                </div>
                <div class="fp-meta">
                    <h4>${p.nama}</h4>
                    <p>${p.waktu}</p>
                </div>
                <span class="fp-tag">${p.tag}</span>
            </div>
            <p class="fp-body">${p.isi}</p>
            <div class="fp-actions">
                <button class="fp-btn ${p.liked?'liked':''}" onclick="toggleLike(${p.id})">
                    <i class="${p.liked?'fas':'far'} fa-heart"></i> ${p.likes}
                </button>
                <button class="fp-btn" onclick="replyForum(${p.id})">
                    <i class="far fa-comment"></i> ${p.komentar} Balasan
                </button>
                <button class="fp-btn">
                    <i class="fas fa-share"></i> Bagikan
                </button>
            </div>
        </div>
    `).join('');
}

function toggleLike(id) {
    const p = lmsState.forumPosts.find(x => x.id === id);
    if (!p) return;
    p.liked  = !p.liked;
    p.likes += p.liked ? 1 : -1;
    renderForum();
}

function replyForum(id) {
    document.getElementById('forum-input').focus();
    document.getElementById('forum-input').placeholder = `Membalas postingan #${id}...`;
}

function postForum() {
    const text  = document.getElementById('forum-input').value.trim();
    const mapel = document.getElementById('forum-mapel').value;
    if (!text) return;

    const newPost = {
        id:     Date.now(),
        nama:   lmsState.user?.nama || 'Saya',
        avatar: lmsState.user?.initial || 'S',
        warna:  '#002244',
        tag:    mapel.split('—')[0].trim(),
        waktu:  'Baru saja',
        isi:    text,
        likes:  0,
        komentar: 0,
        liked:  false,
    };
    lmsState.forumPosts.unshift(newPost);
    renderForum();
    document.getElementById('forum-input').value = '';
    document.getElementById('forum-input').placeholder = 'Tulis pertanyaan atau diskusi...';
    showToast('Postingan berhasil dikirim!', 'green');
}

/* ============================================================
   RENDER: NILAI
   ============================================================ */
function renderNilai() {
    const el = document.getElementById('nilai-grid');
    if (!el) return;
    el.innerHTML = DATA_NILAI.map(n => {
        const avg = Math.round(n.nilai.reduce((s,v) => s+v.skor, 0) / n.nilai.length);
        return `
        <div class="nilai-card" style="border-top-color:${n.warna};">
            <div class="nc-header">
                <div class="nc-icon" style="background:${n.warna}20;">
                    <i class="${n.ikon}" style="color:${n.warna};"></i>
                </div>
                <div class="nc-info">
                    <h3>${n.mapel}</h3>
                    <p>${n.nilai.length} penilaian</p>
                </div>
            </div>
            <div class="nc-body">
                ${n.nilai.map(v => `
                <div class="nilai-row">
                    <span class="nr-label">${v.label}</span>
                    <span class="nr-val ${v.skor>=70?'lulus':'remedial'}">${v.skor}</span>
                </div>`).join('')}
            </div>
            <div class="nc-avg">
                <span>Rata-rata</span>
                <strong style="color:${avg>=70?'var(--green)':'var(--red)'};">${avg}</strong>
            </div>
        </div>`;
    }).join('');
}

/* ============================================================
   DROPDOWN NOTIF & PROFIL
   ============================================================ */
function toggleNotif() {
    const nd = document.getElementById('notif-dropdown');
    const pd = document.getElementById('profile-dropdown');
    if (pd) pd.classList.remove('open');
    if (nd) nd.classList.toggle('open');
}

function toggleProfile() {
    const pd = document.getElementById('profile-dropdown');
    const nd = document.getElementById('notif-dropdown');
    if (nd) nd.classList.remove('open');
    if (pd) pd.classList.toggle('open');
}

// Tutup dropdown saat klik di luar
document.addEventListener('click', (e) => {
    const nd  = document.getElementById('notif-dropdown');
    const pd  = document.getElementById('profile-dropdown');
    const nb  = document.getElementById('notif-btn');
    const av  = document.querySelector('.tb-avatar');
    if (nd && !nd.contains(e.target) && nb && !nb.contains(e.target)) nd.classList.remove('open');
    if (pd && !pd.contains(e.target) && av && !av.contains(e.target)) pd.classList.remove('open');
});

/* ============================================================
   TOAST NOTIFICATION
   ============================================================ */
function showToast(msg, type = 'green') {
    const colors = { green:'#10b981', blue:'#3b82f6', red:'#ef4444', orange:'#f59e0b' };
    const toast  = document.createElement('div');
    toast.style.cssText = `
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(60px);
        background:${colors[type]||colors.green}; color:white;
        padding:12px 24px; border-radius:50px;
        font-family:'Plus Jakarta Sans',sans-serif; font-size:0.88rem; font-weight:700;
        box-shadow:0 8px 24px rgba(0,0,0,0.2); z-index:9999;
        display:flex; align-items:center; gap:8px;
        transition:transform 0.4s cubic-bezier(0.25,1,0.5,1), opacity 0.4s;
        opacity:0; pointer-events:none;
    `;
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${msg}`;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
        toast.style.transform = 'translateX(-50%) translateY(0)';
        toast.style.opacity   = '1';
    });

    setTimeout(() => {
        toast.style.transform = 'translateX(-50%) translateY(60px)';
        toast.style.opacity   = '0';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}

/* ============================================================
   LOGOUT
   ============================================================ */
function lmsLogout() {
    lmsState.user = null;
    showLmsScreen('lms-login');
    // Reset form
    const lfUser = document.getElementById('lf-user');
    const lfPass = document.getElementById('lf-pass');
    if (lfUser) lfUser.value = '';
    if (lfPass) lfPass.value = '';
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    showLmsScreen('lms-login');

    // Drag & drop materi
    const drop = document.getElementById('file-drop');
    if (drop) {
        drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.style.borderColor = 'var(--gold)'; });
        drop.addEventListener('dragleave', () => { drop.style.borderColor = ''; });
        drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.style.borderColor = '';
            const f = e.dataTransfer.files[0];
            if (f) document.getElementById('file-preview').innerHTML =
                `<span><i class="fas fa-paperclip"></i> ${f.name} (${(f.size/1024).toFixed(1)} KB)</span>`;
        });
    }
});