'use strict';

const { v4: uuidv4 } = require('uuid');
const getDB = require('../../config/database');

function nowISO() {
    return new Date().toISOString();
}

function encodeJson(value) {
    if (value === undefined || value === null) return null;
    return JSON.stringify(value);
}

function decodeJson(value, fallback) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch (_err) {
        return fallback;
    }
}

function mapQuestion(row, options = []) {
    if (!row) return null;
    return {
        ...row,
        is_active: Boolean(row.is_active),
        tags: decodeJson(row.tags, []),
        metadata: decodeJson(row.metadata_json, {}),
        options,
    };
}

function listQuestions(filters = {}) {
    const db = getDB();
    const where = ['q.is_active = 1'];
    const params = {};
    if (filters.subject) {
        where.push('q.subject = @subject');
        params.subject = filters.subject;
    }
    if (filters.type) {
        where.push('q.type = @type');
        params.type = filters.type;
    }
    const rows = db.prepare(`
        SELECT q.*
        FROM questions q
        WHERE ${where.join(' AND ')}
        ORDER BY q.created_at DESC
        LIMIT 100
    `).all(params);
    return rows.map(row => mapQuestion(row));
}

function getQuestion(id) {
    const db = getDB();
    const question = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
    if (!question) return null;
    const options = db.prepare(`
        SELECT id, question_id, option_key, option_text, is_correct, sort_order
        FROM question_options
        WHERE question_id = ?
        ORDER BY sort_order ASC, option_key ASC
    `).all(id).map(option => ({ ...option, is_correct: Boolean(option.is_correct) }));
    return mapQuestion(question, options);
}

function createQuestion(payload, userId) {
    const db = getDB();
    const questionId = uuidv4();
    const now = nowISO();
    const insertQuestion = db.prepare(`
        INSERT INTO questions
            (id, subject, type, prompt, explanation, difficulty, tags, metadata_json, created_by, created_at, updated_at)
        VALUES
            (@id, @subject, @type, @prompt, @explanation, @difficulty, @tags, @metadata, @createdBy, @now, @now)
    `);
    const insertOption = db.prepare(`
        INSERT INTO question_options
            (id, question_id, option_key, option_text, is_correct, sort_order)
        VALUES
            (@id, @questionId, @key, @text, @correct, @sortOrder)
    `);

    db.transaction(() => {
        insertQuestion.run({
            id: questionId,
            subject: payload.subject,
            type: payload.type || 'multiple_choice',
            prompt: payload.prompt,
            explanation: payload.explanation || null,
            difficulty: payload.difficulty || 'medium',
            tags: encodeJson(payload.tags || []),
            metadata: encodeJson(payload.metadata || {}),
            createdBy: userId || null,
            now,
        });
        (payload.options || []).forEach((option, index) => {
            insertOption.run({
                id: uuidv4(),
                questionId,
                key: String(option.key || String.fromCharCode(65 + index)).toUpperCase(),
                text: option.text,
                correct: option.is_correct ? 1 : 0,
                sortOrder: index,
            });
        });
    })();

    return getQuestion(questionId);
}

function listExams(filters = {}) {
    const db = getDB();
    const where = ['1 = 1'];
    const params = {};
    if (filters.status) {
        where.push('e.status = @status');
        params.status = filters.status;
    }
    if (filters.subject) {
        where.push('e.subject = @subject');
        params.subject = filters.subject;
    }
    return db.prepare(`
        SELECT e.*,
               COUNT(DISTINCT eq.question_id) AS question_count,
               COUNT(DISTINCT ep.id) AS participant_count
        FROM exams e
        LEFT JOIN exam_questions eq ON eq.exam_id = e.id
        LEFT JOIN exam_participants ep ON ep.exam_id = e.id
        WHERE ${where.join(' AND ')}
        GROUP BY e.id
        ORDER BY e.created_at DESC
        LIMIT 100
    `).all(params).map(row => ({
        ...row,
        shuffle_questions: Boolean(row.shuffle_questions),
        shuffle_options: Boolean(row.shuffle_options),
    }));
}

