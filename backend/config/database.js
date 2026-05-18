// config/database.js — sql.js pure JavaScript wrapper
'use strict';

require('dotenv').config();
const path = require('path');
const fs   = require('fs');

const DB_PATH = path.resolve(
    (process.env.DB_PATH || './data/smkn1terisi').replace(/\.db$/, '') + '.bin'
);
const DB_DIR = path.dirname(DB_PATH);
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

let SQL      = null;
let rawDB    = null;
let _wrapper = null;

/* ── Simpan ke file ──────────────────────────────────── */
function saveDB() {
    if (!rawDB) return;
    try {
        const data = rawDB.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch(e) { console.error('[DB] saveDB error:', e.message); }
}

/* ── Statement Wrapper ───────────────────────────────── */
class Stmt {
    constructor(sql) { this._sql = sql; }

    /* Konversi params ke format sql.js */
    _p(params) {
        if (!params || params.length === 0) return [];
        // Named params (object) → {':key': value}
        if (
            params.length === 1 &&
            params[0] !== null &&
            typeof params[0] === 'object' &&
            !Array.isArray(params[0])
        ) {
            const obj  = params[0];
            const out  = {};
            for (const k of Object.keys(obj)) {
                // Support :key dan tanpa prefix
                out[`:${k}`] = obj[k];
            }
            return out;
        }
        // Positional params → flat array
        return params.flat();
    }

    _fix(row) {
        if (!row) return row;
        const r = {};
        for (const [k, v] of Object.entries(row)) {
            r[k] = typeof v === 'bigint' ? Number(v) : v;
        }
        return r;
    }

    run(...params) {
        rawDB.run(this._sql, this._p(params));
        saveDB();
        try {
            const meta = rawDB.exec('SELECT last_insert_rowid() as lid, changes() as ch');
            const row  = meta[0]?.values[0];
            return { lastInsertRowid: row?.[0] ?? null, changes: row?.[1] ?? 0 };
        } catch { return { lastInsertRowid: null, changes: 0 }; }
    }

    get(...params) {
        const st  = rawDB.prepare(this._sql);
        const p   = this._p(params);
        if (p && typeof p === 'object' && !Array.isArray(p)) {
            st.bind(p);
        } else if (Array.isArray(p) && p.length > 0) {
            st.bind(p);
        }
        const result = st.step() ? this._fix(st.getAsObject()) : undefined;
        st.free();
        return result;
    }

    all(...params) {
        const out  = [];
        const p    = this._p(params);
        // Untuk array params, gunakan exec; untuk named params, gunakan prepare
        if (p && typeof p === 'object' && !Array.isArray(p)) {
            const st = rawDB.prepare(this._sql);
            st.bind(p);
            while (st.step()) out.push(this._fix(st.getAsObject()));
            st.free();
        } else {
            const res = rawDB.exec(this._sql, Array.isArray(p) && p.length ? p : undefined);
            if (!res.length) return out;
            const { columns, values } = res[0];
            for (const row of values) {
                const o = {};
                columns.forEach((c, i) => { o[c] = row[i]; });
                out.push(this._fix(o));
            }
        }
        return out;
    }
}

/* ── DB Wrapper ──────────────────────────────────────── */
class DB {
    exec(sql) {
        rawDB.run(sql);
        saveDB();
        return this;
    }

    prepare(sql) { return new Stmt(sql); }

    pragma(s) {
        try { rawDB.run(`PRAGMA ${s}`); } catch {}
        return this;
    }

    /* transaction — menjalankan fn dalam satu BEGIN/COMMIT
       Aman: tidak nested, tidak crash jika tidak ada transaksi aktif */
    transaction(fn) {
        return (...args) => {
            // Cek apakah sudah ada transaksi aktif
            let inTransaction = false;
            try {
                rawDB.run('BEGIN');
                inTransaction = true;
            } catch(e) {
                // Sudah ada transaksi aktif — jalankan tanpa wrap
                inTransaction = false;
            }

            try {
                const result = fn(...args);
                if (inTransaction) {
                    rawDB.run('COMMIT');
                    saveDB();
                }
                return result;
            } catch(err) {
                if (inTransaction) {
                    try { rawDB.run('ROLLBACK'); } catch {}
                }
                throw err;
            }
        };
    }

    close() {
        saveDB();
        rawDB?.close();
        rawDB    = null;
        _wrapper = null;
    }
}

/* ── Public API ──────────────────────────────────────── */
function getDB() {
    if (!_wrapper) throw new Error('[DB] Belum diinisialisasi. Panggil initDatabase() dahulu.');
    return _wrapper;
}

async function initDatabase() {
    if (_wrapper) return _wrapper;

    if (!SQL) SQL = await require('sql.js')();

    if (fs.existsSync(DB_PATH)) {
        rawDB = new SQL.Database(fs.readFileSync(DB_PATH));
    } else {
        rawDB = new SQL.Database();
    }

    _wrapper = new DB();
    _wrapper.pragma('foreign_keys = ON');

    // Auto-save tiap 30 detik
    setInterval(saveDB, 30_000);

    return _wrapper;
}

module.exports             = getDB;
module.exports.initDatabase = initDatabase;
module.exports.saveDB       = saveDB;
