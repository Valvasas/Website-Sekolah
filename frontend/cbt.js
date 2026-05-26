/* =====================================================
   CBT ONLINE — SMKN 1 TERISI
   File: cbt.js
   ===================================================== */

'use strict';

/* ============================================================
   DATA SOAL PER MATA PELAJARAN
   Format: { soal, opsi:[...], jawaban:'A'/'B'/... }
   ============================================================ */
const BANK_SOAL = {
    matematika: {
        nama: 'Matematika',
        jenis: 'Penilaian Akhir Semester (PAS)',
        durasi: 90,
        soal: [
            { soal:'Nilai dari 2³ × 4² adalah...', opsi:['32','64','128','256','512'], jawaban:'C' },
            { soal:'Akar pangkat dua dari 225 adalah...', opsi:['13','14','15','16','17'], jawaban:'C' },
            { soal:'Jika f(x) = 3x + 5, maka f(4) = ...', opsi:['17','19','20','21','22'], jawaban:'A' },
            { soal:'Hasil dari 5! (5 faktorial) adalah...', opsi:['60','100','120','150','200'], jawaban:'C' },
            { soal:'Sebuah persegi panjang memiliki panjang 12 cm dan lebar 8 cm. Luasnya adalah...', opsi:['80 cm²','88 cm²','96 cm²','100 cm²','104 cm²'], jawaban:'C' },
            { soal:'Nilai sin 30° adalah...', opsi:['½','½√2','½√3','1','√3'], jawaban:'A' },
            { soal:'Gradien garis 4x - 2y + 8 = 0 adalah...', opsi:['2','-2','4','-4','1'], jawaban:'A' },
            { soal:'Jika p = 3 dan q = -2, maka 2p² - 3q = ...', opsi:['12','18','24','10','20'], jawaban:'C' },
            { soal:'Jumlah deret aritmetika 2 + 5 + 8 + ... + 29 adalah...', opsi:['155','160','165','170','175'], jawaban:'A' },
            { soal:'FPB dari 36 dan 48 adalah...', opsi:['6','8','12','16','24'], jawaban:'C' },
        ]
    },
    bindo: {
        nama: 'Bahasa Indonesia',
        jenis: 'Penilaian Akhir Semester (PAS)',
        durasi: 90,
        soal: [
            { soal:'Kalimat yang menggunakan kata baku yang benar adalah...', opsi:['Saya pergi ke apotek membeli obat','Saya pergi ke apotik membeli obat','Saya pergi ke aptek membeli obat','Saya pergi ke apotheek membeli obat','Saya pergi ke apoteks membeli obat'], jawaban:'A' },
            { soal:'Antonim dari kata "boros" adalah...', opsi:['Hemat','Miskin','Kikir','Sederhana','Murah'], jawaban:'A' },
            { soal:'Penulisan huruf kapital yang benar terdapat pada kalimat...', opsi:['Dia tinggal di jalan Merdeka','Dia tinggal di Jalan Merdeka','Dia tinggal di Jalan merdeka','Dia tinggal di jalan merdeka','Dia Tinggal di jalan Merdeka'], jawaban:'B' },
            { soal:'Jenis paragraf yang kalimat utamanya berada di akhir paragraf disebut...', opsi:['Deduktif','Induktif','Campuran','Naratif','Deskriptif'], jawaban:'B' },
            { soal:'Majas yang melebih-lebihkan sesuatu disebut...', opsi:['Simile','Metafora','Hiperbola','Personifikasi','Ironi'], jawaban:'C' },
            { soal:'Kata "menggubah" dalam kalimat "Ia menggubah sebuah lagu" bermakna...', opsi:['Menyanyikan','Menciptakan','Merekam','Memainkan','Memperbaiki'], jawaban:'B' },
            { soal:'Tanda baca yang digunakan untuk mengakhiri kalimat tanya adalah...', opsi:['Titik (.)','Koma (,)','Tanda tanya (?)','Tanda seru (!)','Titik dua (:)'], jawaban:'C' },
            { soal:'Sinonim dari kata "genuine" adalah...', opsi:['Asli','Palsu','Baru','Lama','Kuno'], jawaban:'A' },
            { soal:'"Suaranya menggelegar memecah langit." Kalimat tersebut mengandung majas...', opsi:['Metafora','Personifikasi','Hiperbola','Simile','Alegori'], jawaban:'C' },
            { soal:'Penulisan angka yang benar dalam kalimat adalah...', opsi:['Saya membeli 5 buah buku','Saya membeli lima buah buku','Saya membeli Lima buah buku','Saya membeli 5 Buah buku','Saya membeli limah buah buku'], jawaban:'B' },
        ]
    },
    basing: {
        nama: 'Bahasa Inggris',
        jenis: 'Penilaian Akhir Semester (PAS)',
        durasi: 90,
        soal: [
            { soal:'The correct past tense of "go" is...', opsi:['Goed','Went','Gone','Goes','Going'], jawaban:'B' },
            { soal:'"She ___ to school every day." The correct verb is...', opsi:['go','goes','going','went','gone'], jawaban:'B' },
            { soal:'The synonym of "big" is...', opsi:['Small','Tiny','Large','Narrow','Short'], jawaban:'C' },
            { soal:'Which sentence is correct?', opsi:['I am going to school yesterday','She was cooked dinner last night','They played football this morning','He go to market every day','We was happy yesterday'], jawaban:'C' },
            { soal:'The antonym of "beautiful" is...', opsi:['Handsome','Ugly','Pretty','Cute','Lovely'], jawaban:'B' },
            { soal:'"___ you like coffee?" The correct question word is...', opsi:['Are','Is','Do','Does','Did'], jawaban:'C' },
            { soal:'The plural form of "child" is...', opsi:['Childs','Childes','Children','Childrens','Childen'], jawaban:'C' },
            { soal:'"I have been studying for 2 hours." This sentence uses...', opsi:['Simple Present','Simple Past','Present Perfect','Present Continuous','Past Perfect Continuous'], jawaban:'C' },
            { soal:'The correct spelling is...', opsi:['Recieve','Receive','Recive','Receieve','Receeive'], jawaban:'B' },
            { soal:'What does "ambitious" mean?', opsi:['Lazy','Humble','Having strong desire to succeed','Careless','Generous'], jawaban:'C' },
        ]
    },
    pkk: {
        nama: 'Produk Kreatif & Kewirausahaan',
        jenis: 'Penilaian Akhir Semester (PAS)',
        durasi: 90,
        soal: [
            { soal:'Ciri utama seorang wirausaha yang sukses adalah...', opsi:['Takut gagal','Berani mengambil risiko yang terukur','Menunggu peluang datang','Bergantung pada bantuan pemerintah','Mudah menyerah'], jawaban:'B' },
            { soal:'Apa yang dimaksud dengan analisis SWOT?', opsi:['Strategi pemasaran produk','Analisis Strength, Weakness, Opportunity, Threat','Teknik pengelolaan keuangan','Metode produksi barang','Sistem distribusi produk'], jawaban:'B' },
            { soal:'Dokumen yang berisi rencana bisnis secara menyeluruh disebut...', opsi:['Invoice','Business Plan','Nota Penjualan','Kuitansi','SIUP'], jawaban:'B' },
            { soal:'Apa kepanjangan dari UMKM?', opsi:['Usaha Maju Kreatif Mandiri','Usaha Mikro Kecil Menengah','Unit Modal Kerja Mandiri','Usaha Modern Kreatif Mandiri','Unit Mikro Karya Mandiri'], jawaban:'B' },
            { soal:'Modal awal yang digunakan untuk memulai usaha disebut...', opsi:['Modal kerja','Modal tetap','Modal investasi','Modal awal','Modal ventura'], jawaban:'D' },
            { soal:'Strategi penetapan harga di bawah harga pasar untuk menarik konsumen disebut...', opsi:['Skimming pricing','Penetration pricing','Premium pricing','Cost plus pricing','Value pricing'], jawaban:'B' },
            { soal:'Hak eksklusif yang diberikan negara atas hasil karya/invensi seseorang disebut...', opsi:['Hak Cipta','Paten','Merek Dagang','Desain Industri','Lisensi'], jawaban:'B' },
            { soal:'Proses mengubah bahan baku menjadi produk jadi disebut...', opsi:['Distribusi','Produksi','Konsumsi','Pemasaran','Investasi'], jawaban:'B' },
            { soal:'E-commerce adalah...', opsi:['Perdagangan elektronik berbasis internet','Toko elektronik fisik','Pasar tradisional modern','Sistem pembayaran tunai','Gudang penyimpanan barang'], jawaban:'A' },
            { soal:'Break Even Point (BEP) adalah kondisi di mana...', opsi:['Usaha mendapat keuntungan besar','Total pendapatan sama dengan total biaya','Usaha mengalami kerugian','Modal sudah kembali berlipat','Produksi mencapai maksimum'], jawaban:'B' },
        ]
    },
    sejarah: {
        nama: 'Sejarah Indonesia',
        jenis: 'Penilaian Akhir Semester (PAS)',
        durasi: 60,
        soal: [
            { soal:'Proklamasi Kemerdekaan Indonesia dibacakan pada tanggal...', opsi:['17 Agustus 1944','17 Agustus 1945','17 Agustus 1946','17 Agustus 1947','17 Agustus 1950'], jawaban:'B' },
            { soal:'Kerajaan Majapahit mencapai puncak kejayaannya pada masa pemerintahan...', opsi:['Raden Wijaya','Hayam Wuruk','Brawijaya V','Ken Arok','Sindok'], jawaban:'B' },
            { soal:'Budi Utomo didirikan pada tanggal...', opsi:['20 Mei 1906','20 Mei 1908','20 Mei 1910','20 Mei 1912','20 Mei 1915'], jawaban:'B' },
            { soal:'Peristiwa Rengasdengklok terjadi pada...', opsi:['15 Agustus 1945','16 Agustus 1945','17 Agustus 1945','18 Agustus 1945','19 Agustus 1945'], jawaban:'B' },
            { soal:'Sumpah Pemuda diikrarkan pada tanggal...', opsi:['28 Oktober 1926','28 Oktober 1927','28 Oktober 1928','28 Oktober 1929','28 Oktober 1930'], jawaban:'C' },
            { soal:'PPKI singkatan dari...', opsi:['Panitia Penyidik Kemerdekaan Indonesia','Panitia Persiapan Kemerdekaan Indonesia','Persatuan Pejuang Kemerdekaan Indonesia','Panitia Penyusun Konstitusi Indonesia','Persatuan Pemuda Kemerdekaan Indonesia'], jawaban:'B' },
            { soal:'Siapa yang membacakan teks Proklamasi Kemerdekaan RI?', opsi:['Soekarno saja','Hatta saja','Soekarno dan Hatta','BPUPKI','PPKI'], jawaban:'C' },
            { soal:'Konferensi Asia-Afrika dilaksanakan di...', opsi:['Jakarta','Surabaya','Bandung','Yogyakarta','Medan'], jawaban:'C' },
            { soal:'Penjajahan Belanda di Indonesia berlangsung selama kurang lebih...', opsi:['150 tahun','200 tahun','250 tahun','300 tahun','350 tahun'], jawaban:'D' },
            { soal:'Organisasi pergerakan nasional pertama di Indonesia adalah...', opsi:['Sarekat Islam','Indische Partij','Budi Utomo','PNI','PKI'], jawaban:'C' },
        ]
    },
    produktif: {
        nama: 'Kompetensi Keahlian',
        jenis: 'Ujian Kompetensi Keahlian (UKK)',
        durasi: 120,
        soal: [
            { soal:'OSI Layer yang bertanggung jawab untuk pengiriman data end-to-end adalah...', opsi:['Physical Layer','Data Link Layer','Network Layer','Transport Layer','Application Layer'], jawaban:'D' },
            { soal:'IP Address 192.168.1.1 termasuk dalam kelas...', opsi:['Kelas A','Kelas B','Kelas C','Kelas D','Kelas E'], jawaban:'C' },
            { soal:'Protokol yang digunakan untuk mengirim email adalah...', opsi:['HTTP','FTP','SMTP','SSH','DNS'], jawaban:'C' },
            { soal:'Subnet mask /24 setara dengan...', opsi:['255.0.0.0','255.255.0.0','255.255.255.0','255.255.255.128','255.255.255.192'], jawaban:'C' },
            { soal:'Port default yang digunakan protokol HTTPS adalah...', opsi:['21','22','80','443','8080'], jawaban:'D' },
            { soal:'Topologi jaringan yang semua perangkat terhubung ke satu pusat disebut...', opsi:['Bus','Ring','Star','Mesh','Tree'], jawaban:'C' },
            { soal:'Perintah untuk melihat konfigurasi IP di Linux adalah...', opsi:['ipconfig','ifconfig','netstat','tracert','nslookup'], jawaban:'B' },
            { soal:'DNS berfungsi untuk...', opsi:['Mengamankan jaringan','Mentranslasi nama domain ke IP Address','Mengatur bandwidth','Membagi IP Address','Menghubungkan dua jaringan'], jawaban:'B' },
            { soal:'Jenis kabel fiber optik yang menggunakan satu jalur cahaya disebut...', opsi:['Multi Mode','Single Mode','UTP','STP','Coaxial'], jawaban:'B' },
            { soal:'VPN singkatan dari...', opsi:['Very Private Network','Virtual Private Network','Virtual Public Network','Verified Private Network','Virtual Protocol Network'], jawaban:'B' },
        ]
    }
};

