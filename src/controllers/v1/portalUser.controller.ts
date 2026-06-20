import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { HTTP_STATUS } from '../../config/constants.js';
import { ENV } from '../../config/env.js';
import { PressReleaseResponseDTO } from '../../dtos/v1/PressReleases/PressReleaseResponseDTO.js';
import { UserResponseDTO } from '../../dtos/v1/Auth/UserResponseDTO.js';
import { ApiError } from '../../exceptions/ApiError.js';
import { getDb } from '../../lib/mongodb.js';
import { PressReleaseRepository } from '../../repositories/pressRelease.repository.js';
import { NewsletterSubscriberRepository } from '../../repositories/newsletterSubscriber.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { getEmailDigestFrequency } from '../../services/appConfig.service.js';
import {
    PORTAL_USER_CACHE_TTL_SEC,
    cacheAsideJson,
    invalidatePortalUserCache,
} from '../../services/apiCache.service.js';
import { successResponse } from '../../utils/response.util.js';
import { toObjectId } from '../../utils/mongo.util.js';
import type { PressReleaseRecord } from '../../types/PressRelease.js';
import type { JournalistProfile, UserRecord } from '../../types/User.js';

const userRepository = new UserRepository();
const newsletterSubscriberRepository = new NewsletterSubscriberRepository();
const pressReleaseRepository = new PressReleaseRepository();
const bookmarkCollection = () => getDb().collection('journalist_bookmarks');

const PORTAL_ROLES = ['submitter', 'journalist'] as const;

const requirePortalUser = (req: Request) => {
    if (!req.user || !PORTAL_ROLES.includes(req.user.role as (typeof PORTAL_ROLES)[number])) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Portal access required');
    }

    return req.user.id;
};

const expireCreditsIfNeeded = async (user: UserRecord | null) => {
    if (!user) {
        return null;
    }

    return userRepository.applyBundleCreditExpiry(user._id);
};

const bookmarkOwnerFilter = (userId: string) => {
    const oid = new ObjectId(userId);

    return {
        $or: [
            { userId: oid },
            { journalistId: oid },
        ],
    };
};

const buildPortalState = (user: UserRecord) => {
    const dto = UserResponseDTO.fromModel(user as Omit<UserRecord, 'password'>);

    return {
        id: dto.id,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        mediaOutlet: user.journalistProfile?.mediaOutlet ?? user.organization ?? '',
        location: user.journalistProfile?.location ?? '',
        primaryBeat: user.journalistProfile?.primaryBeat ?? '',
        bio: user.journalistProfile?.bio ?? '',
        digestOptedIn: user.journalistProfile?.digestOptIn === true,
        organization: user.organization,
        phone: user.phone,
        credits: dto.credits,
        bundleCreditsRemaining: dto.bundleCreditsRemaining,
        permanentCredits: dto.permanentCredits,
        creditsExpiresAt: dto.creditsExpiresAt,
        bundleCreditsExpiresAt: dto.bundleCreditsExpiresAt,
        packageType: dto.packageType ?? null,
        memberSince: dto.createdAt,
        createdAt: dto.createdAt,
    };
};

export const getPortalProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const cacheKey = `carib:api:portal:${userId}:profile`;

        const body = await cacheAsideJson(cacheKey, PORTAL_USER_CACHE_TTL_SEC, async () => {
            let user = await userRepository.findById(userId);

            if (!user) {
                throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
            }

            user = await expireCreditsIfNeeded(user as UserRecord) ?? user;

            return successResponse('Profile retrieved successfully', buildPortalState(user as UserRecord));
        });

        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};

const packageCapacityForUser = (packageType: UserRecord['packageType']) => {
    /** Only the 3-Release bundle has a fixed pool size for progress UI. Single purchases have no fixed denominator. */
    if (packageType === 'bundle') {
        return 3;
    }

    return null;
};

