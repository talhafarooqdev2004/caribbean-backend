import fs from 'fs';
import type { RequestHandler } from 'express';

import { COVER_PHOTO_MAX_BYTES, DOCUMENT_MAX_BYTES, formatBytesLimit } from '../constants/upload.constants.js';
import { ApiError } from '../exceptions/ApiError.js';

function unlinkUploadedFile(filePath: string | undefined) {
    if (!filePath) {
        return;
    }

    fs.unlink(filePath, () => undefined);
}

export const validatePressReleaseUpload: RequestHandler = (req, _res, next) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;

    if (!files) {
        next();
        return;
    }

    const coverPhoto = files.coverPhoto?.[0];
    const document = files.document?.[0];

    if (coverPhoto && coverPhoto.size > COVER_PHOTO_MAX_BYTES) {
        unlinkUploadedFile(coverPhoto.path);

        next(new ApiError(
            400,
            `Cover image is too large. Maximum size is ${formatBytesLimit(COVER_PHOTO_MAX_BYTES)}.`,
            [{ field: 'coverPhoto', message: `Cover image must be under ${formatBytesLimit(COVER_PHOTO_MAX_BYTES)}.` }],
        ));
        return;
    }

    if (document && document.size > DOCUMENT_MAX_BYTES) {
        unlinkUploadedFile(document.path);

        next(new ApiError(
            400,
            `Document is too large. Maximum size is ${formatBytesLimit(DOCUMENT_MAX_BYTES)}.`,
            [{ field: 'document', message: `Document must be under ${formatBytesLimit(DOCUMENT_MAX_BYTES)}.` }],
        ));
        return;
    }

    next();
};
