'use strict';

const FULL_ACCESS = 'super_admin';

const ROLE_PERMISSIONS = {
    super_admin: {
        manageUsers: true,
        managePPDB: true,
        manageLMS: true,
        manageCBT: true,
        moderateForum: true,
        manageKantin: true,
        manageStorage: true,
        viewAudit: true,
        backupDatabase: true,
        viewReports: true,
        manageWebsiteContent: true,
    },
    content_admin: {
        manageWebsiteContent: true,
        viewReports: true,
    },
    kepala_sekolah: {
        managePPDB: false,
        manageLMS: false,
        manageCBT: false,
        moderateForum: true,
        manageKantin: false,
        viewAudit: false,
        viewReports: true,
    },
    wakil_kepala_sekolah: {
        managePPDB: false,
        manageLMS: false,
        manageCBT: false,
        moderateForum: true,
        manageKantin: false,
        viewAudit: false,
        viewReports: true,
    },
    guru: {
        manageLMS: true,
        manageCBT: true,
        moderateForum: true,
        viewReports: true,
    },
    tata_usaha: {
        managePPDB: true,
        manageWebsiteContent: true,
        viewReports: true,
    },
};

function hasPermission(userOrRole, permission) {
    const role = typeof userOrRole === 'string' ? userOrRole : userOrRole?.role;
    if (role === FULL_ACCESS) return true;
    return Boolean(ROLE_PERMISSIONS[role]?.[permission]);
}

const canManageUsers = user => hasPermission(user, 'manageUsers');
const canManagePPDB = user => hasPermission(user, 'managePPDB');
const canManageLMS = user => hasPermission(user, 'manageLMS');
const canManageCBT = user => hasPermission(user, 'manageCBT');
const canModerateForum = user => hasPermission(user, 'moderateForum');
const canManageKantin = user => hasPermission(user, 'manageKantin');
const canManageStorage = user => hasPermission(user, 'manageStorage');
const canViewAudit = user => hasPermission(user, 'viewAudit');
const canBackupDatabase = user => hasPermission(user, 'backupDatabase');
const canViewReports = user => hasPermission(user, 'viewReports');
const canManageWebsiteContent = user => hasPermission(user, 'manageWebsiteContent');

module.exports = {
    hasPermission,
    canManageUsers,
    canManagePPDB,
    canManageLMS,
    canManageCBT,
    canModerateForum,
    canManageKantin,
    canManageStorage,
    canViewAudit,
    canBackupDatabase,
    canViewReports,
    canManageWebsiteContent,
};
