// middleware/auditLog.js
'use strict';

const { v4: uuidv4 } = require('uuid');

function log(userId, action, entity, entityId, detail, ip) {
    try {
        const getDB = require('../config/database');
        const db    = getDB();
        db.prepare(`
            INSERT INTO audit_logs
            (id,user_id,action,entity,entity_id,detail,ip_address,created_at)
            VALUES (:id,:uid,:action,:entity,:eid,:detail,:ip,:now)
        `).run({
            id:     uuidv4(),
            uid:    userId   || null,
            action: action,
            entity: entity   || null,
            eid:    entityId || null,
            detail: typeof detail === 'object' ? JSON.stringify(detail) : (detail || null),
            ip:     ip       || null,
            now:    new Date().toISOString()
        });
    } catch (err) {
        // Jangan crash server hanya karena audit log gagal
        console.error('[AuditLog]', err.message);
    }
}

module.exports = { log };
