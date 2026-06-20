import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import { getPublicNetworkStats } from '../../services/networkStats.service.js';
import { successResponse } from '../../utils/response.util.js';

export const getPublicNetworkStatsHandler = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const stats = await getPublicNetworkStats();

        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
        res.status(HTTP_STATUS.OK).json(successResponse('Network statistics retrieved', stats));
    } catch (error) {
        next(error);
    }
};
