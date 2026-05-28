/* =====================================================
   CBT ONLINE — SMKN 1 TERISI
   File: cbt.js
   ===================================================== */

'use strict';

/* ============================================================
   METADATA MAPEL CBT
   Soal ujian dan kunci jawaban wajib dimuat dari backend.
   ============================================================ */
const BANK_SOAL = {
    matematika: { nama: 'Matematika', jenis: 'Ujian CBT', durasi: 90 },
    bindo:      { nama: 'Bahasa Indonesia', jenis: 'Ujian CBT', durasi: 90 },
    basing:     { nama: 'Bahasa Inggris', jenis: 'Ujian CBT', durasi: 90 },
    pkk:        { nama: 'Produk Kreatif & Kewirausahaan', jenis: 'Ujian CBT', durasi: 90 },
    sejarah:    { nama: 'Sejarah Indonesia', jenis: 'Ujian CBT', durasi: 60 },
    produktif:  { nama: 'Kompetensi Keahlian', jenis: 'Ujian CBT', durasi: 120 },
};
// URL base API — sesuaikan jika backend di server berbeda
const CBT_API = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/cbt'
    : '/api/cbt';

/* ============================================================
   STATE APLIKASI
   ============================================================ */
const state = {
    mapel:       null,
    siswa:       '',
    nisn:        '',   // FIX: simpan NISN untuk WS handshake
    token:       '',   // FIX: simpan CBT token untuk WS handshake
    sessionId:   null,
    examId:      null,
    examTitle:   null,
    soalList:    [],
    jawaban:     {},     // { nomor: 'A'/'B'/... }
    raguList:    new Set(),
    current:     0,
    durasi:      90,     // menit
    timerSisa:   0,      // detik
    timerInterval: null,
    started:     false,
    submitting:   false,
    lastResult:   null,
};

const emergencyChat = {
    unread: 0,
    open: false
};

/* ============================================================
   UTILITAS
   ============================================================ */
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) { el.classList.add('active'); window.scrollTo(0,0); }
}

function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
}

function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
}

function escHtml(value) {
    return String(value || '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
}

/* ============================================================
   LOGIN
   ============================================================ */
// Toggle show/hide password
const togglePw = document.getElementById('toggle-pw');
if (togglePw) {
    togglePw.addEventListener('click', () => {
        const inp = document.getElementById('login-token');
        const icon = togglePw.querySelector('i');
        if (inp.type === 'password') {
            inp.type = 'text';
            icon.className = 'fas fa-eye-slash';
            togglePw.setAttribute('aria-label', 'Sembunyikan token');
        } else {
            inp.type = 'password';
            icon.className = 'fas fa-eye';
            togglePw.setAttribute('aria-label', 'Tampilkan token');
        }
    });
}

async function handleLogin() {
    const nisn   = document.getElementById('login-nisn').value.trim();
    const token  = document.getElementById('login-token').value.trim();
    const mapel  = document.getElementById('login-mapel').value;
    const errEl  = document.getElementById('login-error');
    const errMsg = document.getElementById('login-error-msg');
    const btnMasuk = document.getElementById('btn-masuk');

    function showErr(msg) {
        errMsg.textContent = msg;
        errEl.classList.remove('hidden');
    }

    errEl.classList.add('hidden');

    if (!nisn || nisn.length < 6) {
        showErr('NISN harus minimal 6 digit.');
        return;
    }
    if (!token) {
        showErr('Token ujian tidak boleh kosong.');
        return;
    }
    if (!mapel) {
        showErr('Pilih mata pelajaran terlebih dahulu.');
        return;
    }

    btnMasuk.disabled = true;
    btnMasuk.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memvalidasi...';

    try {
        const res  = await fetch(`${CBT_API}/token/validate`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ nisn, token })
        });
        const data = await res.json();

        if (!data.success) {
            showErr(data.message || 'Token tidak valid. Hubungi guru pengawas.');
            return;
        }

        if (data.data.mapel !== mapel) {
            showErr(`Token ini untuk mapel ${data.data.mapel}, bukan ${mapel}. Hubungi guru pengawas.`);
            return;
        }

        state.mapel  = data.data.mapel;
        state.siswa  = data.data.siswa_nama || `NISN: ${nisn}`;
        state.nisn   = nisn;
        state.token  = token;
        state.sessionId = data.data.session_id || null;
        state.examId    = data.data.exam_id || null;
        state.examTitle = data.data.exam_title || null;

        const bankData = BANK_SOAL[state.mapel] || { nama: state.mapel, jenis: 'Ujian CBT', durasi: data.data.durasi_menit || 90, soal: [] };
        if (!bankData) {
            showErr('Data soal untuk mata pelajaran ini tidak tersedia.');
            return;
        }

        document.getElementById('brief-mapel-name').textContent = state.examTitle || bankData.nama;
        document.getElementById('brief-type').textContent       = bankData.jenis;
        document.getElementById('brief-jumlah').textContent     = data.data.jumlah_soal || bankData.soal?.length || '-';
        document.getElementById('brief-durasi').textContent     = data.data.durasi_menit || bankData.durasi;
        state.durasi = data.data.durasi_menit || bankData.durasi;

        runPreExamCheck(state.mapel, nisn);

    } catch (err) {
        if (!navigator.onLine || err.message.includes('fetch')) {
            showErr('Tidak bisa terhubung ke server. Pastikan koneksi internet aktif.');
        } else {
            showErr('Terjadi kesalahan. Coba lagi atau hubungi pengawas.');
        }
        console.error('[CBT handleLogin]', err);
    } finally {
        btnMasuk.disabled = false;
        btnMasuk.innerHTML = '<span>Mulai Ujian</span><i class="fas fa-arrow-right"></i>';
    }
}

/* ============================================================
   MULAI UJIAN
   ============================================================ */
function beginExamWithQuestions(data, questions) {
    state.soalList   = questions;
    state.jawaban    = {};
    state.raguList   = new Set();
    state.current    = 0;
    state.durasi     = state.durasi || data.durasi || 90;
    state.timerSisa  = state.durasi * 60;
    state.started    = true;

    document.getElementById('exam-mapel-label').textContent   = state.examTitle || data.nama;
    document.getElementById('exam-student-label').textContent = state.siswa;
    document.getElementById('q-total').textContent            = state.soalList.length;

    buildNavGrid();
    updateExamProgress();
    updateTimerDisplay();
    renderQuestion();
    startTimer();
    showScreen('screen-exam');
    document.getElementById('emergency-chat')?.classList.remove('hidden');
}

/* ============================================================
   TIMER
   ============================================================ */
function startTimer() {
    clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
        state.timerSisa--;
        updateTimerDisplay();
        if (state.timerSisa <= 0) {
            clearInterval(state.timerInterval);
            openModal('modal-timeout');
        }
    }, 1000);
}

function updateTimerDisplay() {
    const m  = Math.floor(state.timerSisa / 60);
    const s  = state.timerSisa % 60;
    const el = document.getElementById('timer-display');
    const box= document.getElementById('timer-box');
    if (!el) return;
    el.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;

    box.classList.remove('warn','danger');
    if (state.timerSisa <= 60)       box.classList.add('danger');
    else if (state.timerSisa <= 300) box.classList.add('warn');
}

/* ============================================================
   RENDER SOAL
   ============================================================ */
const LETTERS = ['A','B','C','D','E'];