// URL base API — sesuaikan jika backend di server berbeda
const CBT_API = window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/cbt'
    : '/api/cbt';
const CBT_TOKEN_KEY = 'accessToken';

/* ============================================================
   STATE APLIKASI
   ============================================================ */
const state = {
    mapel:       null,
    siswa:       '',
    nisn:        '',   // FIX: simpan NISN untuk WS handshake
    token:       '',   // FIX: simpan CBT token untuk WS handshake
    soalList:    [],
    jawaban:     {},     // { nomor: 'A'/'B'/... }
    raguList:    new Set(),
    current:     0,
    durasi:      90,     // menit
    timerSisa:   0,      // detik
    timerInterval: null,
    started:     false,
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
        } else {
            inp.type = 'password';
            icon.className = 'fas fa-eye';
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

        const bankData = BANK_SOAL[state.mapel];
        if (!bankData) {
            showErr('Data soal untuk mata pelajaran ini tidak tersedia.');
            return;
        }

        document.getElementById('brief-mapel-name').textContent = bankData.nama;
        document.getElementById('brief-type').textContent       = bankData.jenis;
        document.getElementById('brief-jumlah').textContent     = bankData.soal.length;
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

function showError(el, msgEl, msg) {
    msgEl.textContent = msg;
    el.classList.remove('hidden');
    el.style.animation = 'none';
    requestAnimationFrame(() => { el.style.animation = ''; });
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

    document.getElementById('exam-mapel-label').textContent   = data.nama;
    document.getElementById('exam-student-label').textContent = state.siswa;
    document.getElementById('q-total').textContent            = state.soalList.length;

    buildNavGrid();
    renderQuestion();
    startTimer();
    showScreen('screen-exam');
}

function startExam() {
    const data = BANK_SOAL[state.mapel];
    if (!data) return;
    beginExamWithQuestions(data, shuffle([...data.soal]));
}

window._origStartExam = startExam;

// Fisher-Yates shuffle
function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
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

    // Teks soal
    document.getElementById('q-text').innerHTML =
        `<p>${soal.soal}</p>`;

    // Opsi
    const container = document.getElementById('q-options');
    container.innerHTML = '';
    soal.opsi.forEach((opt, i) => {
        const letter  = LETTERS[i];
        const isChosen= state.jawaban[idx] === letter;
        const btn     = document.createElement('button');
        btn.className = 'option-btn' + (isChosen ? ' selected' : '');
        btn.innerHTML = `<span class="option-letter">${letter}</span><span>${opt}</span>`;
        btn.addEventListener('click', () => selectAnswer(letter));
        container.appendChild(btn);
    });

    // Ragu-ragu
    document.getElementById('ragu-check').checked = state.raguList.has(idx);

    // Nav buttons
    document.getElementById('btn-prev').disabled = idx === 0;
    document.getElementById('btn-next').disabled = idx === state.soalList.length - 1;

    updateNavGrid();
}

