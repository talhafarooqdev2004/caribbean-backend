import { MongoServerError, ObjectId, type Filter, type OptionalUnlessRequiredId, type Sort } from 'mongodb';
import { HTTP_STATUS } from '../config/constants.js';
import { ApiError } from '../exceptions/ApiError.js';
import { getDb } from '../lib/mongodb.js';
import {
    bumpPressReleaseListCache,
    invalidatePublicPressReleaseDetailKeys,
    invalidatePortalUserCache,
    isRedisCacheEnabled,
} from '../services/apiCache.service.js';
import type { PaymentStatus, PressReleasePackage, PressReleaseRecord, PressReleaseStatus } from '../types/PressRelease.js';
import { slugify, toObjectId } from '../utils/mongo.util.js';

type CreatePressReleasePayload = Omit<PressReleaseRecord, '_id' | 'slug' | 'views' | 'clicks' | 'createdAt' | 'updatedAt' | 'publishedAt' | 'paymentId'> & {
    paymentId?: ObjectId | null;
};

export type PressReleaseQuery = {
    status?: PressReleaseStatus;
    category?: string;
    island?: string;
    featured?: boolean;
    isActive?: boolean;
    paymentStatus?: PaymentStatus;
    search?: string;
    sort?: 'newest' | 'oldest' | 'mostViewed' | 'featured' | 'featuredFirst' | 'adminQueue';
    dateRange?: 'today' | 'thisWeek' | 'thisMonth' | 'last3Months' | 'allTime';
    limit?: number;
    page?: number;
};

const collection = () => getDb().collection<PressReleaseRecord>('press_releases');

