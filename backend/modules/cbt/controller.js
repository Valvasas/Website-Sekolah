'use strict';

const service = require('./service');

function reqMeta(req) {
    return {
        ip: req.ip,
        userAgent: req.get('user-agent') || null,
    };
}

function send(res, data, status = 200, extra = {}) {
    return res.status(status).json({ success: true, data, ...extra });
}

function handleError(res, err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[CBT Foundation]', err);
    return res.status(status).json({
        success: false,
        message: status >= 500 ? 'Terjadi kesalahan pada modul CBT.' : err.message,
    });
}

function health(_req, res) {
    return send(res, {
        module: 'cbt-foundation',
        status: 'ready',
        tables: [
            'questions',
            'question_options',
            'exams',
            'exam_questions',
            'exam_participants',
            'exam_attempts',
            'student_answers',
            'exam_activity_logs',
        ],
    });
}

function listQuestions(req, res) {
    try {
        return send(res, service.listQuestions(req.query));
    } catch (err) {
        return handleError(res, err);
    }
}

function getQuestion(req, res) {
    try {
        const question = service.getQuestion(req.params.id);
        if (!question) return res.status(404).json({ success: false, message: 'Question tidak ditemukan.' });
        return send(res, question);
    } catch (err) {
        return handleError(res, err);
    }
}

function createQuestion(req, res) {
    try {
        return send(res, service.createQuestion(req.body, req.user), 201);
    } catch (err) {
        return handleError(res, err);
    }
}

function listExams(req, res) {
    try {
        return send(res, service.listExams(req.query));
    } catch (err) {
        return handleError(res, err);
    }
}

function createExam(req, res) {
    try {
        return send(res, service.createExam(req.body, req.user), 201);
    } catch (err) {
        return handleError(res, err);
    }
}

function assignQuestion(req, res) {
    try {
        return send(res, service.assignQuestion(req.params.examId, req.body), 201);
    } catch (err) {
        return handleError(res, err);
    }
}

function addParticipant(req, res) {
    try {
        return send(res, service.addParticipant(req.params.examId, req.body), 201);
    } catch (err) {
        return handleError(res, err);
    }
}

function startAttempt(req, res) {
    try {
        const result = service.startAttempt(req.params.examId, req.body, req.user, reqMeta(req));
        return send(res, result.attempt, result.reused ? 200 : 201, { reused: result.reused });
    } catch (err) {
        return handleError(res, err);
    }
}

function saveAnswer(req, res) {
    try {
        return send(res, service.saveAnswer(req.params.attemptId, req.params.questionId, req.body, req.user));
    } catch (err) {
        return handleError(res, err);
    }
}

function createActivity(req, res) {
    try {
        return send(res, service.createActivity(req.params.attemptId, req.body, req.user, reqMeta(req)), 201);
    } catch (err) {
        return handleError(res, err);
    }
}

function listActivityLogs(req, res) {
    try {
        return send(res, service.listActivityLogs(req.params.examId));
    } catch (err) {
        return handleError(res, err);
    }
}

module.exports = {
    health,
    listQuestions,
    getQuestion,
    createQuestion,
    listExams,
    createExam,
    assignQuestion,
    addParticipant,
    startAttempt,
    saveAnswer,
    createActivity,
    listActivityLogs,
};