function selectAnswer(letter) {
    state.jawaban[state.current] = letter;
    renderQuestion();
    updateFabBadge();
}

function toggleRagu() {
    const idx = state.current;
    if (state.raguList.has(idx)) state.raguList.delete(idx);
    else state.raguList.add(idx);
    updateNavGrid();
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
        btn.className = 'nav-num';
        btn.textContent = i + 1;
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
    });
}

function updateFabBadge() {
    const count = Object.keys(state.jawaban).length;
    const el    = document.getElementById('fab-badge');
    if (el) el.textContent = count;
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
    const summary  = document.getElementById('modal-summary');

    if (belum > 0) {
        summary.innerHTML = `Masih ada <strong>${belum} soal</strong> yang belum dijawab. Yakin ingin mengumpulkan?`;
    } else {
        summary.innerHTML = 'Semua soal sudah dijawab. Kumpulkan sekarang?';
    }
    openModal('modal-finish');
}

function finishExam() {
    clearInterval(state.timerInterval);
    closeModal('modal-finish');
    closeModal('modal-timeout');
    calculateResult();
    state.started = false;
    examLock.deactivate();
    showScreen('screen-result');
}

/* ============================================================
   HITUNG NILAI
   ============================================================ */
function calculateResult() {
    const total   = state.soalList.length;
    let benar     = 0;
    let salah     = 0;
    let kosong    = 0;

    state.soalList.forEach((soal, i) => {
        const jwb = state.jawaban[i];
        if (!jwb) { kosong++; }
        else if (jwb === soal.jawaban) { benar++; }
        else { salah++; }
    });

    const nilai = Math.round((benar / total) * 100);
    const lulus = nilai >= 70;

    // Update UI
    const iconEl = document.getElementById('result-icon');
    iconEl.className = 'result-icon ' + (lulus ? 'pass' : 'fail');
    iconEl.innerHTML = lulus ? '<i class="fas fa-trophy"></i>' : '<i class="fas fa-times-circle"></i>';

    document.getElementById('result-title').textContent = lulus ? 'Selamat, Lulus!' : 'Belum Tuntas';
    document.getElementById('result-sub').textContent   = lulus
        ? `Nilaimu ${nilai} — Di atas KKM. Kerja bagus!`
        : `Nilaimu ${nilai} — Di bawah KKM (70). Tetap semangat!`;

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
                mapel: studentData.mapel,
                lat:   studentData.lat,
                lng:   studentData.lng,
                device:  studentData.device,
                browser: studentData.browser
            });
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
                        examLock._warn(`📢 ${msg.message}`);
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
    if (adminSocket && adminSocket.readyState === WebSocket.OPEN) {
        adminSocket.send(JSON.stringify(payload));
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
    minScreenW: 800,
    minScreenH: 480,
    minCores: 2,
    networkTestBytes: 8 * 1024 * 1024,
    networkWarmupMs: 1200,
    networkMaxMs: 12000
};

