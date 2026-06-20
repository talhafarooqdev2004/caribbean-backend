import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MongoServerError } from 'mongodb';
import multer from 'multer';

import {
    COVER_PHOTO_MAX_BYTES,
    DOCUMENT_MAX_BYTES,
    formatBytesLimit,
} from '../constants/upload.constants.js';
import { ApiError } from '../exceptions/ApiError.js';
import { logger } from '../utils/logger.util.js';
import { errorResponse } from '../utils/response.util.js';

function uploadFieldErrors(field: string | undefined, message: string) {
    if (!field) {
        return null;
    }

    return [{ field, message }];
}

function multerErrorMessage(err: multer.MulterError): string {
    switch (err.code) {
        case 'LIMIT_FILE_SIZE': {
            if (err.field === 'coverPhoto') {
                return `Cover image is too large. Maximum size is ${formatBytesLimit(COVER_PHOTO_MAX_BYTES)}.`;
            }

            if (err.field === 'document') {
                return `Document is too large. Maximum size is ${formatBytesLimit(DOCUMENT_MAX_BYTES)}.`;
            }

            return `Uploaded file is too large. Cover images must be under ${formatBytesLimit(COVER_PHOTO_MAX_BYTES)} and documents under ${formatBytesLimit(DOCUMENT_MAX_BYTES)}.`;
        }
        case 'LIMIT_UNEXPECTED_FILE':
            return 'Unexpected file field. Only a cover image and an optional document may be uploaded.';
        case 'LIMIT_FILE_COUNT':
            return 'Too many files uploaded.';
        default:
            return err.message || 'File upload failed.';
    }
}

function multerFieldErrorMessage(err: multer.MulterError): string | null {
    if (err.code !== 'LIMIT_FILE_SIZE') {
        return null;
    }

    if (err.field === 'coverPhoto') {
        return `Cover image must be under ${formatBytesLimit(COVER_PHOTO_MAX_BYTES)}.`;
    }

    if (err.field === 'document') {
        return `Document must be under ${formatBytesLimit(DOCUMENT_MAX_BYTES)}.`;
    }

    return null;
}

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

    if (err instanceof multer.MulterError) {
        const message = multerErrorMessage(err);
        const fieldMessage = multerFieldErrorMessage(err);
        const errors = uploadFieldErrors(err.field, fieldMessage ?? message);

        return res.status(400).json(errorResponse(message, errors));
    }

    if (err instanceof Error) {
        const uploadMessages = [
            'Cover image must be a JPG, PNG, or WebP image.',
            'Document must be a PDF, DOC, or DOCX file.',
            'Unexpected upload field.',
        ];

        if (uploadMessages.includes(err.message)) {
            return res.status(400).json(errorResponse(err.message));
        }
    }

    if (err instanceof MongoServerError && err.code === 11000) {
        return res.status(409).json(errorResponse('Resource already exists'));
    }

    if (err.name === 'BSONError') {
        return res.status(400).json(errorResponse('Invalid resource identifier'));
    }

    return res.status(500).json(errorResponse('Internal server error'));
};

export const notFoundHandler: RequestHandler = (_req, res) => {
    res.status(404).json(errorResponse('Route not found'));
};

export const errorHandler = errorMiddleware;
