/* ================================================================
   PATCH: frontend/cbt.js
   Ganti bagian BANK_SOAL hardcoded + startExam()
   dengan fetch dari API
   ================================================================ */

const CBT_API = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/cbt'
    : '/api/cbt';

// BANK_SOAL lokal sebagai FALLBACK jika server down
// (data asli tetap ada di cbt.js sebagai backup offline)
const BANK_SOAL_FALLBACK = window.BANK_SOAL || {};

/* ── startExam() override — fetch soal dari server ────────────── */
window._origStartExam = async function startExamFromAPI() {
    if (!precheckState.passed) {
        alert('Kamera dan lokasi wajib aktif sebelum ujian bisa dimulai.');
        showScreen('screen-precheck');
        return;
    }

    // Tampilkan warmup dulu
    showScreen('screen-warmup');
    warmupState.current = 0;
    warmupState.jawaban = {};
    renderWarmup();
};

// Override proceedToExam untuk fetch soal dari server
const _origProceedToExam = window.proceedToExam;
window.proceedToExam = async function() {
    if (!precheckState.passed) {
        alert('Kamera dan lokasi wajib aktif.');
        showScreen('screen-precheck');
        return;
    }

    document.getElementById('screen-warmup-result')?.classList.remove('active');

    // Tampilkan loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'soal-loading';
    loadingDiv.style.cssText = 'position:fixed;inset:0;background:rgba(0,34,68,.9);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:16px;';
    loadingDiv.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:2.5rem;color:#D4AF37;"></i><p style="font-size:1rem;font-weight:600;">Memuat soal ujian...</p>';
    document.body.appendChild(loadingDiv);

    try {
        // Fetch soal dari server (teracak otomatis)
        const res = await fetch(`${CBT_API}/soal/ujian/${state.mapel}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}` }
        });
        const data = await res.json();

        if (data.success && data.data?.length) {
            // Gunakan soal dari server
            const bankData = BANK_SOAL_FALLBACK[state.mapel] || {};
            state.soalList  = data.data;
            state.jawaban   = {};
            state.raguList  = new Set();
            state.current   = 0;
            state.durasi    = state.durasi || bankData.durasi || 90;
            state.timerSisa = state.durasi * 60;
            state.started   = true;

            document.getElementById('exam-mapel-label').textContent   = bankData.nama || state.mapel;
            document.getElementById('exam-student-label').textContent = state.siswa;
            document.getElementById('q-total').textContent            = state.soalList.length;

            buildNavGrid();
            renderQuestion();
            startTimer();
            examLock.activate();
            showScreen('screen-exam');

        } else {
            // Fallback ke bank soal lokal jika server tidak ada soal
            console.warn('[CBT] Soal dari server tidak ada, pakai bank soal lokal.');
            const fallback = BANK_SOAL_FALLBACK[state.mapel];
            if (!fallback?.soal?.length) {
                alert('Soal ujian tidak tersedia. Hubungi guru pengawas.');
                showScreen('screen-login');
                return;
            }
            // Jalankan dengan soal fallback
            const shuffled = shuffle([...fallback.soal]);
            state.soalList  = shuffled;
            state.jawaban   = {};
            state.raguList  = new Set();
            state.current   = 0;
            state.timerSisa = (state.durasi || fallback.durasi || 90) * 60;
            state.started   = true;

            document.getElementById('exam-mapel-label').textContent   = fallback.nama;
            document.getElementById('exam-student-label').textContent = state.siswa;
            document.getElementById('q-total').textContent            = shuffled.length;

            buildNavGrid();
            renderQuestion();
            startTimer();
            examLock.activate();
            showScreen('screen-exam');
        }

    } catch (err) {
        console.error('[CBT fetch soal]', err);
        // Network error — pakai fallback
        const fallback = BANK_SOAL_FALLBACK[state.mapel];
        if (fallback?.soal?.length) {
            console.warn('[CBT] Network error, pakai bank soal lokal sebagai fallback.');
            const shuffled = shuffle([...fallback.soal]);
            state.soalList  = shuffled;
            state.jawaban   = {};
            state.raguList  = new Set();
            state.current   = 0;
            state.timerSisa = (state.durasi || fallback.durasi || 90) * 60;
            state.started   = true;

            document.getElementById('exam-mapel-label').textContent   = fallback.nama;
            document.getElementById('exam-student-label').textContent = state.siswa;
            document.getElementById('q-total').textContent            = shuffled.length;

            buildNavGrid(); renderQuestion(); startTimer();
            examLock.activate();
            showScreen('screen-exam');
        } else {
            alert('Gagal memuat soal. Periksa koneksi dan coba lagi.');
            showScreen('screen-login');
        }
    } finally {
        document.getElementById('soal-loading')?.remove();
    }
};
