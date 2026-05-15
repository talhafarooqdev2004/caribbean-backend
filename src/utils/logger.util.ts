import fs from 'fs';
import path from 'path';
import winston from 'winston';

const logsDir = path.resolve(process.cwd(), 'logs');
fs.mkdirSync(logsDir, { recursive: true });

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
        }),
        new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
        new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
    ],
});
