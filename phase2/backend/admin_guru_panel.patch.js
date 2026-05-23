// admin_guru_panel.patch.js
// Tambahkan ke backend/admin-panel/dashboard.html
// 1. Tambahkan nav item di sidebar
// 2. Tambahkan page content
// 3. Tambahkan JavaScript functions

// ── STEP 1: Tambahkan di sidebar nav (setelah tombol "Audit Log") ──
/*
<button class="nav-item" onclick="switchPage('nilai', this)">
    <i class="fas fa-star"></i> Input Nilai
</button>
<button class="nav-item" onclick="switchPage('kehadiran', this)">
    <i class="fas fa-calendar-check"></i> Input Kehadiran
</button>
<button class="nav-item" onclick="switchPage('soal', this)">
    <i class="fas fa-question-circle"></i> Bank Soal CBT
</button>
<button class="nav-item" onclick="switchPage('cbt_token', this)">
    <i class="fas fa-key"></i> Token Ujian CBT
</button>
*/

// ── STEP 2: Tambahkan page content (setelah page-auditlog div) ──

const GURU_PAGES_HTML = `
<!-- ══ PAGE: INPUT NILAI ══ -->
<div class="content page" id="page-nilai">
    <div class="card">
        <div class="card-header">
            <div class="card-title"><i class="fas fa-star"></i> Input Nilai Siswa</div>
        </div>
        <div class="card-body">
            <div class="toolbar" style="margin-bottom:16px;">
                <select class="filter-select" id="nilaiKelasFilter" onchange="loadNilaiSiswa()">
                    <option value="">-- Pilih Kelas --</option>
                    <option value="X TKJ 1">X TKJ 1</option>
                    <option value="X TKJ 2">X TKJ 2</option>
                    <option value="XI TKJ 1">XI TKJ 1</option>
                    <option value="XI TKJ 2">XI TKJ 2</option>
                    <option value="XII TKJ 1">XII TKJ 1</option>
                </select>
                <select class="filter-select" id="nilaiMapelFilter" onchange="loadNilaiSiswa()">
                    <option value="">-- Pilih Mapel --</option>
                    <option value="Teknik Komputer Jaringan">Teknik Komputer Jaringan</option>
                    <option value="Matematika">Matematika</option>
                    <option value="Bahasa Indonesia">Bahasa Indonesia</option>
                    <option value="Bahasa Inggris">Bahasa Inggris</option>
                    <option value="Produk Kreatif & KWU">Produk Kreatif & KWU</option>
                </select>
                <select class="filter-select" id="nilaiSemesterFilter" onchange="loadNilaiSiswa()">
                    <option value="genap">Semester Genap</option>
                    <option value="ganjil">Semester Ganjil</option>
                </select>
                <button class="btn-export" onclick="exportNilaiCSV()">
                    <i class="fas fa-download"></i> Export CSV
                </button>
            </div>
            <div id="nilaiTableWrap" style="overflow-x:auto;">
                <p style="color:var(--muted);text-align:center;padding:40px;">
                    Pilih kelas dan mata pelajaran untuk menampilkan data siswa.
                </p>
            </div>
        </div>
    </div>
</div>

<!-- ══ PAGE: INPUT KEHADIRAN ══ -->
<div class="content page" id="page-kehadiran">
    <div class="card">
        <div class="card-header">
            <div class="card-title"><i class="fas fa-calendar-check"></i> Input Kehadiran Siswa</div>
        </div>
        <div class="card-body">
            <div class="toolbar" style="margin-bottom:16px;">
                <select class="filter-select" id="khKelasFilter">
                    <option value="">-- Pilih Kelas --</option>
                    <option value="X TKJ 1">X TKJ 1</option>
                    <option value="XI TKJ 1">XI TKJ 1</option>
                    <option value="XII TKJ 1">XII TKJ 1</option>
                </select>
                <input type="date" class="search-input" id="khTanggal"
                    value="${new Date().toISOString().split('T')[0]}"
                    style="max-width:180px;flex:none;">
                <button class="btn-primary" onclick="loadKehadiranSiswa()">
                    <i class="fas fa-search"></i> Tampilkan
                </button>
                <button class="btn-primary" style="background:var(--green);" onclick="saveAllKehadiran()">
                    <i class="fas fa-save"></i> Simpan Semua
                </button>
            </div>
            <div id="kehadiranTableWrap">
                <p style="color:var(--muted);text-align:center;padding:40px;">
                    Pilih kelas dan tanggal untuk menampilkan daftar siswa.
                </p>
            </div>
        </div>
    </div>
</div>

<!-- ══ PAGE: BANK SOAL CBT ══ -->
<div class="content page" id="page-soal">
    <div class="card">
        <div class="card-header">
            <div class="card-title"><i class="fas fa-question-circle"></i> Bank Soal CBT</div>
            <button class="btn-primary" onclick="openSoalModal()">
                <i class="fas fa-plus"></i> Tambah Soal
            </button>
        </div>
        <div class="card-body">
            <div class="toolbar" style="margin-bottom:16px;">
                <select class="filter-select" id="soalMapelFilter" onchange="loadBankSoal()">
                    <option value="">Semua Mapel</option>
                    <option value="matematika">Matematika</option>
                    <option value="bindo">Bahasa Indonesia</option>
                    <option value="basing">Bahasa Inggris</option>
                    <option value="pkk">PKK</option>
                    <option value="sejarah">Sejarah Indonesia</option>
                    <option value="produktif">Kompetensi Keahlian</option>
                </select>
                <input class="search-input" placeholder="Cari soal..." id="soalSearch"
                    oninput="debounce(loadBankSoal,400)()" style="flex:1;">
            </div>
            <div class="table-wrap">
                <table class="data-table" id="soalTable">
                    <thead>
                        <tr>
                            <th>#</th><th>Soal</th><th>Mapel</th>
                            <th>Jawaban</th><th>Tingkat</th><th>Aksi</th>
                        </tr>
                    </thead>
                    <tbody id="soalTbody">
                        <tr><td colspan="6" class="empty-cell">
                            <i class="fas fa-spinner fa-spin"></i> Memuat...
                        </td></tr>
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="soalPagination"></div>
        </div>
    </div>
</div>

<!-- ══ PAGE: TOKEN CBT ══ -->
<div class="content page" id="page-cbt_token">
    <div class="card">
        <div class="card-header">
            <div class="card-title"><i class="fas fa-key"></i> Generate Token Ujian CBT</div>
        </div>
        <div class="card-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px;">
                <div class="form-group">
                    <label>Mata Pelajaran</label>
                    <select id="tokenMapel" class="form-group input" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;">
                        <option value="matematika">Matematika</option>
                        <option value="bindo">Bahasa Indonesia</option>
                        <option value="basing">Bahasa Inggris</option>
                        <option value="pkk">Produk Kreatif & KWU</option>
                        <option value="sejarah">Sejarah Indonesia</option>
                        <option value="produktif">Kompetensi Keahlian</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Durasi (menit)</label>
                    <input type="number" id="tokenDurasi" value="90" min="30" max="180"
                        style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;">
                </div>
            </div>
            <div class="form-group" style="margin-bottom:16px;">
                <label>NISN Siswa (pisahkan dengan koma atau enter untuk bulk)</label>
                <textarea id="tokenNisnInput" rows="4"
                    placeholder="0012345678&#10;0023456789&#10;0034567890"
                    style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;resize:vertical;"></textarea>
            </div>
            <div style="display:flex;gap:10px;">
                <button class="btn-primary" onclick="generateTokenBulk()">
                    <i class="fas fa-key"></i> Generate Token
                </button>
                <button class="btn-export" onclick="exportTokenCSV()">
                    <i class="fas fa-download"></i> Export Token CSV
                </button>
            </div>
            <div id="tokenResult" style="margin-top:20px;"></div>
        </div>
    </div>

    <div class="card" style="margin-top:20px;">
        <div class="card-header">
            <div class="card-title"><i class="fas fa-list"></i> Token Aktif</div>
            <button class="btn-act" onclick="loadActiveTokens()">
                <i class="fas fa-sync"></i> Refresh
            </button>
        </div>
        <div class="table-wrap">
            <table class="data-table">
                <thead><tr>
                    <th>NISN</th><th>Nama</th><th>Mapel</th>
                    <th>Token</th><th>Status</th><th>Expires</th><th>Aksi</th>
                </tr></thead>
                <tbody id="activeTokensTbody">
                    <tr><td colspan="7" class="empty-cell">Klik Refresh untuk memuat data.</td></tr>
                </tbody>
            </table>
        </div>
    </div>
</div>
`;