function getExam(id) {
    const db = getDB();
    return db.prepare('SELECT * FROM exams WHERE id = ?').get(id);
}

function createExam(payload, userId) {
    const db = getDB();
    const id = uuidv4();
    const now = nowISO();
    db.prepare(`
        INSERT INTO exams
            (id, title, subject, kelas, description, duration_minutes, status, shuffle_questions, shuffle_options, start_at, end_at, created_by, created_at, updated_at)
        VALUES
            (@id, @title, @subject, @kelas, @description, @duration, @status, @shuffleQuestions, @shuffleOptions, @startAt, @endAt, @createdBy, @now, @now)
    `).run({
        id,
        title: payload.title,
        subject: payload.subject,
        kelas: payload.kelas || null,
        description: payload.description || null,
        duration: payload.duration_minutes || 90,
        status: payload.status || 'draft',
        shuffleQuestions: payload.shuffle_questions ? 1 : 0,
        shuffleOptions: payload.shuffle_options ? 1 : 0,
        startAt: payload.start_at || null,
        endAt: payload.end_at || null,
        createdBy: userId || null,
        now,
    });
    return getExam(id);
}

function assignQuestionToExam(examId, payload) {
    const db = getDB();
    const id = uuidv4();
    db.prepare(`
        INSERT INTO exam_questions (id, exam_id, question_id, points, sort_order)
        VALUES (@id, @examId, @questionId, @points, @sortOrder)
    `).run({
        id,
        examId,
        questionId: payload.question_id,
        points: payload.points ?? 1,
        sortOrder: payload.sort_order ?? 0,
    });
    return db.prepare('SELECT * FROM exam_questions WHERE id = ?').get(id);
}

function addParticipant(examId, payload) {
    const db = getDB();
    const id = uuidv4();
    db.prepare(`
        INSERT INTO exam_participants (id, exam_id, user_id, nisn, kelas)
        VALUES (@id, @examId, @userId, @nisn, @kelas)
    `).run({
        id,
        examId,
        userId: payload.user_id || null,
        nisn: payload.nisn || null,
        kelas: payload.kelas || null,
    });
    return db.prepare('SELECT * FROM exam_participants WHERE id = ?').get(id);
}

function findParticipant(examId, userId, nisn) {
    const db = getDB();
    if (userId) {
        const byUser = db.prepare('SELECT * FROM exam_participants WHERE exam_id = ? AND user_id = ?').get(examId, userId);
        if (byUser) return byUser;
    }
    if (nisn) {
        return db.prepare('SELECT * FROM exam_participants WHERE exam_id = ? AND nisn = ?').get(examId, nisn);
    }
    return null;
}

function createAttempt(examId, payload, reqMeta = {}) {
    const db = getDB();
    const existing = db.prepare(`
        SELECT * FROM exam_attempts
        WHERE exam_id = @examId
          AND status IN ('in_progress', 'paused')
          AND ((@userId IS NOT NULL AND user_id = @userId) OR (@nisn IS NOT NULL AND nisn = @nisn))
        LIMIT 1
    `).get({ examId, userId: payload.user_id || null, nisn: payload.nisn || null });
    if (existing) return { attempt: existing, reused: true };

    const id = uuidv4();
    const now = nowISO();
    db.prepare(`
        INSERT INTO exam_attempts
            (id, exam_id, participant_id, user_id, nisn, status, started_at, last_seen_at, device_fingerprint, ip_address, user_agent, created_at, updated_at)
        VALUES
            (@id, @examId, @participantId, @userId, @nisn, 'in_progress', @now, @now, @device, @ip, @agent, @now, @now)
    `).run({
        id,
        examId,
        participantId: payload.participant_id || null,
        userId: payload.user_id || null,
        nisn: payload.nisn || null,
        device: payload.device_fingerprint || null,
        ip: reqMeta.ip || null,
        agent: reqMeta.userAgent || null,
        now,
    });
    return { attempt: db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(id), reused: false };
}

