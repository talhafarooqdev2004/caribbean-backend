import type { NextFunction, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { HTTP_STATUS, SUCCESS_MESSAGES } from '../../config/constants.js';
import { ENV } from '../../config/env.js';
import { PressReleaseResponseDTO } from '../../dtos/v1/PressReleases/PressReleaseResponseDTO.js';
import { PressReleaseStoreRequestDTO } from '../../dtos/v1/PressReleases/Store/PressReleaseStoreRequestDTO.js';
import { ApiError } from '../../exceptions/ApiError.js';
import { PressReleaseRepository } from '../../repositories/pressRelease.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { PressReleaseQuerySchema, type PressReleaseQueryInput, type PressReleaseStatusInput, type PressReleaseStoreInput, type CreditCheckoutSessionStoreInput } from '../../schemas/pressRelease.schema.js';
import { CreditCheckoutSessionRepository } from '../../repositories/creditCheckoutSession.repository.js';
import { emailService, scheduleBackgroundEmail } from '../../services/email.service.js';
import {
    cacheAsideJson,
    cacheRememberJson,
    getPressReleaseListCacheVersion,
    NEWSROOM_PUBLIC_LIST_CACHE_PREFIX,
    NEWSROOM_PUBLIC_LIST_CACHE_TTL_SEC,
    readPublicPressReleaseDetailCache,
    stableQueryKey,
    ttlAdminPressReleaseList,
    ttlPublicDetail,
    writePublicPressReleaseDetailCache,
} from '../../services/apiCache.service.js';
import { successResponse } from '../../utils/response.util.js';
import { logger } from '../../utils/logger.util.js';
import type { JwtPayload } from '../../utils/jwt.util.js';
import type { PressReleaseRecord } from '../../types/PressRelease.js';

const pressReleaseRepository = new PressReleaseRepository();
const userRepository = new UserRepository();
const creditCheckoutSessionRepository = new CreditCheckoutSessionRepository();

const isLivePublicPressRelease = (release: PressReleaseRecord) =>
    release.status === 'approved' && release.paymentStatus === 'paid';

const canReadPressRelease = (release: PressReleaseRecord, user?: JwtPayload) => {
    if (user?.role === 'admin') {
        return true;
    }

    if (user?.id && release.submitterId?.toString() === user.id) {
        return true;
    }

    if (isLivePublicPressRelease(release)) {
        return true;
    }

    return release.status !== 'rejected' && release.status !== 'approved' && release.paymentStatus !== 'paid';
};

const listMeta = (
    query: PressReleaseQueryInput,
    total: number,
    paidQueueCounts?: { pending: number; approved: number; rejected: number },
) => {
    const limit = query.limit ?? 100;
    const page = query.page ?? 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return paidQueueCounts
        ? { total, page, limit, totalPages, paidQueueCounts }
        : { total, page, limit, totalPages };
};

const sendApprovalEmail = async (release) => {
    const releaseUrl = `${ENV.FRONTEND_URL}/newsroom/${release.slug}`;

    await emailService.sendMail({
        to: release.email,
        subject: 'Your Press Release is Now Live! 🎉',
        html: `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <h1>Congratulations!</h1>
                <p>Your press release <strong>${release.title}</strong> has been approved.</p>
                <p>It is now live on Carib Newswire.</p>
                <p><a href="${releaseUrl}">View your live release</a></p>
            </div>
        `,
    });
};

const sendRejectionEmail = async (release, reason = '') => {
    await emailService.sendMail({
        to: release.email,
        subject: 'Press Release Status Update',
        html: `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <h1>Press Release Status Update</h1>
                <p>We reviewed your submission <strong>${release.title}</strong>.</p>
                <p>Unfortunately it did not meet our guidelines.</p>
                <p><strong>Reason:</strong> ${reason || 'No specific reason was provided.'}</p>
                <p>Please email <a href="mailto:info@caribnewswire.com">info@caribnewswire.com</a> for support or to resubmit.</p>
            </div>
        `,
    });
};

/** `validateQuery(PressReleaseQuerySchema)` already coerces `req.query` (e.g. `page`/`limit` as numbers). Re-parse that object so cache keys and DB queries stay stable. */
const parsePressReleaseQueryFromRequest = (req: Request): PressReleaseQueryInput =>
    PressReleaseQuerySchema.parse(req.query);

const getUploadedPath = (req: Request, fieldName: 'coverPhoto' | 'document') => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.[fieldName]?.[0];

    if (!file) {
        return null;
    }

    return `/uploads/press-releases/${file.filename}`;
};

const creditCheckoutAmountCents = (packageId: PressReleaseRecord['packageId'], featuredUpgrade: boolean) => {
    if (packageId === 'bundle') {
        return 39900 + (featuredUpgrade ? 9900 : 0);
    }

    if (packageId === 'single') {
        return 14900 + (featuredUpgrade ? 9900 : 0);
    }

    return 0;
};