function renderQuestion() {
    const idx  = state.current;
    const soal = state.soalList[idx];
    if (!soal) return;

    document.getElementById('q-current').textContent = idx + 1;

    // Teks, media, dan area jawaban soal
    document.getElementById('q-text').innerHTML =
        `<p>${escHtml(soal.soal)}</p>${renderQuestionMedia(soal)}`;
    renderCanvasMedia(document.getElementById('q-text'));

    // Opsi / esai
    const container = document.getElementById('q-options');
    container.innerHTML = '';
    if ((soal.question_type || 'multiple_choice') === 'essay') {
        const saved = state.jawaban[idx] || '';
        const minWords = Number(soal.essay_min_words || 0);
        container.innerHTML = `
            <div class="essay-answer">
                <label for="essay-answer-${idx}">Jawaban Esai</label>
                <textarea id="essay-answer-${idx}" rows="8" maxlength="4000" placeholder="Tulis jawaban esai dengan kalimat lengkap.">${escHtml(saved)}</textarea>
                <div class="essay-meta"><span id="essay-words-${idx}">0 kata</span>${minWords ? `<span>Minimal ${minWords} kata</span>` : ''}</div>
            </div>
        `;
        const textarea = document.getElementById(`essay-answer-${idx}`);
        const updateWords = () => {
            const text = textarea.value.trim();
            state.jawaban[idx] = text;
            const count = text ? text.split(/\s+/).filter(Boolean).length : 0;
            document.getElementById(`essay-words-${idx}`).textContent = `${count} kata`;
            setSaveStatus(text ? 'saved' : 'idle');
            updateNavGrid();
            updateExamProgress();
        };
        textarea.addEventListener('input', updateWords);
        updateWords();
    } else {
    soal.opsi.forEach((opt, i) => {
        const letter  = LETTERS[i];
        const isChosen= state.jawaban[idx] === letter;
        const btn     = document.createElement('button');
        btn.type = 'button';
        btn.className = 'option-btn' + (isChosen ? ' selected' : '');
        btn.setAttribute('aria-pressed', String(isChosen));
        btn.innerHTML = `<span class="option-letter">${letter}</span><span>${escHtml(opt)}</span>`;
        btn.addEventListener('click', () => selectAnswer(letter));
        container.appendChild(btn);
    });
    }

    // Ragu-ragu
    document.getElementById('ragu-check').checked = state.raguList.has(idx);
    const clearBtn = document.getElementById('btn-clear-answer');
    if (clearBtn) clearBtn.disabled = !state.jawaban[idx];

    // Nav buttons
    document.getElementById('btn-prev').disabled = idx === 0;
    document.getElementById('btn-next').disabled = idx === state.soalList.length - 1;

    updateNavGrid();
    updateExamProgress();
    setSaveStatus(state.jawaban[idx] ? 'saved' : 'idle');
}

function renderQuestionMedia(soal) {
    const type = soal.media_type;
    const url = soal.media_url;
    const alt = escHtml(soal.media_alt || 'Media soal');
    if (type === 'image' && url) return `<figure class="question-media"><img src="${escHtml(url)}" alt="${alt}" loading="lazy"></figure>`;
    if (type === 'audio' && url) return `<figure class="question-media"><audio controls preload="metadata" src="${escHtml(url)}"></audio></figure>`;
    if (type === 'video' && url) return `<figure class="question-media"><video controls preload="metadata" src="${escHtml(url)}"></video></figure>`;
    if (type === 'canvas' && soal.canvas_data) {
        return `<figure class="question-media"><canvas class="question-canvas" data-canvas='${escHtml(JSON.stringify(soal.canvas_data))}' width="640" height="320"></canvas></figure>`;
    }
    return '';
}

function renderCanvasMedia(scope) {
    scope?.querySelectorAll('.question-canvas').forEach(canvas => {
        let data = null;
        try { data = JSON.parse(canvas.dataset.canvas || 'null'); } catch { data = null; }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1;
        for (let x = 0; x <= canvas.width; x += 32) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += 32) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }
        if (data?.label) {
            ctx.fillStyle = '#0f172a';
            ctx.font = '700 20px Sora, sans-serif';
            ctx.fillText(String(data.label).slice(0, 80), 24, 42);
        }
        if (Array.isArray(data?.shapes)) {
            data.shapes.slice(0, 40).forEach(shape => {
                ctx.strokeStyle = shape.color || '#002244';
                ctx.fillStyle = shape.fill || 'transparent';
                ctx.lineWidth = Number(shape.width || 3);
                if (shape.type === 'circle') {
                    ctx.beginPath(); ctx.arc(Number(shape.x || 80), Number(shape.y || 80), Number(shape.r || 30), 0, Math.PI * 2); ctx.stroke();
                } else if (shape.type === 'line') {
                    ctx.beginPath(); ctx.moveTo(Number(shape.x1 || 0), Number(shape.y1 || 0)); ctx.lineTo(Number(shape.x2 || 120), Number(shape.y2 || 80)); ctx.stroke();
                } else {
                    ctx.strokeRect(Number(shape.x || 40), Number(shape.y || 60), Number(shape.w || 120), Number(shape.h || 70));
                }
            });
        }
    });
}

function selectAnswer(letter) {
    state.jawaban[state.current] = letter;
    setSaveStatus('pending');
    sendToAdmin({
        type: 'answer_update',
        nisn: state.nisn,
        mapel: state.mapel,
        answered: Object.keys(state.jawaban).length,
        total: state.soalList.length,
        current: state.current + 1
    });
    renderQuestion();
}

function toggleRagu() {
    const idx = state.current;
    if (state.raguList.has(idx)) state.raguList.delete(idx);
    else state.raguList.add(idx);
    updateNavGrid();
    updateExamProgress();
}

function clearCurrentAnswer() {
    if (!state.jawaban[state.current]) return;
    delete state.jawaban[state.current];
    sendToAdmin({
        type: 'answer_update',
        nisn: state.nisn,
        mapel: state.mapel,
        answered: Object.keys(state.jawaban).length,
        total: state.soalList.length,
        current: state.current + 1
    });
    renderQuestion();
}

/* ============================================================
   NAVIGASI SOAL
   ============================================================ */
function nextQuestion() {
    if (state.current < state.soalList.length - 1) {
        state.current++;
        renderQuestion();
    }
}

function prevQuestion() {
    if (state.current > 0) {
        state.current--;
        renderQuestion();
    }
}

function jumpTo(idx) {
    state.current = idx;
    renderQuestion();
    // Tutup nav di mobile
    document.getElementById('nav-panel').classList.remove('mobile-open');
}

/* ============================================================
   NAVIGASI GRID
   ============================================================ */
function buildNavGrid() {
    const grid = document.getElementById('nav-grid');
    grid.innerHTML = '';
    state.soalList.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'nav-num';
        btn.textContent = i + 1;
        btn.setAttribute('aria-label', `Buka soal ${i + 1}`);
        btn.addEventListener('click', () => jumpTo(i));
        grid.appendChild(btn);
    });
}

function updateNavGrid() {
    const btns = document.querySelectorAll('.nav-num');
    btns.forEach((btn, i) => {
        btn.className = 'nav-num';
        if (i === state.current)         btn.classList.add('current');
        else if (state.raguList.has(i))  btn.classList.add('ragu');
        else if (state.jawaban[i])       btn.classList.add('answered');
        btn.setAttribute('aria-current', i === state.current ? 'true' : 'false');
    });
}

function updateFabBadge() {
    const count = Math.max(state.soalList.length - Object.keys(state.jawaban).length, 0);
    const el    = document.getElementById('fab-badge');
    if (el) el.textContent = count;
}

function getExamCounts() {
    const total = state.soalList.length;
    const answered = Object.keys(state.jawaban).length;
    const ragu = state.raguList.size;
    return {
        total,
        answered,
        ragu,
        unanswered: Math.max(total - answered, 0)
    };
}

function updateExamProgress() {
    const { total, answered, ragu, unanswered } = getExamCounts();
    const percent = total ? Math.round((answered / total) * 100) : 0;
    const progressText = document.getElementById('exam-progress-text');
    const examBar = document.getElementById('exam-progress-bar');
    const qBar = document.getElementById('q-progress-bar');
    const summaryAnswered = document.getElementById('summary-answered');
    const summaryRagu = document.getElementById('summary-ragu');
    const summaryUnanswered = document.getElementById('summary-unanswered');

    if (progressText) progressText.textContent = `${answered} / ${total} dijawab`;
    if (examBar) examBar.style.width = `${percent}%`;
    if (qBar) qBar.style.width = `${state.soalList.length ? ((state.current + 1) / state.soalList.length) * 100 : 0}%`;
    if (summaryAnswered) summaryAnswered.textContent = answered;
    if (summaryRagu) summaryRagu.textContent = ragu;
    if (summaryUnanswered) summaryUnanswered.textContent = unanswered;
    updateFabBadge();
}

