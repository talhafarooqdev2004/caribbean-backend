import type { RequestHandler } from 'express';
import { logger } from '../utils/logger.util.js';

export const loggerMiddleware: RequestHandler = (req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    });

    next();
};
