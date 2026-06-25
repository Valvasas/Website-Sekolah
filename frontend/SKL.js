/* =====================================================
   PORTAL SKL — SMKN 1 TERISI
   File: skl.js
   ===================================================== */
'use strict';

/* URL API Backend */
const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';

/* ============================================================
   STATE
   ============================================================ */
let captchaAnswer = 0;
let dataSiswaFound = null;

/* ============================================================
   PARTIKEL LATAR
   ============================================================ */
function generateParticles() {
    const container = document.getElementById('particle-bg');
    if (!container) return;
    for (let i = 0; i < 25; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        const size = Math.random() * 6 + 2;
        p.style.cssText = `
            width:${size}px; height:${size}px;
            left:${Math.random() * 100}%;
            animation-duration:${Math.random() * 20 + 15}s;
            animation-delay:${Math.random() * 20}s;
            opacity:${Math.random() * 0.08 + 0.02};
        `;
        container.appendChild(p);
    }
}

/* ============================================================
   CAPTCHA
   ============================================================ */
function genCaptcha() {
    const ops   = ['+', '-', '×'];
    const op    = ops[Math.floor(Math.random() * ops.length)];
    let a, b, answer;

    if (op === '+') { a = Math.floor(Math.random()*9)+1; b = Math.floor(Math.random()*9)+1; answer = a+b; }
    else if (op === '-') { a = Math.floor(Math.random()*9)+5; b = Math.floor(Math.random()*a)+1; answer = a-b; }
    else { a = Math.floor(Math.random()*5)+2; b = Math.floor(Math.random()*4)+2; answer = a*b; }

    captchaAnswer = answer;
    const soalEl = document.getElementById('captcha-soal');
    if (soalEl) {
        soalEl.style.opacity = '0';
        setTimeout(() => {
            soalEl.textContent = `${a} ${op} ${b} = ?`;
            soalEl.style.opacity = '1';
        }, 200);
    }
    const ansEl = document.getElementById('captcha-ans');
    if (ansEl) ansEl.value = '';
}

/* ============================================================
   FORMAT INPUT
   ============================================================ */
function formatNisn(input) {
    input.value = input.value.replace(/\D/g, '').slice(0, 10);
}

/* ============================================================
   UTILITAS LAYAR
   ============================================================ */
