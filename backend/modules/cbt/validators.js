'use strict';

const { body, param, query, validationResult } = require('express-validator');

const VALID_QUESTION_TYPES = ['multiple_choice', 'essay'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
const VALID_EXAM_STATUS = ['draft', 'scheduled', 'open', 'closed', 'archived'];
const VALID_ATTEMPT_STATUS = ['in_progress', 'paused', 'submitted', 'expired', 'void'];
const VALID_ACTIVITY_SEVERITY = ['info', 'warning', 'critical'];

function handleCbtValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(422).json({
            success: false,
            message: 'Data CBT tidak valid.',
            errors: errors.array().map(err => ({ field: err.path, message: err.msg })),
        });
    }
    next();
}

const idParam = (name) => param(name).isUUID().withMessage(`${name} harus berupa UUID.`);

const listQuestionsRules = [
    query('subject').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Subject maksimal 120 karakter.'),
    query('type').optional({ checkFalsy: true }).isIn(VALID_QUESTION_TYPES).withMessage('Tipe soal tidak valid.'),
];

const getByIdRules = [
    idParam('id'),
];

const listExamsRules = [
    query('subject').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Subject maksimal 120 karakter.'),
    query('status').optional({ checkFalsy: true }).isIn(VALID_EXAM_STATUS).withMessage('Status ujian tidak valid.'),
];

const createQuestionRules = [
    body('subject').trim().notEmpty().withMessage('Subject wajib diisi.').isLength({ max: 120 }).withMessage('Subject maksimal 120 karakter.'),
    body('type').optional().isIn(VALID_QUESTION_TYPES).withMessage('Tipe soal tidak valid.'),
    body('prompt').trim().notEmpty().withMessage('Prompt soal wajib diisi.').isLength({ max: 8000 }).withMessage('Prompt maksimal 8000 karakter.'),
    body('explanation').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 4000 }).withMessage('Explanation maksimal 4000 karakter.'),
    body('difficulty').optional().isIn(VALID_DIFFICULTIES).withMessage('Difficulty tidak valid.'),
    body('tags').optional().isArray().withMessage('Tags harus array.'),
    body('tags.*').optional().trim().isLength({ min: 1, max: 60 }).withMessage('Tag 1-60 karakter.'),
    body('metadata').optional().isObject().withMessage('Metadata harus object.'),
    body('options').optional().isArray({ min: 2, max: 8 }).withMessage('Pilihan jawaban harus 2-8 item.'),
    body('options.*.key').optional().trim().isLength({ min: 1, max: 8 }).withMessage('Key opsi 1-8 karakter.'),
    body('options.*.text').optional().trim().notEmpty().withMessage('Teks opsi wajib diisi.').isLength({ max: 2000 }).withMessage('Teks opsi maksimal 2000 karakter.'),
    body('options.*.is_correct').optional().isBoolean().withMessage('is_correct harus boolean.'),
    body().custom((value) => {
        const type = value.type || 'multiple_choice';
        if (type === 'multiple_choice') {
            if (!Array.isArray(value.options) || value.options.length < 2) {
                throw new Error('Soal pilihan ganda wajib punya minimal 2 opsi.');
            }
            if (!value.options.some(option => option.is_correct === true || option.is_correct === 1)) {
                throw new Error('Soal pilihan ganda wajib punya satu opsi benar.');
            }
        }
        return true;
    }),
];

const createExamRules = [
    body('title').trim().notEmpty().withMessage('Judul ujian wajib diisi.').isLength({ max: 180 }).withMessage('Judul maksimal 180 karakter.'),
    body('subject').trim().notEmpty().withMessage('Subject wajib diisi.').isLength({ max: 120 }).withMessage('Subject maksimal 120 karakter.'),
    body('kelas').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('Kelas maksimal 80 karakter.'),
    body('description').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 2000 }).withMessage('Deskripsi maksimal 2000 karakter.'),
    body('duration_minutes').optional().isInt({ min: 1, max: 600 }).withMessage('Durasi harus 1-600 menit.'),
    body('status').optional().isIn(VALID_EXAM_STATUS).withMessage('Status ujian tidak valid.'),
    body('shuffle_questions').optional().isBoolean().withMessage('shuffle_questions harus boolean.'),
    body('shuffle_options').optional().isBoolean().withMessage('shuffle_options harus boolean.'),
    body('start_at').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('start_at harus ISO8601.'),
    body('end_at').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('end_at harus ISO8601.'),
];

const assignQuestionRules = [
    idParam('examId'),
    body('question_id').isUUID().withMessage('question_id harus UUID.'),
    body('points').optional().isFloat({ min: 0 }).withMessage('Poin minimal 0.'),
    body('sort_order').optional().isInt({ min: 0 }).withMessage('sort_order minimal 0.'),
];

const addParticipantRules = [
    idParam('examId'),
    body('user_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('user_id harus UUID.'),
    body('nisn').optional({ nullable: true, checkFalsy: true }).trim().isLength({ min: 5, max: 20 }).withMessage('NISN 5-20 karakter.'),
    body('kelas').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('Kelas maksimal 80 karakter.'),
    body().custom((value) => {
        if (!value.user_id && !value.nisn) throw new Error('Peserta wajib punya user_id atau nisn.');
        return true;
    }),
];

const startAttemptRules = [
    idParam('examId'),
    body('participant_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('participant_id harus UUID.'),
    body('nisn').optional({ nullable: true, checkFalsy: true }).trim().isLength({ min: 5, max: 20 }).withMessage('NISN 5-20 karakter.'),
    body('device_fingerprint').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }).withMessage('Device fingerprint maksimal 200 karakter.'),
];

const saveAnswerRules = [
    idParam('attemptId'),
    idParam('questionId'),
    body('option_id').optional({ nullable: true, checkFalsy: true }).isUUID().withMessage('option_id harus UUID.'),
    body('answer_text').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 8000 }).withMessage('Jawaban maksimal 8000 karakter.'),
    body('source').optional().isIn(['autosave', 'manual', 'submit']).withMessage('Source jawaban tidak valid.'),
    body().custom((value) => {
        if (!value.option_id && !value.answer_text) throw new Error('Jawaban wajib berisi option_id atau answer_text.');
        return true;
    }),
];

const createActivityRules = [
    idParam('attemptId'),
    body('event_type').trim().notEmpty().withMessage('event_type wajib diisi.').isLength({ max: 80 }).withMessage('event_type maksimal 80 karakter.'),
    body('severity').optional().isIn(VALID_ACTIVITY_SEVERITY).withMessage('Severity tidak valid.'),
    body('message').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 1000 }).withMessage('Message maksimal 1000 karakter.'),
    body('metadata').optional().isObject().withMessage('Metadata harus object.'),
];

const examIdParamRules = [
    idParam('examId'),
];

module.exports = {
    handleCbtValidation,
    listQuestionsRules,
    getByIdRules,
    listExamsRules,
    createQuestionRules,
    createExamRules,
    assignQuestionRules,
    addParticipantRules,
    startAttemptRules,
    saveAnswerRules,
    createActivityRules,
    examIdParamRules,
};