/* ──────────────────────────────────────────────────────────────
   1. EXAM BROWSER LOCK  (Full Kunci Layar / Anti-Cheat Ketat)
   ────────────────────────────────────────────────────────────── */
const examLock = {
    violations: 0,
    maxViolations: 3,
    active: false,
    listenersBound: false,
    fullscreenRetryTimer: null,
    focusRetryTimer: null,
    muteTimer: null,
    violationCooldowns: {},
    audioCtx: null,
    originalAudioContext: window.AudioContext || window.webkitAudioContext,

    activate() {
        if (this.active) {
            this._enforceFullscreen(true);
            this._activateExamMute();
            return;
        }
        this.active = true;

        // Fullscreen wajib
        if (this.listenersBound) {
            this._enforceFullscreen(true);
        } else {
            this._requestFullscreen();
        }
        this._activateExamMute();
        if (this.listenersBound) return;
        this.listenersBound = true;

        // Blokir klik kanan
        document.addEventListener('contextmenu', e => {
            if (state.started) { e.preventDefault(); this._warn('Klik kanan dinonaktifkan.'); }
        });

        // Blokir shortcut berbahaya
        document.addEventListener('keydown', e => {
            if (!state.started) return;
            const blocked = [
                e.key === 'F12',
                e.ctrlKey && ['c','v','u','s','a','p','w','r','t','n','Tab'].includes(e.key.toLowerCase()),
                e.altKey  && ['Tab','F4'].includes(e.key),
                e.metaKey,
                e.key === 'Escape' && document.fullscreenElement,
                ['F1','F2','F3','F4','F5','F6','F7','F8','F9','F10','F11'].includes(e.key),
            ];
            if (blocked.some(Boolean)) {
                e.preventDefault();
                e.stopPropagation();
                this._warn('Shortcut keyboard diblokir selama ujian.');
            }
        }, true);

        // Blokir copy/paste/select
        ['copy','cut','paste','selectstart'].forEach(ev =>
            document.addEventListener(ev, e => { if (state.started) e.preventDefault(); })
        );

        // Deteksi tab tidak aktif / minimize
        document.addEventListener('visibilitychange', () => {
            if (!state.started) return;
            if (document.hidden) {
                this._recordViolation('tab_switch', 'Tab berpindah terdeteksi!');
            } else {
                this._enforceFullscreen(false);
                this._recoverFocus();
            }
        });

        // Blokir navigasi browser (back/forward)
        history.pushState(null, '', location.href);
        window.addEventListener('popstate', () => {
            history.pushState(null, '', location.href);
            if (state.started) this._warn('Tombol Back/Forward diblokir.');
        });

        // Deteksi DevTools (resize trick)
        setInterval(() => {
            if (!state.started) return;
            const diff = window.outerWidth - window.innerWidth;
            if (diff > 200) {
                this._warn('DevTools terdeteksi! Segera tutup.');
                sendToAdmin({ type: 'violation', reason: 'devtools_open' });
            }
        }, 2000);

        // Deteksi window blur (beralih aplikasi)
        window.addEventListener('blur', () => {
            if (!state.started) return;
            this._recordViolation('window_blur', 'Aplikasi tidak fokus!');
            this._recoverFocus();
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
        clearInterval(this.fullscreenRetryTimer);
        clearInterval(this.focusRetryTimer);
        clearInterval(this.muteTimer);
        this.violationCooldowns = {};
    },

    _requestFullscreen() {
        this._enforceFullscreen(true);

        // Jika keluar fullscreen, paksa masuk lagi
        document.addEventListener('fullscreenchange', () => {
            if (!state.started) return;
            if (!document.fullscreenElement) {
                this._recordViolation('fullscreen', 'Mode layar penuh wajib aktif!');
                this._startFullscreenRecovery();
            }
        });
        document.addEventListener('webkitfullscreenchange', () => {
            if (!state.started) return;
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                this._recordViolation('fullscreen', 'Mode layar penuh wajib aktif!');
                this._startFullscreenRecovery();
            }
        });

        ['click','pointerdown','keydown'].forEach(ev => {
            document.addEventListener(ev, () => {
                if (state.started && !document.fullscreenElement) this._enforceFullscreen(false);
            }, true);
        });
    },

    _enforceFullscreen(isInitial = false) {
        const el = document.documentElement;
        const rfs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
        if (!rfs || document.fullscreenElement || document.webkitFullscreenElement) return;

        rfs.call(el).catch(() => {
            if (isInitial) this._warn('Klik halaman ujian untuk mengaktifkan layar penuh.');
        });
    },

    _startFullscreenRecovery() {
        clearInterval(this.fullscreenRetryTimer);
        let attempts = 0;
        this.fullscreenRetryTimer = setInterval(() => {
            if (!state.started || document.fullscreenElement || attempts >= 12) {
                clearInterval(this.fullscreenRetryTimer);
                return;
            }
            attempts++;
            this._enforceFullscreen(false);
        }, 500);
    },

    _recoverFocus() {
        clearInterval(this.focusRetryTimer);
        let attempts = 0;
        this.focusRetryTimer = setInterval(() => {
            if (!state.started || attempts >= 8) {
                clearInterval(this.focusRetryTimer);
                return;
            }
            attempts++;
            window.focus();
            this._enforceFullscreen(false);
        }, 400);
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
        if (this.violations >= this.maxViolations) this._forceFinish();
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

    _forceFinish() {
        alert('Batas pelanggaran tercapai. Ujian dikumpulkan otomatis.');
        finishExam();
    }
};

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

        if (statusEl) statusEl.innerHTML =
            `<i class="fas fa-check-circle" style="color:#10b981"></i> Kamera aktif`;

        // Buat canvas untuk capture frame
        cameraState.canvas = document.createElement('canvas');
        cameraState.canvas.width  = 160;
        cameraState.canvas.height = 120;

        // Kirim snapshot ke admin setiap 10 detik
        cameraState.captureInterval = setInterval(() => {
            if (!state.started) return;
            const ctx = cameraState.canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 160, 120);
            const imageData = cameraState.canvas.toDataURL('image/jpeg', 0.5);
            sendToAdmin({ type: 'camera_frame', frame: imageData });
        }, 10000);

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
        geolocation: !!navigator.geolocation
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
    if (info.screenW < PRECHECK_RULES.minScreenW || info.screenH < PRECHECK_RULES.minScreenH) {
        issues.push(`Resolusi di bawah rekomendasi ${PRECHECK_RULES.minScreenW}x${PRECHECK_RULES.minScreenH}.`);
    }
    if (Number.isFinite(cores) && cores < PRECHECK_RULES.minCores) {
        issues.push(`CPU di bawah rekomendasi ${PRECHECK_RULES.minCores} core.`);
    }
    if (!info.fullscreen) issues.push('Browser tidak mendukung fullscreen lock.');
    if (!info.camera) issues.push('Browser tidak mendukung akses kamera.');
    if (!info.geolocation) issues.push('Browser tidak mendukung akses lokasi.');

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
    document.getElementById('screen-warmup-result').classList.remove('active');

    const localBank = BANK_SOAL[state.mapel];
    const loading = document.createElement('div');
    loading.id = 'soal-loading';
    loading.style.cssText = 'position:fixed;inset:0;background:rgba(0,34,68,.92);z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:white;gap:16px;';
    loading.innerHTML = '<i class="fas fa-spinner fa-spin" style="font-size:2.5rem;color:#D4AF37;"></i><p style="font-size:1rem;font-weight:700;">Memuat soal ujian...</p>';
    document.body.appendChild(loading);

    try {
        const token = localStorage.getItem(CBT_TOKEN_KEY) || localStorage.getItem('smkn_token') || '';
        const res = await fetch(`${CBT_API}/soal/ujian/${state.mapel}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const json = await res.json();

        if (res.ok && json.success && Array.isArray(json.data) && json.data.length) {
            beginExamWithQuestions(localBank || { nama: state.mapel, durasi: state.durasi }, json.data);
        } else {
            console.warn('[CBT] Soal API belum tersedia, memakai fallback lokal.');
            window._origStartExam();
        }
    } catch (err) {
        console.warn('[CBT] Gagal memuat soal API, memakai fallback lokal:', err.message);
        window._origStartExam();
    } finally {
        loading.remove();
        examLock.activate();
    }
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

    const nextBtn = document.getElementById('precheck-next-btn');
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.innerHTML = 'Mempersiapkan... <i class="fas fa-spinner fa-spin"></i>';
    }

    const steps = [
        { id: 'step-network', label: 'Tes kecepatan jaringan', fn: runNetworkTest, required: false },
        { id: 'step-location', label: 'Aktifkan lokasi', fn: requestLocation, required: true },
        { id: 'step-camera', label: 'Aktifkan kamera', fn: requestCamera, required: true },
        { id: 'step-browser', label: 'Deteksi browser', fn: collectBrowserInfo, required: false },
        { id: 'step-device', label: 'Baca info device', fn: collectDeviceInfo, required: false },
    ];

    for (const step of steps) {
        const stepEl = document.getElementById(step.id);
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
                if (nextBtn) {
                    nextBtn.disabled = false;
                    nextBtn.textContent = 'Coba Ulang Pre-check';
                    nextBtn.onclick = () => runPreExamCheck(mapel, nisn);
                }
                return false;
            }
        }
    }

    // Hubungkan ke WebSocket admin
    connectAdminSocket({
        nisn,
        mapel,
        lat  : gpsState.lat,
        lng  : gpsState.lng,
        device: detectDevice(),
        browser: `${detectBrowser().name} ${detectBrowser().version}`
    });

    precheckState.passed = true;
    if (nextBtn) {
        nextBtn.disabled = false;
        nextBtn.textContent = 'Lanjut ke Briefing ->';
        nextBtn.onclick = () => showScreen('screen-briefing');
    }
    return true;

    document.getElementById('precheck-next-btn').textContent = 'Lanjut ke Briefing →';
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