function setSaveStatus(type) {
    const el = document.getElementById('save-status');
    if (!el) return;
    el.classList.remove('pending', 'error');
    if (type === 'pending') {
        el.classList.add('pending');
        el.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Mencatat';
        return;
    }
    if (type === 'idle') {
        el.innerHTML = '<i class="fas fa-minus-circle"></i> Belum dijawab';
        return;
    }
    el.innerHTML = '<i class="fas fa-check-circle"></i> Pilihan tercatat';
}

function jumpToStatus(status) {
    let target = -1;
    if (status === 'unanswered') {
        target = state.soalList.findIndex((_, i) => !state.jawaban[i]);
    } else if (status === 'ragu') {
        target = Array.from(state.raguList).sort((a, b) => a - b)[0] ?? -1;
    } else if (status === 'answered') {
        target = state.soalList.findIndex((_, i) => !!state.jawaban[i]);
    }
    if (target >= 0) jumpTo(target);
}

function toggleNavPanel() {
    const panel = document.getElementById('nav-panel');
    panel.classList.toggle('mobile-open');
}

/* ============================================================
   SELESAI UJIAN
   ============================================================ */
function confirmFinish() {
    const total    = state.soalList.length;
    const dijawab  = Object.keys(state.jawaban).length;
    const belum    = total - dijawab;
    const ragu     = state.raguList.size;
    const summary  = document.getElementById('modal-summary');
    const breakdown = document.getElementById('finish-breakdown');

    if (belum > 0) {
        summary.innerHTML = `Masih ada <strong>${belum} soal</strong> yang belum dijawab. Yakin ingin mengumpulkan?`;
    } else if (ragu > 0) {
        summary.innerHTML = `Semua soal sudah dijawab, tapi ada <strong>${ragu} soal</strong> yang masih ditandai ragu.`;
    } else {
        summary.innerHTML = 'Semua soal sudah dijawab. Kumpulkan sekarang?';
    }
    if (breakdown) {
        breakdown.innerHTML = `
            <div class="finish-pill"><strong>${dijawab}</strong><span>Dijawab</span></div>
            <div class="finish-pill"><strong>${ragu}</strong><span>Ragu</span></div>
            <div class="finish-pill"><strong>${belum}</strong><span>Belum</span></div>
        `;
    }
    openModal('modal-finish');
}

async function finishExam() {
    if (state.submitting) return;
    clearInterval(state.timerInterval);
    closeModal('modal-finish');
    closeModal('modal-timeout');
    state.submitting = true;

    try {
        const result = await submitExamToServer();
        state.lastResult = result;
        renderResult(result);
        state.started = false;
        examLock.deactivate();
        stopProctoring();
        sendToAdmin({
            type: 'student_finish',
            nisn: state.nisn,
            mapel: state.mapel,
            nilai: result.nilai,
            benar: result.benar,
            salah: result.salah,
            kosong: result.kosong,
            serverVerified: true
        });
        showScreen('screen-result');
    } catch (err) {
        openModal('modal-finish');
        alert(err.message || 'Gagal mengumpulkan jawaban. Cek koneksi lalu coba lagi.');
    } finally {
        state.submitting = false;
    }
}

function stopProctoring() {
    clearInterval(cameraState.captureInterval);
    clearInterval(screenState.captureInterval);
    if (gpsState.watchId && navigator.geolocation?.clearWatch) navigator.geolocation.clearWatch(gpsState.watchId);
    cameraState.stream?.getTracks().forEach(t => t.stop());
    screenState.stream?.getTracks().forEach(t => t.stop());
    document.getElementById('proctor-widget')?.classList.add('hidden');
    document.getElementById('emergency-chat')?.classList.add('hidden');
}

/* ============================================================
   KUMPULKAN & TAMPILKAN HASIL
   ============================================================ */
