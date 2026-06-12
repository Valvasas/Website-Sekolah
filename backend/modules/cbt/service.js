'use strict';

const repo = require('./repository');

function assertFound(record, message) {
    if (!record) {
        const err = new Error(message);
        err.status = 404;
        throw err;
    }
    return record;
}

function assertAttemptAccess(attempt, user) {
    if (!attempt) return;
    const staffRoles = ['super_admin', 'kepala_sekolah', 'wakil_kepala_sekolah', 'guru', 'tata_usaha'];
    if (staffRoles.includes(user.role)) return;
    if (user.role === 'siswa' && (attempt.user_id === user.sub || attempt.nisn === user.nisn)) return;
    const err = new Error('Attempt ini bukan milik akun siswa yang sedang login.');
    err.status = 403;
    throw err;
}

function createQuestion(payload, user) {
    return repo.createQuestion(payload, user.sub);
}

function createExam(payload, user) {
    return repo.createExam(payload, user.sub);
}

function assignQuestion(examId, payload) {
    assertFound(repo.getExam(examId), 'Exam tidak ditemukan.');
    assertFound(repo.getQuestion(payload.question_id), 'Question tidak ditemukan.');
    return repo.assignQuestionToExam(examId, payload);
}

function addParticipant(examId, payload) {
    assertFound(repo.getExam(examId), 'Exam tidak ditemukan.');
    return repo.addParticipant(examId, payload);
}

function startAttempt(examId, payload, user, reqMeta) {
    const exam = assertFound(repo.getExam(examId), 'Exam tidak ditemukan.');
    if (!['scheduled', 'open'].includes(exam.status) && user.role === 'siswa') {
        const err = new Error('Ujian belum dibuka untuk siswa.');
        err.status = 403;
        throw err;
    }
    const nisn = payload.nisn || user.nisn || null;
    const participant = payload.participant_id
        ? { id: payload.participant_id }
        : repo.findParticipant(examId, user.sub, nisn);

    if (user.role === 'siswa' && !participant) {
        const err = new Error('Siswa belum terdaftar sebagai peserta ujian.');
        err.status = 403;
        throw err;
    }

    return repo.createAttempt(examId, {
        participant_id: participant?.id || null,
        user_id: user.role === 'siswa' ? user.sub : (payload.user_id || null),
        nisn,
        device_fingerprint: payload.device_fingerprint || null,
    }, reqMeta);
}

function saveAnswer(attemptId, questionId, payload, user) {
    const attempt = assertFound(repo.getAttempt(attemptId), 'Attempt tidak ditemukan.');
    assertAttemptAccess(attempt, user);
    assertFound(repo.getQuestion(questionId), 'Question tidak ditemukan.');
    return repo.saveAnswer(attempt, questionId, payload);
}

function createActivity(attemptId, payload, user, reqMeta) {
    const attempt = assertFound(repo.getAttempt(attemptId), 'Attempt tidak ditemukan.');
    assertAttemptAccess(attempt, user);
    return repo.createActivityLog({
        exam_id: attempt.exam_id,
        attempt_id: attempt.id,
        user_id: user.sub,
        actor_role: user.role,
        event_type: payload.event_type,
        severity: payload.severity || 'info',
        message: payload.message || null,
        metadata: payload.metadata || {},
    }, reqMeta);
}

module.exports = {
    listQuestions: repo.listQuestions,
    getQuestion: repo.getQuestion,
    createQuestion,
    listExams: repo.listExams,
    getExam: repo.getExam,
    createExam,
    assignQuestion,
    addParticipant,
    startAttempt,
    saveAnswer,
    createActivity,
    listActivityLogs: repo.listActivityLogs,
};