function showScreen(id) {
    document.querySelectorAll('.skl-screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) {
        el.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function updateStepIndicator(step) {
    for (let i = 1; i <= 3; i++) {
        const el = document.getElementById(`step${i}-ind`);
        if (!el) continue;
        el.classList.remove('active', 'done');
        if (i < step)  el.classList.add('done');
        if (i === step) el.classList.add('active');
    }
}

/* ============================================================
   LOADING OVERLAY
   ============================================================ */
function showLoading() {
    const ov = document.getElementById('loading-overlay');
    if (ov) ov.classList.remove('hidden');
}
function hideLoading() {
    const ov = document.getElementById('loading-overlay');
    if (ov) ov.classList.add('hidden');
}

function animateLoadingProgress(steps, onComplete) {
    const ring = document.getElementById('ring-prog');
    const pct  = document.getElementById('loading-pct');
    const msgs = document.getElementById('loading-msg');
    const lsItems = ['ls1','ls2','ls3','ls4'];
    const circum = 213.6;

    let currentStep = 0;
    let progress    = 0;

    const stepMessages = [
        'Memverifikasi Data...',
        'Menyiapkan Dokumen...',
        'Membuat Kode Verifikasi...',
        'Finalisasi Dokumen...'
    ];

    // Reset semua step
    lsItems.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.className = 'ls-item';
    });

    function runStep(idx) {
        if (idx >= steps.length) {
            // Selesai
            if (ring) { ring.style.strokeDashoffset = '0'; }
            if (pct)  { pct.textContent = '100%'; }
            setTimeout(onComplete, 500);
            return;
        }

        const stepEl = document.getElementById(lsItems[idx]);
        if (stepEl) stepEl.classList.add('active');
        if (msgs)   msgs.textContent = stepMessages[idx];

        const targetProgress = ((idx + 1) / steps.length) * 100;

        const interval = setInterval(() => {
            progress = Math.min(progress + 2, targetProgress);
            const offset = circum - (progress / 100) * circum;
            if (ring) ring.style.strokeDashoffset = offset;
            if (pct)  pct.textContent = Math.round(progress) + '%';

            if (progress >= targetProgress) {
                clearInterval(interval);
                if (stepEl) { stepEl.classList.remove('active'); stepEl.classList.add('done'); }
                setTimeout(() => runStep(idx + 1), 300);
            }
        }, 25);
    }

    runStep(0);
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg, type='green', duration=3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const icons = { green:'fas fa-check-circle', red:'fas fa-exclamation-circle', blue:'fas fa-info-circle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${icons[type]||icons.green}"></i> ${msg}`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
        toast.style.transition = '0.3s';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/* ============================================================
   CARI SKL
   ============================================================ */
async function cariSKL() {
    const nisn  = document.getElementById('inp-nisn').value.trim();
    const nama  = document.getElementById('inp-nama').value.trim();
    const ttl   = document.getElementById('inp-ttl').value;
    const tahun = document.getElementById('inp-tahun').value;
    const ansEl = document.getElementById('captcha-ans');
    const errEl = document.getElementById('search-error');
    const errMsg= document.getElementById('search-error-msg');

    if (!nisn || !nama || !ttl || !tahun) { showErr(errEl, errMsg, 'Semua kolom wajib diisi.'); return; }
    if (nisn.length < 10) { showErr(errEl, errMsg, 'NISN harus 10 digit.'); return; }

    const userAns = parseInt(ansEl ? ansEl.value : '');
    if (isNaN(userAns) || userAns !== captchaAnswer) {
        showErr(errEl, errMsg, 'Jawaban verifikasi salah. Silakan coba lagi.');
        genCaptcha(); return;
    }

    errEl.classList.add('hidden');
    showLoading();

    try {
        const res  = await fetch(`${API_BASE}/api/content/skl/cari`, {
            method : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body   : JSON.stringify({ nisn, nama, ttl, tahun_lulus: tahun }),
        });
        const json = await res.json();

        animateLoadingProgress([1,2,3,4], () => {
            hideLoading();
            if (!res.ok || !json.success) {
                showErr(errEl, errMsg, json.message || 'Data tidak ditemukan.');
                genCaptcha(); return;
            }
            // Normalisasi key dari API ke format tampilkan
            const d = json.data;
            dataSiswaFound = {
                nisn      : d.nisn,
                nama      : d.nama,
                ttl       : d.ttl,
                jurusan   : d.jurusan,
                kelas     : d.kelas,
                tahunLulus: d.tahun_lulus,
                noIjazah  : d.no_ijazah,
                nilaiRata : d.nilai_rata,
            };
            tampilkanKonfirmasi(dataSiswaFound);
        });
    } catch(e) {
        animateLoadingProgress([1,2,3,4], () => {
            hideLoading();
            showErr(errEl, errMsg, 'Server verifikasi SKL tidak dapat dihubungi. Coba lagi beberapa saat.');
            genCaptcha();
        });
    }
}

function showErr(errEl, errMsg, msg) {
    errMsg.textContent = msg;
    errEl.classList.remove('hidden');
    document.getElementById('form-search-card').scrollIntoView({ behavior:'smooth', block:'center' });
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    }[char]));
}

function formatTanggalId(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', { day:'numeric', month:'long', year:'numeric' });
}

/* ============================================================
   TAMPILKAN KONFIRMASI
   ============================================================ */
function tampilkanKonfirmasi(data) {
    // Isi data
    document.getElementById('conf-avatar').textContent = data.nama.charAt(0);
    document.getElementById('conf-nama').textContent   = data.nama;
    document.getElementById('conf-kelas').textContent  = `${data.kelas} · Lulus ${data.tahunLulus}`;
    document.getElementById('conf-nisn').textContent   = data.nisn;
    document.getElementById('conf-jurusan').textContent= String(data.jurusan || '-').split('(')[0].trim();
    document.getElementById('conf-noij').textContent   = data.noIjazah || '-';
    document.getElementById('conf-nilai').textContent  = Number(data.nilaiRata || 0).toFixed(2);

    // Format tanggal lahir
    document.getElementById('conf-ttl').textContent = formatTanggalId(data.ttl);

    // Pilihan format kartu
    document.querySelectorAll('.dl-format-card').forEach((card, i) => {
        card.classList.toggle('selected', i === 0);
        const inp = card.querySelector('input');
        if (inp) inp.checked = (i === 0);
    });

    updateStepIndicator(2);
    showScreen('screen-confirm');
}

