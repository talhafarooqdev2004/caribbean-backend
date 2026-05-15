import type { ErrorRequestHandler } from 'express';
import { MongoServerError } from 'mongodb';
import { ApiError } from '../exceptions/ApiError.js';
import { logger } from '../utils/logger.util.js';
import { errorResponse } from '../utils/response.util.js';

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
    logger.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
    });

    if (err instanceof ApiError) {
        return res.status(err.statusCode).json(errorResponse(err.message, err.errors));
    }

    if (err instanceof MongoServerError && err.code === 11000) {
        return res.status(409).json(errorResponse('Resource already exists'));
    }

    if (err.name === 'BSONError') {
        return res.status(400).json(errorResponse('Invalid resource identifier'));
    }

    return res.status(500).json(errorResponse('Internal server error'));
};