async function submitExamToServer() {
    const answers = state.soalList.map((soal, i) => ({
        question_id: soal.id,
        jawaban: state.jawaban[i] || null,
        answer_type: soal.question_type || 'multiple_choice',
    })).filter(item => item.question_id);

    const res = await fetch(`${CBT_API}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nisn: state.nisn,
            token: state.token,
            answers,
        })
    });

    const json = await res.json().catch(() => ({ success: false, message: 'Response server tidak valid.' }));
    if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengumpulkan jawaban.');
    }
    return json.data;
}

function renderResult(result) {
    const benar  = result.benar || 0;
    const salah  = result.salah || 0;
    const kosong = result.kosong || 0;
    const nilai  = result.nilai || 0;
    const lulus = nilai >= 70;

    // Update UI
    const iconEl = document.getElementById('result-icon');
    iconEl.className = 'result-icon ' + (lulus ? 'pass' : 'fail');
    iconEl.innerHTML = lulus ? '<i class="fas fa-trophy"></i>' : '<i class="fas fa-times-circle"></i>';

    document.getElementById('result-title').textContent = lulus ? 'Selamat, Lulus!' : 'Belum Tuntas';
    document.getElementById('result-sub').textContent   = lulus
        ? `Nilaimu ${nilai} — Di atas KKM. Kerja bagus!`
        : `Nilaimu ${nilai} — Di bawah KKM (70). Tetap semangat!`;
    if (result.essay_pending) {
        document.getElementById('result-sub').textContent += ` ${result.essay_pending} esai belum punya kata kunci koreksi dari guru.`;
    }

    document.getElementById('res-correct').textContent = benar;
    document.getElementById('res-wrong').textContent   = salah;
    document.getElementById('res-skip').textContent    = kosong;

    // Animate ring
    const circumference = 314;
    const offset = circumference - (nilai / 100) * circumference;
    setTimeout(() => {
        const ring = document.getElementById('ring-fill');
        ring.style.strokeDashoffset = offset;
        ring.style.stroke = lulus ? '#10b981' : '#ef4444';
    }, 300);

    // Animate score counter
    animateCount('ring-score', 0, nilai, 1500);
}

function animateCount(id, from, to, duration) {
    const el   = document.getElementById(id);
    if (!el) return;
    const start= performance.now();
    function update(now) {
        const elapsed = now - start;
        const progress= Math.min(elapsed / duration, 1);
        const ease    = 1 - Math.pow(1 - progress, 3);
        el.textContent= Math.round(from + (to - from) * ease);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

/* ============================================================
   KEYBOARD SHORTCUTS
   ============================================================ */
document.addEventListener('keydown', (e) => {
    const s = document.getElementById('screen-exam');
    if (!s || !s.classList.contains('active')) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') nextQuestion();
    if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   prevQuestion();

    // Jawab dengan A-E
    const letters = { a:'A', b:'B', c:'C', d:'D', e:'E' };
    const l = letters[e.key.toLowerCase()];
    if (l && state.soalList[state.current]?.opsi.length >= LETTERS.indexOf(l)+1) {
        selectAnswer(l);
    }
});

/* ============================================================
   ANTI CHEAT: Deteksi pindah tab
   ============================================================ */
document.addEventListener('visibilitychange', () => {
    const s = document.getElementById('screen-exam');
    if (!s || !s.classList.contains('active') || !state.started) return;
    if (document.hidden) {
        // Tampilkan peringatan
        const warn = document.createElement('div');
        warn.style.cssText = 'position:fixed;inset:0;background:rgba(239,68,68,0.95);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;font-family:Sora,sans-serif;text-align:center;padding:30px;';
        warn.innerHTML = '<i class="fas fa-exclamation-triangle" style="font-size:3rem;margin-bottom:16px;"></i><h2 style="font-size:1.8rem;margin-bottom:10px;">Peringatan!</h2><p style="font-size:1rem;opacity:0.85;">Aktivitas berpindah tab terdeteksi.<br>Tindakan ini dicatat oleh sistem.</p>';
        warn.id = 'cheat-warn';
        document.body.appendChild(warn);
        setTimeout(() => {
            const el = document.getElementById('cheat-warn');
            if (el) el.remove();
        }, 3000);
    }
});

/* ──────────────────────────────────────────────────────────────
   KONFIGURASI SOCKET (WebSocket ke server admin)
   Ganti URL sesuai server Node.js admin kamu
   ────────────────────────────────────────────────────────────── */
let adminSocket = null;
const telemetryQueue = [];
const MAX_TELEMETRY_QUEUE = 40;
const FRAME_TYPES = new Set(['camera_frame', 'screen_frame']);
const FRAME_SEND_INTERVAL_MS = { camera_frame: 30000, screen_frame: 45000 };
const lastFrameSentAt = {};
let lastLocationSentAt = 0;

function toggleEmergencyChat(force) {
    const chat = document.getElementById('emergency-chat');
    if (!chat) return;
    const willOpen = typeof force === 'boolean' ? force : !chat.classList.contains('open');
    chat.classList.toggle('open', willOpen);
    emergencyChat.open = willOpen;
    if (willOpen) {
        emergencyChat.unread = 0;
        updateEmergencyBadge();
        setTimeout(() => document.getElementById('emergency-input')?.focus(), 80);
    }
}

function updateEmergencyBadge() {
    const badge = document.getElementById('emergency-badge');
    if (!badge) return;
    badge.textContent = emergencyChat.unread;
    badge.classList.toggle('hidden', emergencyChat.unread <= 0);
}

function addEmergencyMessage(message, type = 'system', senderName = '') {
    const feed = document.getElementById('emergency-feed');
    if (!feed) return;
    const label = senderName || (type === 'me'
        ? (state.siswa || state.nisn || 'Saya')
        : type === 'admin'
            ? 'Panitia CBT'
            : type === 'announcement'
                ? 'Administrator'
                : 'Sistem');
    const item = document.createElement('div');
    item.className = `emergency-msg ${type}`;
    item.innerHTML = `
        <span class="emergency-sender">${escHtml(label)}</span>
        <span class="emergency-text">${escHtml(message || '')}</span>
    `;
    feed.appendChild(item);
    feed.scrollTop = feed.scrollHeight;
    if (!emergencyChat.open && ['admin', 'announcement'].includes(type)) {
        emergencyChat.unread += 1;
        updateEmergencyBadge();
    }
}

function markLastEmergencyMessageSent() {
    const feed = document.getElementById('emergency-feed');
    const last = feed?.querySelector('.emergency-msg.me:last-child');
    if (last && !last.dataset.sent) {
        last.dataset.sent = '1';
        last.title = 'Terkirim ke panitia CBT';
    }
}

function sendEmergencyMessage(event) {
    event.preventDefault();
    if (!state.started) return;
    const input = document.getElementById('emergency-input');
    const message = input?.value.trim();
    if (!message) return;
    if (message.length > 500) {
        addEmergencyMessage('Pesan terlalu panjang. Maksimal 500 karakter.', 'system');
        return;
    }
    addEmergencyMessage(message, 'me', state.siswa || state.nisn || 'Saya');
    sendToAdmin({
        type: 'student_help',
        exam_id: state.examId,
        session_id: state.sessionId,
        senderName: state.siswa,
        message
    });
    input.value = '';
}

function connectAdminSocket(studentData) {
    try {
        const wsUrl = window.location.protocol === 'https:'
            ? `wss://${window.location.host}`
            : `ws://${window.location.hostname}:3001`;

        adminSocket = new WebSocket(wsUrl);

        adminSocket.onopen = () => {
            console.log('[CBT] Terhubung ke server admin');
            sendToAdmin({
                type:  'student_join',
                nisn:  studentData.nisn || state.nisn,
                token: state.token,
                exam_id: state.examId,
                session_id: state.sessionId,
                mapel: studentData.mapel,
                lat:   studentData.lat,
                lng:   studentData.lng,
                device:  studentData.device,
                browser: studentData.browser
            });
            setTimeout(flushTelemetryQueue, 120);
        };

        adminSocket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                switch (msg.type) {
                    case 'warning':
                        examLock._warn(`⚠️ Peringatan dari pengawas: ${msg.message}`);
                        break;
                    case 'kicked':
                        alert('Anda dikeluarkan dari sesi ujian oleh pengawas.');
                        finishExam();
                        break;
                    case 'force_finish':
                        alert('Waktu ujian telah dihentikan oleh pengawas. Jawaban dikumpulkan otomatis.');
                        finishExam();
                        break;
                    case 'broadcast':
                    case 'announcement':
                        examLock._warn(`📢 ${msg.message}`);
                        addEmergencyMessage(msg.message, 'announcement', msg.sender_name || 'Administrator');
                        break;
                    case 'admin_reply':
                        addEmergencyMessage(msg.message, 'admin', msg.sender_name || 'Panitia CBT');
                        break;
                    case 'student_help_ack':
                        markLastEmergencyMessageSent();
                        break;
                    case 'chat_error':
                        addEmergencyMessage(msg.message || 'Pesan tidak terkirim.', 'system');
                        break;
                    case 'error':
                        console.warn('[CBT WS error]', msg.message);
                        break;
                }
            } catch(e) {}
        };

        adminSocket.onclose = (event) => {
            console.warn('[CBT] Koneksi admin terputus', event.code);
            if (state.started) {
                setTimeout(() => connectAdminSocket(studentData), 5000);
            }
        };

        adminSocket.onerror = (e) => {
            console.warn('[CBT] Server admin tidak tersedia – mode offline');
        };

    } catch(e) {
        console.warn('[CBT] Gagal koneksi WebSocket:', e.message);
    }
}

function sendToAdmin(payload) {
    const normalized = { ...payload, nisn: payload.nisn || state.nisn, mapel: payload.mapel || state.mapel };
    if (FRAME_TYPES.has(normalized.type)) {
        const now = Date.now();
        const minGap = FRAME_SEND_INTERVAL_MS[normalized.type] || 30000;
        if (now - (lastFrameSentAt[normalized.type] || 0) < minGap) return;
        lastFrameSentAt[normalized.type] = now;
    }
    if (normalized.type === 'location_update') {
        const now = Date.now();
        if (now - lastLocationSentAt < 30000) return;
        lastLocationSentAt = now;
    }
    if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
        adminSocket.send(JSON.stringify(normalized));
        return;
    }
    if (FRAME_TYPES.has(normalized.type)) return;
    telemetryQueue.push(normalized);
    if (telemetryQueue.length > MAX_TELEMETRY_QUEUE) telemetryQueue.shift();
}

function flushTelemetryQueue() {
    if (!adminSocket || adminSocket.readyState !== WebSocket.OPEN) return;
    while (telemetryQueue.length) {
        adminSocket.send(JSON.stringify(telemetryQueue.shift()));
    }
}

const precheckState = {
    passed: false,
    lastMapel: null,
    lastNisn: null,
    results: {}
};

const PRECHECK_RULES = {
    minSpeedMbps: 1,
    minCores: 2,
    networkTestBytes: 2 * 1024 * 1024,
    networkWarmupMs: 700,
    networkMaxMs: 8000
};

/* ──────────────────────────────────────────────────────────────
   1. EXAM BROWSER LOCK  (Full Kunci Layar / Anti-Cheat Ketat)
   ────────────────────────────────────────────────────────────── */
