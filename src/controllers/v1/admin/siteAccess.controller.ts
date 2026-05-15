import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../../config/constants.js';
import { ApiError } from '../../../exceptions/ApiError.js';
import {
    getSiteIpAllowlistStored,
    saveSiteIpRestrictionEnabled,
} from '../../../services/siteIpAllowlist.service.js';
import { successResponse } from '../../../utils/response.util.js';

const parseBody = (body: unknown): boolean => {
    if (!body || typeof body !== 'object') {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid request body');
    }

    const obj = body as Record<string, unknown>;

    if (!('enabled' in obj)) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'enabled is required');
    }

    return obj.enabled === true || obj.enabled === 'true';
};

export const getAdminSiteAccess = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const stored = await getSiteIpAllowlistStored();
        res.status(HTTP_STATUS.OK).json(successResponse('Site access settings retrieved', stored));
    } catch (error) {
        next(error);
    }
};

export const putAdminSiteAccess = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const enabled = parseBody(req.body);
        await saveSiteIpRestrictionEnabled(enabled);
        const stored = await getSiteIpAllowlistStored();
        res.status(HTTP_STATUS.OK).json(successResponse('Site access settings updated', stored));
    } catch (error) {
        next(error);
    }
};
