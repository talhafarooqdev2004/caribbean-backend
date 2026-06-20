import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import {
    getSiteIpAllowlistPublic,
    getSiteIpAllowlistStored,
    saveSiteIpRestrictionEnabled,
} from '../../services/siteIpAllowlist.service.js';
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

export const postDisableSiteMaintenance = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        await saveSiteIpRestrictionEnabled(false);
        const [stored, publicPolicy] = await Promise.all([
            getSiteIpAllowlistStored(),
            getSiteIpAllowlistPublic(),
        ]);

        res.status(HTTP_STATUS.OK).json(
            successResponse('Maintenance mode disabled — public site is open.', {
                ...stored,
                restrictEnabled: publicPolicy.restrictEnabled,
                allowedIps: publicPolicy.allowedIps,
            }),
        );
    } catch (error) {
        next(error);
    }
};

export const postEnableSiteMaintenance = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        await saveSiteIpRestrictionEnabled(true);
        const [stored, publicPolicy] = await Promise.all([
            getSiteIpAllowlistStored(),
            getSiteIpAllowlistPublic(),
        ]);

        res.status(HTTP_STATUS.OK).json(
            successResponse('Maintenance mode enabled — only allowlisted IPs may access the site.', {
                ...stored,
                restrictEnabled: publicPolicy.restrictEnabled,
                allowedIps: publicPolicy.allowedIps,
            }),
        );
    } catch (error) {
        next(error);
    }
};
