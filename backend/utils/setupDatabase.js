// utils/setupDatabase.js
'use strict';

async function setup() {
    // Inisialisasi manual agar tidak ada setInterval yang blokir proses
    const path   = require('path');
    const fs     = require('fs');
    const SQL    = await require('sql.js')();
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    require('dotenv').config();
    const DB_PATH = path.resolve(
        (process.env.DB_PATH || './data/smkn1terisi').replace(/\.db$/, '') + '.bin'
    );
    const DB_DIR = path.dirname(DB_PATH);
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

    let db;
    if (fs.existsSync(DB_PATH)) {
        db = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
        db = new SQL.Database();
    }

    function saveDB() {
        const data = db.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    }

    // ── CREATE TABLES ──
    const tables = [
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY, nama_lengkap TEXT NOT NULL, email TEXT UNIQUE,
            password_hash TEXT, role TEXT NOT NULL DEFAULT 'siswa',
            nisn TEXT UNIQUE, nip TEXT UNIQUE, no_hp TEXT, foto_profil TEXT,
            google_id TEXT UNIQUE, is_active INTEGER NOT NULL DEFAULT 1,
            is_verified INTEGER NOT NULL DEFAULT 0, last_login TEXT,
            login_attempts INTEGER NOT NULL DEFAULT 0, locked_until TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS refresh_tokens (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
            type TEXT NOT NULL DEFAULT 'email', expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS email_verification_tokens (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL, used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS audit_logs (
            id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL,
            entity TEXT, entity_id TEXT, detail TEXT, ip_address TEXT, user_agent TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS user_sessions (
            id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL UNIQUE,
            ip_address TEXT, user_agent TEXT, expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS announcements (
            id TEXT PRIMARY KEY, judul TEXT NOT NULL, isi TEXT NOT NULL,
            tipe TEXT NOT NULL DEFAULT 'info', is_active INTEGER NOT NULL DEFAULT 1,
            urutan INTEGER NOT NULL DEFAULT 0, created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS cbt_results (
            id TEXT PRIMARY KEY, nisn TEXT NOT NULL, mapel TEXT NOT NULL,
            benar INTEGER DEFAULT 0, salah INTEGER DEFAULT 0, kosong INTEGER DEFAULT 0,
            nilai REAL DEFAULT 0, selesai_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
        `CREATE TABLE IF NOT EXISTS skl_data (
            id TEXT PRIMARY KEY, nisn TEXT NOT NULL UNIQUE, nama TEXT NOT NULL,
            ttl TEXT NOT NULL, jurusan TEXT NOT NULL, kelas TEXT NOT NULL,
            tahun_lulus TEXT NOT NULL, no_ijazah TEXT, nilai_rata REAL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        )`,
    ];

    for (const sql of tables) {
        db.run(sql);
    }
    saveDB();
    console.log('✅ Tabel berhasil dibuat/diverifikasi');

    // Cek apakah sudah ada data
    const [{ values: [[cnt]] }] = db.exec('SELECT COUNT(*) FROM users');
    if (cnt > 0) {
        console.log(`ℹ️  Database sudah ada (${cnt} user). Skip seed.`);
        db.close();
        return;
    }

    // ── SEED DATA ──
    console.log('🌱 Mengisi data awal...');
    const hash = bcrypt.hashSync('Smkn1Terisi@2024', 12);
    const now  = new Date().toISOString();

    const akun = [
        { id:uuidv4(), nama:'Administrator Sistem',                 email:'admin@smkn1terisi.sch.id',              role:'super_admin',    nisn:null,         nip:'000000000000000001', hp:'081200000001' },
        { id:uuidv4(), nama:'Agung Hendra Adiwiguna, S.Kom., M.M.',email:'kepsek@smkn1terisi.sch.id',             role:'kepala_sekolah', nisn:null,         nip:'198001012005011001', hp:'081200000002' },
        { id:uuidv4(), nama:'Deni Setiawan, S.Kom',                 email:'deni.setiawan@smkn1terisi.sch.id',      role:'guru',           nisn:null,         nip:'198505152010011002', hp:'081200000003' },
        { id:uuidv4(), nama:'Ratna Sari, S.Pd',                     email:'ratna.sari@smkn1terisi.sch.id',         role:'guru',           nisn:null,         nip:'198705202011012003', hp:'081200000004' },
        { id:uuidv4(), nama:'Intan Permata, M.Pd',                  email:'intan.permata@smkn1terisi.sch.id',      role:'guru',           nisn:null,         nip:'199002102012012004', hp:'081200000005' },
        { id:uuidv4(), nama:'Sari Dewi, A.Md',                      email:'tu@smkn1terisi.sch.id',                 role:'tata_usaha',     nisn:null,         nip:'199001012015012005', hp:'081200000006' },
        { id:uuidv4(), nama:'Ahmad Farhan Maulana',                  email:'ahmad.farhan@siswa.smkn1terisi.sch.id', role:'siswa',          nisn:'0012345678', nip:null,                hp:'081200000007' },
        { id:uuidv4(), nama:'Siti Nurhaliza Putri',                  email:'siti.nurhaliza@siswa.smkn1terisi.sch.id',role:'siswa',         nisn:'0023456789', nip:null,                hp:'081200000008' },
        { id:uuidv4(), nama:'Rizky Aditya Pratama',                  email:'rizky.aditya@siswa.smkn1terisi.sch.id', role:'siswa',          nisn:'0034567890', nip:null,                hp:'081200000009' },
        { id:uuidv4(), nama:'Supriadi (Wali Ahmad Farhan)',           email:'supriadi@gmail.com',                    role:'wali_murid',     nisn:null,         nip:null,                hp:'081200000010' },
    ];

    for (const u of akun) {
        try {
            db.run(`INSERT OR IGNORE INTO users
                (id,nama_lengkap,email,password_hash,role,nisn,nip,no_hp,is_active,is_verified,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,1,1,?,?)`,
                [u.id, u.nama, u.email, hash, u.role, u.nisn||null, u.nip||null, u.hp, now, now]);
        } catch(e) { console.warn(`  ⚠️  Skip ${u.email}:`, e.message); }
    }

    const announcements = [
        { id:uuidv4(), judul:'PPDB Gelombang 2',  isi:'PPDB Gelombang 2 sudah dibuka — daftar sekarang!',           tipe:'info',    urutan:1 },
        { id:uuidv4(), judul:'Jadwal UKK',         isi:'Ujian Kompetensi Keahlian (UKK) dimulai 15 Mei 2026',        tipe:'warning', urutan:2 },
        { id:uuidv4(), judul:'Prestasi LKS',       isi:'LKS Tingkat Kabupaten — SMKN 1 Terisi meraih 3 medali emas', tipe:'success', urutan:3 },
        { id:uuidv4(), judul:'Jadwal PKL',         isi:'Persiapan PKL Kelas XII — Lihat jadwal di LMS',              tipe:'info',    urutan:4 },
    ];

    for (const a of announcements) {
        try {
            db.run(`INSERT OR IGNORE INTO announcements (id,judul,isi,tipe,is_active,urutan,created_at,updated_at)
                VALUES (?,?,?,?,1,?,?,?)`,
                [a.id, a.judul, a.isi, a.tipe, a.urutan, now, now]);
        } catch(e) { console.warn('  ⚠️  Skip announcement:', e.message); }
    }

    const sklRows = [
        { id:uuidv4(), nisn:'0012345678', nama:'AHMAD FARHAN MAULANA', ttl:'2008-01-15', jurusan:'Teknik Komputer & Jaringan (TKJ)', kelas:'XI TKJ 1',  tahun:'2026', ijazah:'DN-034/SMKN1T/2026', nilai:87.40 },
        { id:uuidv4(), nisn:'0023456789', nama:'SITI NURHALIZA PUTRI', ttl:'2008-03-22', jurusan:'Akuntansi & Keuangan (AKL)',       kelas:'XI AKL 1',  tahun:'2026', ijazah:'DN-057/SMKN1T/2026', nilai:91.20 },
        { id:uuidv4(), nisn:'0034567890', nama:'RIZKY ADITYA PRATAMA', ttl:'2007-11-08', jurusan:'Teknik Bisnis Sepeda Motor (TBSM)',kelas:'XI TBSM 2', tahun:'2026', ijazah:'DN-089/SMKN1T/2026', nilai:83.75 },
        { id:uuidv4(), nisn:'1234567890', nama:'BUDI SANTOSO',         ttl:'2007-05-20', jurusan:'Teknik Komputer & Jaringan (TKJ)', kelas:'XI TKJ 2',  tahun:'2025', ijazah:'DN-011/SMKN1T/2025', nilai:85.30 },
    ];

    for (const s of sklRows) {
        try {
            db.run(`INSERT OR IGNORE INTO skl_data
                (id,nisn,nama,ttl,jurusan,kelas,tahun_lulus,no_ijazah,nilai_rata,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [s.id, s.nisn, s.nama, s.ttl, s.jurusan, s.kelas, s.tahun, s.ijazah, s.nilai, now]);
        } catch(e) { console.warn('  ⚠️  Skip SKL:', e.message); }
    }

    saveDB();
    db.close();

    console.log('✅ Data awal berhasil diisi');
    console.log('');
    console.log('  Akun testing (password: Smkn1Terisi@2024):');
    console.log('  super_admin    → admin@smkn1terisi.sch.id');
    console.log('  kepala_sekolah → kepsek@smkn1terisi.sch.id');
    console.log('  guru           → deni.setiawan@smkn1terisi.sch.id');
    console.log('  tata_usaha     → tu@smkn1terisi.sch.id');
    console.log('  siswa          → NISN: 0012345678');
    console.log('  wali_murid     → supriadi@gmail.com');
}

if (require.main === module) {
    setup().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}

module.exports = { setup };

/* Export fungsi tambah tabel baru (dipanggil dari migrasi) */
async function migrate() {
    const path = require('path');
    const fs   = require('fs');
    const SQL  = await require('sql.js')();
    require('dotenv').config();

    const DB_PATH = path.resolve(
        (process.env.DB_PATH || './data/smkn1terisi').replace(/\.db$/, '') + '.bin'
    );
    if (!fs.existsSync(DB_PATH)) { console.error('DB tidak ditemukan. Jalankan setup dulu.'); return; }

    const db = new SQL.Database(fs.readFileSync(DB_PATH));

    /* Tabel siswa detail */
    db.run(`CREATE TABLE IF NOT EXISTS siswa_profil (
        id          TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL UNIQUE,
        nisn        TEXT NOT NULL,
        kelas       TEXT,
        jurusan     TEXT,
        tempat_lahir TEXT,
        tanggal_lahir TEXT,
        jenis_kelamin TEXT,
        agama       TEXT,
        alamat      TEXT,
        kelurahan   TEXT,
        kecamatan   TEXT,
        kabupaten   TEXT DEFAULT 'Indramayu',
        provinsi    TEXT DEFAULT 'Jawa Barat',
        kode_pos    TEXT,
        nama_ayah   TEXT,
        pekerjaan_ayah TEXT,
        nama_ibu    TEXT,
        pekerjaan_ibu  TEXT,
        no_hp_ortu  TEXT,
        email_ortu  TEXT,
        updated_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    /* Tabel nilai */
    db.run(`CREATE TABLE IF NOT EXISTS nilai_siswa (
        id          TEXT PRIMARY KEY,
        nisn        TEXT NOT NULL,
        semester    TEXT NOT NULL,
        mapel       TEXT NOT NULL,
        uh          REAL DEFAULT 0,
        uts         REAL DEFAULT 0,
        uas         REAL DEFAULT 0,
        tugas       REAL DEFAULT 0,
        kkm         REAL DEFAULT 70,
        created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    /* Tabel kehadiran */
    db.run(`CREATE TABLE IF NOT EXISTS kehadiran (
        id          TEXT PRIMARY KEY,
        nisn        TEXT NOT NULL,
        tanggal     TEXT NOT NULL,
        hari        TEXT,
        status      TEXT NOT NULL DEFAULT 'hadir',
        keterangan  TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    /* Tabel jadwal */
    db.run(`CREATE TABLE IF NOT EXISTS jadwal (
        id          TEXT PRIMARY KEY,
        kelas       TEXT NOT NULL,
        hari        TEXT NOT NULL,
        jam         TEXT NOT NULL,
        mapel       TEXT NOT NULL,
        guru        TEXT,
        ruang       TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    /* Tabel PPDB */
    db.run(`CREATE TABLE IF NOT EXISTS ppdb_pendaftaran (
        id              TEXT PRIMARY KEY,
        nomor_daftar    TEXT NOT NULL UNIQUE,
        jalur           TEXT NOT NULL,
        nama_lengkap    TEXT NOT NULL,
        nisn            TEXT,
        tempat_lahir    TEXT,
        tanggal_lahir   TEXT,
        jenis_kelamin   TEXT,
        asal_sekolah    TEXT,
        jurusan_pilihan TEXT,
        nama_ayah       TEXT,
        pekerjaan_ayah  TEXT,
        nama_ibu        TEXT,
        pekerjaan_ibu   TEXT,
        no_hp           TEXT,
        alamat          TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        catatan         TEXT,
        jarak_km        REAL,
        created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    /* Seed nilai untuk siswa default */
    const { v4: uuidv4 } = require('uuid');
    const now = new Date().toISOString();

    const nilaiData = [
        { mapel:'Teknik Komputer Jaringan', uh:90, uts:86, uas:88, tugas:92, kkm:75 },
        { mapel:'Matematika',               uh:78, uts:80, uas:82, tugas:85, kkm:70 },
        { mapel:'Bahasa Indonesia',         uh:88, uts:90, uas:85, tugas:92, kkm:70 },
        { mapel:'Bahasa Inggris',           uh:82, uts:85, uas:88, tugas:90, kkm:70 },
        { mapel:'PKn',                      uh:85, uts:88, uas:86, tugas:88, kkm:70 },
        { mapel:'Sejarah Indonesia',        uh:80, uts:82, uas:84, tugas:86, kkm:70 },
        { mapel:'Produk Kreatif & KWU',     uh:87, uts:89, uas:91, tugas:93, kkm:75 },
    ];

    for (const n of nilaiData) {
        try {
            db.run(`INSERT OR IGNORE INTO nilai_siswa (id,nisn,semester,mapel,uh,uts,uas,tugas,kkm,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)`,
                [uuidv4(),'0012345678','genap',n.mapel,n.uh,n.uts,n.uas,n.tugas,n.kkm,now]);
        } catch(e) {}
    }

    /* Seed profil siswa default */
    try {
        db.run(`INSERT OR IGNORE INTO siswa_profil
            (id,user_id,nisn,kelas,jurusan,tempat_lahir,tanggal_lahir,jenis_kelamin,agama,
             alamat,kelurahan,kecamatan,nama_ayah,pekerjaan_ayah,nama_ibu,pekerjaan_ibu,
             no_hp_ortu,email_ortu,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [uuidv4(),'__nisn_0012345678__','0012345678','XI TKJ 1','Teknik Komputer & Jaringan',
             'Indramayu','2008-01-15','Laki-laki','Islam',
             'Jl. Raya Terisi No. 45 RT 02 RW 05','Terisi','Terisi',
             'Supriadi','Wiraswasta','Siti Aminah','Ibu Rumah Tangga',
             '0811-2233-4455','supriadi@email.com',now]);
    } catch(e) {}

    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    db.close();

    console.log('✅ Migrasi selesai: tabel siswa_profil, nilai_siswa, kehadiran, jadwal, ppdb_pendaftaran dibuat.');
}

if (require.main === module) {
    const arg = process.argv[2];
    if (arg === '--migrate') {
        migrate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
    } else {
        setup().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
    }
}

module.exports = { setup, migrate };
