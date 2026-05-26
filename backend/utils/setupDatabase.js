// utils/setupDatabase.js — better-sqlite3 version
'use strict';

function setup() {
    const path    = require('path');
    const fs      = require('fs');
    const bcrypt  = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');
    require('dotenv').config();

    const Database = require('better-sqlite3');
    const DB_PATH  = path.resolve(
        (process.env.DB_PATH || './data/smkn1terisi')
            .replace(/\.bin$/, '').replace(/\.db$/, '') + '.db'
    );
    const DB_DIR = path.dirname(DB_PATH);
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

    const db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // ── CREATE ALL TABLES ──────────────────────────────────────────
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, nama_lengkap TEXT NOT NULL, email TEXT UNIQUE,
            password_hash TEXT, role TEXT NOT NULL DEFAULT 'siswa',
            nisn TEXT UNIQUE, nip TEXT UNIQUE, no_hp TEXT, bidang TEXT, jabatan_detail TEXT, foto_profil TEXT,
            google_id TEXT UNIQUE, is_active INTEGER NOT NULL DEFAULT 1,
            is_verified INTEGER NOT NULL DEFAULT 0, last_login TEXT,
            login_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'email', expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL,
            entity TEXT, entity_id TEXT, detail TEXT,
            ip_address TEXT, user_agent TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS announcements (
            id TEXT PRIMARY KEY, judul TEXT NOT NULL, isi TEXT NOT NULL,
            tipe TEXT NOT NULL DEFAULT 'info', is_active INTEGER NOT NULL DEFAULT 1,
            urutan INTEGER NOT NULL DEFAULT 0, created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS cbt_results (
            id TEXT PRIMARY KEY, exam_id TEXT, session_id TEXT,
            nisn TEXT NOT NULL, mapel TEXT NOT NULL,
            benar INTEGER DEFAULT 0, salah INTEGER DEFAULT 0,
            kosong INTEGER DEFAULT 0, nilai REAL DEFAULT 0,
            selesai_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS cbt_exams (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            mapel TEXT NOT NULL,
            kelas TEXT NOT NULL,
            durasi_menit INTEGER NOT NULL DEFAULT 90,
            question_count INTEGER NOT NULL DEFAULT 40,
            start_at TEXT,
            end_at TEXT,
            status TEXT NOT NULL DEFAULT 'draft',
            created_by TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS cbt_exam_questions (
            id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            urutan INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(exam_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS cbt_answers (
            id TEXT PRIMARY KEY,
            exam_id TEXT,
            session_id TEXT NOT NULL,
            nisn TEXT NOT NULL,
            question_id TEXT NOT NULL,
            jawaban TEXT,
            is_correct INTEGER,
            answered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(session_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS cbt_sessions (
            id TEXT PRIMARY KEY, exam_id TEXT, nisn TEXT NOT NULL, mapel TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE, used INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'issued',
            start_time TEXT, end_time TEXT,
            durasi_menit INTEGER NOT NULL DEFAULT 90,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS skl_data (
            id TEXT PRIMARY KEY, nisn TEXT NOT NULL UNIQUE, nama TEXT NOT NULL,
            ttl TEXT NOT NULL, jurusan TEXT NOT NULL, kelas TEXT NOT NULL,
            tahun_lulus TEXT NOT NULL, no_ijazah TEXT, nilai_rata REAL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS siswa_profil (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nisn TEXT NOT NULL,
            kelas TEXT, jurusan TEXT, tempat_lahir TEXT, tanggal_lahir TEXT,
            jenis_kelamin TEXT, agama TEXT, alamat TEXT,
            kelurahan TEXT, kecamatan TEXT,
            kabupaten TEXT DEFAULT 'Indramayu',
            provinsi TEXT DEFAULT 'Jawa Barat',
            kode_pos TEXT, nama_ayah TEXT, pekerjaan_ayah TEXT,
            nama_ibu TEXT, pekerjaan_ibu TEXT, no_hp_ortu TEXT, email_ortu TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS nilai_siswa (
            id TEXT PRIMARY KEY, nisn TEXT NOT NULL, semester TEXT NOT NULL,
            mapel TEXT NOT NULL, uh REAL DEFAULT 0, uts REAL DEFAULT 0,
            uas REAL DEFAULT 0, tugas REAL DEFAULT 0, kkm REAL DEFAULT 70,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS kehadiran (
            id TEXT PRIMARY KEY, nisn TEXT NOT NULL,
            tanggal TEXT NOT NULL, hari TEXT,
            status TEXT NOT NULL DEFAULT 'hadir', keterangan TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS jadwal (
            id TEXT PRIMARY KEY, kelas TEXT NOT NULL,
            hari TEXT NOT NULL, jam TEXT NOT NULL,
            mapel TEXT NOT NULL, guru TEXT, ruang TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS ppdb_pendaftaran (
            id TEXT PRIMARY KEY, nomor_daftar TEXT NOT NULL UNIQUE,
            jalur TEXT NOT NULL, nama_lengkap TEXT NOT NULL,
            nisn TEXT, tempat_lahir TEXT, tanggal_lahir TEXT,
            jenis_kelamin TEXT, asal_sekolah TEXT, jurusan_pilihan TEXT,
            nama_ayah TEXT, pekerjaan_ayah TEXT,
            nama_ibu TEXT, pekerjaan_ibu TEXT,
            no_hp TEXT, alamat TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            catatan TEXT, jarak_km REAL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS bank_soal (
            id TEXT PRIMARY KEY, mapel TEXT NOT NULL,
            jenis_ujian TEXT NOT NULL DEFAULT 'PAS',
            soal TEXT NOT NULL,
            opsi_a TEXT NOT NULL, opsi_b TEXT NOT NULL,
            opsi_c TEXT NOT NULL, opsi_d TEXT NOT NULL,
            opsi_e TEXT,
            jawaban TEXT NOT NULL,
            tingkat TEXT DEFAULT 'sedang',
            created_by TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS tugas_kelas (
            id TEXT PRIMARY KEY, judul TEXT NOT NULL,
            deskripsi TEXT, mapel TEXT NOT NULL,
            kelas TEXT NOT NULL, deadline TEXT,
            created_by TEXT NOT NULL,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS submission_tugas (
            id TEXT PRIMARY KEY,
            tugas_id TEXT NOT NULL,
            nisn TEXT NOT NULL,
            jawaban TEXT,
            file_url TEXT,
            nilai REAL,
            feedback TEXT,
            status TEXT NOT NULL DEFAULT 'submitted',
            submitted_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(tugas_id, nisn)
        );
        CREATE TABLE IF NOT EXISTS file_uploads (
            id TEXT PRIMARY KEY,
            uploader_id TEXT NOT NULL,
            original_name TEXT NOT NULL,
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_url TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            size_bytes INTEGER NOT NULL,
            category TEXT DEFAULT 'general',
            entity_type TEXT,
            entity_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS forum_posts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            mapel TEXT,
            konten TEXT NOT NULL,
            parent_id TEXT,
            likes INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS forum_likes (
            user_id TEXT NOT NULL,
            post_id TEXT NOT NULL,
            PRIMARY KEY(user_id, post_id)
        );
        CREATE TABLE IF NOT EXISTS notifikasi (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            judul TEXT NOT NULL,
            pesan TEXT NOT NULL,
            tipe TEXT DEFAULT 'info',
            is_read INTEGER NOT NULL DEFAULT 0,
            link TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
    `);

    console.log('✅ Semua tabel berhasil dibuat/diverifikasi');

    const sessionCols = db.pragma('table_info(cbt_sessions)').map(c => c.name);
    if (!sessionCols.includes('exam_id')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN exam_id TEXT');
    if (!sessionCols.includes('status')) db.exec("ALTER TABLE cbt_sessions ADD COLUMN status TEXT NOT NULL DEFAULT 'issued'");

    const resultCols = db.pragma('table_info(cbt_results)').map(c => c.name);
    if (!resultCols.includes('exam_id')) db.exec('ALTER TABLE cbt_results ADD COLUMN exam_id TEXT');
    if (!resultCols.includes('session_id')) db.exec('ALTER TABLE cbt_results ADD COLUMN session_id TEXT');

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cbt_sessions_token   ON cbt_sessions(token);
        CREATE INDEX IF NOT EXISTS idx_cbt_sessions_nisn    ON cbt_sessions(nisn);
        CREATE INDEX IF NOT EXISTS idx_cbt_sessions_exam    ON cbt_sessions(exam_id, nisn);
        CREATE INDEX IF NOT EXISTS idx_cbt_exams_status     ON cbt_exams(status, kelas, mapel);
        CREATE INDEX IF NOT EXISTS idx_cbt_exam_questions   ON cbt_exam_questions(exam_id, urutan);
        CREATE INDEX IF NOT EXISTS idx_cbt_answers_session  ON cbt_answers(session_id, question_id);
        CREATE INDEX IF NOT EXISTS idx_cbt_results_exam     ON cbt_results(exam_id, nisn);
        CREATE INDEX IF NOT EXISTS idx_users_nisn           ON users(nisn) WHERE nisn IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email) WHERE email IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created   ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_kehadiran_nisn       ON kehadiran(nisn, tanggal);
        CREATE INDEX IF NOT EXISTS idx_nilai_nisn           ON nilai_siswa(nisn, semester);
        CREATE INDEX IF NOT EXISTS idx_notifikasi_user      ON notifikasi(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_forum_user           ON forum_posts(user_id);
        CREATE INDEX IF NOT EXISTS idx_submission_tugas     ON submission_tugas(tugas_id, nisn);
    `);

    console.log('✅ Database indexes created');

    const bankCnt = db.prepare('SELECT COUNT(*) as c FROM bank_soal').get().c;
    if (bankCnt === 0) {
        const now = new Date().toISOString();
        const demoSoal = [
            ['matematika','Nilai dari 2 pangkat 3 dikali 4 adalah...','16','24','32','40','48','C'],
            ['matematika','Akar kuadrat dari 225 adalah...','13','14','15','16','17','C'],
            ['matematika','Jika f(x)=3x+5, maka f(4)=...','15','17','19','21','23','B'],
            ['matematika','Luas persegi panjang 12 cm x 8 cm adalah...','80','88','96','104','112','C'],
            ['matematika','FPB dari 36 dan 48 adalah...','6','8','12','16','24','C'],
            ['bindo','Antonim dari kata boros adalah...','Hemat','Kikir','Mahal','Murah','Banyak','A'],
            ['bindo','Kalimat dengan kata baku yang benar adalah...','Saya pergi ke apotek','Saya pergi ke apotik','Saya pergi ke aptek','Saya pergi ke apotheke','Saya pergi ke apoteks','A'],
            ['bindo','Paragraf yang kalimat utamanya di akhir disebut...','Deduktif','Induktif','Campuran','Naratif','Deskriptif','B'],
            ['bindo','Majas yang melebih-lebihkan disebut...','Metafora','Hiperbola','Simile','Ironi','Litotes','B'],
            ['bindo','Tanda baca untuk kalimat tanya adalah...','Titik','Koma','Tanda tanya','Titik dua','Tanda seru','C'],
            ['basing','The past tense of go is...','Goed','Went','Gone','Goes','Going','B'],
            ['basing','She ___ to school every day.','go','goes','going','went','gone','B'],
            ['basing','The synonym of big is...','Small','Tiny','Large','Short','Narrow','C'],
            ['basing','The plural form of child is...','Childs','Childes','Children','Childrens','Childen','C'],
            ['basing','The opposite of beautiful is...','Handsome','Ugly','Pretty','Cute','Lovely','B'],
            ['pkk','SWOT adalah analisis...','Sales Work Order Team','Strength Weakness Opportunity Threat','Stock Work Output Target','System Work Online Trade','Standard Workflow Task','B'],
            ['pkk','Dokumen rencana bisnis disebut...','Invoice','Business Plan','Nota','Kuitansi','SIUP','B'],
            ['pkk','Modal awal untuk memulai usaha disebut...','Modal tetap','Modal awal','Modal akhir','Modal sosial','Modal pasif','B'],
            ['pkk','E-commerce adalah...','Perdagangan elektronik','Gudang barang','Toko fisik','Distribusi manual','Pemasaran offline','A'],
            ['pkk','BEP terjadi saat...','Pendapatan sama dengan biaya','Biaya nol','Untung besar','Rugi besar','Produksi maksimum','A'],
            ['sejarah','Proklamasi Kemerdekaan RI dibacakan pada...','17 Agustus 1944','17 Agustus 1945','17 Agustus 1946','18 Agustus 1945','20 Mei 1908','B'],
            ['sejarah','Budi Utomo berdiri pada...','20 Mei 1906','20 Mei 1908','28 Oktober 1928','17 Agustus 1945','1 Juni 1945','B'],
            ['sejarah','Sumpah Pemuda diikrarkan pada...','28 Oktober 1926','28 Oktober 1927','28 Oktober 1928','28 Oktober 1929','28 Oktober 1930','C'],
            ['sejarah','PPKI adalah singkatan dari...','Panitia Persiapan Kemerdekaan Indonesia','Panitia Penyidik Kemerdekaan Indonesia','Persatuan Pemuda Kemerdekaan Indonesia','Panitia Pusat Kebangsaan Indonesia','Persatuan Pekerja Indonesia','A'],
            ['sejarah','Konferensi Asia-Afrika dilaksanakan di...','Jakarta','Surabaya','Bandung','Yogyakarta','Medan','C'],
            ['produktif','OSI Layer untuk pengiriman end-to-end adalah...','Physical','Data Link','Network','Transport','Application','D'],
            ['produktif','IP 192.168.1.1 termasuk kelas...','A','B','C','D','E','C'],
            ['produktif','Port default HTTPS adalah...','21','22','80','443','8080','D'],
            ['produktif','DNS berfungsi untuk...','Membatasi bandwidth','Menerjemahkan domain ke IP','Membuat kabel','Mematikan server','Menghapus cache','B'],
            ['produktif','VPN adalah singkatan dari...','Virtual Private Network','Very Private Network','Virtual Public Network','Verified Private Network','Visual Protocol Network','A'],
        ];
        const insertSoal = db.prepare(`
            INSERT INTO bank_soal (id,mapel,jenis_ujian,soal,opsi_a,opsi_b,opsi_c,opsi_d,opsi_e,jawaban,tingkat,created_by,is_active,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?, 'sedang', NULL, 1, ?, ?)
        `);
        const seedBank = db.transaction(() => {
            for (const s of demoSoal) {
                insertSoal.run(uuidv4(), s[0], 'DEMO', s[1], s[2], s[3], s[4], s[5], s[6], s[7], now, now);
            }
        });
        seedBank();
        console.log('✅ Demo bank soal CBT dibuat untuk testing');
    }

    const profilCnt = db.prepare('SELECT COUNT(*) as c FROM siswa_profil').get().c;
    if (profilCnt === 0) {
        const now = new Date().toISOString();
        const demoProfiles = [
            ['0012345678', 'XI TKJ 1', 'Teknik Komputer & Jaringan'],
            ['0023456789', 'XI AKL 1', 'Akuntansi & Keuangan Lembaga'],
            ['0034567890', 'XI TBSM 2', 'Teknik Bisnis Sepeda Motor'],
            ['1234567890', 'XI TKJ 1', 'Teknik Komputer & Jaringan'],
        ];
        const findUser = db.prepare('SELECT id FROM users WHERE nisn = ?');
        const insertProfile = db.prepare(`
            INSERT OR IGNORE INTO siswa_profil (id,user_id,nisn,kelas,jurusan,updated_at)
            VALUES (?,?,?,?,?,?)
        `);
        const seedProfiles = db.transaction(() => {
            for (const p of demoProfiles) {
                const user = findUser.get(p[0]);
                if (user) insertProfile.run(uuidv4(), user.id, p[0], p[1], p[2], now);
            }
        });
        seedProfiles();
        console.log('✅ Demo profil siswa dibuat untuk testing kelas CBT');
    }

    // ── CEK APAKAH SUDAH ADA DATA ──────────────────────────────────
    const cnt = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
    if (cnt > 0) {
        console.log(`ℹ️  Database sudah ada (${cnt} user). Skip seed.`);
        db.close();
        return;
    }

    // ── SEED DATA ──────────────────────────────────────────────────
    console.log('🌱 Mengisi data awal...');
    const hash = bcrypt.hashSync('Smkn1Terisi@2024', 12);
    const now  = new Date().toISOString();

    const insertUser = db.prepare(`
        INSERT OR IGNORE INTO users
        (id,nama_lengkap,email,password_hash,role,nisn,nip,no_hp,is_active,is_verified,created_at,updated_at)
        VALUES (@id,@nama,@email,@hash,@role,@nisn,@nip,@hp,1,1,@now,@now)
    `);

    const seedUsers = db.transaction((users) => {
        for (const u of users) insertUser.run(u);
    });

    seedUsers([
        { id:uuidv4(), nama:'Administrator Sistem',                  email:'admin@smkn1terisi.sch.id',               role:'super_admin',    nisn:null,         nip:'000000000000000001', hp:'081200000001', hash, now },
        { id:uuidv4(), nama:'Agung Hendra Adiwiguna, S.Kom., M.M.', email:'kepsek@smkn1terisi.sch.id',              role:'kepala_sekolah', nisn:null,         nip:'198001012005011001', hp:'081200000002', hash, now },
        { id:uuidv4(), nama:'Deni Setiawan, S.Kom',                  email:'deni.setiawan@smkn1terisi.sch.id',       role:'guru',           nisn:null,         nip:'198505152010011002', hp:'081200000003', hash, now },
        { id:uuidv4(), nama:'Ratna Sari, S.Pd',                      email:'ratna.sari@smkn1terisi.sch.id',          role:'guru',           nisn:null,         nip:'198705202011012003', hp:'081200000004', hash, now },
        { id:uuidv4(), nama:'Sari Dewi, A.Md',                       email:'tu@smkn1terisi.sch.id',                  role:'tata_usaha',     nisn:null,         nip:'199001012015012005', hp:'081200000006', hash, now },
        { id:uuidv4(), nama:'Ahmad Farhan Maulana',                   email:'ahmad.farhan@siswa.smkn1terisi.sch.id',  role:'siswa',          nisn:'0012345678', nip:null,                hp:'081200000007', hash, now },
        { id:uuidv4(), nama:'Siti Nurhaliza Putri',                   email:'siti.nurhaliza@siswa.smkn1terisi.sch.id',role:'siswa',          nisn:'0023456789', nip:null,                hp:'081200000008', hash, now },
        { id:uuidv4(), nama:'Rizky Aditya Pratama',                   email:'rizky.aditya@siswa.smkn1terisi.sch.id',  role:'siswa',          nisn:'0034567890', nip:null,                hp:'081200000009', hash, now },
        { id:uuidv4(), nama:'Supriadi',                               email:'supriadi@gmail.com',                     role:'wali_murid',     nisn:null,         nip:null,                hp:'081200000010', hash, now },
    ]);

    const seededProfiles = [
        ['0012345678', 'XI TKJ 1', 'Teknik Komputer & Jaringan'],
        ['0023456789', 'XI AKL 1', 'Akuntansi & Keuangan Lembaga'],
        ['0034567890', 'XI TBSM 2', 'Teknik Bisnis Sepeda Motor'],
    ];
    const findSeedUser = db.prepare('SELECT id FROM users WHERE nisn = ?');
    const insertSeedProfile = db.prepare(`
        INSERT OR IGNORE INTO siswa_profil (id,user_id,nisn,kelas,jurusan,updated_at)
        VALUES (?,?,?,?,?,?)
    `);
    for (const p of seededProfiles) {
        const user = findSeedUser.get(p[0]);
        if (user) insertSeedProfile.run(uuidv4(), user.id, p[0], p[1], p[2], now);
    }

    // Seed announcements
    const insertAnn = db.prepare(`INSERT OR IGNORE INTO announcements (id,judul,isi,tipe,is_active,urutan,created_at,updated_at) VALUES (@id,@judul,@isi,@tipe,1,@urutan,@now,@now)`);
    const seedAnns = db.transaction((anns) => { for (const a of anns) insertAnn.run(a); });
    seedAnns([
        { id:uuidv4(), judul:'PPDB Gelombang 2',  isi:'PPDB Gelombang 2 sudah dibuka!',                              tipe:'info',    urutan:1, now },
        { id:uuidv4(), judul:'Jadwal UKK',         isi:'Ujian Kompetensi Keahlian dimulai 15 Mei 2026',               tipe:'warning', urutan:2, now },
        { id:uuidv4(), judul:'Prestasi LKS',       isi:'SMKN 1 Terisi meraih 3 medali emas LKS Tingkat Kabupaten!',  tipe:'success', urutan:3, now },
    ]);

    // Seed SKL
    const insertSKL = db.prepare(`INSERT OR IGNORE INTO skl_data (id,nisn,nama,ttl,jurusan,kelas,tahun_lulus,no_ijazah,nilai_rata,created_at) VALUES (@id,@nisn,@nama,@ttl,@jurusan,@kelas,@tahun,@ijazah,@nilai,@now)`);
    const seedSKL = db.transaction((rows) => { for (const r of rows) insertSKL.run(r); });
    seedSKL([
        { id:uuidv4(), nisn:'0012345678', nama:'AHMAD FARHAN MAULANA', ttl:'2008-01-15', jurusan:'Teknik Komputer & Jaringan (TKJ)', kelas:'XI TKJ 1', tahun:'2026', ijazah:'DN-034/SMKN1T/2026', nilai:87.40, now },
        { id:uuidv4(), nisn:'0023456789', nama:'SITI NURHALIZA PUTRI', ttl:'2008-03-22', jurusan:'Akuntansi & Keuangan (AKL)',       kelas:'XI AKL 1', tahun:'2026', ijazah:'DN-057/SMKN1T/2026', nilai:91.20, now },
        { id:uuidv4(), nisn:'0034567890', nama:'RIZKY ADITYA PRATAMA', ttl:'2007-11-08', jurusan:'Teknik Bisnis Sepeda Motor (TBSM)',kelas:'XI TBSM 2',tahun:'2026', ijazah:'DN-089/SMKN1T/2026', nilai:83.75, now },
    ]);

    // Seed nilai default siswa demo
    const insertNilai = db.prepare(`INSERT OR IGNORE INTO nilai_siswa (id,nisn,semester,mapel,uh,uts,uas,tugas,kkm,created_at) VALUES (@id,@nisn,@semester,@mapel,@uh,@uts,@uas,@tugas,@kkm,@now)`);
    const seedNilai = db.transaction((rows) => { for (const r of rows) insertNilai.run(r); });
    seedNilai([
        { id:uuidv4(), nisn:'0012345678', semester:'genap', mapel:'Teknik Komputer Jaringan', uh:90, uts:86, uas:88, tugas:92, kkm:75, now },
        { id:uuidv4(), nisn:'0012345678', semester:'genap', mapel:'Matematika',               uh:78, uts:80, uas:82, tugas:85, kkm:70, now },
        { id:uuidv4(), nisn:'0012345678', semester:'genap', mapel:'Bahasa Indonesia',         uh:88, uts:90, uas:85, tugas:92, kkm:70, now },
        { id:uuidv4(), nisn:'0012345678', semester:'genap', mapel:'Bahasa Inggris',           uh:82, uts:85, uas:88, tugas:90, kkm:70, now },
        { id:uuidv4(), nisn:'0012345678', semester:'genap', mapel:'Produk Kreatif & KWU',     uh:87, uts:89, uas:91, tugas:93, kkm:75, now },
    ]);

    // Seed kehadiran demo
    const insertKH = db.prepare(`INSERT OR IGNORE INTO kehadiran (id,nisn,tanggal,hari,status,created_at) VALUES (@id,@nisn,@tanggal,@hari,@status,@now)`);
    const days = ['Senin','Selasa','Rabu','Kamis','Jumat'];
    const seedKH = db.transaction(() => {
        for (let i = 1; i <= 20; i++) {
            const d = new Date(2026, 3, i);
            if (d.getDay() === 0 || d.getDay() === 6) continue;
            insertKH.run({ id:uuidv4(), nisn:'0012345678', tanggal:`2026-04-${String(i).padStart(2,'0')}`, hari: days[d.getDay()-1], status: i === 5 ? 'sakit' : i === 12 ? 'izin' : 'hadir', now });
        }
    });
    seedKH();

    // Seed jadwal demo
    const insertJadwal = db.prepare(`INSERT OR IGNORE INTO jadwal (id,kelas,hari,jam,mapel,guru,ruang,created_at) VALUES (@id,@kelas,@hari,@jam,@mapel,@guru,@ruang,@now)`);
    const seedJadwal = db.transaction((rows) => { for (const r of rows) insertJadwal.run(r); });
    seedJadwal([
        { id:uuidv4(), kelas:'XI TKJ 1', hari:'senin',  jam:'07:00-08:30', mapel:'Teknik Komputer Jaringan', guru:'Deni Setiawan, S.Kom',  ruang:'Lab TKJ 1', now },
        { id:uuidv4(), kelas:'XI TKJ 1', hari:'senin',  jam:'08:30-10:00', mapel:'Matematika',               guru:'Ratna Sari, S.Pd',      ruang:'R. 12',     now },
        { id:uuidv4(), kelas:'XI TKJ 1', hari:'selasa', jam:'07:00-08:30', mapel:'Bahasa Indonesia',         guru:'Intan Permata, M.Pd',   ruang:'R. 12',     now },
        { id:uuidv4(), kelas:'XI TKJ 1', hari:'selasa', jam:'08:30-10:00', mapel:'Bahasa Inggris',           guru:'Drs. Wahyu Santoso',    ruang:'R. 12',     now },
        { id:uuidv4(), kelas:'XI TKJ 1', hari:'rabu',   jam:'07:00-09:00', mapel:'Produk Kreatif & KWU',     guru:'Hendra Wijaya, S.T',    ruang:'R. 11',     now },
        { id:uuidv4(), kelas:'XI TKJ 1', hari:'kamis',  jam:'07:00-08:30', mapel:'Teknik Komputer Jaringan', guru:'Deni Setiawan, S.Kom',  ruang:'Lab TKJ 2', now },
        { id:uuidv4(), kelas:'XI TKJ 1', hari:'jumat',  jam:'07:00-08:00', mapel:'Pendidikan Agama',         guru:'Drs. Ahmad Syafei',     ruang:'R. 12',     now },
    ]);

    db.close();
    console.log('✅ Seed data berhasil.');
    console.log('\n  Akun testing (password: Smkn1Terisi@2024):');
    console.log('  super_admin    → admin@smkn1terisi.sch.id');
    console.log('  kepala_sekolah → kepsek@smkn1terisi.sch.id');
    console.log('  guru           → deni.setiawan@smkn1terisi.sch.id');
    console.log('  tata_usaha     → tu@smkn1terisi.sch.id');
    console.log('  siswa          → NISN: 0012345678  (password: Smkn1Terisi@2024)');
    console.log('  wali_murid     → supriadi@gmail.com\n');
}

if (require.main === module) {
    setup();
    process.exit(0);
}

module.exports = { setup };
