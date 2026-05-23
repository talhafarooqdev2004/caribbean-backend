import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS, SUCCESS_MESSAGES } from '../../config/constants.js';
import { MediaSignupResponseDTO } from '../../dtos/v1/MediaSignups/MediaSignupResponseDTO.js';
import { MediaSignupStoreRequestDTO } from '../../dtos/v1/MediaSignups/Store/MediaSignupStoreRequestDTO.js';
import { ApiError } from '../../exceptions/ApiError.js';
import { MediaSignupRepository } from '../../repositories/mediaSignup.repository.js';
import type { MediaSignupStatusInput, MediaSignupStoreInput } from '../../schemas/mediaSignup.schema.js';
import { MediaSignupQuerySchema } from '../../schemas/mediaSignup.schema.js';
import { emailService, scheduleBackgroundEmail } from '../../services/email.service.js';
import {
    cacheAsideJson,
    getMediaSignupListCacheVersion,
    stableQueryKey,
    ttlMediaSignups,
} from '../../services/apiCache.service.js';
import { logger } from '../../utils/logger.util.js';
import { successResponse } from '../../utils/response.util.js';

const mediaSignupRepository = new MediaSignupRepository();

export const createMediaSignup = async (
    req: Request<{}, unknown, MediaSignupStoreInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const requestDto = new MediaSignupStoreRequestDTO(req.body);
        const signup = await mediaSignupRepository.create(requestDto.toPersistence());

        logger.info('Media signup created; scheduling admin notification', {
            publicationName: requestDto.publicationName,
            signupId: String(signup._id),
        });

        scheduleBackgroundEmail('media-signup-admin-notify', () => emailService.notifyAdmin(
            'New media signup',
            `<p>${requestDto.firstName} ${requestDto.lastName} submitted a media signup for ${requestDto.publicationName}.</p>`,
        ));

        res.status(HTTP_STATUS.CREATED).json(successResponse('Media signup submitted successfully', MediaSignupResponseDTO.fromModel(signup)));
    } catch (error) {
        next(error);
    }
};

export const getAllMediaSignups = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const query = MediaSignupQuerySchema.parse(req.query);
        const version = await getMediaSignupListCacheVersion();
        const filterKey = stableQueryKey({
            status: query.status ?? '',
            page: query.page,
            limit: query.limit,
        } as Record<string, unknown>);
        const cacheKey = `carib:api:ms:admin:list:v${version}:${filterKey}`;

        const body = await cacheAsideJson(cacheKey, ttlMediaSignups(), async () => {
            const [signups, total, statusCounts] = await Promise.all([
                mediaSignupRepository.findAll(query.status, query.page, query.limit),
                mediaSignupRepository.count(query.status),
                mediaSignupRepository.countStatusBreakdown(),
            ]);
            const totalPages = Math.max(1, Math.ceil(total / query.limit));

            return successResponse(
                'Media signups retrieved successfully',
                signups.map((signup) => MediaSignupResponseDTO.fromModel(signup)),
                { total, page: query.page, limit: query.limit, totalPages, statusCounts },
            );
        });

        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};

export const updateMediaSignupStatus = async (
    req: Request<{ id: string }, unknown, MediaSignupStatusInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const signup = await mediaSignupRepository.updateStatus(req.params.id, req.body.status);

        if (!signup) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Media signup not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, MediaSignupResponseDTO.fromModel(signup)));
    } catch (error) {
        next(error);
    }
};

export const deleteMediaSignup = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const deleted = await mediaSignupRepository.delete(req.params.id);

        if (!deleted) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Media signup not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.DELETED));
    } catch (error) {
        next(error);
    }
};
