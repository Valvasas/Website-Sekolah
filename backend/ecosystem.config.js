// ecosystem.config.js — PM2 Production Config
// Taruh di folder backend/
// Jalankan: pm2 start ecosystem.config.js --env production

module.exports = {
    apps: [
        {
            name:         'smkn1terisi-backend',
            script:       'server.js',
            cwd:          __dirname,

            // ── Instances & mode ────────────────────────────────────
            instances:    1,          // 1 instance (SQLite tidak support multi-process)
            exec_mode:    'fork',     // fork mode untuk SQLite

            // ── Restart policy ──────────────────────────────────────
            watch:        false,      // Jangan watch di production
            max_memory_restart: '512M',
            restart_delay: 3000,      // Tunggu 3 detik sebelum restart
            max_restarts:  10,        // Maksimal 10 restart dalam 1 jam
            min_uptime:   '30s',      // Minimal uptime sebelum dianggap stable

            // ── Environment ─────────────────────────────────────────
            env: {
                NODE_ENV: 'development',
                PORT:     3001,
            },
            env_production: {
                NODE_ENV: 'production',
                PORT:     3001,
            },

            // ── Logging ─────────────────────────────────────────────
            log_date_format:  'YYYY-MM-DD HH:mm:ss',
            error_file:       './logs/pm2-error.log',
            out_file:         './logs/pm2-out.log',
            merge_logs:       true,
            log_type:         'json',

            // ── Graceful shutdown ────────────────────────────────────
            kill_timeout:     5000,   // 5 detik untuk graceful shutdown
            listen_timeout:   10000,  // 10 detik untuk startup

            // ── Auto-restart schedule (restart tiap hari jam 3 pagi) ─
            cron_restart:     '0 3 * * *',
        }
    ],

    // ── Deploy config (opsional untuk CI/CD) ─────────────────────
    deploy: {
        production: {
            user:         'smknadmin',
            host:         'SERVER_IP_DISINI',
            ref:          'origin/main',
            repo:         'git@github.com:USERNAME/smkn1terisi.git',
            path:         '/var/www/smkn1terisi',
            'pre-deploy-local': '',
            'post-deploy': 'cd backend && npm install --production && pm2 reload ecosystem.config.js --env production',
        }
    }
};
