/* =====================================================
   PORTAL DATA SISWA — SMKN 1 TERISI
   File: datasiswa.js
   ===================================================== */
'use strict';

/* ============================================================
   API CONFIG & FALLBACK DATA
   ============================================================ */
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3001' : '';

async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('smkn_token');
    const res = await fetch(API_BASE + path, {
        ...options,
        headers: {
            'Content-Type' : 'application/json',
            'Authorization': token ? 'Bearer ' + token : '',
            ...(options.headers||{}),
        },
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

const FALLBACK_NILAI = {
    genap: [
        { mapel:'Teknik Komputer Jaringan', uh:90, uts:86, uas:88, tugas:92, kkm:75 },
        { mapel:'Matematika',               uh:78, uts:80, uas:82, tugas:85, kkm:70 },
        { mapel:'Bahasa Indonesia',         uh:88, uts:90, uas:85, tugas:92, kkm:70 },
        { mapel:'Bahasa Inggris',           uh:82, uts:85, uas:88, tugas:90, kkm:70 },
        { mapel:'PKn',                      uh:85, uts:88, uas:86, tugas:88, kkm:70 },
        { mapel:'Sejarah Indonesia',        uh:80, uts:82, uas:84, tugas:86, kkm:70 },
        { mapel:'Produk Kreatif & KWU',     uh:87, uts:89, uas:91, tugas:93, kkm:75 },
    ],
    ganjil: [
        { mapel:'Teknik Komputer Jaringan', uh:85, uts:88, uas:90, tugas:87, kkm:75 },
        { mapel:'Matematika',               uh:75, uts:78, uas:80, tugas:82, kkm:70 },
        { mapel:'Bahasa Indonesia',         uh:85, uts:87, uas:89, tugas:88, kkm:70 },
        { mapel:'Bahasa Inggris',           uh:78, uts:82, uas:85, tugas:87, kkm:70 },
        { mapel:'PKn',                      uh:82, uts:86, uas:84, tugas:85, kkm:70 },
        { mapel:'Sejarah Indonesia',        uh:77, uts:80, uas:82, tugas:84, kkm:70 },
        { mapel:'Produk Kreatif & KWU',     uh:84, uts:86, uas:88, tugas:90, kkm:75 },
    ],
};

const FALLBACK_JADWAL = {
    senin : [
        { jam:'07.00 - 08.30', mapel:'Teknik Komputer Jaringan', guru:'Pak Deni S.',   ruang:'Lab TKJ 1' },
        { jam:'08.30 - 10.00', mapel:'Matematika',               guru:'Bu Ratna S.',   ruang:'R.11' },
        { jam:'10.15 - 11.45', mapel:'Bahasa Indonesia',         guru:'Bu Intan P.',   ruang:'R.11' },
        { jam:'12.45 - 14.15', mapel:'PKn',                      guru:'Pak Asep H.',   ruang:'R.11' },
    ],
    selasa: [
        { jam:'07.00 - 08.30', mapel:'Bahasa Inggris',           guru:'Bu Maya S.',    ruang:'R.12' },
        { jam:'08.30 - 10.00', mapel:'Produk Kreatif & KWU',     guru:'Pak Hendra W.', ruang:'R.11' },
        { jam:'10.15 - 11.45', mapel:'Sejarah Indonesia',        guru:'Bu Rini L.',    ruang:'R.11' },
        { jam:'12.45 - 14.15', mapel:'Praktik TKJ',              guru:'Pak Deni S.',   ruang:'Lab TKJ 2' },
    ],
    rabu: [
        { jam:'07.00 - 09.00', mapel:'Praktik TKJ (TEFA)',       guru:'Pak Deni S.',   ruang:'Lab TKJ 1' },
        { jam:'09.00 - 11.00', mapel:'Matematika',               guru:'Bu Ratna S.',   ruang:'R.11' },
    ],
    kamis: [
        { jam:'07.00 - 08.30', mapel:'Teknik Komputer Jaringan', guru:'Pak Deni S.',   ruang:'Lab TKJ 2' },
        { jam:'08.30 - 10.00', mapel:'Sejarah Indonesia',        guru:'Bu Rini L.',    ruang:'R.11' },
    ],
    jumat: [
        { jam:'07.00 - 08.00', mapel:'Pendidikan Agama Islam',   guru:'Pak Usep M.',   ruang:'Mushola' },
        { jam:'08.00 - 09.30', mapel:'PKn',                      guru:'Pak Asep H.',   ruang:'R.11' },
    ],
};

const FALLBACK_KEHADIRAN = {
    hadir:142, sakit:3, izin:2, alpha:1,
    riwayat:[
        { tgl:'23 Apr 2026', hari:'Kamis',  status:'hadir', ket:'-' },
        { tgl:'22 Apr 2026', hari:'Rabu',   status:'hadir', ket:'-' },
        { tgl:'16 Apr 2026', hari:'Kamis',  status:'sakit', ket:'Demam' },
        { tgl:'10 Apr 2026', hari:'Jumat',  status:'izin',  ket:'Keperluan keluarga' },
    ],
};

const FALLBACK_PRESTASI = [
    { judul:'Juara 1 LKS IT Networking', tingkat:'Kabupaten Indramayu', tahun:'2025', medal:'🥇', keterangan:'Lomba Kompetensi Siswa bidang IT Network Systems Administration.' },
    { judul:'Juara 2 Olimpiade Matematika', tingkat:'Kecamatan Terisi', tahun:'2025', medal:'🥈', keterangan:'Kompetisi Olimpiade Sains Matematika tingkat kecamatan.' },
];

const NOTIFIKASI = [
    { ikon:'fas fa-tasks', warna:'#2563eb', judul:'Jadwal UKK telah ditetapkan',  waktu:'1 jam lalu', unread:true  },
    { ikon:'fas fa-star',  warna:'#d97706', judul:'Nilai UTS sudah bisa dilihat', waktu:'3 jam lalu', unread:true  },
    { ikon:'fas fa-file-alt', warna:'#059669', judul:'Surat Aktif siap diambil', waktu:'Kemarin',    unread:false },
    { ikon:'fas fa-calendar', warna:'#7c3aed', judul:'Libur Nasional 1 Mei 2026', waktu:'2 hari lalu',unread:false },
];

/* ============================================================
   STATE
   ============================================================ */
let currentUser  = null;
let currentMonth = new Date().getMonth();
let currentYear  = new Date().getFullYear();
let currentSem   = 'genap';
let suratList    = [];
let apiData = { profil:null, nilai:{}, kehadiran:null, jadwal:{}, prestasi:[], dashboard:null };

/* ============================================================
   UTILS
   ============================================================ */
function getGreeting() {
    const h = new Date().getHours();
    if (h < 11) return 'Selamat Pagi';
    if (h < 15) return 'Selamat Siang';
    if (h < 18) return 'Selamat Sore';
    return 'Selamat Malam';
}

function showPage(id) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
}

function showToastDs(msg, type='green', dur=3000) {
    const c = document.getElementById('toast-ds-container');
    if (!c) return;
    const icons = { green:'fas fa-check-circle', red:'fas fa-exclamation-circle', blue:'fas fa-info-circle', orange:'fas fa-bell' };
    const t = document.createElement('div');
    t.className = `toast-ds ${type}`;
    t.innerHTML = `<i class="${icons[type]||icons.green}"></i> ${msg}`;
    c.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0'; t.style.transform = 'translateX(40px)';
        t.style.transition = '0.3s';
        setTimeout(() => t.remove(), 300);
    }, dur);
}

