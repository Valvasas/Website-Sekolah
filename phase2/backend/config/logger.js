// config/logger.js — Production logging dengan Winston
'use strict';

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs   = require('fs');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const isDev = process.env.NODE_ENV !== 'production';

const logger = createLogger({
    level: isDev ? 'debug' : 'info',
    format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.json()
    ),
    transports: [
        // Error log — hanya error
        new transports.File({
            filename:   path.join(logsDir, 'error.log'),
            level:      'error',
            maxsize:    10 * 1024 * 1024, // 10MB
            maxFiles:   5,
            tailable:   true,
        }),
        // Combined log — semua level
        new transports.File({
            filename:   path.join(logsDir, 'app.log'),
            maxsize:    20 * 1024 * 1024, // 20MB
            maxFiles:   7,
            tailable:   true,
        }),
    ],
});

// Development: tampilkan di console juga
if (isDev) {
    logger.add(new transports.Console({
        format: format.combine(
            format.colorize(),
            format.printf(({ level, message, timestamp, stack }) => {
                return `${timestamp} [${level}]: ${stack || message}`;
            })
        )
    }));
}

module.exports = logger;