export const getAllPressReleases = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const query = parsePressReleaseQueryFromRequest(req);
        const version = await getPressReleaseListCacheVersion();
        const cacheKey = `carib:api:pr:admin:list:v${version}:${stableQueryKey(query as unknown as Record<string, unknown>)}`;

        const body = await cacheAsideJson(cacheKey, ttlAdminPressReleaseList(), async () => {
            const [releases, total, paidQueueCounts] = await Promise.all([
                pressReleaseRepository.findAll(query),
                pressReleaseRepository.countByQuery(query),
                pressReleaseRepository.countPaidByStatuses(),
            ]);

            return successResponse(
                'Press releases retrieved successfully',
                releases.map((release) => PressReleaseResponseDTO.fromModel(release)),
                listMeta(query, total, paidQueueCounts),
            );
        });

        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};

export const getPublicPressReleases = async (
    req: Request,
    res: Response,
    next: NextFunction,
) => {
    try {
        const query = parsePressReleaseQueryFromRequest(req);
        const scopedQuery = {
            ...query,
            status: 'approved' as const,
            paymentStatus: 'paid' as const,
        };
        const stablePart = stableQueryKey(scopedQuery as unknown as Record<string, unknown>);
        const cacheKey = `${NEWSROOM_PUBLIC_LIST_CACHE_PREFIX}${stablePart}`;

        const { value: body, redis: listRedis } = await cacheRememberJson(
            cacheKey,
            NEWSROOM_PUBLIC_LIST_CACHE_TTL_SEC,
            async () => {
                const [releases, total] = await Promise.all([
                    pressReleaseRepository.findAll(scopedQuery),
                    pressReleaseRepository.countByQuery(scopedQuery),
                ]);

                return successResponse(
                    'Press releases retrieved successfully',
                    releases.map((release) => PressReleaseResponseDTO.fromModel(release)),
                    listMeta(query, total),
                );
            },
        );

        if (listRedis === 'OFF') {
            logger.warn(
                'Public press releases list: Redis cache is OFF for this API process (REDIS_URL unset after trim). ' +
                    'Responses are always loaded from Mongo; no carib:newsroom:list:* keys are written.',
            );
        }
        if (process.env.LOG_PUBLIC_PRESS_LIST_REDIS === '1') {
            logger.info('[press-releases/public] list cache', {
                redis: listRedis,
                keySuffix: cacheKey.slice(-120),
            });
        }
        res.setHeader('X-API-Press-List-Cache', listRedis);
        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};

export const getPressReleaseById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const param = req.params.id;
        const cached = await readPublicPressReleaseDetailCache(param);

        if (cached?.success && cached.data?.status === 'approved' && cached.data?.paymentStatus === 'paid') {
            const idMatch = /^[a-fA-F0-9]{24}$/.test(param) ? cached.data.id === param : true;
            const slugMatch = !/^[a-fA-F0-9]{24}$/.test(param) ? cached.data.slug === param : true;

            if (idMatch && slugMatch) {
                res.status(HTTP_STATUS.OK).json(cached);
                return;
            }
        }

        const release = ObjectId.isValid(req.params.id)
            ? await pressReleaseRepository.findById(req.params.id)
            : await pressReleaseRepository.findBySlug(req.params.id);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        if (!canReadPressRelease(release, req.user)) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        const body = successResponse('Press release retrieved successfully', PressReleaseResponseDTO.fromModel(release));

        if (isLivePublicPressRelease(release)) {
            await writePublicPressReleaseDetailCache(
                release._id.toHexString(),
                release.slug,
                body,
                ttlPublicDetail(),
            );
        }

        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};

export const createCreditCheckoutSession = async (
    req: Request<{}, unknown, CreditCheckoutSessionStoreInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        if (!req.user?.id) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication token required');
        }

        const requestDto = new PressReleaseStoreRequestDTO({
            ...req.body,
            coverImagePath: getUploadedPath(req, 'coverPhoto'),
            documentPath: getUploadedPath(req, 'document'),
        });

        if (requestDto.packageId === 'custom') {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Custom campaigns are not available for this checkout flow.');
        }

        const amountCents = creditCheckoutAmountCents(requestDto.packageId, requestDto.featuredUpgrade);

        if (amountCents <= 0) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Invalid package for credit checkout.');
        }

        await pressReleaseRepository.assertCanonicalSlugAvailable(requestDto.title);

        const session = await creditCheckoutSessionRepository.create({
            submitterId: new ObjectId(req.user.id),
            packageId: requestDto.packageId,
            featuredUpgrade: requestDto.featuredUpgrade,
            amountCents,
            payload: {
                fullName: requestDto.fullName,
                email: requestDto.email,
                phoneNumber: requestDto.phoneNumber,
                organization: requestDto.organization,
                title: requestDto.title,
                category: requestDto.category,
                island: requestDto.island,
                preferredDistributionDate: requestDto.preferredDistributionDate,
                content: requestDto.content,
                targetRegions: requestDto.targetRegions,
                specialInstructions: requestDto.specialInstructions,
                outboundLink: requestDto.outboundLink,
                coverImagePath: requestDto.coverImagePath,
                documentPath: requestDto.documentPath,
            },
        });

        if (!session) {
            throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Unable to save checkout session.');
        }

        res.status(HTTP_STATUS.CREATED).json(successResponse(SUCCESS_MESSAGES.CREATED, {
            creditCheckoutSessionId: session._id.toHexString(),
            creditCheckoutSession: true,
        }));
    } catch (error) {
        next(error);
    }
};