/* ============================================================
   SIDEBAR & TOPBAR
   ============================================================ */
function toggleSidebar() {
    const sb = document.getElementById('ds-sidebar');
    const ov = document.getElementById('sb-overlay');
    sb.classList.toggle('open');
    ov.classList.toggle('open');
}
function closeSidebar() {
    const sb = document.getElementById('ds-sidebar');
    const ov = document.getElementById('sb-overlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('open');
}

function navTo(pageId, el) {
    if (!currentUser) return;
    document.querySelectorAll('.ds-nav-item').forEach(i => i.classList.remove('active'));
    if (el) el.classList.add('active');
    document.getElementById('topbar-page-name').textContent = {
        beranda:'Dashboard', biodata:'Biodata Saya', kehadiran:'Kehadiran',
        nilai:'Nilai Akademik', prestasi:'Prestasi', jadwal:'Jadwal Pelajaran',
        surat:'Surat & Dokumen'
    }[pageId] || pageId;
    showPage('page-' + pageId);
    closeSidebar();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (pageId === 'kehadiran') renderKalender();
    if (pageId === 'nilai') renderNilai(currentSem);
    if (pageId === 'jadwal') renderJadwal('senin');
}

function toggleNotif() {
    const p = document.getElementById('notif-panel');
    if (p) p.classList.toggle('open');
    // Tutup saat klik luar
}

/* ============================================================
   LOGIN
   ============================================================ */
async function doLogin() {
    const nisn = document.getElementById('l-nisn').value.trim();
    const pass = document.getElementById('l-pass').value.trim();
    const err  = document.getElementById('l-err');
    const errM = document.getElementById('l-err-msg');
    const btn  = document.querySelector('.btn-login-ds');

    if (!nisn || !pass) { errM.textContent='Harap isi semua kolom.'; err.classList.remove('hidden'); return; }

    if (btn) { btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Masuk...'; btn.disabled=true; }

    try {
        const json = await apiFetch('/api/auth/login', {
            method:'POST', body:JSON.stringify({ nisn, password:pass }),
        });

        if (!json.success) throw new Error(json.message || 'Login gagal.');

        // Simpan token
        localStorage.setItem('smkn_token',   json.data.accessToken);
        localStorage.setItem('smkn_refresh',  json.data.refreshToken);
        localStorage.setItem('smkn_user',     JSON.stringify(json.data.user));

        const u = json.data.user;
        currentUser = { nisn:u.nisn, nama:u.nama_lengkap, kelas:'-', jurusan:'-', role:u.role, id:u.id };
        err.classList.add('hidden');
        await initDashboard();

    } catch(e) {
        // Fallback demo mode jika backend offline
        if (e.message.includes('fetch') || e.message.includes('Failed')) {
            showToastDs('Backend offline — mode demo aktif', 'orange', 4000);
            currentUser = { nisn, nama:'Ahmad Farhan Maulana', kelas:'XI TKJ 1', jurusan:'Teknik Komputer & Jaringan', role:'siswa' };
            await initDashboard();
        } else {
            errM.textContent = e.message;
            err.classList.remove('hidden');
        }
    } finally {
        if (btn) { btn.innerHTML='<i class="fas fa-sign-in-alt"></i> Masuk'; btn.disabled=false; }
    }
}

/* ============================================================
   INIT DASHBOARD
   ============================================================ */
async function initDashboard() {
    const u = currentUser;

    // Fetch semua data paralel dari API
    try {
        const [dash, nilaiRes, khRes, jadwalRes] = await Promise.allSettled([
            apiFetch('/api/siswa/dashboard'),
            apiFetch('/api/siswa/nilai?semester=genap'),
            apiFetch('/api/siswa/kehadiran'),
            apiFetch('/api/siswa/jadwal'),
        ]);

        if (dash.status==='fulfilled' && dash.value.success) {
            const d = dash.value.data;
            u.kelas   = d.kelas   || u.kelas   || '-';
            u.jurusan = d.jurusan || u.jurusan || '-';
            apiData.dashboard = d;
        }
        if (nilaiRes.status==='fulfilled' && nilaiRes.value.success) {
            apiData.nilai.genap = nilaiRes.value.data;
        }
        if (khRes.status==='fulfilled' && khRes.value.success) {
            apiData.kehadiran = { ...khRes.value.summary, riwayat: khRes.value.data };
        }
        if (jadwalRes.status==='fulfilled' && jadwalRes.value.success) {
            apiData.jadwal = jadwalRes.value.data;
        }
    } catch(e) { /* pakai fallback */ }

    // Update UI sidebar
    const initial = u.nama.charAt(0).toUpperCase();
    const el = id => document.getElementById(id);
    if(el('sb-avatar'))     el('sb-avatar').textContent     = initial;
    if(el('sb-nama'))       el('sb-nama').textContent       = u.nama.split(' ').slice(0,2).join(' ');
    if(el('sb-kelas'))      el('sb-kelas').textContent      = u.kelas;
    if(el('topbar-avatar')) el('topbar-avatar').textContent = initial;

    // Welcome banner
    if(el('wd-greeting')) el('wd-greeting').textContent = getGreeting();
    if(el('wd-nama'))     el('wd-nama').textContent     = u.nama.split(' ')[0];
    if(el('wd-sub'))      el('wd-sub').textContent      = `${u.kelas} · Semester Genap · TA 2025/2026`;

    // Biodata profile card
    if(el('bpc-avatar'))  el('bpc-avatar').textContent  = initial;
    if(el('bpc-nama'))    el('bpc-nama').textContent    = u.nama;
    if(el('bpc-kelas'))   el('bpc-kelas').textContent   = `${u.kelas} · SMKN 1 Terisi`;
    if(el('bpc-nisn'))    el('bpc-nisn').textContent    = u.nisn;
    if(el('bpc-jurusan')) el('bpc-jurusan').textContent = (u.jurusan||'-').split(' ')[0];

    renderNotif();
    renderBeranda();
    renderBiodata();
    renderKehadiranTable();
    renderNilai('genap');
    renderPrestasi();
    renderJadwal('senin');
    renderSurat();

    showPage('page-beranda');
}

/* ============================================================
   RENDER: NOTIFIKASI
   ============================================================ */
function renderNotif() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    list.innerHTML = NOTIFIKASI.map(n => `
        <div class="notif-item ${n.unread?'unread':''}">
            <i class="notif-item ni-icon ${n.ikon}" style="color:${n.warna};"></i>
            <div class="ni-text">
                <strong>${n.judul}</strong>
                <span>${n.waktu}</span>
            </div>
        </div>
    `).join('');
}

/* ============================================================
   RENDER: BERANDA
   ============================================================ */
function renderBeranda() {
    // Grafik Kehadiran Bulanan (Chart Batang)
    const chartEl = document.getElementById('attendance-chart');
    if (chartEl) {
        const bulan   = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
        const data    = [22,20,24,21,23,0,0,0,0,0,0,0]; // 0 = belum
        const maxVal  = Math.max(...data.filter(v=>v>0));
        const html    = `<div class="chart-bars">
            ${bulan.map((b,i) => `
            <div class="chart-bar-wrap">
                <div class="chart-bar" style="
                    height:${data[i]?(data[i]/maxVal*100)+'%':'4%'};
                    background:${data[i]?'#2563eb':'#e2e8f0'};
                    opacity:${data[i]?'0.85':'0.5'};
                " title="${b}: ${data[i]||0} hari"></div>
                <span class="chart-label">${b}</span>
            </div>`).join('')}
        </div>`;
        chartEl.innerHTML = html;
    }

    // Nilai Bars
    const barsEl = document.getElementById('nilai-bars');
    if (barsEl) {
        const mapelList = (apiData.nilai.genap || FALLBACK_NILAI.genap).slice(0,5);
        barsEl.innerHTML = mapelList.map(m => {
            const final = m.nilai_final !== undefined ? Math.round(m.nilai_final) : Math.round((m.uh*0.2 + m.uts*0.25 + m.uas*0.3 + m.tugas*0.25));
            const color = final >= 90 ? '#059669' : final >= 75 ? '#2563eb' : '#dc2626';
            return `<div class="nb-item">
                <div class="nb-info">
                    <span>${m.mapel.split(' ').slice(0,3).join(' ')}</span>
                    <strong style="color:${color}">${final}</strong>
                </div>
                <div class="nb-bar-bg">
                    <div class="nb-bar-fill" style="width:${final}%;background:${color};"></div>
                </div>
            </div>`;
        }).join('');
        // Trigger animasi
        requestAnimationFrame(() => {
            document.querySelectorAll('.nb-bar-fill').forEach(el => {
                const w = el.style.width; el.style.width = '0';
                setTimeout(() => { el.style.width = w; }, 100);
            });
        });
    }

    // Jadwal hari ini
    const hari = ['minggu','senin','selasa','rabu','kamis','jumat','sabtu'];
    const hariIni = hari[new Date().getDay()];
    const jadwal  = (Object.keys(apiData.jadwal).length ? apiData.jadwal : FALLBACK_JADWAL)[hariIni] || [];
    const hariEl  = document.getElementById('hari-ini-badge');
    const jadwalEl= document.getElementById('jadwal-today');
    const now     = new Date();
    const nowHours= now.getHours() * 60 + now.getMinutes();

    if (hariEl) hariEl.textContent = hariIni.charAt(0).toUpperCase()+hariIni.slice(1);
    if (jadwalEl) {
        if (!jadwal.length) {
            jadwalEl.innerHTML = '<div style="padding:20px;text-align:center;color:#94a3b8;font-size:0.88rem;"><i class="fas fa-coffee"></i> Tidak ada jadwal hari ini. Selamat beristirahat!</div>';
        } else {
            jadwalEl.innerHTML = jadwal.map((j,i) => {
                const [startH, startM] = j.jam.split(' - ')[0].split('.').map(Number);
                const [endH,   endM]   = j.jam.split(' - ')[1].split('.').map(Number);
                const startMin = startH * 60 + startM;
                const endMin   = endH   * 60 + endM;
                const isCurr   = nowHours >= startMin && nowHours < endMin;
                return `<div class="jt-item ${isCurr?'current':''}">
                    <span class="jt-time">${j.jam}</span>
                    <div style="flex:1;">
                        <div class="jt-mapel">${j.mapel}</div>
                        <div class="jt-guru">${j.guru}</div>
                    </div>
                    <span class="jt-room">${j.ruang}</span>
                    ${isCurr ? '<span style="background:#d1fae5;color:#065f46;padding:3px 8px;border-radius:50px;font-size:0.7rem;font-weight:700;margin-left:6px;">Sekarang</span>' : ''}
                </div>`;
            }).join('');
        }
    }
}

/* ============================================================
   RENDER: BIODATA
   ============================================================ */
function renderBiodata() {
    const p = apiData.profil?.profil;
    const u = currentUser;

    function renderSection(sectionId, data) {
        const el = document.getElementById(sectionId);
        if (!el || !data) return;
        el.innerHTML = Object.entries(data).map(([k,v]) => `
            <div class="bd-field">
                <label>${k}</label>
                <span>${v || '-'}</span>
            </div>
        `).join('');
    }

    const pribadi = {
        'NISN'           : u.nisn || '-',
        'Nama Lengkap'   : u.nama || '-',
        'Tempat Lahir'   : p?.tempat_lahir || '-',
        'Tanggal Lahir'  : p?.tanggal_lahir ? new Date(p.tanggal_lahir).toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'}) : '-',
        'Jenis Kelamin'  : p?.jenis_kelamin || '-',
        'Agama'          : p?.agama || 'Islam',
        'Kewarganegaraan': 'Indonesia',
        'No. HP'         : u.no_hp || '-',
    };
    const ortu = {
        'Nama Ayah'       : p?.nama_ayah      || '-',
        'Pekerjaan Ayah'  : p?.pekerjaan_ayah || '-',
        'Nama Ibu'        : p?.nama_ibu       || '-',
        'Pekerjaan Ibu'   : p?.pekerjaan_ibu  || '-',
        'No. HP Orang Tua': p?.no_hp_ortu     || '-',
        'Email Orang Tua' : p?.email_ortu     || '-',
    };
    const alamat = {
        'Jalan'     : p?.alamat     || '-',
        'Kelurahan' : p?.kelurahan  || '-',
        'Kecamatan' : p?.kecamatan  || '-',
        'Kabupaten' : p?.kabupaten  || 'Indramayu',
        'Provinsi'  : p?.provinsi   || 'Jawa Barat',
        'Kode Pos'  : p?.kode_pos   || '-',
    };

    renderSection('bd-pribadi', pribadi);
    renderSection('bd-ortu',    ortu);
    renderSection('bd-alamat',  alamat);

    // Fetch profil dari API jika belum ada
    if (!apiData.profil && currentUser?.nisn) {
        apiFetch('/api/siswa/profil').then(json => {
            if (json.success) { apiData.profil = json.data; renderBiodata(); }
        }).catch(()=>{});
    }
}

/* ============================================================
   RENDER: KEHADIRAN TABLE
   ============================================================ */
function renderKehadiranTable() {
    const kh    = apiData.kehadiran || FALLBACK_KEHADIRAN;
    const tbody = document.getElementById('kehadiran-tbody');
    if (!tbody) return;

    const statusMap = { hadir:'Hadir', sakit:'Sakit', izin:'Izin', alpha:'Tidak Hadir', libur:'-' };
    const riwayat   = kh.riwayat || [];
    tbody.innerHTML = riwayat.map(r => `
        <tr>
            <td>${r.tgl || r.tanggal || '-'}</td>
            <td>${r.hari || '-'}</td>
            <td><span class="status-badge ${r.status}">${statusMap[r.status]||r.status}</span></td>
            <td>${r.ket || r.keterangan || '-'}</td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center;color:#94a3b8;">Belum ada data kehadiran.</td></tr>';

    ['hadir','sakit','izin','alpha'].forEach(k => {
        const el = document.getElementById(`kh-${k}`);
        if (el) el.textContent = kh[k] || 0;
    });
    const total = (kh.hadir||0)+(kh.sakit||0)+(kh.izin||0)+(kh.alpha||0);
    const pct   = kh.persen || (total ? Math.round(((kh.hadir||0)/total)*100) : 100);
    const pelEl = document.getElementById('kh-persen');
    if (pelEl) pelEl.textContent = `${pct}%`;
}
/* ============================================================
   KALENDER KEHADIRAN
   ============================================================ */
const KEHADIRAN_DATA = {
    '2026-4-7': 'hadir',  '2026-4-8': 'hadir',   '2026-4-9': 'hadir',
    '2026-4-10':'izin',   '2026-4-13':'hadir',    '2026-4-14':'hadir',
    '2026-4-15':'hadir',  '2026-4-16':'sakit',    '2026-4-17':'hadir',
    '2026-4-20':'hadir',  '2026-4-21':'hadir',    '2026-4-22':'hadir',
    '2026-4-23':'hadir',
};

function renderKalender() {
    const calEl = document.getElementById('attendance-calendar');
    const lblEl = document.getElementById('month-label');
    if (!calEl) return;

    const namaBulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    if (lblEl) lblEl.textContent = `${namaBulan[currentMonth]} ${currentYear}`;

    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const today = new Date();
    const hariNama = ['Min','Sen','Sel','Rab','Kam','Jum','Sab'];

    let html = `<div class="cal-header">${hariNama.map(h=>`<span>${h}</span>`).join('')}</div>`;
    html += '<div class="cal-grid">';

    // Kosong di awal
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateObj = new Date(currentYear, currentMonth, d);
        const dow     = dateObj.getDay(); // 0=Min, 6=Sab
        const isToday = dateObj.toDateString() === today.toDateString();
        const isFuture= dateObj > today;
        const key     = `${currentYear}-${currentMonth+1}-${d}`;
        let cls       = 'cal-day';

        if (dow === 0 || dow === 6) { cls += ' libur'; }
        else if (isFuture) { cls += ' future'; }
        else {
            const status = KEHADIRAN_DATA[key] || 'hadir';
            cls += ` ${status}`;
        }
        if (isToday) cls += ' today';
        html += `<div class="${cls}" title="${d} ${namaBulan[currentMonth]} ${currentYear}">${d}</div>`;
    }

    html += '</div>';
    calEl.innerHTML = html;
}

function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderKalender();
}
function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderKalender();
}

/* ============================================================
   RENDER: NILAI
   ============================================================ */
function renderNilai(sem) {
    currentSem = sem;
    // Ambil dari apiData, fallback ke FALLBACK_NILAI
    const rawData = apiData.nilai[sem] || FALLBACK_NILAI[sem] || FALLBACK_NILAI.genap;

    // Normalisasi format API vs fallback
    const data = rawData.map(r => {
        if (r.nilai_final !== undefined) {
            // Format dari API sudah dihitung
            return { mapel:r.mapel, uh:r.uh, uts:r.uts, uas:r.uas, tugas:r.tugas, kkm:r.kkm, final:r.nilai_final, lulus:r.lulus };
        }
        const final = parseFloat(((r.uh*0.2+r.uts*0.25+r.uas*0.3+r.tugas*0.25)).toFixed(1));
        return { mapel:r.mapel, uh:r.uh, uts:r.uts, uas:r.uas, tugas:r.tugas, kkm:r.kkm||70, final, lulus:final>=(r.kkm||70) };
    });

    const tbody = document.getElementById('nilai-tbody');
    if (!tbody) return;

    let totalFinal=0, maxVal=0, minVal=100;
    tbody.innerHTML = data.map(m => {
        if (m.final > maxVal) maxVal = m.final;
        if (m.final < minVal) minVal = m.final;
        totalFinal += m.final;
        return `<tr>
            <td><strong>${m.mapel}</strong></td>
            <td>${m.uh}</td><td>${m.uts}</td><td>${m.uas}</td><td>${m.tugas}</td>
            <td><strong style="color:${m.lulus?'#059669':'#dc2626'}">${m.final}</strong></td>
            <td><span class="status-badge ${m.lulus?'lulus':'remedial'}">${m.lulus?'Lulus':'Remedial'}</span></td>
        </tr>`;
    }).join('');

    const rata = data.length ? (totalFinal/data.length).toFixed(2) : '0.00';
    const set  = id => { const el=document.getElementById(id); if(el) el.textContent=arguments[1]; };
    ['nsc-rata','nsc-tertinggi','nsc-terendah'].forEach((id,i)=>{
        const el=document.getElementById(id);
        if(el) el.textContent=[rata,maxVal,minVal][i];
    });
    const scNilaiB=document.getElementById('sc-nilai');
    if(scNilaiB) scNilaiB.textContent=rata;

    renderNilaiTrend();

    // Jika belum ada data API untuk semester ini, fetch sekarang
    if (!apiData.nilai[sem]) {
        apiFetch(`/api/siswa/nilai?semester=${sem}`).then(json=>{
            if(json.success){ apiData.nilai[sem]=json.data; renderNilai(sem); }
        }).catch(()=>{});
    }
}
function filterNilai(sem, btn) {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    renderNilai(sem);
}

function renderNilaiTrend() {
    const el = document.getElementById('nilai-trend-chart');
    if (!el) return;
    const sems = ['Ganjil X','Genap X','Ganjil XI','Genap XI'];
    const vals = [82.5, 84.3, 85.7, 87.4];
    const max  = 100; const min = 70;

    el.innerHTML = `
    <div style="padding:16px 0 0;display:flex;align-items:flex-end;gap:24px;height:140px;position:relative;">
        ${vals.map((v,i) => {
            const h = ((v - min) / (max - min)) * 100;
            const color = '#2563eb';
            return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;">
                <div style="font-size:0.78rem;font-weight:800;color:#002244">${v}</div>
                <div style="width:100%;border-radius:8px 8px 0 0;background:${color};height:${h}%;opacity:0.85;transition:height 1s ease;min-height:8px;"></div>
                <div style="font-size:0.72rem;color:#64748b;font-weight:600;text-align:center;">${sems[i]}</div>
            </div>`;
        }).join('')}
    </div>`;
}

/* ============================================================
   RENDER: PRESTASI
   ============================================================ */
function renderPrestasi() {
    const data = apiData.prestasi?.length ? apiData.prestasi : FALLBACK_PRESTASI;
    const el   = document.getElementById('prestasi-grid');
    if (!el) return;
    el.innerHTML = data.map(p => `
        <div class="prestasi-card">
            <div class="pc-header">
                <div class="pc-medal">${p.medal||'🏆'}</div>
                <div>
                    <h3>${p.judul}</h3>
                    <p>${p.tingkat} · ${p.tahun}</p>
                </div>
            </div>
            <div class="pc-body">
                <div class="pc-juara"><i class="fas fa-trophy"></i> ${p.medal?.includes('🥇')?'Juara 1':p.medal?.includes('🥈')?'Juara 2':'Terbaik'}</div>
                <p>${p.keterangan}</p>
            </div>
        </div>
    `).join('');
    const sc=document.getElementById('sc-prestasi');
    if(sc) sc.textContent=data.length;
}
/* ============================================================
   RENDER: JADWAL
   ============================================================ */
function renderJadwal(hari) {
    const allJadwal = Object.keys(apiData.jadwal).length ? apiData.jadwal : FALLBACK_JADWAL;
    const jadwal    = allJadwal[hari] || [];
    const list      = document.getElementById('jadwal-list');
    if (!list) return;
    if (!jadwal.length) {
        list.innerHTML = '<div style="padding:40px;text-align:center;color:#94a3b8;"><i class="fas fa-coffee" style="font-size:2rem;margin-bottom:10px;display:block;"></i> Tidak ada jadwal hari ini.</div>';
        return;
    }
    list.innerHTML = jadwal.map((j,i) => `
        <div class="jadwal-item">
            <div class="ji-num">${i+1}</div>
            <div class="ji-time"><i class="fas fa-clock" style="font-size:0.7rem;color:#94a3b8;margin-right:4px;"></i>${j.jam}</div>
            <div class="ji-info">
                <h4>${j.mapel}</h4>
                <p>${j.guru || '-'}</p>
            </div>
            <div class="ji-room">${j.ruang || '-'}</div>
        </div>
    `).join('');
}
function filterJadwal(hari, btn) {
    document.querySelectorAll('.jt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderJadwal(hari);
}

/* ============================================================
   RENDER: SURAT
   ============================================================ */
function renderSurat() {
    const el = document.getElementById('surat-list');
    if (!el) return;
    const statusMap  = { selesai:'selesai', proses:'proses', ditolak:'alpha' };
    const statusLabel= { selesai:'Selesai', proses:'Diproses', ditolak:'Ditolak' };

    if (!suratList.length) {
        el.innerHTML = '<div style="padding:30px;text-align:center;color:#94a3b8;">Belum ada riwayat surat.</div>';
    } else {
        el.innerHTML = suratList.map(s => `
            <div class="surat-item">
                <div class="si-icon"><i class="fas fa-file-alt"></i></div>
                <div class="si-info">
                    <h4>${s.jenis}</h4>
                    <p><i class="fas fa-calendar" style="font-size:0.7rem;"></i> ${s.tanggal} · ${s.tujuan}</p>
                </div>
                <div class="si-status">
                    <span class="status-badge ${statusMap[s.status]||'blue'}">${statusLabel[s.status]||s.status}</span>
                </div>
                ${s.status==='selesai'?`<button onclick="downloadSurat('${s.id}')" style="margin-left:8px;padding:5px 12px;background:var(--navy);color:var(--gold);border:none;border-radius:8px;font-size:0.72rem;font-weight:700;cursor:pointer;"><i class="fas fa-download"></i> Unduh</button>`:''}
            </div>
        `).join('');
    }

    const badgeSurat = document.getElementById('badge-surat');
    if (badgeSurat) {
        const pending = suratList.filter(s=>s.status==='proses').length;
        badgeSurat.textContent = pending || '';
    }
}
async function ajukanSurat() {
    const jenis  = document.getElementById('surat-jenis').value;
    const tujuan = document.getElementById('surat-tujuan').value.trim();
    const ket    = document.getElementById('surat-ket').value.trim();

    if (!jenis || !tujuan) { showToastDs('Lengkapi jenis surat dan tujuan terlebih dahulu.','red'); return; }

    const jenisLabel = {
        aktif:'Surat Keterangan Aktif', pindah:'Surat Keterangan Pindah',
        magang:'Surat Pengantar Magang/PKL', beasiswa:'Surat Rekomendasi Beasiswa',
        izin:'Surat Izin Tidak Masuk', lainnya:'Surat Lainnya',
    };

    const baru = {
        id: Date.now(),
        jenis  : jenisLabel[jenis] || jenis,
        tanggal: new Date().toLocaleDateString('id-ID',{day:'numeric',month:'short',year:'numeric'}),
        tujuan,
        status : 'proses',
    };

    // Coba kirim ke API
    try {
        await apiFetch('/api/content/surat', {
            method:'POST',
            body  : JSON.stringify({ jenis: jenisLabel[jenis]||jenis, tujuan, keterangan:ket, nisn:currentUser?.nisn }),
        });
    } catch(e) { /* simpan lokal saja jika gagal */ }

    suratList.unshift(baru);
    renderSurat();

    document.getElementById('surat-jenis').value  = '';
    document.getElementById('surat-tujuan').value = '';
    document.getElementById('surat-ket').value    = '';

    showToastDs('Permohonan surat berhasil diajukan! Estimasi selesai 1×24 jam.','green',4000);
}
function downloadSurat(id) {
    const surat = suratList.find(s => s.id === id);
    if (!surat) return;
    showToastDs(`Mengunduh: ${surat.jenis}...`, 'blue', 2500);
}

/* ============================================================
   BIODATA: AJUKAN PERUBAHAN
   ============================================================ */
function requestEdit() {
    showToastDs('Permohonan perubahan data telah dikirim ke bagian TU. Harap tunggu konfirmasi.', 'orange', 5000);
}

/* ============================================================
   EXPORT
   ============================================================ */
function exportKehadiran() {
    const rows = [['Tanggal','Hari','Status','Keterangan']];
    const kh = apiData.kehadiran || FALLBACK_KEHADIRAN;
    (kh.riwayat||[]).forEach(r => rows.push([r.tgl||r.tanggal||'-', r.hari||'-', r.status, r.ket||r.keterangan||'-']));
    downloadCSV(rows, `Kehadiran_${currentUser?.nisn}_${new Date().toISOString().slice(0,10)}.csv`);
    showToastDs('Data kehadiran berhasil diekspor!', 'green');
}

function exportNilai() {
    const rawData = apiData.nilai[currentSem] || FALLBACK_NILAI[currentSem] || FALLBACK_NILAI.genap;
    const data = rawData.map(r => ({ ...r, nilai_final: r.nilai_final !== undefined ? r.nilai_final : parseFloat(((r.uh*0.2+r.uts*0.25+r.uas*0.3+r.tugas*0.25)).toFixed(1)) }));
    const rows = [['Mata Pelajaran','UH','UTS','UAS','Tugas','Nilai Final','Status']];
    data.forEach(m => {
        const final = m.nilai_final !== undefined ? m.nilai_final : parseFloat(((m.uh*0.2+m.uts*0.25+m.uas*0.3+m.tugas*0.25)).toFixed(1));
        rows.push([m.mapel, m.uh, m.uts, m.uas, m.tugas, final, final>=m.kkm?'Lulus':'Remedial']);
    });
    downloadCSV(rows, `Nilai_${currentUser?.nisn}_${currentSem}_${new Date().toISOString().slice(0,10)}.csv`);
    showToastDs('Data nilai berhasil diekspor!', 'green');
}

function downloadCSV(rows, filename) {
    const csv  = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
}

/* ============================================================
   GLOBAL SEARCH
   ============================================================ */
function globalSearch(query) {
    if (!query.trim()) return;
    const lower = query.toLowerCase();
    const results = [];
    if ('nilai'.includes(lower) || 'akademik'.includes(lower)) results.push('nilai');
    if ('hadir'.includes(lower) || 'absen'.includes(lower)) results.push('kehadiran');
    if ('biodata'.includes(lower) || 'data'.includes(lower)) results.push('biodata');
    if ('surat'.includes(lower)) results.push('surat');
    if ('prestasi'.includes(lower) || 'juara'.includes(lower)) results.push('prestasi');
    if ('jadwal'.includes(lower)) results.push('jadwal');
    if (results.length) {
        navTo(results[0], document.querySelector(`[data-page="${results[0]}"]`));
        document.getElementById('global-search').value = '';
        showToastDs(`Menampilkan halaman: ${results[0]}`, 'blue', 2000);
    }
}

/* ============================================================
   LOGOUT
   ============================================================ */
async function doLogout() {
    if (!confirm('Yakin ingin keluar dari portal data siswa?')) return;
    // Hapus token dari server
    try {
        const refresh = localStorage.getItem('smkn_refresh');
        await apiFetch('/api/auth/logout',{method:'POST',body:JSON.stringify({refreshToken:refresh})});
    } catch(e) {}
    localStorage.removeItem('smkn_token');
    localStorage.removeItem('smkn_refresh');
    localStorage.removeItem('smkn_user');
    currentUser = null;
    apiData = { profil:null, nilai:{}, kehadiran:null, jadwal:{}, prestasi:[], dashboard:null };
    const lNisn=document.getElementById('l-nisn');
    const lPass=document.getElementById('l-pass');
    if(lNisn) lNisn.value='';
    if(lPass) lPass.value='';
    const errEl=document.getElementById('l-err');
    if(errEl) errEl.classList.add('hidden');
    showPage('page-login');
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // Auto-login jika sudah ada token
    const savedToken = localStorage.getItem('smkn_token');
    const savedUser  = localStorage.getItem('smkn_user');
    if (savedToken && savedUser) {
        try {
            const u = JSON.parse(savedUser);
            // Cek token belum expired (client-side)
            const payload = JSON.parse(atob(savedToken.split('.')[1]));
            const now = Math.floor(Date.now()/1000);
            if (payload.exp && payload.exp > now) {
                currentUser = { nisn:u.nisn, nama:u.nama_lengkap||u.nama, kelas:'-', jurusan:'-', role:u.role, id:u.id, no_hp:u.no_hp };
                initDashboard();
                return;
            }
        } catch(e) {}
        localStorage.removeItem('smkn_token');
        localStorage.removeItem('smkn_user');
        localStorage.removeItem('smkn_refresh');
    }
    showPage('page-login');

    // Toggle password login
    const toggle = document.getElementById('l-toggle');
    if (toggle) {
        toggle.addEventListener('click', () => {
            const inp  = document.getElementById('l-pass');
            const icon = toggle.querySelector('i');
            if (inp.type === 'password') { inp.type = 'text'; icon.className = 'fas fa-eye-slash'; }
            else { inp.type = 'password'; icon.className = 'fas fa-eye'; }
        });
    }

    // Enter untuk login
    ['l-nisn','l-pass'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    });

    // Tutup notif saat klik luar
    document.addEventListener('click', (e) => {
        const panel = document.getElementById('notif-panel');
        const btn   = document.getElementById('notif-btn');
        if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
            panel.classList.remove('open');
        }
    });

    // Init kalender
    currentMonth = new Date().getMonth();
    currentYear  = new Date().getFullYear();
});