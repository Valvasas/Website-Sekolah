'use strict';

function ensureCbtFoundationSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS questions (
            id TEXT PRIMARY KEY,
            subject TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'multiple_choice',
            prompt TEXT NOT NULL,
            explanation TEXT,
            difficulty TEXT NOT NULL DEFAULT 'medium',
            tags TEXT,
            metadata_json TEXT,
            created_by TEXT,
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS question_options (
            id TEXT PRIMARY KEY,
            question_id TEXT NOT NULL,
            option_key TEXT NOT NULL,
            option_text TEXT NOT NULL,
            is_correct INTEGER NOT NULL DEFAULT 0,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(question_id, option_key),
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS exams (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            subject TEXT NOT NULL,
            kelas TEXT,
            description TEXT,
            duration_minutes INTEGER NOT NULL DEFAULT 90,
            status TEXT NOT NULL DEFAULT 'draft',
            shuffle_questions INTEGER NOT NULL DEFAULT 0,
            shuffle_options INTEGER NOT NULL DEFAULT 0,
            start_at TEXT,
            end_at TEXT,
            created_by TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS exam_questions (
            id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            points REAL NOT NULL DEFAULT 1,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(exam_id, question_id),
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT
        );

        CREATE TABLE IF NOT EXISTS exam_participants (
            id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            user_id TEXT,
            nisn TEXT,
            kelas TEXT,
            status TEXT NOT NULL DEFAULT 'assigned',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(exam_id, user_id),
            UNIQUE(exam_id, nisn),
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS exam_attempts (
            id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            participant_id TEXT,
            user_id TEXT,
            nisn TEXT,
            status TEXT NOT NULL DEFAULT 'in_progress',
            started_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            finished_at TEXT,
            last_seen_at TEXT,
            device_fingerprint TEXT,
            ip_address TEXT,
            user_agent TEXT,
            score REAL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
            FOREIGN KEY (participant_id) REFERENCES exam_participants(id) ON DELETE SET NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS student_answers (
            id TEXT PRIMARY KEY,
            attempt_id TEXT NOT NULL,
            question_id TEXT NOT NULL,
            option_id TEXT,
            answer_text TEXT,
            is_correct INTEGER,
            revision INTEGER NOT NULL DEFAULT 1,
            source TEXT NOT NULL DEFAULT 'autosave',
            answered_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            UNIQUE(attempt_id, question_id),
            FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE CASCADE,
            FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE RESTRICT,
            FOREIGN KEY (option_id) REFERENCES question_options(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS exam_activity_logs (
            id TEXT PRIMARY KEY,
            exam_id TEXT NOT NULL,
            attempt_id TEXT,
            user_id TEXT,
            actor_role TEXT,
            event_type TEXT NOT NULL,
            severity TEXT NOT NULL DEFAULT 'info',
            message TEXT,
            metadata_json TEXT,
            ip_address TEXT,
            user_agent TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
            FOREIGN KEY (attempt_id) REFERENCES exam_attempts(id) ON DELETE SET NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject, is_active);
        CREATE INDEX IF NOT EXISTS idx_question_options_question ON question_options(question_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_exams_status ON exams(status, subject, kelas);
        CREATE INDEX IF NOT EXISTS idx_exam_questions_exam ON exam_questions(exam_id, sort_order);
        CREATE INDEX IF NOT EXISTS idx_exam_participants_exam ON exam_participants(exam_id, status);
        CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam ON exam_attempts(exam_id, status);
        CREATE INDEX IF NOT EXISTS idx_exam_attempts_user ON exam_attempts(user_id, status);
        CREATE INDEX IF NOT EXISTS idx_student_answers_attempt ON student_answers(attempt_id, question_id);
        CREATE INDEX IF NOT EXISTS idx_exam_activity_logs_exam ON exam_activity_logs(exam_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_exam_activity_logs_attempt ON exam_activity_logs(attempt_id, created_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_one_active_user
            ON exam_attempts(exam_id, user_id)
            WHERE user_id IS NOT NULL AND status IN ('in_progress', 'paused');
        CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_one_active_nisn
            ON exam_attempts(exam_id, nisn)
            WHERE nisn IS NOT NULL AND status IN ('in_progress', 'paused');
    `);
}

module.exports = { ensureCbtFoundationSchema };