const examLock = {
    violations: 0,
    maxViolations: 5,
    active: false,
    listenersBound: false,
    muteTimer: null,
    violationCooldowns: {},
    audioCtx: null,
    originalAudioContext: window.AudioContext || window.webkitAudioContext,

    activate() {
        this.active = true;
        this._activateExamMute();
        this._showFullscreenPrompt();

        if (this.listenersBound) return;
        this.listenersBound = true;

        document.addEventListener('contextmenu', e => {
            if (state.started) { e.preventDefault(); this._warn('Klik kanan dinonaktifkan selama ujian.'); }
        });

        document.addEventListener('keydown', e => {
            if (!state.started) return;
            const blocked =
                e.key === 'F12' ||
                (e.ctrlKey && ['u','s','p','w','r','t','n'].includes(e.key.toLowerCase())) ||
                e.metaKey;

            if (blocked) {
                e.preventDefault();
                e.stopPropagation();
                this._warn('Shortcut browser diblokir selama ujian.');
            }
        }, true);

        ['copy','cut','paste'].forEach(ev =>
            document.addEventListener(ev, e => { if (state.started) e.preventDefault(); })
        );

        document.addEventListener('visibilitychange', () => {
            if (!state.started) return;
            if (document.hidden) {
                this._recordViolation('tab_switch', 'Tab berpindah terdeteksi.');
            }
        });

        document.addEventListener('fullscreenchange', () => this._handleFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this._handleFullscreenChange());

        history.pushState(null, '', location.href);
        window.addEventListener('popstate', () => {
            history.pushState(null, '', location.href);
            if (state.started) this._warn('Tombol Back/Forward diblokir selama ujian.');
        });

        window.addEventListener('blur', () => {
            if (!state.started) return;
            this._recordViolation('window_blur', 'Jendela ujian kehilangan fokus.');
        });

        window.addEventListener('beforeunload', e => {
            if (!state.started) return;
            e.preventDefault();
            e.returnValue = 'Ujian masih berlangsung.';
            return e.returnValue;
        });
    },

    deactivate() {
        this.active = false;
        clearInterval(this.muteTimer);
        this.violationCooldowns = {};
        this._hideFullscreenPrompt();
    },

    returnToFullscreen() {
        const el = document.documentElement;
        const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
        if (!rfs) {
            this._hideFullscreenPrompt();
            this._warn('Browser tidak mendukung mode layar penuh.');
            return;
        }
        rfs.call(el)
            .then(() => this._hideFullscreenPrompt())
            .catch(() => this._warn('Klik tombol sekali lagi untuk masuk layar penuh.'));
    },

    _handleFullscreenChange() {
        if (!state.started) return;
        const isFullscreen = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        if (isFullscreen) {
            this._hideFullscreenPrompt();
            return;
        }
        this._recordViolation('fullscreen_exit', 'Mode layar penuh dinonaktifkan.');
        this._showFullscreenPrompt();
    },

    _showFullscreenPrompt() {
        if (!state.started) return;
        if (document.fullscreenElement || document.webkitFullscreenElement) return;
        document.getElementById('fullscreen-return')?.classList.add('show');
    },

    _hideFullscreenPrompt() {
        document.getElementById('fullscreen-return')?.classList.remove('show');
    },

    _activateExamMute() {
        this._mutePageMedia();
        clearInterval(this.muteTimer);
        this.muteTimer = setInterval(() => {
            if (!state.started) {
                clearInterval(this.muteTimer);
                return;
            }
            this._mutePageMedia();
        }, 1000);

        if (this.originalAudioContext && !window.__cbtAudioMuted) {
            const NativeAudioContext = this.originalAudioContext;
            const lock = this;
            window.AudioContext = window.webkitAudioContext = function(...args) {
                const ctx = new NativeAudioContext(...args);
                if (state.started && ctx.state !== 'closed') ctx.suspend().catch(() => {});
                return ctx;
            };
            window.__cbtAudioMuted = true;
            document.addEventListener('play', e => lock._muteMediaElement(e.target), true);
        }

        if (!this.audioCtx && this.originalAudioContext) {
            try {
                this.audioCtx = new this.originalAudioContext();
                this.audioCtx.suspend().catch(() => {});
            } catch(e) {}
        }
    },

    _mutePageMedia() {
        document.querySelectorAll('audio, video').forEach(media => this._muteMediaElement(media));
    },

    _muteMediaElement(media) {
        if (!state.started || !(media instanceof HTMLMediaElement)) return;
        const allowedIds = ['proctor-video', 'proctor-video-mini'];
        if (allowedIds.includes(media.id)) return;
        media.muted = true;
        media.volume = 0;
        media.pause();
    },

    _recordViolation(reason, message) {
        const now = Date.now();
        if (this.violationCooldowns[reason] && now - this.violationCooldowns[reason] < 1200) return;
        this.violationCooldowns[reason] = now;
        this.violations++;
        this._showViolation(`${message} (${this.violations}/${this.maxViolations})`);
        sendToAdmin({ type: 'violation', reason, count: this.violations });
        if (this.violations >= this.maxViolations) {
            this._warn('Batas pelanggaran tercapai. Pengawas akan meninjau sesi ini.');
        }
    },

    _warn(msg) {
        const el = document.getElementById('lock-warn-msg');
        const wrap = document.getElementById('lock-warn');
        if (!el || !wrap) return;
        el.textContent = msg;
        wrap.classList.add('show');
        clearTimeout(this._warnTimer);
        this._warnTimer = setTimeout(() => wrap.classList.remove('show'), 3000);
    },

    _showViolation(msg) {
        const el = document.getElementById('violation-overlay');
        const msgEl = document.getElementById('violation-msg');
        if (!el) return;
        msgEl.textContent = msg;
        el.classList.add('show');
        setTimeout(() => el.classList.remove('show'), 4000);
    },

    _forceFinish() {}
};
window.examLock = examLock;

/* ──────────────────────────────────────────────────────────────
   2. TES KECEPATAN JARINGAN (file uji besar + warmup)
   ────────────────────────────────────────────────────────────── */
async function runNetworkTest() {
    return new Promise((resolve, reject) => {
        const el       = document.getElementById('net-test-bar');
        const statusEl = document.getElementById('net-test-status');
        const speedEl  = document.getElementById('net-test-speed');

        if (!el || !statusEl || !speedEl) return reject('Elemen UI tidak ditemukan.');

        statusEl.textContent = 'Mempersiapkan tes jaringan...';
        el.style.width = '0%';
        el.classList.add('active');
        speedEl.textContent = '0 Mbps';
        speedEl.className = 'speed-value';

        const testSize = PRECHECK_RULES.networkTestBytes;
        const testUrl = `https://speed.cloudflare.com/__down?bytes=${testSize}&ts=${Date.now()}`;
        const controller = new AbortController();
        const startTime = performance.now();
        let measuredStartTime = null;
        let measuredBytes = 0;
        let lastMeasuredSpeed = 0;
        let fallbackTimer = null;

        fetch(testUrl, { 
            cache: 'no-store',
            priority: 'high',
            mode: 'cors',
            signal: controller.signal
        })
            .then(async (response) => {
                if (!response.ok) throw new Error('Gagal mengunduh data.');
                
                const reader = response.body.getReader();
                let receivedLength = 0;
                const contentLength = Number(response.headers.get('content-length')) || testSize;

                fallbackTimer = setTimeout(() => controller.abort(), PRECHECK_RULES.networkMaxMs);
                statusEl.textContent = `Mengunduh data uji ${formatBytes(testSize)}...`;

                while(true) {
                    const {done, value} = await reader.read();
                    if (done) break;
                    
                    receivedLength += value.length;
                    const currentTime = performance.now();
                    const elapsedMs = currentTime - startTime;
                    if (elapsedMs >= PRECHECK_RULES.networkWarmupMs) {
                        if (measuredStartTime === null) measuredStartTime = currentTime;
                        measuredBytes += value.length;
                    }

                    const pct = (receivedLength / contentLength) * 100;
                    el.style.width = Math.min(pct, 100) + '%';

                    const measuredElapsed = measuredStartTime ? (currentTime - measuredStartTime) / 1000 : 0;
                    if (measuredElapsed > 0.25 && measuredBytes > 0) {
                        lastMeasuredSpeed = (measuredBytes * 8) / measuredElapsed / 1_000_000;
                        speedEl.textContent = `${lastMeasuredSpeed.toFixed(2)} Mbps`;
                        speedEl.className = 'speed-value ' + (lastMeasuredSpeed >= PRECHECK_RULES.minSpeedMbps ? 'speed-good' : 'speed-bad');
                    }
                }

                if (fallbackTimer) clearTimeout(fallbackTimer);
                const endTime = performance.now();
                el.classList.remove('active');
                const measuredElapsed = measuredStartTime ? (endTime - measuredStartTime) / 1000 : (endTime - startTime) / 1000;
                const finalBytes = measuredBytes || receivedLength;
                const finalSpeedMbps = ((finalBytes * 8) / measuredElapsed / 1_000_000).toFixed(2);

                if (el) el.style.width = '100%';
                statusEl.textContent = 'Tes jaringan selesai';
                speedEl.textContent  = `${finalSpeedMbps} Mbps`;
                speedEl.className = 'speed-value ' + (parseFloat(finalSpeedMbps) >= PRECHECK_RULES.minSpeedMbps ? 'speed-good' : 'speed-bad');
                sendToAdmin({ type: 'network_speed', mbps: finalSpeedMbps });

                const warning = parseFloat(finalSpeedMbps) < PRECHECK_RULES.minSpeedMbps
                    ? `Di bawah rekomendasi ${PRECHECK_RULES.minSpeedMbps} Mbps, tetapi tidak menghalangi ujian.`
                    : null;
                if (warning) statusEl.textContent = warning;
                setTimeout(() => resolve({ mbps: finalSpeedMbps, warning }), 800);
            })
            .catch((err) => {
                if (fallbackTimer) clearTimeout(fallbackTimer);
                el.classList.remove('active');
                if (el) el.style.width = '100%';
                const partialSpeed = lastMeasuredSpeed > 0 ? lastMeasuredSpeed.toFixed(2) : null;
                statusEl.textContent = partialSpeed
                    ? 'Tes dihentikan karena waktu habis; memakai hasil sementara.'
                    : 'Koneksi lambat / tidak terukur';
                speedEl.textContent  = partialSpeed ? `${partialSpeed} Mbps` : (navigator.onLine ? 'Tidak terukur' : 'Offline');
                speedEl.className    = 'speed-value ' + (partialSpeed && Number(partialSpeed) >= PRECHECK_RULES.minSpeedMbps ? 'speed-good' : 'speed-bad');
                sendToAdmin({ type: 'network_speed', mbps: partialSpeed, error: err && err.message });
                setTimeout(() => resolve({
                    mbps: partialSpeed,
                    warning: 'Koneksi tidak stabil atau tidak dapat diukur penuh, tetapi tidak menghalangi ujian.'
                }), 800);
            });
    });
}

