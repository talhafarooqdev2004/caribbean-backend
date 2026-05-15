import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG_KEYS, HTTP_STATUS } from '../../../config/constants.js';
import { AppConfigRepository } from '../../../repositories/appConfig.repository.js';
import { squareService } from '../../../services/square.service.js';
import { successResponse } from '../../../utils/response.util.js';

const appConfigRepository = new AppConfigRepository();

export const getPaymentMode = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const config = await squareService.getWebPaymentsConfig();
        res.status(HTTP_STATUS.OK).json(successResponse('Payment mode retrieved successfully', config));
    } catch (error) {
        next(error);
    }
};

export const updatePaymentMode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const testMode = Boolean(req.body.testMode);
        await appConfigRepository.updateOrCreate(
            APP_CONFIG_KEYS.SQUARE_TEST_MODE,
            testMode,
            'When true, Square payments use sandbox credentials. When false, production credentials are used.',
        );
        const config = await squareService.getWebPaymentsConfig();

        res.status(HTTP_STATUS.OK).json(successResponse('Payment mode updated successfully', config));
    } catch (error) {
        next(error);
    }
};
