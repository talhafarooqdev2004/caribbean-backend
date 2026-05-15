import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG_KEYS, HTTP_STATUS, SUCCESS_MESSAGES } from '../../../config/constants.js';
import { ENV } from '../../../config/env.js';
import { AppConfigRepository } from '../../../repositories/appConfig.repository.js';
import { successResponse } from '../../../utils/response.util.js';

const appConfigRepository = new AppConfigRepository();

export const getAllPaymentGateways = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const testModeConfig = await appConfigRepository.findByKey(APP_CONFIG_KEYS.SQUARE_TEST_MODE);
        const testMode = testModeConfig?.value === true || testModeConfig?.value === 'true';

        res.status(HTTP_STATUS.OK).json(successResponse('Payment gateways retrieved successfully', [{
            id: 'square',
            name: 'Square',
            provider: 'square',
            is_active: true,
            test_mode: testMode,
            environment: testMode ? 'sandbox' : 'production',
            sandbox_configured: Boolean(ENV.SQUARE_SANDBOX_APP_ID && ENV.SQUARE_SANDBOX_ACCESS_TOKEN && ENV.SQUARE_SANDBOX_LOCATION_ID),
            production_configured: Boolean(ENV.SQUARE_PROD_APP_ID && ENV.SQUARE_PROD_ACCESS_TOKEN && ENV.SQUARE_PROD_LOCATION_ID),
        }]));
    } catch (error) {
        next(error);
    }
};

export const updateSquareTestMode = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const value = Boolean(req.body?.testMode);
        const config = await appConfigRepository.updateOrCreate(
            APP_CONFIG_KEYS.SQUARE_TEST_MODE,
            value,
            'When true, Square payments use sandbox credentials. When false, production credentials are used.',
        );

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, config));
    } catch (error) {
        next(error);
    }
};
