import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { DOCUMENT_MAX_BYTES } from '../constants/upload.constants.js';
import { ENV } from '../config/env.js';

const DOCUMENT_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const pressReleaseUploadDir = path.resolve(process.cwd(), ENV.UPLOAD_DIR, 'press-releases');

fs.mkdirSync(pressReleaseUploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, callback) => {
        callback(null, pressReleaseUploadDir);
    },
    filename: (_req, file, callback) => {
        const extension = path.extname(file.originalname);
        const safeBaseName = path
            .basename(file.originalname, extension)
            .replace(/[^a-zA-Z0-9-_]/g, '-')
            .toLowerCase();

        callback(null, `${Date.now()}-${safeBaseName}${extension}`);
    },
});

export const pressReleaseUpload = multer({
    storage,
    limits: {
        fileSize: Math.min(ENV.MAX_FILE_SIZE, DOCUMENT_MAX_BYTES),
    },
    fileFilter: (_req, file, callback) => {
        if (file.fieldname === 'coverPhoto') {
            if (!file.mimetype.startsWith('image/')) {
                callback(new Error('Cover image must be a JPG, PNG, or WebP image.'));
                return;
            }

            callback(null, true);
            return;
        }

        if (file.fieldname === 'document') {
            if (!DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
                callback(new Error('Document must be a PDF, DOC, or DOCX file.'));
                return;
            }

            callback(null, true);
            return;
        }

        callback(new Error('Unexpected upload field.'));
    },
});
