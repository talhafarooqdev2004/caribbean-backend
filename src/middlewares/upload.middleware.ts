import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { ENV } from '../config/env.js';

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
        fileSize: ENV.MAX_FILE_SIZE,
    },
    fileFilter: (_req, file, callback) => {
        const isImage = file.fieldname === 'coverPhoto' && file.mimetype.startsWith('image/');
        const isDocument = file.fieldname === 'document' && [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ].includes(file.mimetype);

        if (!isImage && !isDocument) {
            callback(new Error('Unsupported upload type'));
            return;
        }

        callback(null, true);
    },
});
