/* =====================================================
   CBT ADMIN PANEL — Frontend JS
   File: admin.js
   Terhubung ke server Node.js via WebSocket (port 3001)
   ===================================================== */

'use strict';

/* ── CONFIG ── */
const WS_URL    = `ws://${location.hostname}:3001`;
const HTTP_URL  = `http://${location.hostname}:3001`;

/* ── STATE ── */
const adminState = {
    ws          : null,
    connected   : false,
    students    : new Map(),   // nisn → data
    violations  : [],
    results     : [],
    activity    : [],
    snapshots   : new Map(),   // nisn → latest base64 frame
};

/* ════════════════════════════════
   WEBSOCKET CONNECTION
   ════════════════════════════════ */
function connectWS() {
    try {
        adminState.ws = new WebSocket(WS_URL);
    } catch(e) {
        setWsStatus(false);
        return;
    }

    adminState.ws.onopen = () => {
        setWsStatus(true);
        const token = localStorage.getItem('accessToken') || localStorage.getItem('smkn_token') || '';
        adminState.ws.send(JSON.stringify({ type: 'admin_auth', role: 'admin', token }));
        addLog('Terhubung ke server CBT.', 'success');
    };

    adminState.ws.onclose = () => {
        setWsStatus(false);
        addLog('Koneksi terputus. Mencoba ulang...', 'warn');
        setTimeout(connectWS, 4000);
    };

    adminState.ws.onerror = () => setWsStatus(false);

    adminState.ws.onmessage = (ev) => {
        try {
            const msg = JSON.parse(ev.data);
            handleServerMessage(msg);
        } catch(e) { console.error('[Admin] Parse error:', e); }
    };
}

function setWsStatus(online) {
    adminState.connected = online;
    const dot  = document.getElementById('ws-dot');
    const text = document.getElementById('ws-status-text');
    if (dot)  dot.className  = 'dot ' + (online ? 'online' : 'offline');
    if (text) text.textContent = online ? 'Server Terhubung' : 'Server Offline';
}

/* ════════════════════════════════
   HANDLER PESAN DARI SERVER
   ════════════════════════════════ */
function handleServerMessage(msg) {
    switch (msg.type) {

        case 'student_join':
            upsertStudent(msg.nisn, {
                nisn    : msg.nisn,
                mapel   : msg.mapel,
                device  : msg.device || 'Unknown',
                battery : null,
                speed   : null,
                lat     : msg.lat,
                lng     : msg.lng,
                answered: 0,
                total   : 0,
                violations: 0,
                status  : 'active',
                joinedAt: new Date(),
            });
            addLog(`Siswa ${msg.nisn} (${msg.mapel}) bergabung.`, 'info');
            refreshAll();
            break;

        case 'device_info':
            updateStudentField(msg.nisn, 'device', msg.info?.device);
            updateStudentField(msg.nisn, 'battery', msg.info?.battery);
            refreshStudentTable();
            break;

        case 'battery_update':
            updateStudentField(msg.nisn, 'battery', { level: msg.level, charging: msg.charging });
            refreshStudentTable();
            break;

        case 'network_speed':
            updateStudentField(msg.nisn, 'speed', msg.mbps);
            refreshStudentTable();
            break;

        case 'location':
        case 'location_update':
            updateStudentField(msg.nisn, 'lat', msg.lat);
            updateStudentField(msg.nisn, 'lng', msg.lng);
            updateStudentField(msg.nisn, 'locationUpdated', new Date());
            refreshLocationTable();
            break;

        case 'camera_frame':
            adminState.snapshots.set(msg.nisn, msg.frame);
            updateCameraCell(msg.nisn, msg.frame);
            break;

        case 'answer_update':
            updateStudentField(msg.nisn, 'answered', msg.answered);
            updateStudentField(msg.nisn, 'total', msg.total);
            refreshStudentTable();
            refreshMapelProgress();
            break;

        case 'violation':
            addViolation(msg.nisn, msg.reason, msg.count);
            updateStudentField(msg.nisn, 'violations', msg.count || 1);
            refreshStudentTable();
            break;

        case 'student_finish':
            updateStudentField(msg.nisn, 'status', 'done');
            addResult(msg);
            addLog(`Siswa ${msg.nisn} selesai ujian. Nilai: ${msg.nilai}`, 'success');
            refreshAll();
            break;

        case 'student_disconnect':
            updateStudentField(msg.nisn, 'status', 'offline');
            addLog(`Siswa ${msg.nisn} terputus.`, 'warn');
            refreshStudentTable();
            break;

        case 'broadcast_ack':
            showToast('Pesan berhasil dikirim ke semua siswa.', 'success');
            break;
    }
}

