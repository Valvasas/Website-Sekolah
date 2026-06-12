'use strict';

const express = require('express');
const router = express.Router();
const { authenticate } = require('../../middleware/auth');
const ctrl = require('./controller');
const {
    requireCbtStaff,
    requireCbtUser,
} = require('./permissions');
const {
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
} = require('./validators');

router.get('/health', ctrl.health);

router.get(
    '/questions',
    authenticate,
    requireCbtStaff,
    listQuestionsRules,
    handleCbtValidation,
    ctrl.listQuestions
);
router.post(
    '/questions',
    authenticate,
    requireCbtStaff,
    createQuestionRules,
    handleCbtValidation,
    ctrl.createQuestion
);
router.get(
    '/questions/:id',
    authenticate,
    requireCbtStaff,
    getByIdRules,
    handleCbtValidation,
    ctrl.getQuestion
);

router.get('/exams', authenticate, requireCbtStaff, listExamsRules, handleCbtValidation, ctrl.listExams);
router.post(
    '/exams',
    authenticate,
    requireCbtStaff,
    createExamRules,
    handleCbtValidation,
    ctrl.createExam
);
router.post(
    '/exams/:examId/questions',
    authenticate,
    requireCbtStaff,
    assignQuestionRules,
    handleCbtValidation,
    ctrl.assignQuestion
);
router.post(
    '/exams/:examId/participants',
    authenticate,
    requireCbtStaff,
    addParticipantRules,
    handleCbtValidation,
    ctrl.addParticipant
);
router.post(
    '/exams/:examId/attempts',
    authenticate,
    requireCbtUser,
    startAttemptRules,
    handleCbtValidation,
    ctrl.startAttempt
);
router.get(
    '/exams/:examId/activity-logs',
    authenticate,
    requireCbtStaff,
    examIdParamRules,
    handleCbtValidation,
    ctrl.listActivityLogs
);

router.put(
    '/attempts/:attemptId/answers/:questionId',
    authenticate,
    requireCbtUser,
    saveAnswerRules,
    handleCbtValidation,
    ctrl.saveAnswer
);
router.post(
    '/attempts/:attemptId/activity-logs',
    authenticate,
    requireCbtUser,
    createActivityRules,
    handleCbtValidation,
    ctrl.createActivity
);

module.exports = router;
