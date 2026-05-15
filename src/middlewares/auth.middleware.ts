import type { RequestHandler } from 'express';
import { ApiError } from '../exceptions/ApiError.js';
import { verifyToken } from '../utils/jwt.util.js';

export const authMiddleware: RequestHandler = async (req, _res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            throw new ApiError(401, 'Authentication token required');
        }

        req.user = verifyToken(token);
        next();
    } catch {
        next(new ApiError(401, 'Invalid or expired token'));
    }
};

export const authorize = (...roles: string[]): RequestHandler => {
    return (req, _res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return next(new ApiError(403, 'Insufficient permissions'));
        }

        next();
    };
};

export const optionalAuth: RequestHandler = async (req, _res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (token) {
            req.user = verifyToken(token);
        }
    } catch {
        // Optional auth intentionally ignores token failures.
    }

    next();
};