// ── STEP 3: JavaScript functions ──────────────────────────────────

const GURU_JS = `
// ════ INPUT NILAI ════════════════════════════════════════════════

let nilaiBuffer = {}; // { nisn: { uh, uts, uas, tugas } }

async function loadNilaiSiswa() {
    const kelas    = document.getElementById('nilaiKelasFilter').value;
    const mapel    = document.getElementById('nilaiMapelFilter').value;
    const semester = document.getElementById('nilaiSemesterFilter').value;
    const wrap     = document.getElementById('nilaiTableWrap');
    if (!kelas || !mapel) return;

    nilaiBuffer = {};
    wrap.innerHTML = '<p style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat...</p>';

    try {
        // Ambil daftar siswa di kelas
        const siswaRes = await apiFetch('/users?role=siswa&limit=100');
        // Filter by kelas (via siswa_profil)
        const profRes  = await apiFetch('/siswa/profil?kelas=' + encodeURIComponent(kelas));

        // Ambil nilai yang sudah ada
        const nilaiRes = await apiFetch('/siswa/nilai?semester=' + semester + '&kelas=' + encodeURIComponent(kelas));

        const nilaiMap = {};
        (nilaiRes.data || []).forEach(n => {
            if (!nilaiMap[n.nisn]) nilaiMap[n.nisn] = {};
            nilaiMap[n.nisn][n.mapel] = n;
        });

        const siswaList = profRes.data?.rows || [];
        if (!siswaList.length) {
            wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px;">Tidak ada siswa di kelas ini.</p>';
            return;
        }

        wrap.innerHTML = \`
        <table class="data-table">
            <thead><tr>
                <th>#</th><th>Nama</th><th>NISN</th>
                <th>UH (0-100)</th><th>UTS (0-100)</th>
                <th>UAS (0-100)</th><th>Tugas (0-100)</th>
                <th>Nilai Akhir</th><th>Aksi</th>
            </tr></thead>
            <tbody id="nilaiTbody"></tbody>
        </table>
        <button class="btn-primary" style="margin-top:14px;width:100%;" onclick="saveAllNilai('\${mapel}','\${semester}')">
            <i class="fas fa-save"></i> Simpan Semua Nilai
        </button>
        \`;

        const tbody = document.getElementById('nilaiTbody');
        tbody.innerHTML = siswaList.map((s, i) => {
            const existing = (nilaiMap[s.nisn] || {})[mapel] || {};
            return \`
            <tr id="nilai-row-\${s.nisn}">
                <td>\${i+1}</td>
                <td style="font-weight:600;">\${s.nama_lengkap || '-'}</td>
                <td style="font-size:.78rem;color:var(--muted);">\${s.nisn}</td>
                \${['uh','uts','uas','tugas'].map(k => \`
                <td>
                    <input type="number" min="0" max="100" value="\${existing[k] ?? ''}"
                        placeholder="0"
                        style="width:70px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.85rem;"
                        oninput="updateNilaiBuffer('\${s.nisn}','\${k}',this.value)"
                        class="nilai-input" data-nisn="\${s.nisn}" data-key="\${k}">
                </td>\`).join('')}
                <td id="final-\${s.nisn}" style="font-weight:700;color:var(--navy);">
                    \${existing.uh ? calcFinal(existing).toFixed(1) : '-'}
                </td>
                <td>
                    <button class="btn-act" onclick="saveOneNilai('\${s.nisn}','\${mapel}','\${semester}')">
                        Simpan
                    </button>
                </td>
            </tr>\`;
        }).join('');

    } catch(e) {
        wrap.innerHTML = \`<p style="color:var(--red);text-align:center;padding:20px;">Error: \${e.message}</p>\`;
    }
}

function calcFinal(n) {
    return (n.uh||0)*0.2 + (n.uts||0)*0.25 + (n.uas||0)*0.3 + (n.tugas||0)*0.25;
}

function updateNilaiBuffer(nisn, key, val) {
    if (!nilaiBuffer[nisn]) nilaiBuffer[nisn] = {};
    nilaiBuffer[nisn][key] = parseFloat(val) || 0;
    // Update live preview nilai akhir
    const row    = document.getElementById('nilai-row-' + nisn);
    const finals = document.getElementById('final-' + nisn);
    if (!row || !finals) return;
    const inputs = row.querySelectorAll('.nilai-input[data-nisn="' + nisn + '"]');
    const vals   = {};
    inputs.forEach(inp => { vals[inp.dataset.key] = parseFloat(inp.value) || 0; });
    finals.textContent = calcFinal(vals).toFixed(1);
}

async function saveOneNilai(nisn, mapel, semester) {
    const row  = document.getElementById('nilai-row-' + nisn);
    if (!row) return;
    const vals = {};
    row.querySelectorAll('.nilai-input').forEach(inp => {
        vals[inp.dataset.key] = parseFloat(inp.value) || 0;
    });
    try {
        const res = await apiFetch('/siswa/nilai', {
            method: 'POST',
            body: JSON.stringify({ nisn, semester, mapel, ...vals, kkm: 70 }),
        });
        if (res.success) showToast('Nilai disimpan!', 'success');
        else showToast(res.message, 'error');
    } catch(e) { showToast('Gagal menyimpan.', 'error'); }
}

async function saveAllNilai(mapel, semester) {
    const rows = document.querySelectorAll('[id^="nilai-row-"]');
    let saved  = 0;
    for (const row of rows) {
        const nisn = row.id.replace('nilai-row-', '');
        const vals = {};
        row.querySelectorAll('.nilai-input').forEach(inp => {
            vals[inp.dataset.key] = parseFloat(inp.value) || 0;
        });
        try {
            await apiFetch('/siswa/nilai', {
                method: 'POST',
                body: JSON.stringify({ nisn, semester, mapel, ...vals, kkm: 70 }),
            });
            saved++;
        } catch {}
    }
    showToast('Berhasil simpan ' + saved + ' nilai!', 'success');
}

function exportNilaiCSV() {
    const rows   = document.querySelectorAll('[id^="nilai-row-"]');
    const lines  = [['Nama','NISN','UH','UTS','UAS','Tugas','Nilai Akhir']];
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        const vals = row.querySelectorAll('.nilai-input');
        const v    = {};
        vals.forEach(inp => { v[inp.dataset.key] = parseFloat(inp.value) || 0; });
        lines.push([
            cols[1]?.textContent.trim(),
            cols[2]?.textContent.trim(),
            v.uh, v.uts, v.uas, v.tugas,
            calcFinal(v).toFixed(1)
        ]);
    });
    downloadCSV(lines, 'nilai_' + new Date().toISOString().slice(0,10) + '.csv');
}

// ════ INPUT KEHADIRAN ═════════════════════════════════════════════

let khBuffer = {}; // { nisn: status }

async function loadKehadiranSiswa() {
    const kelas    = document.getElementById('khKelasFilter').value;
    const tanggal  = document.getElementById('khTanggal').value;
    const wrap     = document.getElementById('kehadiranTableWrap');
    if (!kelas || !tanggal) { showToast('Pilih kelas dan tanggal!', 'warning'); return; }

    khBuffer = {};
    wrap.innerHTML = '<p style="text-align:center;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Memuat...</p>';

    try {
        // Ambil siswa di kelas (via siswa_profil)
        const profRes = await apiFetch('/siswa/profil?kelas=' + encodeURIComponent(kelas));
        const siswaList = profRes.data?.rows || [];

        if (!siswaList.length) {
            wrap.innerHTML = '<p style="text-align:center;color:var(--muted);padding:40px;">Tidak ada siswa di kelas ini.</p>';
            return;
        }

        // Ambil data kehadiran yang sudah ada untuk tanggal ini
        const existingMap = {};
        // TODO: API untuk ambil kehadiran per tanggal & kelas bisa ditambahkan

        const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(tanggal).getDay()];

        wrap.innerHTML = \`
        <p style="font-size:.85rem;color:var(--muted);margin-bottom:12px;">
            <i class="fas fa-calendar"></i> \${tanggal} (\${hari}) — Kelas \${kelas}
            — Total \${siswaList.length} siswa
        </p>
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
            <button class="btn-act" onclick="setAllStatus('hadir')">✅ Semua Hadir</button>
            <button class="btn-act" onclick="setAllStatus('sakit')">🤒 Semua Sakit</button>
        </div>
        <table class="data-table">
            <thead><tr><th>#</th><th>Nama</th><th>NISN</th><th>Status</th><th>Keterangan</th></tr></thead>
            <tbody id="khTbody"></tbody>
        </table>\`;

        const tbody = document.getElementById('khTbody');
        tbody.innerHTML = siswaList.map((s, i) => {
            const existing = existingMap[s.nisn] || 'hadir';
            khBuffer[s.nisn] = existing;
            return \`
            <tr>
                <td>\${i+1}</td>
                <td style="font-weight:600;">\${s.nama_lengkap || '-'}</td>
                <td style="font-size:.78rem;color:var(--muted);">\${s.nisn}</td>
                <td>
                    <select onchange="khBuffer['\${s.nisn}']=this.value"
                        style="padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-family:inherit;"
                        id="kh-\${s.nisn}">
                        \${['hadir','sakit','izin','alpha'].map(st =>
                            \`<option value="\${st}" \${existing===st?'selected':''}>\${st.charAt(0).toUpperCase()+st.slice(1)}</option>\`
                        ).join('')}
                    </select>
                </td>
                <td>
                    <input type="text" placeholder="Opsional"
                        id="ket-\${s.nisn}"
                        style="width:160px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:.82rem;">
                </td>
            </tr>\`;
        }).join('');

    } catch(e) {
        wrap.innerHTML = \`<p style="color:var(--red);text-align:center;padding:20px;">Error: \${e.message}</p>\`;
    }
}

function setAllStatus(status) {
    Object.keys(khBuffer).forEach(nisn => {
        khBuffer[nisn] = status;
        const sel = document.getElementById('kh-' + nisn);
        if (sel) sel.value = status;
    });
}

async function saveAllKehadiran() {
    const tanggal = document.getElementById('khTanggal').value;
    const kelas   = document.getElementById('khKelasFilter').value;
    if (!Object.keys(khBuffer).length) { showToast('Tidak ada data untuk disimpan.', 'warning'); return; }

    const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][new Date(tanggal).getDay()];

    const payload = Object.entries(khBuffer).map(([nisn, status]) => ({
        nisn, tanggal, hari, status,
        keterangan: document.getElementById('ket-' + nisn)?.value || '',
    }));

    try {
        const res = await apiFetch('/siswa/kehadiran', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        if (res.success) showToast('Kehadiran berhasil disimpan!', 'success');
        else showToast(res.message, 'error');
    } catch(e) { showToast('Gagal menyimpan kehadiran.', 'error'); }
}

// ════ BANK SOAL ═══════════════════════════════════════════════════

let currentSoalPage = 1;

async function loadBankSoal(page = 1) {
    currentSoalPage = page;
    const mapel  = document.getElementById('soalMapelFilter')?.value || '';
    const search = document.getElementById('soalSearch')?.value || '';
    const tbody  = document.getElementById('soalTbody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="6" class="empty-cell"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    const params = new URLSearchParams({ page, limit: 20 });
    if (mapel)  params.set('mapel', mapel);
    if (search) params.set('search', search);

    try {
        const res = await apiFetch('/cbt/soal?' + params);
        if (!res.success) { tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Gagal memuat data.</td></tr>'; return; }

        const { soal, pagination } = res.data;
        if (!soal?.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-cell">Belum ada soal. Klik "Tambah Soal" untuk mulai.</td></tr>';
            return;
        }

        tbody.innerHTML = soal.map((s, i) => \`
        <tr>
            <td>\${(page-1)*20 + i + 1}</td>
            <td style="max-width:300px;font-size:.82rem;">\${s.soal.substring(0,80)}\${s.soal.length>80?'...':''}</td>
            <td><span class="role-badge role-siswa">\${s.mapel}</span></td>
            <td style="font-weight:700;color:var(--green);">\${s.jawaban}</td>
            <td><span class="badge badge-\${s.tingkat==='mudah'?'active':s.tingkat==='sedang'?'verified':'inactive'}">\${s.tingkat}</span></td>
            <td>
                <div style="display:flex;gap:5px;">
                    <button class="btn-act edit" onclick="editSoal('\${s.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-act del"  onclick="deleteSoal('\${s.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>\`).join('');

        if (pagination) renderPagination('soalPagination', pagination, loadBankSoal);

    } catch(e) {
        tbody.innerHTML = \`<tr><td colspan="6" class="empty-cell">Error: \${e.message}</td></tr>\`;
    }
}

function openSoalModal(soalData = null) {
    // Isi modal dengan data jika edit
    document.getElementById('modalTitle').textContent = soalData ? 'Edit Soal' : 'Tambah Soal Baru';
    document.getElementById('formMode').value = soalData ? 'edit' : 'create';
    document.getElementById('editUserId').value = soalData?.id || '';

    // Tampilkan form soal (gunakan modal yang sudah ada, isi ulang)
    document.getElementById('modal-soal-content').innerHTML = \`
    <div class="form-row">
        <div class="form-group full">
            <label>Mata Pelajaran</label>
            <select id="soalMapel" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;">
                <option value="matematika">Matematika</option>
                <option value="bindo">Bahasa Indonesia</option>
                <option value="basing">Bahasa Inggris</option>
                <option value="pkk">Produk Kreatif & KWU</option>
                <option value="sejarah">Sejarah Indonesia</option>
                <option value="produktif">Kompetensi Keahlian</option>
            </select>
        </div>
        <div class="form-group full">
            <label>Pertanyaan</label>
            <textarea id="soalTeks" rows="3" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;resize:vertical;">\${soalData?.soal||''}</textarea>
        </div>
        \${['A','B','C','D','E'].map((l,i) => \`
        <div class="form-group">
            <label>Opsi \${l}</label>
            <input type="text" id="opsi\${l}" value="\${soalData?.['opsi_'+l.toLowerCase()]||''}"
                style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;">
        </div>\`).join('')}
        <div class="form-group">
            <label>Jawaban Benar</label>
            <select id="soalJawaban" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;">
                \${['A','B','C','D','E'].map(l => \`<option value="\${l}" \${soalData?.jawaban===l?'selected':''}>\${l}</option>\`).join('')}
            </select>
        </div>
        <div class="form-group">
            <label>Tingkat Kesulitan</label>
            <select id="soalTingkat" style="width:100%;padding:10px;border:1.5px solid var(--border);border-radius:9px;font-family:inherit;">
                \${['mudah','sedang','sulit'].map(t => \`<option value="\${t}" \${soalData?.tingkat===t?'selected':''}>\${t.charAt(0).toUpperCase()+t.slice(1)}</option>\`).join('')}
            </select>
        </div>
    </div>\`;

    openModal('userModal');
    document.getElementById('submitUserBtn').onclick = saveSoal;
}

async function saveSoal() {
    const payload = {
        mapel:    document.getElementById('soalMapel')?.value,
        soal:     document.getElementById('soalTeks')?.value?.trim(),
        opsi_a:   document.getElementById('opsiA')?.value?.trim(),
        opsi_b:   document.getElementById('opsiB')?.value?.trim(),
        opsi_c:   document.getElementById('opsiC')?.value?.trim(),
        opsi_d:   document.getElementById('opsiD')?.value?.trim(),
        opsi_e:   document.getElementById('opsiE')?.value?.trim() || null,
        jawaban:  document.getElementById('soalJawaban')?.value,
        tingkat:  document.getElementById('soalTingkat')?.value,
    };

    if (!payload.soal || !payload.opsi_a || !payload.opsi_b) {
        showToast('Soal dan minimal 2 opsi wajib diisi.', 'error'); return;
    }

    const mode = document.getElementById('formMode').value;
    const id   = document.getElementById('editUserId').value;

    try {
        const res = await apiFetch(mode === 'edit' ? '/cbt/soal/' + id : '/cbt/soal', {
            method: mode === 'edit' ? 'PUT' : 'POST',
            body: JSON.stringify(payload),
        });
        if (res.success) {
            closeModal('userModal');
            showToast(res.message, 'success');
            loadBankSoal(currentSoalPage);
        } else {
            showToast(res.message, 'error');
        }
    } catch(e) { showToast('Gagal menyimpan soal.', 'error'); }
}

async function deleteSoal(id) {
    if (!confirm('Hapus soal ini?')) return;
    try {
        const res = await apiFetch('/cbt/soal/' + id, { method: 'DELETE' });
        if (res.success) { showToast('Soal dihapus.', 'success'); loadBankSoal(currentSoalPage); }
        else showToast(res.message, 'error');
    } catch(e) { showToast('Gagal menghapus.', 'error'); }
}

// ════ TOKEN CBT ═══════════════════════════════════════════════════

let lastGeneratedTokens = [];

async function generateTokenBulk() {
    const mapel   = document.getElementById('tokenMapel').value;
    const durasi  = parseInt(document.getElementById('tokenDurasi').value) || 90;
    const nisnRaw = document.getElementById('tokenNisnInput').value;
    const nisnArr = nisnRaw.split(/[,\\n\\s]+/).map(n => n.trim()).filter(n => n.length >= 6);

    if (!nisnArr.length) { showToast('Masukkan minimal 1 NISN!', 'warning'); return; }
    if (nisnArr.length > 100) { showToast('Maksimal 100 NISN sekaligus.', 'warning'); return; }

    const resultDiv = document.getElementById('tokenResult');
    resultDiv.innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Generating tokens...</p>';

    try {
        const res = await apiFetch('/api/cbt/token/generate', {
            method: 'POST',
            body: JSON.stringify({ siswa: nisnArr, mapel, durasi_menit: durasi }),
        });

        if (!res.success) { showToast(res.message, 'error'); resultDiv.innerHTML = ''; return; }

        lastGeneratedTokens = res.data;

        resultDiv.innerHTML = \`
        <div style="background:var(--light);border-radius:10px;padding:16px;border:1px solid var(--border);">
            <p style="font-weight:700;margin-bottom:12px;color:var(--green);">
                ✅ \${res.data.length} token berhasil di-generate untuk mapel \${mapel.toUpperCase()}
            </p>
            <div style="max-height:200px;overflow-y:auto;">
                <table class="data-table">
                    <thead><tr><th>NISN</th><th>Token</th><th>Berlaku Hingga</th></tr></thead>
                    <tbody>
                        \${res.data.map(t => \`
                        <tr>
                            <td>\${t.nisn}</td>
                            <td><code style="font-size:.85rem;background:#fff;padding:2px 6px;border-radius:4px;">\${t.token}</code></td>
                            <td style="font-size:.78rem;">\${new Date(t.expires_at).toLocaleString('id-ID')}</td>
                        </tr>\`).join('')}
                    </tbody>
                </table>
            </div>
        </div>\`;

        loadActiveTokens();

    } catch(e) {
        resultDiv.innerHTML = '';
        showToast('Gagal generate token: ' + e.message, 'error');
    }
}

function exportTokenCSV() {
    if (!lastGeneratedTokens.length) { showToast('Generate token dulu!', 'warning'); return; }
    const rows = [['NISN','Token','Berlaku Hingga']];
    lastGeneratedTokens.forEach(t => rows.push([t.nisn, t.token, t.expires_at]));
    downloadCSV(rows, 'token_cbt_' + new Date().toISOString().slice(0,10) + '.csv');
    showToast('Token di-export ke CSV!', 'success');
}

async function loadActiveTokens() {
    const tbody = document.getElementById('activeTokensTbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try {
        const res = await apiFetch('/api/cbt/tokens?limit=50');
        if (!res.success) { tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Gagal memuat.</td></tr>'; return; }
        const tokens = res.data.tokens;
        if (!tokens?.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">Belum ada token aktif.</td></tr>'; return; }
        tbody.innerHTML = tokens.map(t => \`
        <tr>
            <td>\${t.nisn}</td>
            <td style="font-size:.82rem;">\${t.nama_lengkap || '-'}</td>
            <td><span class="role-badge role-siswa">\${t.mapel}</span></td>
            <td><code style="font-size:.78rem;">\${t.token.substring(0,16)}...</code></td>
            <td><span class="badge \${t.used ? 'badge-inactive' : 'badge-active'}">\${t.used ? 'Dipakai' : 'Aktif'}</span></td>
            <td style="font-size:.75rem;">\${new Date(t.expires_at).toLocaleString('id-ID')}</td>
            <td>
                \${!t.used ? \`<button class="btn-act del" onclick="invalidateToken('\${t.token}')">
                    <i class="fas fa-ban"></i>
                </button>\` : ''}
            </td>
        </tr>\`).join('');
    } catch(e) {
        tbody.innerHTML = \`<tr><td colspan="7" class="empty-cell">Error: \${e.message}</td></tr>\`;
    }
}

async function invalidateToken(token) {
    if (!confirm('Invalidasi token ini? Siswa tidak bisa pakai token ini lagi.')) return;
    try {
        const res = await apiFetch('/api/cbt/token/' + token, { method: 'DELETE' });
        if (res.success) { showToast('Token diinvalidasi.', 'success'); loadActiveTokens(); }
    } catch(e) { showToast('Gagal invalidasi.', 'error'); }
}
`;

module.exports = { GURU_PAGES_HTML, GURU_JS };
