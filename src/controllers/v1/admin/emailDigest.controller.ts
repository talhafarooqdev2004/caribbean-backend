import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../../config/constants.js';
import { getEmailDigestFrequency } from '../../../services/appConfig.service.js';
import { sendJournalistDigest } from '../../../services/emailDigest.service.js';
import { successResponse } from '../../../utils/response.util.js';

export const sendDigestNow = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const cadence = await getEmailDigestFrequency();
        const result = await sendJournalistDigest(cadence);
        const message = result.skipped
            ? 'Digest was not sent (no opted-in users or no approved releases).'
            : 'Digest sent successfully';
        res.status(HTTP_STATUS.OK).json(successResponse(message, result));
    } catch (error) {
        next(error);
    }
};
