'use strict';

const CBT_ADMIN_ROLES = ['super_admin', 'kepala_sekolah', 'wakil_kepala_sekolah'];
const CBT_STAFF_ROLES = [...CBT_ADMIN_ROLES, 'guru', 'tata_usaha'];
const CBT_STUDENT_ROLES = ['siswa'];

function requireCbtRole(roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ success: false, message: 'Autentikasi diperlukan.' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Akses CBT ditolak untuk role ini.',
                yourRole: req.user.role,
                allowedRoles: roles,
            });
        }
        next();
    };
}

const requireCbtStaff = requireCbtRole(CBT_STAFF_ROLES);
const requireCbtStudent = requireCbtRole(CBT_STUDENT_ROLES);
const requireCbtUser = requireCbtRole([...CBT_STAFF_ROLES, ...CBT_STUDENT_ROLES]);

module.exports = {
    CBT_ADMIN_ROLES,
    CBT_STAFF_ROLES,
    CBT_STUDENT_ROLES,
    requireCbtRole,
    requireCbtStaff,
    requireCbtStudent,
    requireCbtUser,
};