export const updatePortalProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const currentUser = await userRepository.findById(userId);

        if (!currentUser) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        }

        if (req.body && typeof req.body === 'object') {
            const keys = Object.keys(req.body as Record<string, unknown>);
            const invalid = keys.filter((key) => key !== 'primaryBeat' && key !== 'bio');

            if (invalid.length > 0) {
                throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Invalid field(s): ${invalid.join(', ')}. Only primaryBeat and bio are allowed.`);
            }

            if ('primaryBeat' in req.body && typeof (req.body as { primaryBeat?: unknown }).primaryBeat !== 'string') {
                throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'primaryBeat must be a string.');
            }

            if ('bio' in req.body && typeof (req.body as { bio?: unknown }).bio !== 'string') {
                throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'bio must be a string.');
            }
        }

        const baseProfile = currentUser.journalistProfile ?? {
            mediaOutlet: currentUser.organization ?? null,
            location: null,
            primaryBeat: null,
            website: null,
            bio: null,
            digestOptIn: false,
            digestFrequency: 'daily' as const,
        };

        const primaryBeat = typeof req.body.primaryBeat === 'string'
            ? req.body.primaryBeat.trim().replace(/\s+/g, ' ')
            : (baseProfile.primaryBeat ?? '');

        const bio = typeof req.body.bio === 'string'
            ? req.body.bio.trim().replace(/\s+/g, ' ')
            : (baseProfile.bio ?? '');

        const profile: JournalistProfile = {
            ...baseProfile,
            primaryBeat: primaryBeat || null,
            bio: bio || null,
        };

        const user = await userRepository.update(userId, {
            journalistProfile: profile,
        });

        await invalidatePortalUserCache(userId);

        res.status(HTTP_STATUS.OK).json(successResponse('Profile updated successfully', buildPortalState(user as UserRecord)));
    } catch (error) {
        next(error);
    }
};

export const getPortalCredits = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const cacheKey = `carib:api:portal:${userId}:credits`;

        const body = await cacheAsideJson(cacheKey, PORTAL_USER_CACHE_TTL_SEC, async () => {
            let user = await userRepository.findById(userId);

            if (!user) {
                throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
            }

            user = await expireCreditsIfNeeded(user as UserRecord) ?? user;
            const u = user as UserRecord;
            const dto = UserResponseDTO.fromModel(u);
            const bundleRemaining = Math.max(0, u.bundleCreditsRemaining ?? 0);
            const capacity = packageCapacityForUser(u.packageType ?? null);
            const used = capacity !== null ? Math.max(0, capacity - bundleRemaining) : null;

            return successResponse('Credits retrieved successfully', {
                credits: dto.credits,
                bundleCreditsRemaining: bundleRemaining,
                permanentCredits: dto.permanentCredits,
                packageType: dto.packageType,
                creditsExpiresAt: dto.creditsExpiresAt,
                bundleCreditsExpiresAt: dto.bundleCreditsExpiresAt,
                packageCapacity: capacity,
                creditsUsedInPackage: used,
            });
        });

        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};

export const getPortalSubmissions = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const submissions = await pressReleaseRepository.findBySubmitterId(userId);

        res.status(HTTP_STATUS.OK).json(
            successResponse(
                'Submissions retrieved successfully',
                submissions.map((release) => PressReleaseResponseDTO.fromModel(release)),
            ),
        );
    } catch (error) {
        next(error);
    }
};

export const getPortalBookmarks = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const cacheKey = `carib:api:portal:${userId}:bookmarks`;

        const body = await cacheAsideJson(cacheKey, PORTAL_USER_CACHE_TTL_SEC, async () => {
            const bookmarks = await bookmarkCollection().find(bookmarkOwnerFilter(userId)).sort({ createdAt: -1 }).toArray();
            const releases = await Promise.all(bookmarks.map((bookmark) => pressReleaseRepository.findById(bookmark.releaseId)));
            const existingReleases = releases.filter((release): release is PressReleaseRecord => Boolean(release));

            return successResponse(
                'Bookmarks retrieved successfully',
                existingReleases.map((release) => PressReleaseResponseDTO.fromModel(release)),
            );
        });

        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};

export const addPortalBookmark = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const releaseId = toObjectId(req.body.releaseId || req.body.id);

        if (!releaseId) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Release ID is required');
        }

        const oid = new ObjectId(userId);

        await bookmarkCollection().updateOne(
            { releaseId, $or: [{ userId: oid }, { journalistId: oid }] },
            {
                $set: { userId: oid },
                $setOnInsert: {
                    _id: new ObjectId(),
                    releaseId,
                    createdAt: new Date(),
                },
            },
            { upsert: true },
        );

        await invalidatePortalUserCache(userId);

        res.status(HTTP_STATUS.CREATED).json(successResponse('Bookmark saved successfully'));
    } catch (error) {
        next(error);
    }
};

export const removePortalBookmark = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const releaseId = toObjectId(req.params.id);

        if (!releaseId) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Release ID is required');
        }

        await bookmarkCollection().deleteMany({
            releaseId,
            $or: [{ userId: new ObjectId(userId) }, { journalistId: new ObjectId(userId) }],
        });

        await invalidatePortalUserCache(userId);

        res.status(HTTP_STATUS.OK).json(successResponse('Bookmark removed successfully'));
    } catch (error) {
        next(error);
    }
};

export const updatePortalDigestSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const currentUser = await userRepository.findById(userId);

        if (!currentUser) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        }

        if (!req.body || typeof req.body !== 'object') {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Request body must be JSON with digestOptedIn (boolean).');
        }

        const bodyKeys = Object.keys(req.body as Record<string, unknown>);
        const invalid = bodyKeys.filter((key) => key !== 'digestOptedIn');

        if (invalid.length > 0) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, `Invalid field(s): ${invalid.join(', ')}. Only digestOptedIn is allowed.`);
        }

        if (typeof (req.body as { digestOptedIn?: unknown }).digestOptedIn !== 'boolean') {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'digestOptedIn (boolean) is required.');
        }

        const digestOptIn = (req.body as { digestOptedIn: boolean }).digestOptedIn;

        const raw = currentUser.journalistProfile;
        const existing: JournalistProfile = raw
            ? {
                mediaOutlet: raw.mediaOutlet ?? null,
                location: raw.location ?? null,
                primaryBeat: raw.primaryBeat ?? null,
                website: raw.website ?? null,
                bio: raw.bio ?? null,
                digestOptIn: raw.digestOptIn === true,
                digestFrequency: raw.digestFrequency === '3x-weekly' ? '3x-weekly' : 'daily',
                unsubscribeToken: raw.unsubscribeToken ?? undefined,
            }
            : {
                mediaOutlet: currentUser.organization ?? null,
                location: null,
                primaryBeat: null,
                website: null,
                bio: null,
                digestOptIn: false,
                digestFrequency: 'daily',
            };

        const globalFrequency = await getEmailDigestFrequency();
        const digestFrequency: 'daily' | '3x-weekly' = digestOptIn
            ? globalFrequency
            : (existing.digestFrequency === '3x-weekly' ? '3x-weekly' : 'daily');

        const profile: JournalistProfile = {
            ...existing,
            digestOptIn,
            digestFrequency,
            unsubscribeToken: existing.unsubscribeToken ?? crypto.randomUUID(),
        };
        const user = await userRepository.update(userId, { journalistProfile: profile });

        await invalidatePortalUserCache(userId);

        res.status(HTTP_STATUS.OK).json(successResponse('Digest settings updated successfully', buildPortalState(user as UserRecord)));
    } catch (error) {
        next(error);
    }
};

export const unsubscribeDigestGet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = typeof req.query.token === 'string' ? req.query.token : '';

        if (!token) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Unsubscribe token is required');
        }

        const user = await getDb().collection<UserRecord>('users').findOne({ 'journalistProfile.unsubscribeToken': token });

        if (user) {
            await userRepository.update(user._id, {
                journalistProfile: {
                    ...user.journalistProfile,
                    digestOptIn: false,
                } as JournalistProfile,
            });

            const loginUrl = `${ENV.FRONTEND_URL.replace(/\/$/, '')}/login`;

            res.status(HTTP_STATUS.OK).type('html').send(
                '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>'
                + '<body style="font-family: Arial, sans-serif; color: #274060; padding: 24px; max-width: 560px;">'
                + '<p>You have been successfully unsubscribed from Carib Newswire email digests.</p>'
                + '<p>Changed your mind? <a href="' + loginUrl + '">Log in</a> to your portal to re-subscribe.</p>'
                + '</body></html>',
            );
            return;
        }

        const subscriber = await newsletterSubscriberRepository.unsubscribeByToken(token);

        if (!subscriber) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Unsubscribe token not found');
        }

        res.status(HTTP_STATUS.OK).type('html').send(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>'
            + '<body style="font-family: Arial, sans-serif; color: #274060; padding: 24px; max-width: 560px;">'
            + '<p>You have been successfully unsubscribed from Carib Newswire email digests.</p>'
            + '</body></html>',
        );
    } catch (error) {
        next(error);
    }
};

export const getPortalDashboard = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const userId = requirePortalUser(req);
        const cacheKey = `carib:api:portal:${userId}:dashboard`;

        const body = await cacheAsideJson(cacheKey, PORTAL_USER_CACHE_TTL_SEC, async () => {
            let user = await userRepository.findById(userId);

            if (!user) {
                throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
            }

            user = await expireCreditsIfNeeded(user as UserRecord) ?? user;
            const submissions = await pressReleaseRepository.findBySubmitterId(userId);

            return successResponse('Dashboard retrieved successfully', {
                user: UserResponseDTO.fromModel(user as Omit<UserRecord, 'password'>),
                submissions: submissions.map((release) => PressReleaseResponseDTO.fromModel(release)),
            });
        });

        res.status(HTTP_STATUS.OK).json(body);
    } catch (error) {
        next(error);
    }
};
