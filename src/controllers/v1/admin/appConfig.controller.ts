import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS, SUCCESS_MESSAGES } from '../../../config/constants.js';
import { AppConfigResponseDTO } from '../../../dtos/v1/AppConfigs/AppConfigResponseDTO.js';
import { AppConfigRepository } from '../../../repositories/appConfig.repository.js';
import type { AppConfigUpdateInput } from '../../../schemas/appConfig.schema.js';
import { successResponse } from '../../../utils/response.util.js';

const appConfigRepository = new AppConfigRepository();

export const getAppConfig = async (req: Request<{ key: string }>, res: Response, next: NextFunction) => {
    try {
        const config = await appConfigRepository.findByKey(req.params.key);

        if (!config) {
            return res.status(HTTP_STATUS.OK).json(successResponse('Config not found. Returning null value.', {
                key: req.params.key,
                value: null,
            }));
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Config retrieved successfully', AppConfigResponseDTO.fromModel(config)));
    } catch (error) {
        next(error);
    }
};

export const updateAppConfig = async (
    req: Request<{ key: string }, unknown, AppConfigUpdateInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const config = await appConfigRepository.updateOrCreate(req.params.key, req.body.value, req.body.description ?? null);

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, AppConfigResponseDTO.fromModel(config)));
    } catch (error) {
        next(error);
    }
};