/* ════════════════════════════════
   STUDENT DATA
   ════════════════════════════════ */
function upsertStudent(nisn, data) {
    if (!adminState.students.has(nisn)) {
        adminState.students.set(nisn, data);
        addCameraCell(nisn);
    } else {
        const existing = adminState.students.get(nisn);
        adminState.students.set(nisn, { ...existing, ...data });
    }
    updateNavCount();
}

function updateStudentField(nisn, field, value) {
    if (adminState.students.has(nisn)) {
        adminState.students.get(nisn)[field] = value;
    }
    updateNavCount();
}

function updateNavCount() {
    const active = [...adminState.students.values()].filter(s => s.status === 'active').length;
    document.getElementById('nav-count').textContent = active;
    document.getElementById('stat-total').textContent = active;
    document.getElementById('stat-done').textContent  =
        [...adminState.students.values()].filter(s => s.status === 'done').length;
}

/* ════════════════════════════════
   REFRESH UI FUNCTIONS
   ════════════════════════════════ */
function refreshAll() {
    refreshStudentTable();
    refreshMapelProgress();
    refreshLocationTable();
    refreshStats();
}

function refreshStats() {
    const students = [...adminState.students.values()];
    document.getElementById('stat-total').textContent = students.filter(s => s.status === 'active').length;
    document.getElementById('stat-done').textContent  = students.filter(s => s.status === 'done').length;
    document.getElementById('stat-ragu').textContent  = students.filter(s => s.ragu > 0).length;
    document.getElementById('stat-viol').textContent  = adminState.violations.length;
    document.getElementById('nav-viol').textContent   = adminState.violations.length;
}

function refreshStudentTable() {
    const tbody   = document.getElementById('students-tbody');
    const search  = (document.getElementById('search-student')?.value || '').toLowerCase();
    const mapelF  = document.getElementById('filter-mapel')?.value || '';
    const students = [...adminState.students.values()].filter(s =>
        (!search || s.nisn.includes(search)) && (!mapelF || s.mapel === mapelF)
    );

    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="10" class="empty-cell"><i class="fas fa-users"></i> Belum ada siswa terdaftar.</td></tr>';
        return;
    }

    tbody.innerHTML = students.map((s, i) => {
        const bat = formatBattery(s.battery);
        const statusBadge = s.status === 'active'
            ? '<span class="badge active"><i class="fas fa-circle"></i> Aktif</span>'
            : s.status === 'done'
            ? '<span class="badge done"><i class="fas fa-check"></i> Selesai</span>'
            : '<span class="badge offline"><i class="fas fa-times"></i> Offline</span>';

        const violBadge = s.violations > 0
            ? `<span class="badge danger"><i class="fas fa-flag"></i> ${s.violations}</span>`
            : '<span class="badge">0</span>';

        const progress = s.total > 0 ? `${s.answered}/${s.total}` : '0/0';

        return `<tr>
            <td>${i + 1}</td>
            <td><strong>${s.nisn}</strong></td>
            <td>${formatMapel(s.mapel)}</td>
            <td><i class="fas fa-laptop" style="color:var(--blue);margin-right:6px"></i>${s.device || 'N/A'}</td>
            <td>${bat}</td>
            <td>${s.speed ? `<span style="color:var(--green);font-weight:700">${s.speed} Mbps</span>` : 'N/A'}</td>
            <td>${progress}</td>
            <td>${violBadge}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="btn-action cam"  onclick="viewStudentDetail('${s.nisn}')"><i class="fas fa-eye"></i></button>
                <button class="btn-action warn" onclick="warnStudent('${s.nisn}')"><i class="fas fa-exclamation"></i></button>
                <button class="btn-action kick" onclick="kickStudent('${s.nisn}')"><i class="fas fa-ban"></i></button>
            </td>
        </tr>`;
    }).join('');
}

function formatBattery(bat) {
    if (!bat) return 'N/A';
    const cls   = bat.level > 60 ? 'bat-good' : bat.level > 30 ? 'bat-med' : 'bat-low';
    const icon  = bat.level > 60 ? 'fa-battery-full' : bat.level > 30 ? 'fa-battery-half' : 'fa-battery-quarter';
    const charge = bat.charging ? ' <i class="fas fa-bolt" style="color:var(--gold)"></i>' : '';
    return `<div class="bat-wrap ${cls}"><i class="fas ${icon} bat-icon"></i>${bat.level}%${charge}</div>`;
}

