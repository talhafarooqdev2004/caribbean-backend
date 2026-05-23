import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import { getSiteIpAllowlistPublic } from '../../services/siteIpAllowlist.service.js';
import { successResponse } from '../../utils/response.util.js';

export const getPublicSiteAccess = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const data = await getSiteIpAllowlistPublic();
        res.setHeader('Cache-Control', 'private, no-cache, no-store, max-age=0, must-revalidate');
        res.status(HTTP_STATUS.OK).json(successResponse('Site access policy retrieved', data));
    } catch (error) {
        next(error);
    }
};