const buildSummary = (content: string) => {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildPressReleaseFilter = (query: PressReleaseQuery): Filter<PressReleaseRecord> => {
    const filter: Filter<PressReleaseRecord> = {};

    if (query.status) filter.status = query.status;
    if (query.category) {
        const categoryTrimmed = query.category.trim();
        if (categoryTrimmed) {
            filter.category = { $regex: new RegExp(`^${escapeRegex(categoryTrimmed)}$`, 'i') };
        }
    }
    if (query.island) {
        const islandTrimmed = query.island.trim();
        if (islandTrimmed) {
            filter.island = { $regex: new RegExp(`^${escapeRegex(islandTrimmed)}$`, 'i') };
        }
    }
    if (query.featured !== undefined) filter.featured = query.featured;

    if (query.isActive === true) {
        filter.$or = [{ isActive: { $exists: false } }, { isActive: true }];
    } else if (query.isActive === false) {
        filter.isActive = false;
    }

    if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;

    if (query.dateRange && query.dateRange !== 'allTime') {
        const since = new Date();

        if (query.dateRange === 'today') {
            since.setHours(0, 0, 0, 0);
        } else if (query.dateRange === 'thisWeek') {
            since.setDate(since.getDate() - 7);
        } else if (query.dateRange === 'thisMonth') {
            since.setMonth(since.getMonth() - 1);
        } else if (query.dateRange === 'last3Months') {
            since.setMonth(since.getMonth() - 3);
        }

        filter.createdAt = { $gte: since };
    }

    const term = query.search?.trim();
    if (term) {
        const escaped = escapeRegex(term);
        filter.$or = [
            { title: { $regex: escaped, $options: 'i' } },
            { summary: { $regex: escaped, $options: 'i' } },
        ];
    }

    return filter;
};

const buildSort = (query: PressReleaseQuery): Sort => {
    return query.sort === 'adminQueue'
        ? { featured: -1 as const, featuredUpgrade: -1 as const, createdAt: -1 as const }
        : query.sort === 'featured' || query.sort === 'featuredFirst'
        ? { featured: -1 as const, publishedAt: -1 as const, createdAt: -1 as const }
        : query.sort === 'oldest'
            ? { publishedAt: 1 as const, createdAt: 1 as const }
            : query.sort === 'mostViewed'
                ? { views: -1 as const, publishedAt: -1 as const, createdAt: -1 as const }
                : { publishedAt: -1 as const, createdAt: -1 as const };
};

export class PressReleaseRepository {
    /** Ensures no existing release already uses this headline's canonical newsroom URL (`slugify(title)`). */
    async assertCanonicalSlugAvailable(title: string) {
        const slug = slugify(title);

        if (!slug) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Please enter a valid release title.');
        }

        const existing = await collection().findOne({ slug });

        if (existing) {
            throw new ApiError(
                HTTP_STATUS.CONFLICT,
                'That headline matches a story that already uses this link. Change the title slightly so your release has its own page.',
            );
        }
    }

    async findAll(query: PressReleaseQuery = {}) {
        const filter = buildPressReleaseFilter(query);
        const sort = buildSort(query);
        const limit = Math.min(Math.max(1, query.limit ?? 100), 100);
        const page = Math.max(1, query.page ?? 1);
        const skip = (page - 1) * limit;

        return collection().find(filter).sort(sort).skip(skip).limit(limit).toArray();
    }

    async countByQuery(query: PressReleaseQuery = {}) {
        const filter = buildPressReleaseFilter(query);
        return collection().countDocuments(filter);
    }

    async findBySubmitterId(submitterId: string | ObjectId) {
        const objectId = toObjectId(submitterId);

        if (!objectId) {
            return [];
        }

        return collection().find({ submitterId: objectId }).sort({ createdAt: -1 }).toArray();
    }

    async findById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId });
    }

    async findBySlug(slug: string) {
        return collection().findOne({ slug });
    }

    async create(payload: CreatePressReleasePayload) {
        const now = new Date();
        const slug = slugify(payload.title);
        const document: OptionalUnlessRequiredId<PressReleaseRecord> = {
            ...payload,
            _id: new ObjectId(),
            slug,
            summary: payload.summary || buildSummary(payload.content),
            paymentId: payload.paymentId ?? null,
            views: 0,
            clicks: 0,
            createdAt: now,
            updatedAt: now,
            publishedAt: payload.status === 'approved' ? now : null,
        };

        try {
            await collection().insertOne(document);
        } catch (error) {
            if (error instanceof MongoServerError && error.code === 11000) {
                const msg = String(error.message || '');

                if (msg.includes('slug')) {
                    throw new ApiError(
                        HTTP_STATUS.CONFLICT,
                        'That headline matches a story that already uses this link. Change the title slightly so your release has its own page.',
                    );
                }
            }

            throw error;
        }

        const release = await this.findById(document._id);

        if (!release) {
            throw new Error('Unable to persist press release');
        }

        if (isRedisCacheEnabled()) {
            await bumpPressReleaseListCache();
            await invalidatePublicPressReleaseDetailKeys(release._id.toHexString(), [release.slug]);

            if (release.submitterId) {
                await invalidatePortalUserCache(release.submitterId.toHexString());
            }
        }

        return release;
    }

    async update(id: string | ObjectId, payload: Partial<Omit<PressReleaseRecord, '_id' | 'createdAt'>>) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        const previous = isRedisCacheEnabled() ? await this.findById(objectId) : null;

        const set: Partial<PressReleaseRecord> = {
            ...payload,
            updatedAt: new Date(),
        };

        if (typeof payload.content === 'string') {
            set.summary = buildSummary(payload.content);
        }

        if (typeof payload.title === 'string') {
            const existing = await this.findById(objectId);
            const nextTitle = payload.title.trim();

            if (existing && nextTitle && nextTitle !== existing.title) {
                const newSlug = slugify(nextTitle);
                const colliding = await collection().findOne({ slug: newSlug });

                if (colliding && !colliding._id.equals(objectId)) {
                    throw new ApiError(
                        HTTP_STATUS.CONFLICT,
                        'That headline matches a story that already uses this link. Change the title slightly so your release has its own page.',
                    );
                }

                set.slug = newSlug;
            }
        }

        if (payload.status === 'approved' && payload.publishedAt === undefined) {
            set.publishedAt = new Date();
        }

        const updated = await collection().findOneAndUpdate(
            { _id: objectId },
            { $set: set },
            { returnDocument: 'after' },
        );

        if (isRedisCacheEnabled() && updated) {
            await bumpPressReleaseListCache();
            const slugs = [previous?.slug, updated.slug].filter((s): s is string => Boolean(s));
            await invalidatePublicPressReleaseDetailKeys(updated._id.toHexString(), [...new Set(slugs)]);

            if (updated.submitterId) {
                await invalidatePortalUserCache(updated.submitterId.toHexString());
            }
        }

        return updated;
    }

    async updatePayment(id: string | ObjectId, paymentId: ObjectId, paymentStatus: PaymentStatus) {
        const update: Partial<PressReleaseRecord> = {
            paymentId,
            paymentStatus,
        };

        if (paymentStatus === 'paid') {
            update.status = 'pending';
        }

        return this.update(id, update);
    }

    async updateStatus(id: string | ObjectId, status: PressReleaseStatus, rejectionReason = '') {
        return this.update(id, {
            status,
            publishedAt: status === 'approved' ? new Date() : null,
            rejectionReason: status === 'rejected' ? rejectionReason || null : null,
            ...(status === 'approved' ? { isActive: true } : {}),
        } as Partial<PressReleaseRecord>);
    }

    async toggleFeatured(id: string | ObjectId) {
        const release = await this.findById(id);

        if (!release) {
            return null;
        }

        return this.update(release._id, { featured: !release.featured });
    }

    async setFeatured(id: string | ObjectId, featured: boolean) {
        return this.update(id, { featured });
    }

    async setActive(id: string | ObjectId, isActive: boolean) {
        return this.update(id, { isActive });
    }

    isLivePublicRelease(release: PressReleaseRecord) {
        return release.status === 'approved' && release.paymentStatus === 'paid' && release.isActive !== false;
    }

    async incrementViews(idOrSlug: string) {
        const release = toObjectId(idOrSlug)
            ? await collection().findOne({ _id: toObjectId(idOrSlug)! })
            : await collection().findOne({ slug: idOrSlug });

        if (!release || !this.isLivePublicRelease(release)) {
            return null;
        }

        const filter = toObjectId(idOrSlug)
            ? { _id: toObjectId(idOrSlug)! }
            : { slug: idOrSlug };

        const updated = await collection().findOneAndUpdate(
            filter,
            { $inc: { views: 1 }, $set: { updatedAt: new Date() } },
            { returnDocument: 'after' },
        );

        if (isRedisCacheEnabled() && updated) {
            await invalidatePublicPressReleaseDetailKeys(updated._id.toHexString(), [updated.slug]);

            if (updated.submitterId) {
                await invalidatePortalUserCache(updated.submitterId.toHexString());
            }
        }

        return updated;
    }

    async incrementClicks(idOrSlug: string) {
        const release = toObjectId(idOrSlug)
            ? await collection().findOne({ _id: toObjectId(idOrSlug)! })
            : await collection().findOne({ slug: idOrSlug });

        if (!release || !this.isLivePublicRelease(release)) {
            return null;
        }

        const filter = toObjectId(idOrSlug)
            ? { _id: toObjectId(idOrSlug)! }
            : { slug: idOrSlug };

        const updated = await collection().findOneAndUpdate(
            filter,
            { $inc: { clicks: 1 }, $set: { updatedAt: new Date() } },
            { returnDocument: 'after' },
        );

        if (isRedisCacheEnabled() && updated) {
            await invalidatePublicPressReleaseDetailKeys(updated._id.toHexString(), [updated.slug]);

            if (updated.submitterId) {
                await invalidatePortalUserCache(updated.submitterId.toHexString());
            }
        }

        return updated;
    }

    async delete(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return false;
        }

        const existing = isRedisCacheEnabled() ? await this.findById(objectId) : null;
        const result = await collection().deleteOne({ _id: objectId });

        if (result.deletedCount === 1 && isRedisCacheEnabled() && existing) {
            await bumpPressReleaseListCache();
            await invalidatePublicPressReleaseDetailKeys(existing._id.toHexString(), [existing.slug]);

            if (existing.submitterId) {
                await invalidatePortalUserCache(existing.submitterId.toHexString());
            }
        }

        return result.deletedCount === 1;
    }

    async count(status?: PressReleaseStatus) {
        return collection().countDocuments(status ? { status } : {});
    }

    async countSince(since: Date, status?: PressReleaseStatus) {
        return collection().countDocuments({
            createdAt: { $gte: since },
            ...(status ? { status } : {}),
        });
    }

    async countPaidSince(since: Date) {
        return collection().countDocuments({
            createdAt: { $gte: since },
            paymentStatus: 'paid',
        });
    }

    /** Paid releases only — used for admin queue tab totals. */
    async countPaidByStatuses(): Promise<{ pending: number; approved: number; rejected: number }> {
        const base = { paymentStatus: 'paid' as const };
        const [pending, approved, rejected] = await Promise.all([
            collection().countDocuments({ ...base, status: 'pending' }),
            collection().countDocuments({ ...base, status: 'approved' }),
            collection().countDocuments({ ...base, status: 'rejected' }),
        ]);

        return { pending, approved, rejected };
    }

    async countApprovedPaidSince(since: Date) {
        return collection().countDocuments({
            createdAt: { $gte: since },
            status: 'approved',
            paymentStatus: 'paid',
        });
    }

    async countBySubmitter(submitterId: string | ObjectId) {
        const objectId = toObjectId(submitterId);

        if (!objectId) {
            return 0;
        }

        return collection().countDocuments({ submitterId: objectId });
    }

    getPackagePrice(packageId: PressReleasePackage, featuredUpgrade: boolean) {
        const packagePrice = packageId === 'bundle' ? 399 : packageId === 'custom' ? 999 : 149;
        const featuredPrice = featuredUpgrade ? 99 : 0;

        return (packagePrice + featuredPrice) * 100;
    }
}