export const createPressRelease = async (
    req: Request<{}, unknown, PressReleaseStoreInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const requestDto = new PressReleaseStoreRequestDTO({
            ...req.body,
            coverImagePath: getUploadedPath(req, 'coverPhoto'),
            documentPath: getUploadedPath(req, 'document'),
        });
        const useExistingCredit = Boolean(req.body.useExistingCredit);

        if (!req.user?.id) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication token required');
        }

        await pressReleaseRepository.assertCanonicalSlugAvailable(requestDto.title);

        if (!useExistingCredit) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Purchase credits on the Pricing page before submitting. After payment, submit your release here; each submission uses one credit.');
        }

        const amountCents = 0;
        const persistence: any = {
            ...requestDto.toPersistence(amountCents),
            submitterId: req.user?.id ? new ObjectId(req.user.id) : null,
        };

        const refreshedUser = await userRepository.applyBundleCreditExpiry(req.user.id);

        if (!refreshedUser || refreshedUser.credits <= 0) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'You have no credits remaining. Please purchase a package.');
        }

        if (requestDto.featuredUpgrade) {
            const featuredPersistence = {
                ...requestDto.toPersistence(9900),
                submitterId: new ObjectId(req.user.id),
                pendingCreditWithFeaturedCheckout: true,
            };

            const release = await pressReleaseRepository.create(featuredPersistence as any);

            res.status(HTTP_STATUS.CREATED).json(successResponse(SUCCESS_MESSAGES.CREATED, {
                release: PressReleaseResponseDTO.fromModel(release),
                creditsRemaining: refreshedUser.credits,
                pendingFeaturedPayment: true,
            }));

            return;
        }

        const updatedUser = await userRepository.consumeCredit(req.user.id);

        if (!updatedUser) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'You have no credits remaining. Please purchase a package.');
        }

        persistence.paymentStatus = 'paid';
        persistence.status = 'pending';

        const release = await pressReleaseRepository.create(persistence);

        scheduleBackgroundEmail('press-release-credit-draft-admin', () => emailService.notifyAdmin(
            'New press release draft',
            `<p>${requestDto.fullName} created a press release draft: <strong>${requestDto.title}</strong>.</p>`,
        ));

        const creditsRemaining = updatedUser && typeof (updatedUser as { credits?: number }).credits === 'number'
            ? (updatedUser as { credits: number }).credits
            : 0;

        res.status(HTTP_STATUS.CREATED).json(successResponse(SUCCESS_MESSAGES.CREATED, {
            release: PressReleaseResponseDTO.fromModel(release),
            creditsRemaining,
        }));
    } catch (error) {
        next(error);
    }
};

export const updatePressReleaseStatus = async (
    req: Request<{ id: string }, unknown, PressReleaseStatusInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const existingRelease = await pressReleaseRepository.findById(req.params.id);

        if (!existingRelease) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        if (req.body.status === 'approved' && existingRelease.paymentStatus !== 'paid') {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Cannot approve press release until payment is completed');
        }

        const release = await pressReleaseRepository.updateStatus(req.params.id, req.body.status, req.body.rejectionReason);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        if (req.body.status === 'approved') {
            scheduleBackgroundEmail('press-release-approved', () => sendApprovalEmail(release));
        }

        if (req.body.status === 'rejected') {
            scheduleBackgroundEmail('press-release-rejected', () => sendRejectionEmail(release, req.body.rejectionReason));
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const approvePressRelease = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const existingRelease = await pressReleaseRepository.findById(req.params.id);

        if (!existingRelease) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        if (existingRelease.paymentStatus !== 'paid') {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Cannot approve press release until payment is completed');
        }

        const release = await pressReleaseRepository.updateStatus(req.params.id, 'approved');

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        scheduleBackgroundEmail('press-release-approved', () => sendApprovalEmail(release));

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.PUBLISHED, PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const rejectPressRelease = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const reason = typeof req.body?.rejectionReason === 'string' ? req.body.rejectionReason : '';
        const release = await pressReleaseRepository.updateStatus(req.params.id, 'rejected', reason);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        scheduleBackgroundEmail('press-release-rejected', () => sendRejectionEmail(release, reason));

        res.status(HTTP_STATUS.OK).json(successResponse('Press release rejected successfully', PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const toggleFeaturedPressRelease = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const release = await pressReleaseRepository.toggleFeatured(req.params.id);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const incrementPressReleaseViews = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const release = await pressReleaseRepository.incrementViews(req.params.id);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Press release view count updated successfully', PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const incrementPressReleaseClicks = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const release = await pressReleaseRepository.incrementClicks(req.params.id);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Press release click count updated successfully', PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const deletePressRelease = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const deleted = await pressReleaseRepository.delete(req.params.id);

        if (!deleted) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.DELETED));
    } catch (error) {
        next(error);
    }
};