function formatBytes(bytes) {
    if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)}MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${bytes}B`;
}

/* ──────────────────────────────────────────────────────────────
   3. LOKASI GPS
   ────────────────────────────────────────────────────────────── */
const gpsState = { lat: null, lng: null, watching: false };

function requestLocation() {
    return new Promise((resolve, reject) => {
        const statusEl = document.getElementById('loc-status');
        if (!navigator.geolocation) {
            if (statusEl) statusEl.textContent = 'GPS tidak didukung perangkat ini.';
            return reject('no_geo');
        }
        if (statusEl) statusEl.textContent = 'Meminta akses lokasi...';
        navigator.geolocation.getCurrentPosition(
            pos => {
                gpsState.lat = pos.coords.latitude.toFixed(6);
                gpsState.lng = pos.coords.longitude.toFixed(6);
                if (statusEl) statusEl.innerHTML =
                    `<i class="fas fa-check-circle" style="color:#10b981"></i> ` +
                    `${gpsState.lat}, ${gpsState.lng}`;
                sendToAdmin({ type: 'location', lat: gpsState.lat, lng: gpsState.lng });

                // Watch position setiap 30 detik
                gpsState.watchId = navigator.geolocation.watchPosition(
                    p => {
                        gpsState.lat = p.coords.latitude.toFixed(6);
                        gpsState.lng = p.coords.longitude.toFixed(6);
                        sendToAdmin({ type: 'location_update', lat: gpsState.lat, lng: gpsState.lng });
                    },
                    null,
                    { maximumAge: 30000, timeout: 10000 }
                );
                resolve();
            },
            err => {
                if (statusEl) statusEl.innerHTML =
                    `<i class="fas fa-times-circle" style="color:#ef4444"></i> Lokasi ditolak.`;
                reject(err);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });
}

/* ──────────────────────────────────────────────────────────────
   4. KAMERA DEPAN (Proctoring)
   ────────────────────────────────────────────────────────────── */
const cameraState = { stream: null, canvas: null, captureInterval: null };
const screenState = { stream: null, video: null, canvas: null, captureInterval: null };

function sendOptimizedFrame(type, canvas, maxLength = 45000) {
    let quality = type === 'screen_frame' ? 0.35 : 0.45;
    let imageData = canvas.toDataURL('image/jpeg', quality);
    while (imageData.length > maxLength && quality > 0.18) {
        quality -= 0.07;
        imageData = canvas.toDataURL('image/jpeg', quality);
    }
    if (imageData.length <= maxLength) sendToAdmin({ type, frame: imageData });
}

async function requestCamera() {
    const video    = document.getElementById('proctor-video');
    const statusEl = document.getElementById('cam-status');

    if (!video) return Promise.reject('no_element');

    try {
        if (statusEl) statusEl.textContent = 'Mengaktifkan kamera depan...';
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
            audio: false
        });
        cameraState.stream = stream;
        video.srcObject    = stream;
        video.play();
        const mini = document.getElementById('proctor-video-mini');
        if (mini) {
            mini.srcObject = stream;
            mini.play().catch(() => {});
            document.getElementById('proctor-widget')?.classList.remove('hidden');
        }

        if (statusEl) statusEl.innerHTML =
            `<i class="fas fa-check-circle" style="color:#10b981"></i> Kamera aktif`;

        // Buat canvas untuk capture frame
        cameraState.canvas = document.createElement('canvas');
        cameraState.canvas.width  = 160;
        cameraState.canvas.height = 120;

        // Kirim snapshot kecil. Ini bukan live video supaya ringan untuk siswa/admin/server.
        cameraState.captureInterval = setInterval(() => {
            if (!state.started) return;
            const ctx = cameraState.canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 160, 120);
            sendOptimizedFrame('camera_frame', cameraState.canvas);
        }, 30000);

        return Promise.resolve();
    } catch(err) {
        if (statusEl) statusEl.innerHTML =
            `<i class="fas fa-times-circle" style="color:#ef4444"></i> Kamera ditolak.`;
        return Promise.reject(err);
    }
}

/* ──────────────────────────────────────────────────────────────
   5. INFO DEVICE & BATERAI
   ────────────────────────────────────────────────────────────── */
async function collectDeviceInfo() {
    const browser = detectBrowser();
    const info = {
        userAgent  : navigator.userAgent,
        platform   : navigator.platform,
        screenW    : screen.width,
        screenH    : screen.height,
        colorDepth : screen.colorDepth,
        lang       : navigator.language,
        online     : navigator.onLine,
        cores      : navigator.hardwareConcurrency || 'N/A',
        battery    : null,
        device     : detectDevice(),
        browser    : `${browser.name} ${browser.version}`,
        fullscreen : !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen),
        camera     : !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        geolocation: !!navigator.geolocation,
        screenCapture: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
    };

    // Battery API
    if (navigator.getBattery) {
        try {
            const bat = await navigator.getBattery();
            info.battery = {
                level    : Math.round(bat.level * 100),
                charging : bat.charging
            };
            // Monitor baterai real-time
            bat.addEventListener('levelchange', () => {
                const pct = Math.round(bat.level * 100);
                updateBatteryUI(pct, bat.charging);
                sendToAdmin({ type: 'battery_update', level: pct, charging: bat.charging });
            });
        } catch(e) {}
    }

    // Tampilkan di UI
    const el = document.getElementById('device-info-text');
    if (el) {
        el.innerHTML = `
            <span><i class="fas fa-desktop"></i> ${info.device}</span>
            <span><i class="fas fa-globe"></i> ${info.browser}</span>
            <span><i class="fas fa-mobile-alt"></i> ${info.screenW}×${info.screenH}</span>
            <span id="bat-pct"><i class="fas fa-battery-three-quarters"></i> ${
                info.battery ? info.battery.level + '%' + (info.battery.charging ? ' ⚡' : '') : 'N/A'
            }</span>
        `;
    }

    sendToAdmin({ type: 'device_info', info });
    return { ...info, warning: validateDeviceInfo(info) };
}

function validateDeviceInfo(info) {
    const issues = [];
    const cores = Number(info.cores);

    if (!info.online) issues.push('Perangkat sedang offline.');
    if (info.device === 'Unknown Device') issues.push('Model perangkat tidak dikenali.');
    if (Number.isFinite(cores) && cores < PRECHECK_RULES.minCores) {
        issues.push(`CPU di bawah rekomendasi ${PRECHECK_RULES.minCores} core.`);
    }
    if (!info.fullscreen) issues.push('Browser tidak mendukung fullscreen lock.');
    if (!info.camera) issues.push('Browser tidak mendukung akses kamera.');
    if (!info.geolocation) issues.push('Browser tidak mendukung akses lokasi.');
    if (!info.screenCapture) issues.push('Browser tidak mendukung rekam layar ringan.');

    return issues.join(' ');
}

function collectBrowserInfo() {
    const browser = detectBrowser();
    const statusEl = document.getElementById('browser-status');
    const info = {
        ...browser,
        online: navigator.onLine,
        cookieEnabled: navigator.cookieEnabled,
        language: navigator.language,
        userAgent: navigator.userAgent
    };
    const warning = [];

    if (!info.online) warning.push('offline');
    if (!info.cookieEnabled) warning.push('cookie nonaktif');
    if (/Internet Explorer|Unknown/.test(info.name)) warning.push('browser tidak direkomendasikan');

    if (statusEl) {
        statusEl.innerHTML =
            `<i class="fas fa-globe" style="color:#3b82f6"></i> ${info.name} ${info.version}` +
            (warning.length ? ` - Catatan: ${warning.join(', ')}` : ' - Terdeteksi normal');
    }

    sendToAdmin({ type: 'browser_info', info, warning: warning.join(', ') });
    return Promise.resolve({ ...info, warning: warning.join(', ') });
}

function detectBrowser() {
    const ua = navigator.userAgent;
    const uaData = navigator.userAgentData;
    if (uaData && uaData.brands && uaData.brands.length) {
        const brand = uaData.brands.find(b => !/Chromium|Not/.test(b.brand)) || uaData.brands[0];
        return { name: brand.brand, version: brand.version };
    }

    const rules = [
        { name: 'Microsoft Edge', regex: /Edg\/([\d.]+)/ },
        { name: 'Opera', regex: /OPR\/([\d.]+)/ },
        { name: 'Samsung Internet', regex: /SamsungBrowser\/([\d.]+)/ },
        { name: 'Firefox', regex: /Firefox\/([\d.]+)/ },
        { name: 'Chrome', regex: /Chrome\/([\d.]+)/ },
        { name: 'Safari', regex: /Version\/([\d.]+).*Safari/ },
        { name: 'Internet Explorer', regex: /(?:MSIE |Trident\/.*rv:)([\d.]+)/ },
    ];

    for (const rule of rules) {
        const match = ua.match(rule.regex);
        if (match) return { name: rule.name, version: match[1].split('.')[0] };
    }
    return { name: 'Unknown Browser', version: 'N/A' };
}

function detectDevice() {
    const ua = navigator.userAgent;
    if (/iPad/.test(ua))                    return 'iPad';
    if (/iPhone/.test(ua))                  return 'iPhone';
    if (/Android.*Mobile/.test(ua))         return 'Android Phone';
    if (/Android/.test(ua))                 return 'Android Tablet';
    if (/Windows/.test(ua))                 return 'Windows PC';
    if (/Macintosh/.test(ua))               return 'MacBook / iMac';
    if (/Linux/.test(ua))                   return 'Linux PC';
    return 'Unknown Device';
}

function updateBatteryUI(level, charging) {
    const el = document.getElementById('bat-pct');
    if (el) el.innerHTML =
        `<i class="fas fa-battery-${level > 60 ? 'full' : level > 30 ? 'half' : 'quarter'}"></i> ` +
        `${level}%${charging ? ' ⚡' : ''}`;
}

/* ──────────────────────────────────────────────────────────────
   6. SOAL WARMING UP (5 soal latihan sebelum ujian asli)
   ────────────────────────────────────────────────────────────── */
const SOAL_WARMUP = [
    { soal: 'Berapa hasil dari 5 + 3?', opsi: ['6','7','8','9','10'], jawaban: 'C' },
    { soal: 'Ibu kota Indonesia adalah...', opsi: ['Bandung','Surabaya','Jakarta','Medan','Yogyakarta'], jawaban: 'C' },
    { soal: 'Planet terdekat dengan Matahari adalah...', opsi: ['Venus','Bumi','Mars','Merkurius','Jupiter'], jawaban: 'D' },
    { soal: 'Berapa hari dalam satu minggu?', opsi: ['5','6','7','8','9'], jawaban: 'C' },
    { soal: 'Warna bendera Indonesia adalah...', opsi: ['Merah Putih Biru','Merah Putih','Biru Putih','Kuning Hijau','Hitam Putih'], jawaban: 'B' },
];

const warmupState = {
    current  : 0,
    jawaban  : {},
    done     : false
};

function renderWarmup() {
    const q = SOAL_WARMUP[warmupState.current];
    const LETTERS = ['A','B','C','D','E'];

    document.getElementById('wu-progress').textContent =
        `Soal ${warmupState.current + 1} / ${SOAL_WARMUP.length}`;
    document.getElementById('wu-q-text').innerHTML =
        `<p>${q.soal}</p>`;

    const optsEl = document.getElementById('wu-options');
    optsEl.innerHTML = '';
    q.opsi.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.className = 'wu-option' +
            (warmupState.jawaban[warmupState.current] === LETTERS[i] ? ' selected' : '');
        btn.innerHTML = `<span class="opt-letter">${LETTERS[i]}</span><span>${opt}</span>`;
        btn.onclick   = () => {
            warmupState.jawaban[warmupState.current] = LETTERS[i];
            renderWarmup();
        };
        optsEl.appendChild(btn);
    });

    // Tombol navigasi warmup
    document.getElementById('wu-btn-prev').disabled = warmupState.current === 0;
    const nextBtn = document.getElementById('wu-btn-next');
    if (warmupState.current === SOAL_WARMUP.length - 1) {
        nextBtn.innerHTML = '<i class="fas fa-check"></i> Selesai Latihan';
        nextBtn.onclick   = finishWarmup;
    } else {
        nextBtn.innerHTML = 'Berikutnya <i class="fas fa-chevron-right"></i>';
        nextBtn.onclick   = () => {
            warmupState.current++;
            renderWarmup();
        };
    }
    document.getElementById('wu-btn-prev').onclick = () => {
        if (warmupState.current > 0) { warmupState.current--; renderWarmup(); }
    };
}

function finishWarmup() {
    // Hitung skor warmup
    let benar = 0;
    SOAL_WARMUP.forEach((q, i) => {
        if (warmupState.jawaban[i] === q.jawaban) benar++;
    });

    document.getElementById('screen-warmup').classList.remove('active');
    document.getElementById('wu-result-benar').textContent = benar;
    document.getElementById('screen-warmup-result').classList.add('active');
}

async function proceedToExam() {
    if (!precheckState.passed) {
        alert('Kamera dan lokasi wajib aktif sebelum ujian bisa dimulai.');
        showScreen('screen-precheck');
        return;
    }
    const returnScreen = document.getElementById('screen-warmup')?.classList.contains('active')
        ? 'screen-warmup'
        : 'screen-warmup-result';
    document.getElementById('screen-warmup-result').classList.remove('active');

    const localBank = BANK_SOAL[state.mapel] || { nama: state.mapel, durasi: state.durasi };
    const loading = document.createElement('div');
    loading.id = 'soal-loading';
    loading.className = 'loading-overlay';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin"></i><p>Memuat soal ujian...</p>';
    document.body.appendChild(loading);

    try {
        const params = new URLSearchParams({ nisn: state.nisn, token: state.token });
        const res = await fetch(`${CBT_API}/soal/ujian/${state.mapel}?${params.toString()}`);
        const json = await res.json();

        if (res.ok && json.success && Array.isArray(json.data) && json.data.length) {
            beginExamWithQuestions(localBank, json.data);
        } else {
            throw new Error(json.message || 'Soal ujian belum tersedia.');
        }
    } catch (err) {
        alert(err.message || 'Gagal memuat soal ujian. Hubungi pengawas.');
        showScreen(returnScreen);
    } finally {
        loading.remove();
        if (state.started) examLock.activate();
    }
}

async function requestScreenCapture() {
    const statusEl = document.getElementById('screen-status');
    if (!navigator.mediaDevices?.getDisplayMedia) {
        if (statusEl) statusEl.textContent = 'Browser tidak mendukung rekam layar.';
        sendToAdmin({ type: 'screen_status', status: 'unsupported' });
        return { warning: 'Browser belum mendukung rekam layar.' };
    }
    try {
        if (statusEl) statusEl.textContent = 'Meminta izin rekam layar...';
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { frameRate: { ideal: 1, max: 3 }, width: { ideal: 960 }, height: { ideal: 540 } },
            audio: false
        });
        screenState.stream = stream;
        screenState.video = document.createElement('video');
        screenState.video.muted = true;
        screenState.video.playsInline = true;
        screenState.video.srcObject = stream;
        await screenState.video.play().catch(() => {});
        screenState.canvas = document.createElement('canvas');
        screenState.canvas.width = 240;
        screenState.canvas.height = 135;
        if (statusEl) statusEl.innerHTML = '<i class="fas fa-check-circle" style="color:#10b981"></i> Rekam layar aktif';
        sendToAdmin({ type: 'screen_status', status: 'active' });
        stream.getVideoTracks()[0]?.addEventListener('ended', () => {
            sendToAdmin({ type: 'screen_status', status: 'stopped' });
            examLock._recordViolation('screen_stopped', 'Rekam layar dihentikan.');
        });
        screenState.captureInterval = setInterval(() => {
            if (!state.started || !screenState.video) return;
            const ctx = screenState.canvas.getContext('2d');
            ctx.drawImage(screenState.video, 0, 0, 240, 135);
            sendOptimizedFrame('screen_frame', screenState.canvas);
        }, 45000);
        return { status: 'active' };
    } catch (err) {
        if (statusEl) statusEl.textContent = 'Rekam layar ditolak.';
        sendToAdmin({ type: 'screen_status', status: 'denied' });
        return { warning: 'Rekam layar ditolak. Pengawas akan melihat status ini.' };
    }
}

function skipWarmup() {
    warmupState.done = true;
    proceedToExam();
}

/* ──────────────────────────────────────────────────────────────
   7. ALUR PERSIAPAN (Pre-Exam Flow)
      Login → Pre-Check → Briefing → Warmup → Ujian
   ────────────────────────────────────────────────────────────── */
async function runPreExamCheck(mapel, nisn) {
    showScreen('screen-precheck');
    precheckState.passed = false;
    precheckState.lastMapel = mapel;
    precheckState.lastNisn = nisn;
    precheckState.results = {};

    connectAdminSocket({
        nisn,
        mapel,
        lat  : gpsState.lat,
        lng  : gpsState.lng,
        device: detectDevice(),
        browser: `${detectBrowser().name} ${detectBrowser().version}`
    });

    const nextBtn = document.getElementById('precheck-next-btn');
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.innerHTML = 'Mempersiapkan... <i class="fas fa-spinner fa-spin"></i>';
    }

    const steps = [
        { id: 'step-network', label: 'Tes kecepatan jaringan', fn: runNetworkTest, required: false },
        { id: 'step-location', label: 'Aktifkan lokasi', fn: requestLocation, required: true },
        { id: 'step-camera', label: 'Aktifkan kamera', fn: requestCamera, required: true },
        { id: 'step-screen', label: 'Aktifkan rekam layar', fn: requestScreenCapture, required: false },
        { id: 'step-browser', label: 'Deteksi browser', fn: collectBrowserInfo, required: false },
        { id: 'step-device', label: 'Baca info device', fn: collectDeviceInfo, required: false },
    ];

    let completedSteps = 0;
    updatePrecheckProgress(completedSteps, steps.length, 'Mulai pengecekan');

    for (const step of steps) {
        const stepEl = document.getElementById(step.id);
        updatePrecheckProgress(completedSteps, steps.length, step.label);
        if (stepEl) {
            stepEl.classList.remove('done', 'warning', 'error');
            stepEl.querySelector('.step-icon').className = 'step-icon loading';
            stepEl.querySelector('.step-icon').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }
        try {
            const result = await step.fn();
            precheckState.results[step.id] = result;
            if (stepEl) {
                const hasWarning = result && result.warning;
                stepEl.classList.toggle('warning', !!hasWarning);
                stepEl.classList.toggle('done', !hasWarning);
                stepEl.querySelector('.step-icon').className = hasWarning ? 'step-icon warning' : 'step-icon done';
                stepEl.querySelector('.step-icon').innerHTML = hasWarning ? '<i class="fas fa-exclamation"></i>' : '<i class="fas fa-check"></i>';
                const detailEl = stepEl.querySelector('small') || stepEl.querySelector('.device-tags');
                if (hasWarning && detailEl && !detailEl.textContent) detailEl.textContent = result.warning;
            }
            completedSteps++;
            updatePrecheckProgress(completedSteps, steps.length, step.label);
        } catch(e) {
            if (stepEl) {
                stepEl.classList.add(step.required ? 'error' : 'warning');
                stepEl.querySelector('.step-icon').className = step.required ? 'step-icon error' : 'step-icon warning';
                stepEl.querySelector('.step-icon').innerHTML = step.required ? '<i class="fas fa-times"></i>' : '<i class="fas fa-exclamation"></i>';
                const detailEl = stepEl.querySelector('small') || stepEl.querySelector('.device-tags');
                if (detailEl) detailEl.textContent = getPrecheckErrorMessage(e);
            }
            console.warn(`[CBT] Step ${step.id} gagal:`, e);
            precheckState.results[step.id] = { error: getPrecheckErrorMessage(e) };
            if (step.required) {
                precheckState.passed = false;
                updatePrecheckProgress(completedSteps, steps.length, 'Perlu izin ulang');
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = 'Coba Ulang Pre-check';
                    nextBtn.onclick = () => runPreExamCheck(mapel, nisn);
                }
                return false;
            }
        }
    }

    precheckState.passed = true;
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = 'Lanjut ke Briefing';
        nextBtn.onclick = () => showScreen('screen-briefing');
    }
    updatePrecheckProgress(steps.length, steps.length, 'Siap');
    return true;
}

function updatePrecheckProgress(done, total, label) {
    const text = document.getElementById('precheck-progress-text');
    const bar = document.getElementById('precheck-progress-bar');
    const labelEl = document.getElementById('precheck-progress-label');
    const percent = total ? Math.round((done / total) * 100) : 0;
    if (text) text.textContent = `${done} / ${total} siap`;
    if (bar) bar.style.width = `${percent}%`;
    if (labelEl) labelEl.textContent = label || 'Menunggu';
}

/* ──────────────────────────────────────────────────────────────
   PATCH handleLogin — sisipkan alur baru
   ────────────────────────────────────────────────────────────── */
function getPrecheckErrorMessage(err) {
    if (!err) return 'Syarat belum terpenuhi.';
    if (err.message) return err.message;
    if (typeof err === 'string') return err;
    if (err.name === 'NotAllowedError') return 'Izin ditolak. Aktifkan izin browser lalu coba ulang.';
    if (err.name === 'NotFoundError') return 'Perangkat yang dibutuhkan tidak ditemukan.';
    return 'Syarat belum terpenuhi. Periksa izin dan perangkat.';
}

window.handleLogin = handleLogin;

/* ──────────────────────────────────────────────────────────────
   PATCH startExam — tambah warmup sebelum ujian
   ────────────────────────────────────────────────────────────── */
window.startExam = function() {
    if (!precheckState.passed) {
        alert('Kamera dan lokasi wajib aktif sebelum ujian bisa dimulai.');
        showScreen('screen-precheck');
        return;
    }
    // Tampilkan warmup
    showScreen('screen-warmup');
    warmupState.current = 0;
    warmupState.jawaban = {};
    renderWarmup();
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const nisnInput = document.getElementById('login-nisn');

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            handleLogin();
        });
    }
    if (nisnInput) {
        nisnInput.addEventListener('input', () => {
            nisnInput.value = nisnInput.value.replace(/\D/g, '').slice(0, 10);
        });
    }

    // Tombol precheck lanjut ke briefing
    const nextBtn = document.getElementById('precheck-next-btn');
    if (nextBtn) {
        nextBtn.onclick = () => {
            if (precheckState.passed) showScreen('screen-briefing');
        };
        nextBtn.disabled = true;
    }

    showScreen('screen-login');
});