function formatMapel(key) {
    const m = { matematika:'Matematika', bindo:'Bhs. Indonesia', basing:'Bhs. Inggris', pkk:'PKK', sejarah:'Sejarah', produktif:'Kompetensi' };
    return m[key] || key;
}

function refreshMapelProgress() {
    const el = document.getElementById('mapel-progress-list');
    if (!el) return;
    const mapelMap = {};
    for (const s of adminState.students.values()) {
        if (!mapelMap[s.mapel]) mapelMap[s.mapel] = { total: 0, done: 0 };
        mapelMap[s.mapel].total++;
        if (s.status === 'done') mapelMap[s.mapel].done++;
    }
    if (!Object.keys(mapelMap).length) {
        el.innerHTML = '<div class="empty-state"><i class="fas fa-satellite-dish"></i> Menunggu siswa masuk...</div>';
        return;
    }
    el.innerHTML = Object.entries(mapelMap).map(([key, v]) => {
        const pct = Math.round((v.done / v.total) * 100);
        return `<div class="mapel-bar-item">
            <div class="mapel-bar-label">
                <span>${formatMapel(key)}</span>
                <span>${v.done}/${v.total} selesai (${pct}%)</span>
            </div>
            <div class="mapel-bar-wrap"><div class="mapel-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
    }).join('');
}

function refreshLocationTable() {
    const tbody = document.getElementById('location-tbody');
    if (!tbody) return;
    const students = [...adminState.students.values()].filter(s => s.lat && s.lng);
    if (!students.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">Belum ada data lokasi.</td></tr>';
        document.getElementById('map-placeholder')?.classList.remove('hidden');
        return;
    }
    document.getElementById('map-placeholder')?.classList.add('hidden');
    const pinsEl = document.getElementById('map-pins-list');
    if (pinsEl) {
        pinsEl.classList.remove('hidden');
        pinsEl.innerHTML = students.map(s => `
            <div class="map-pin-card">
                <strong><i class="fas fa-user" style="color:var(--navy)"></i> ${s.nisn}</strong>
                <span>${s.lat}, ${s.lng}</span><br>
                <a href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank">
                    <i class="fas fa-external-link-alt"></i> Buka di Google Maps
                </a>
            </div>
        `).join('');
    }
    tbody.innerHTML = students.map((s, i) => `
        <tr>
            <td>${s.nisn}</td>
            <td>${s.lat}</td>
            <td>${s.lng}</td>
            <td>${s.locationUpdated ? s.locationUpdated.toLocaleTimeString('id-ID') : 'N/A'}</td>
            <td><a href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank" class="btn-action cam"><i class="fas fa-map-marker-alt"></i> Maps</a></td>
        </tr>
    `).join('');
}

/* ════════════════════════════════
   CAMERA GRID
   ════════════════════════════════ */
function addCameraCell(nisn) {
    const grid = document.getElementById('camera-grid');
    if (!grid) return;
    const empty = grid.querySelector('.empty-state');
    if (empty) empty.remove();

    if (document.getElementById(`cam-${nisn}`)) return;

    const cell = document.createElement('div');
    cell.className = 'cam-cell';
    cell.id = `cam-${nisn}`;
    cell.innerHTML = `
        <div class="cam-no-feed"><i class="fas fa-video-slash"></i><span>Menunggu stream...</span></div>
        <img id="camimg-${nisn}" style="display:none" alt="">
        <div class="cam-cell-label">
            <span>${nisn}</span>
            <span class="cam-live-dot"></span>
        </div>
    `;
    grid.appendChild(cell);
}

function updateCameraCell(nisn, base64Frame) {
    const img = document.getElementById(`camimg-${nisn}`);
    if (!img) return;
    const noFeed = img.parentElement.querySelector('.cam-no-feed');
    if (noFeed) noFeed.style.display = 'none';
    img.src     = base64Frame;
    img.style.display = 'block';
}

function changeCamLayout() {
    const layout = document.getElementById('cam-layout').value;
    const grid   = document.getElementById('camera-grid');
    grid.className = 'camera-grid ' + layout;
}

/* ════════════════════════════════
   LOG & VIOLATIONS
   ════════════════════════════════ */
function addLog(msg, type = 'info') {
    const log  = { msg, type, time: new Date() };
    adminState.activity.unshift(log);
    if (adminState.activity.length > 100) adminState.activity.pop();

    const el = document.getElementById('activity-log');
    if (!el) return;
    const empty = el.querySelector('.empty-state');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = `log-item ${type}`;
    item.innerHTML = `
        <span class="log-time">${log.time.toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit', second:'2-digit'})}</span>
        <span class="log-msg">${msg}</span>
    `;
    el.prepend(item);

    // Limit DOM nodes
    while (el.children.length > 50) el.removeChild(el.lastChild);
}

function addViolation(nisn, reason, count) {
    const v = { nisn, reason, count, time: new Date() };
    adminState.violations.push(v);
    document.getElementById('nav-viol').textContent = adminState.violations.length;
    document.getElementById('stat-viol').textContent = adminState.violations.length;

    const list = document.getElementById('violations-list');
    if (!list) return;
    const empty = list.querySelector('.empty-state');
    if (empty) empty.remove();

    const reasonMap = {
        tab_switch  : 'Berpindah Tab',
        window_blur : 'Pindah Aplikasi',
        devtools_open: 'DevTools Terbuka',
        fullscreen  : 'Keluar Fullscreen',
    };

    const card = document.createElement('div');
    card.className = 'violation-card';
    card.innerHTML = `
        <div class="viol-icon"><i class="fas fa-exclamation-triangle"></i></div>
        <div class="viol-info">
            <strong>NISN ${nisn} — ${reasonMap[reason] || reason}</strong>
            <span>Pelanggaran ke-${count || adminState.violations.length} · ${v.time.toLocaleString('id-ID')}</span>
        </div>
        <div class="viol-time">${v.time.toLocaleTimeString('id-ID')}</div>
    `;
    list.prepend(card);

    addLog(`Pelanggaran dari ${nisn}: ${reasonMap[reason] || reason}`, 'danger');
}

function addResult(data) {
    adminState.results.push(data);
    const tbody = document.getElementById('results-tbody');
    if (!tbody) return;
    if (tbody.querySelector('.empty-cell')) tbody.innerHTML = '';
    const row = document.createElement('tr');
    const lulus = data.nilai >= 70;
    row.innerHTML = `
        <td>${data.nisn}</td>
        <td>${formatMapel(data.mapel)}</td>
        <td>${data.benar ?? '-'}</td>
        <td>${data.salah ?? '-'}</td>
        <td>${data.kosong ?? '-'}</td>
        <td class="${lulus ? 'score-pass' : 'score-fail'}">${data.nilai}</td>
        <td><span class="badge ${lulus ? 'active' : 'danger'}">${lulus ? 'Lulus' : 'Tidak Lulus'}</span></td>
        <td>${new Date().toLocaleTimeString('id-ID')}</td>
    `;
    tbody.prepend(row);
}

/* ════════════════════════════════
   STUDENT DETAIL MODAL
   ════════════════════════════════ */
function viewStudentDetail(nisn) {
    const s = adminState.students.get(nisn);
    if (!s) return;
    const snapshot = adminState.snapshots.get(nisn);
    document.getElementById('modal-student-title').textContent = `Detail Siswa — ${nisn}`;
    document.getElementById('modal-student-body').innerHTML = `
        <div class="student-detail">
            ${snapshot ? `<img src="${snapshot}" class="cam-snapshot" alt="Snapshot ${nisn}">` : '<div class="cam-no-feed" style="height:180px;background:#001529;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#475569"><i class="fas fa-video-slash" style="font-size:2rem"></i><span style="font-size:0.8rem">Tidak ada kamera</span></div>'}
            <div class="detail-row">
                <div class="detail-item"><label>NISN</label><span>${s.nisn}</span></div>
                <div class="detail-item"><label>Mata Pelajaran</label><span>${formatMapel(s.mapel)}</span></div>
                <div class="detail-item"><label>Status</label><span>${s.status}</span></div>
            </div>
            <div class="detail-row">
                <div class="detail-item"><label>Device</label><span>${s.device || 'N/A'}</span></div>
                <div class="detail-item"><label>Baterai</label><span>${s.battery ? s.battery.level + '%' + (s.battery.charging ? ' ⚡' : '') : 'N/A'}</span></div>
                <div class="detail-item"><label>Kecepatan Net</label><span>${s.speed ? s.speed + ' Mbps' : 'N/A'}</span></div>
            </div>
            <div class="detail-row">
                <div class="detail-item"><label>Lokasi</label><span>${s.lat ? `${s.lat}, ${s.lng}` : 'N/A'}</span></div>
                <div class="detail-item"><label>Pelanggaran</label><span>${s.violations || 0}</span></div>
                <div class="detail-item"><label>Jawaban</label><span>${s.answered || 0} / ${s.total || 0}</span></div>
            </div>
            ${s.lat ? `<a href="https://maps.google.com/?q=${s.lat},${s.lng}" target="_blank" class="btn-action cam" style="width:max-content"><i class="fas fa-map-marker-alt"></i> Lihat di Google Maps</a>` : ''}
        </div>
    `;
    openModal('modal-student');
}

/* ════════════════════════════════
   ADMIN ACTIONS
   ════════════════════════════════ */
function warnStudent(nisn) {
    sendWS({ type: 'admin_warn', targetNisn: nisn, message: 'Pengawas mengirimkan peringatan! Harap fokus mengerjakan ujian.' });
    showToast(`Peringatan dikirim ke ${nisn}`, 'success');
}

function kickStudent(nisn) {
    if (!confirm(`Keluarkan siswa ${nisn} dari ujian?`)) return;
    sendWS({ type: 'admin_kick', targetNisn: nisn });
    updateStudentField(nisn, 'status', 'offline');
    refreshStudentTable();
    showToast(`Siswa ${nisn} dikeluarkan.`, 'error');
}

function broadcastMessage() { openModal('modal-broadcast'); }

function sendBroadcast() {
    const msg = document.getElementById('broadcast-msg').value.trim();
    if (!msg) { showToast('Pesan tidak boleh kosong!', 'error'); return; }
    sendWS({ type: 'admin_broadcast', message: msg });
    closeModal('modal-broadcast');
    document.getElementById('broadcast-msg').value = '';
    showToast('Pesan sedang dikirim...', 'success');
}

function confirmEndAll() { openModal('modal-endall'); }

function endAllExams() {
    sendWS({ type: 'admin_end_all' });
    closeModal('modal-endall');
    showToast('Semua ujian diakhiri.', 'error');
    addLog('Admin mengakhiri semua ujian secara paksa.', 'danger');
}

function filterStudents() { refreshStudentTable(); }

/* ════════════════════════════════
   EXPORT CSV
   ════════════════════════════════ */
function exportCSV() {
    if (!adminState.results.length) { showToast('Belum ada hasil untuk di-export.', 'error'); return; }
    const header = ['NISN','Mapel','Benar','Salah','Kosong','Nilai','Status'];
    const rows   = adminState.results.map(r => [
        r.nisn, r.mapel, r.benar, r.salah, r.kosong, r.nilai, r.nilai >= 70 ? 'Lulus' : 'Tidak Lulus'
    ]);
    const csv    = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a');
    a.href = url; a.download = `hasil-ujian-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

/* ════════════════════════════════
   UTILITIES
   ════════════════════════════════ */
function sendWS(payload) {
    if (adminState.ws && adminState.ws.readyState === WebSocket.OPEN) {
        adminState.ws.send(JSON.stringify(payload));
    } else {
        showToast('Server tidak terhubung!', 'error');
    }
}

function openModal(id) {
    document.getElementById(id)?.classList.add('open');
}
function closeModal(id) {
    document.getElementById(id)?.classList.remove('open');
}

function showToast(msg, type = '') {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.className   = 'toast ' + type + ' show';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

function switchPage(el, page) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(`page-${page}`)?.classList.add('active');
    const titles = { dashboard:'Dashboard Pengawas', students:'Siswa Aktif', camera:'Live Camera', map:'Peta Lokasi', violations:'Log Pelanggaran', results:'Hasil Ujian' };
    document.getElementById('topbar-title').textContent = titles[page] || 'Admin';
    // Tutup sidebar di mobile
    if (window.innerWidth <= 768) document.getElementById('sidebar').classList.remove('open');
}

// Clock
function updateClock() {
    const el = document.getElementById('sidebar-time');
    if (el) el.textContent = new Date().toLocaleString('id-ID', { weekday:'short', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

/* ════════════════════════════════
   INIT
   ════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
    connectWS();
    updateClock();
    setInterval(updateClock, 1000);
});