/* ============================================================
   PROSES UNDUH
   ============================================================ */
function prosesUnduh() {
    const selectedFormat = document.querySelector('input[name="dl-format"]:checked');
    const format = selectedFormat ? selectedFormat.value : 'print';

    showLoading();
    animateLoadingProgress([1,2,3,4], () => {
        hideLoading();
        // Generate kode verifikasi unik
        const kodeVerif = generateKodeVerif(dataSiswaFound);
        document.getElementById('verify-code').textContent = kodeVerif;

        unduhDokumenSkl(dataSiswaFound, format, kodeVerif);

        updateStepIndicator(3);
        showScreen('screen-done');
        showToast('SKL berhasil diunduh ke perangkat Anda!', 'green', 4000);
    });
}

function generateKodeVerif(data) {
    const hash = btoa(`${data.nisn}-${data.tahunLulus}-${Date.now()}`)
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8)
        .toUpperCase();
    return `SKL-${data.tahunLulus}-${hash.slice(0,4)}-${hash.slice(4,8)}`;
}

function createSklDocumentHtml(data, kodeVerif, includeCode = true) {
    const tahun = Number.parseInt(data.tahunLulus, 10);
    const tahunPelajaran = Number.isFinite(tahun) ? `${tahun - 1}/${tahun}` : '-';
    return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>SKL ${escapeHtml(data.nama || '')}</title>
<style>
body{font-family:Arial,sans-serif;line-height:1.55;color:#111827;margin:48px}
.kop{text-align:center;border-bottom:3px double #111827;padding-bottom:16px;margin-bottom:32px}
.kop h1{font-size:18px;margin:0;text-transform:uppercase}
.kop h2{font-size:16px;margin:4px 0 0;text-transform:uppercase}
.nomor{text-align:center;margin-bottom:28px}
table{width:100%;border-collapse:collapse;margin:18px 0}
td{padding:6px 8px;vertical-align:top}
td:first-child{width:190px;font-weight:700}
.status{font-weight:800;letter-spacing:.08em}
.ttd{margin-top:48px;width:320px;margin-left:auto;text-align:left}
.kode{margin-top:32px;font-size:12px;color:#475569}
@media print{body{margin:24mm}.no-print{display:none}}
</style>
</head>
<body>
<button class="no-print" onclick="window.print()">Cetak / Simpan PDF</button>
<div class="kop">
<h1>Pemerintah Provinsi Jawa Barat</h1>
<h2>SMK Negeri 1 Terisi</h2>
<div>Jl. Raya Terisi, Kec. Terisi, Kabupaten Indramayu, Jawa Barat 45262</div>
</div>
<h2 style="text-align:center;text-decoration:underline">Surat Keterangan Lulus</h2>
<div class="nomor">Nomor: ${escapeHtml(data.noIjazah || '-')}</div>
<p>Yang bertanda tangan di bawah ini menerangkan bahwa:</p>
<table>
<tr><td>Nama Lengkap</td><td>: ${escapeHtml(data.nama)}</td></tr>
<tr><td>NISN</td><td>: ${escapeHtml(data.nisn)}</td></tr>
<tr><td>Tanggal Lahir</td><td>: ${escapeHtml(formatTanggalId(data.ttl))}</td></tr>
<tr><td>Program Keahlian</td><td>: ${escapeHtml(data.jurusan || '-')}</td></tr>
<tr><td>Kelas</td><td>: ${escapeHtml(data.kelas || '-')}</td></tr>
<tr><td>Nilai Rata-rata</td><td>: ${escapeHtml(Number(data.nilaiRata || 0).toFixed(2))}</td></tr>
</table>
<p>Telah dinyatakan <span class="status">LULUS</span> pada tahun pelajaran ${escapeHtml(tahunPelajaran)} berdasarkan data kelulusan sekolah.</p>
<div class="ttd">
<p>Indramayu, ${escapeHtml(formatTanggalId(new Date().toISOString()))}</p>
<p>Kepala SMK Negeri 1 Terisi,</p>
<br><br><br>
<strong>Agung Hendra Adiwiguna, S.Kom., M.M.</strong><br>
NIP. 19800101 200501 1 001
</div>
${includeCode ? `<div class="kode">Kode verifikasi: ${escapeHtml(kodeVerif)}</div>` : ''}
</body>
</html>`;
}

function createSklArchiveText(data, kodeVerif) {
    const tahun = Number.parseInt(data.tahunLulus, 10);
    const tahunPelajaran = Number.isFinite(tahun) ? `${tahun - 1}/${tahun}` : '-';
    return `SURAT KETERANGAN LULUS
SMK NEGERI 1 TERISI
Jl. Raya Terisi, Kec. Terisi, Kabupaten Indramayu, Jawa Barat 45262

Nomor: ${data.noIjazah || '-'}
Kode Verifikasi: ${kodeVerif}

Nama Lengkap   : ${data.nama}
NISN           : ${data.nisn}
Tanggal Lahir  : ${formatTanggalId(data.ttl)}
Program Keahlian: ${data.jurusan || '-'}
Kelas          : ${data.kelas || '-'}
Nilai Rata-rata: ${Number(data.nilaiRata || 0).toFixed(2)}
Status         : LULUS
Tahun Pelajaran: ${tahunPelajaran}

Indramayu, ${formatTanggalId(new Date().toISOString())}
Kepala SMK Negeri 1 Terisi,


Agung Hendra Adiwiguna, S.Kom., M.M.
NIP. 19800101 200501 1 001
`;
}

function unduhDokumenSkl(data, format, kodeVerif) {
    const safeName = String(data.nama || 'siswa').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g,'_') || 'siswa';
    const isArchive = format === 'archive';
    const content = isArchive
        ? createSklArchiveText(data, kodeVerif)
        : createSklDocumentHtml(data, kodeVerif, format === 'print-code');
    const blob = new Blob([content], { type: isArchive ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `SKL_${data.nisn}_${safeName}.${isArchive ? 'txt' : 'html'}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

/* ============================================================
   SALIN KODE VERIFIKASI
   ============================================================ */
function copyVerifyCode() {
    const code = document.getElementById('verify-code').textContent;
    if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
            showToast('Kode verifikasi disalin!', 'blue', 2000);
        });
    } else {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = code;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Kode verifikasi disalin!', 'blue', 2000);
    }
}

/* ============================================================
   SHARE
   ============================================================ */
function shareWA() {
    const nama = dataSiswaFound ? dataSiswaFound.nama : 'Saya';
    const tahun = dataSiswaFound ? dataSiswaFound.tahunLulus : new Date().getFullYear();
    const text = `🎓 Alhamdulillah, ${nama} telah LULUS dari SMK Negeri 1 Terisi Tahun Ajaran ${parseInt(tahun)-1}/${tahun}! 🎉 #SMKBangkit #SMKN1Terisi #Lulus${tahun}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
}
function shareIG() {
    showToast('Unduh gambar SKL lalu unggah ke Instagram!', 'blue', 3000);
}
function shareTW() {
    const nama = dataSiswaFound ? dataSiswaFound.nama : 'Saya';
    const text = `🎓 Alhamdulillah LULUS dari SMK Negeri 1 Terisi! #SMKN1Terisi #Kelulusan #SMKBisa`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
}

/* ============================================================
   NAVIGASI
   ============================================================ */
function backToSearch() {
    updateStepIndicator(1);
    showScreen('screen-search');
    genCaptcha();
}

function resetAll() {
    dataSiswaFound = null;
    document.getElementById('inp-nisn').value   = '';
    document.getElementById('inp-nama').value   = '';
    document.getElementById('inp-ttl').value    = '';
    document.getElementById('inp-tahun').value  = '';
    document.getElementById('search-error').classList.add('hidden');
    genCaptcha();
    updateStepIndicator(1);
    showScreen('screen-search');
}

/* ============================================================
   FORMAT KARTU RADIO KLIK
   ============================================================ */
function initFormatCards() {
    document.querySelectorAll('.dl-format-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.dl-format-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const inp = card.querySelector('input');
            if (inp) inp.checked = true;
        });
    });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    generateParticles();
    genCaptcha();
    initFormatCards();
    updateStepIndicator(1);

    // Keyboard: Enter untuk submit
    ['inp-nisn','inp-nama','inp-ttl','inp-tahun','captcha-ans'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') cariSKL();
        });
    });
});
