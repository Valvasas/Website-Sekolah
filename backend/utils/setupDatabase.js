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
            answer_type TEXT DEFAULT 'multiple_choice',
            is_correct INTEGER,
            keyword_hits TEXT,
            answered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(session_id, question_id)
        );
        CREATE TABLE IF NOT EXISTS cbt_messages (
            id TEXT PRIMARY KEY,
            exam_id TEXT,
            session_id TEXT,
            nisn TEXT,
            sender_role TEXT NOT NULL,
            sender_name TEXT,
            message_type TEXT NOT NULL DEFAULT 'student_help',
            message TEXT NOT NULL,
            created_by TEXT,
            read_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS cbt_sessions (
            id TEXT PRIMARY KEY, exam_id TEXT, nisn TEXT NOT NULL, mapel TEXT NOT NULL,
            token TEXT NOT NULL UNIQUE, used INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'issued',
            token_scope TEXT NOT NULL DEFAULT 'individual',
            kelas TEXT,
            class_token_id TEXT,
            start_time TEXT, end_time TEXT,
            last_seen_at TEXT, location_lat TEXT, location_lng TEXT,
            device_info TEXT, browser_info TEXT, network_mbps REAL,
            camera_status TEXT, screen_status TEXT,
            progress_answered INTEGER DEFAULT 0, progress_total INTEGER DEFAULT 0,
            current_question INTEGER DEFAULT 0, violation_count INTEGER DEFAULT 0,
            last_camera_frame TEXT, last_screen_frame TEXT,
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
            question_type TEXT NOT NULL DEFAULT 'multiple_choice',
            soal TEXT NOT NULL,
            opsi_a TEXT, opsi_b TEXT,
            opsi_c TEXT, opsi_d TEXT,
            opsi_e TEXT,
            jawaban TEXT,
            essay_keywords TEXT,
            essay_min_words INTEGER NOT NULL DEFAULT 0,
            media_type TEXT,
            media_url TEXT,
            media_alt TEXT,
            canvas_data TEXT,
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
            assignment_group_id TEXT,
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
        CREATE TABLE IF NOT EXISTS website_contents (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            placement TEXT DEFAULT 'general',
            title TEXT NOT NULL,
            excerpt TEXT,
            body TEXT,
            image_url TEXT,
            link_url TEXT,
            category TEXT,
            icon TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS forum_posts (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            mapel TEXT,
            visibility TEXT NOT NULL DEFAULT 'school',
            kelas TEXT,
            konten TEXT NOT NULL,
            parent_id TEXT,
            likes INTEGER NOT NULL DEFAULT 0,
            attachment_url TEXT,
            attachment_name TEXT,
            attachment_type TEXT,
            is_pinned INTEGER NOT NULL DEFAULT 0,
            pinned_at TEXT,
            pinned_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS forum_likes (
            user_id TEXT NOT NULL,
            post_id TEXT NOT NULL,
            PRIMARY KEY(user_id, post_id)
        );
        CREATE TABLE IF NOT EXISTS lms_private_messages (
            id TEXT PRIMARY KEY,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            message TEXT NOT NULL,
            read_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS kantin_products (
            id TEXT PRIMARY KEY,
            seller_id TEXT NOT NULL,
            seller_nisn TEXT,
            name TEXT NOT NULL,
            description TEXT,
            category TEXT,
            tags TEXT,
            price INTEGER NOT NULL,
            stock INTEGER NOT NULL DEFAULT 0,
            image_url TEXT,
            chat_contact TEXT,
            emoney_provider TEXT,
            emoney_account TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS kantin_profiles (
            user_id TEXT PRIMARY KEY,
            nisn TEXT,
            selling_focus TEXT,
            payment_methods TEXT,
            target_market TEXT,
            hobbies TEXT,
            preferences TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS kantin_orders (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            buyer_id TEXT NOT NULL,
            buyer_nisn TEXT,
            seller_id TEXT NOT NULL,
            quantity INTEGER NOT NULL DEFAULT 1,
            total_price INTEGER NOT NULL,
            note TEXT,
            payment_method TEXT NOT NULL DEFAULT 'e-money',
            payment_reference TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS kantin_chats (
            id TEXT PRIMARY KEY,
            order_id TEXT,
            product_id TEXT,
            sender_id TEXT NOT NULL,
            receiver_id TEXT NOT NULL,
            message TEXT NOT NULL,
            attachment_url TEXT,
            attachment_name TEXT,
            attachment_type TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE TABLE IF NOT EXISTS kantin_reviews (
            id TEXT PRIMARY KEY,
            product_id TEXT NOT NULL,
            seller_id TEXT NOT NULL,
            reviewer_id TEXT NOT NULL,
            reviewer_nisn TEXT,
            rating INTEGER NOT NULL,
            comment TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(product_id, reviewer_id)
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
    if (!sessionCols.includes('last_seen_at')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN last_seen_at TEXT');
    if (!sessionCols.includes('location_lat')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN location_lat TEXT');
    if (!sessionCols.includes('location_lng')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN location_lng TEXT');
    if (!sessionCols.includes('device_info')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN device_info TEXT');
    if (!sessionCols.includes('browser_info')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN browser_info TEXT');
    if (!sessionCols.includes('network_mbps')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN network_mbps REAL');
    if (!sessionCols.includes('camera_status')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN camera_status TEXT');
    if (!sessionCols.includes('screen_status')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN screen_status TEXT');
    if (!sessionCols.includes('progress_answered')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN progress_answered INTEGER DEFAULT 0');
    if (!sessionCols.includes('progress_total')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN progress_total INTEGER DEFAULT 0');
    if (!sessionCols.includes('current_question')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN current_question INTEGER DEFAULT 0');
    if (!sessionCols.includes('violation_count')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN violation_count INTEGER DEFAULT 0');
    if (!sessionCols.includes('last_camera_frame')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN last_camera_frame TEXT');
    if (!sessionCols.includes('last_screen_frame')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN last_screen_frame TEXT');
    if (!sessionCols.includes('token_scope')) db.exec("ALTER TABLE cbt_sessions ADD COLUMN token_scope TEXT NOT NULL DEFAULT 'individual'");
    if (!sessionCols.includes('kelas')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN kelas TEXT');
    if (!sessionCols.includes('class_token_id')) db.exec('ALTER TABLE cbt_sessions ADD COLUMN class_token_id TEXT');

    const resultCols = db.pragma('table_info(cbt_results)').map(c => c.name);
    if (!resultCols.includes('exam_id')) db.exec('ALTER TABLE cbt_results ADD COLUMN exam_id TEXT');
    if (!resultCols.includes('session_id')) db.exec('ALTER TABLE cbt_results ADD COLUMN session_id TEXT');
    if (!resultCols.includes('essay_correct')) db.exec('ALTER TABLE cbt_results ADD COLUMN essay_correct INTEGER DEFAULT 0');
    if (!resultCols.includes('essay_pending')) db.exec('ALTER TABLE cbt_results ADD COLUMN essay_pending INTEGER DEFAULT 0');

    const bankCols = db.pragma('table_info(bank_soal)').map(c => c.name);
    if (!bankCols.includes('question_type')) db.exec("ALTER TABLE bank_soal ADD COLUMN question_type TEXT NOT NULL DEFAULT 'multiple_choice'");
    if (!bankCols.includes('essay_keywords')) db.exec('ALTER TABLE bank_soal ADD COLUMN essay_keywords TEXT');
    if (!bankCols.includes('essay_min_words')) db.exec('ALTER TABLE bank_soal ADD COLUMN essay_min_words INTEGER NOT NULL DEFAULT 0');
    if (!bankCols.includes('media_type')) db.exec('ALTER TABLE bank_soal ADD COLUMN media_type TEXT');
    if (!bankCols.includes('media_url')) db.exec('ALTER TABLE bank_soal ADD COLUMN media_url TEXT');
    if (!bankCols.includes('media_alt')) db.exec('ALTER TABLE bank_soal ADD COLUMN media_alt TEXT');
    if (!bankCols.includes('canvas_data')) db.exec('ALTER TABLE bank_soal ADD COLUMN canvas_data TEXT');

    const kantinProductCols = db.pragma('table_info(kantin_products)').map(c => c.name);
    if (!kantinProductCols.includes('category')) db.exec('ALTER TABLE kantin_products ADD COLUMN category TEXT');
    if (!kantinProductCols.includes('tags')) db.exec('ALTER TABLE kantin_products ADD COLUMN tags TEXT');

    const forumCols = db.pragma('table_info(forum_posts)').map(c => c.name);
    if (!forumCols.includes('attachment_url')) db.exec('ALTER TABLE forum_posts ADD COLUMN attachment_url TEXT');
    if (!forumCols.includes('attachment_name')) db.exec('ALTER TABLE forum_posts ADD COLUMN attachment_name TEXT');
    if (!forumCols.includes('attachment_type')) db.exec('ALTER TABLE forum_posts ADD COLUMN attachment_type TEXT');
    if (!forumCols.includes('visibility')) db.exec("ALTER TABLE forum_posts ADD COLUMN visibility TEXT NOT NULL DEFAULT 'school'");
    if (!forumCols.includes('kelas')) db.exec('ALTER TABLE forum_posts ADD COLUMN kelas TEXT');
    if (!forumCols.includes('is_pinned')) db.exec('ALTER TABLE forum_posts ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0');
    if (!forumCols.includes('pinned_at')) db.exec('ALTER TABLE forum_posts ADD COLUMN pinned_at TEXT');
    if (!forumCols.includes('pinned_by')) db.exec('ALTER TABLE forum_posts ADD COLUMN pinned_by TEXT');

    const taskCols = db.pragma('table_info(tugas_kelas)').map(c => c.name);
    if (!taskCols.includes('assignment_group_id')) db.exec('ALTER TABLE tugas_kelas ADD COLUMN assignment_group_id TEXT');

    const kantinChatCols = db.pragma('table_info(kantin_chats)').map(c => c.name);
    if (!kantinChatCols.includes('attachment_url')) db.exec('ALTER TABLE kantin_chats ADD COLUMN attachment_url TEXT');
    if (!kantinChatCols.includes('attachment_name')) db.exec('ALTER TABLE kantin_chats ADD COLUMN attachment_name TEXT');
    if (!kantinChatCols.includes('attachment_type')) db.exec('ALTER TABLE kantin_chats ADD COLUMN attachment_type TEXT');

    const answerCols = db.pragma('table_info(cbt_answers)').map(c => c.name);
    if (!answerCols.includes('answer_type')) db.exec("ALTER TABLE cbt_answers ADD COLUMN answer_type TEXT DEFAULT 'multiple_choice'");
    if (!answerCols.includes('keyword_hits')) db.exec('ALTER TABLE cbt_answers ADD COLUMN keyword_hits TEXT');

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cbt_sessions_token   ON cbt_sessions(token);
        CREATE INDEX IF NOT EXISTS idx_cbt_sessions_nisn    ON cbt_sessions(nisn);
        CREATE INDEX IF NOT EXISTS idx_cbt_sessions_exam    ON cbt_sessions(exam_id, nisn);
        CREATE INDEX IF NOT EXISTS idx_cbt_sessions_seen    ON cbt_sessions(exam_id, last_seen_at);
        CREATE INDEX IF NOT EXISTS idx_cbt_exams_status     ON cbt_exams(status, kelas, mapel);
        CREATE INDEX IF NOT EXISTS idx_cbt_exam_questions   ON cbt_exam_questions(exam_id, urutan);
        CREATE INDEX IF NOT EXISTS idx_cbt_answers_session  ON cbt_answers(session_id, question_id);
        CREATE INDEX IF NOT EXISTS idx_cbt_results_exam     ON cbt_results(exam_id, nisn);
        CREATE INDEX IF NOT EXISTS idx_cbt_messages_exam    ON cbt_messages(exam_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_cbt_messages_student ON cbt_messages(nisn, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_users_nisn           ON users(nisn) WHERE nisn IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email) WHERE email IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_siswa_profil_nisn_unique ON siswa_profil(nisn);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_user      ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created   ON audit_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_kehadiran_nisn       ON kehadiran(nisn, tanggal);
        CREATE INDEX IF NOT EXISTS idx_nilai_nisn           ON nilai_siswa(nisn, semester);
        CREATE INDEX IF NOT EXISTS idx_notifikasi_user      ON notifikasi(user_id, is_read);
        CREATE INDEX IF NOT EXISTS idx_forum_user           ON forum_posts(user_id);
        CREATE INDEX IF NOT EXISTS idx_forum_scope          ON forum_posts(visibility, kelas, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_forum_pinned         ON forum_posts(is_pinned, pinned_at DESC);
        CREATE INDEX IF NOT EXISTS idx_tugas_group          ON tugas_kelas(assignment_group_id, kelas, mapel);
        CREATE INDEX IF NOT EXISTS idx_tugas_creator        ON tugas_kelas(created_by, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_lms_pm_pair          ON lms_private_messages(sender_id, receiver_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_lms_pm_receiver      ON lms_private_messages(receiver_id, read_at, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_submission_tugas     ON submission_tugas(tugas_id, nisn);
        CREATE INDEX IF NOT EXISTS idx_website_contents     ON website_contents(type, placement, is_active, sort_order);
        CREATE INDEX IF NOT EXISTS idx_kantin_products      ON kantin_products(status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_kantin_products_cat  ON kantin_products(status, category, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_kantin_orders_buyer  ON kantin_orders(buyer_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_kantin_orders_seller ON kantin_orders(seller_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_kantin_chats_order   ON kantin_chats(order_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_kantin_reviews_prod  ON kantin_reviews(product_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_kantin_reviews_seller ON kantin_reviews(seller_id, rating DESC);
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