function getAttempt(id) {
    const db = getDB();
    return db.prepare('SELECT * FROM exam_attempts WHERE id = ?').get(id);
}

function saveAnswer(attempt, questionId, payload) {
    const db = getDB();
    const existing = db.prepare('SELECT * FROM student_answers WHERE attempt_id = ? AND question_id = ?').get(attempt.id, questionId);
    const now = nowISO();
    let isCorrect = null;
    if (payload.option_id) {
        const option = db.prepare('SELECT is_correct FROM question_options WHERE id = ? AND question_id = ?').get(payload.option_id, questionId);
        if (option) isCorrect = option.is_correct ? 1 : 0;
    }
    if (existing) {
        db.prepare(`
            UPDATE student_answers
            SET option_id = @optionId,
                answer_text = @answerText,
                is_correct = @isCorrect,
                revision = revision + 1,
                source = @source,
                answered_at = @now,
                updated_at = @now
            WHERE id = @id
        `).run({
            id: existing.id,
            optionId: payload.option_id || null,
            answerText: payload.answer_text || null,
            isCorrect,
            source: payload.source || 'autosave',
            now,
        });
        db.prepare('UPDATE exam_attempts SET last_seen_at = ?, updated_at = ? WHERE id = ?').run(now, now, attempt.id);
        return db.prepare('SELECT * FROM student_answers WHERE id = ?').get(existing.id);
    }
    const id = uuidv4();
    db.prepare(`
        INSERT INTO student_answers
            (id, attempt_id, question_id, option_id, answer_text, is_correct, source, answered_at, created_at, updated_at)
        VALUES
            (@id, @attemptId, @questionId, @optionId, @answerText, @isCorrect, @source, @now, @now, @now)
    `).run({
        id,
        attemptId: attempt.id,
        questionId,
        optionId: payload.option_id || null,
        answerText: payload.answer_text || null,
        isCorrect,
        source: payload.source || 'autosave',
        now,
    });
    db.prepare('UPDATE exam_attempts SET last_seen_at = ?, updated_at = ? WHERE id = ?').run(now, now, attempt.id);
    return db.prepare('SELECT * FROM student_answers WHERE id = ?').get(id);
}

function createActivityLog(input, reqMeta = {}) {
    const db = getDB();
    const id = uuidv4();
    db.prepare(`
        INSERT INTO exam_activity_logs
            (id, exam_id, attempt_id, user_id, actor_role, event_type, severity, message, metadata_json, ip_address, user_agent)
        VALUES
            (@id, @examId, @attemptId, @userId, @actorRole, @eventType, @severity, @message, @metadata, @ip, @agent)
    `).run({
        id,
        examId: input.exam_id,
        attemptId: input.attempt_id || null,
        userId: input.user_id || null,
        actorRole: input.actor_role || null,
        eventType: input.event_type,
        severity: input.severity || 'info',
        message: input.message || null,
        metadata: encodeJson(input.metadata || {}),
        ip: reqMeta.ip || null,
        agent: reqMeta.userAgent || null,
    });
    return db.prepare('SELECT * FROM exam_activity_logs WHERE id = ?').get(id);
}

function listActivityLogs(examId) {
    const db = getDB();
    return db.prepare(`
        SELECT *
        FROM exam_activity_logs
        WHERE exam_id = ?
        ORDER BY created_at DESC
        LIMIT 200
    `).all(examId).map(row => ({ ...row, metadata: decodeJson(row.metadata_json, {}) }));
}

module.exports = {
    listQuestions,
    getQuestion,
    createQuestion,
    listExams,
    getExam,
    createExam,
    assignQuestionToExam,
    addParticipant,
    findParticipant,
    createAttempt,
    getAttempt,
    saveAnswer,
    createActivityLog,
    listActivityLogs,
};
