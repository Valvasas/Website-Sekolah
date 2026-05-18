// routes/users.js
'use strict';

const express  = require('express');
const router   = express.Router();
const ctrl     = require('../controllers/userController');
const { authenticate, isAdmin, isStaff, isSelfOrAdmin } = require('../middleware/auth');
const { registerRules, handleValidation } = require('../middleware/validate');

router.use(authenticate);

router.get('/',                isStaff,       ctrl.getAllUsers);
router.get('/stats',           isAdmin,       ctrl.getUserStats);
router.get('/audit-logs',      isAdmin,       ctrl.getAuditLogs);
router.get('/:id',             isSelfOrAdmin, ctrl.getUserById);
router.post('/',               isAdmin,       registerRules, handleValidation, ctrl.createUser);
router.put('/:id',             isSelfOrAdmin, ctrl.updateUser);
router.delete('/:id',          isAdmin,       ctrl.deactivateUser);
router.patch('/:id/activate',  isAdmin,       ctrl.activateUser);

module.exports = router;
