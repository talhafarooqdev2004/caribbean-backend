import { ObjectId, type Filter, type OptionalUnlessRequiredId, type UpdateFilter } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import { invalidatePortalUserCache, isRedisCacheEnabled } from '../services/apiCache.service.js';
import type { UserRecord, UserRole } from '../types/User.js';
import { toObjectId } from '../utils/mongo.util.js';

type CreateUserPayload = {
    firstName: string;
    lastName: string;
    email: string;
    password: string | null;
    role: UserRole;
    phone?: string | null;
    organization?: string | null;
    credits?: number;
    creditsExpiresAt?: Date | null;
    bundleCreditsRemaining?: number;
    packageType?: UserRecord['packageType'];
    journalistProfile?: UserRecord['journalistProfile'];
};

type UpdateUserPayload = Partial<Omit<CreateUserPayload, 'password'>> & {
    password?: string | null;
    passwordResetToken?: string | null;
    passwordResetExpiresAt?: Date | null;
};

const collection = () => getDb().collection<UserRecord>('users');

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export class UserRepository {
    async findAll(role?: UserRole) {
        const filter: Filter<UserRecord> = role ? { role } : { role: { $ne: 'admin' } };

        return collection().find(filter, {
            projection: { password: 0 },
            sort: { createdAt: -1 },
        }).toArray();
    }

    async findPortalMembers() {
        return collection().find(
            { role: { $in: ['submitter', 'journalist'] } },
            {
                projection: { password: 0 },
                sort: { createdAt: -1 },
            },
        ).toArray();
    }

    /**
     * When admin changes global digest cadence, align opted-in portal users so scheduled sends match recipients.
     */
    async syncDigestFrequencyForOptedInPortalUsers(frequency: 'daily' | '3x-weekly') {
        const result = await collection().updateMany(
            {
                role: { $in: ['submitter', 'journalist'] },
                journalistProfile: { $ne: null },
                'journalistProfile.digestOptIn': { $ne: false },
            },
            {
                $set: {
                    'journalistProfile.digestFrequency': frequency,
                    updatedAt: new Date(),
                },
            },
        );

        return result.modifiedCount;
    }

    async findById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId }, { projection: { password: 0 } });
    }

    async findByIdWithPassword(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId });
    }

    async findByEmail(email: string) {
        const normalized = normalizeEmail(email);
        const exact = await collection().findOne({ email: normalized });

        if (exact) {
            return exact;
        }

        return collection().findOne({
            email: { $regex: new RegExp(`^${escapeRegex(normalized)}$`, 'i') },
        });
    }

    async findByPasswordResetToken(token: string) {
        const trimmed = token.trim();

        if (!trimmed) {
            return null;
        }

        return collection().findOne({
            passwordResetToken: trimmed,
            passwordResetExpiresAt: { $gt: new Date() },
        });
    }

    async create(userData: CreateUserPayload) {
        const now = new Date();
        const document: OptionalUnlessRequiredId<UserRecord> = {
            _id: new ObjectId(),
            firstName: userData.firstName,
            lastName: userData.lastName,
            email: normalizeEmail(userData.email),
            password: userData.password,
            role: userData.role,
            phone: userData.phone ?? null,
            organization: userData.organization ?? null,
            credits: userData.credits ?? 0,
            bundleCreditsRemaining: userData.bundleCreditsRemaining ?? 0,
            creditsExpiresAt: userData.creditsExpiresAt ?? null,
            packageType: userData.packageType ?? null,
            journalistProfile: userData.journalistProfile ?? null,
            createdAt: now,
            updatedAt: now,
        };

        await collection().insertOne(document);

        return this.findById(document._id);
    }

    async update(id: string | ObjectId, userData: UpdateUserPayload) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        const set: Partial<UserRecord> = {
            updatedAt: new Date(),
        };

        if (userData.firstName !== undefined) set.firstName = userData.firstName;
        if (userData.lastName !== undefined) set.lastName = userData.lastName;
        if (userData.email !== undefined) set.email = normalizeEmail(userData.email);
        if (userData.password !== undefined) set.password = userData.password;
        if (userData.role !== undefined) set.role = userData.role;
        if (userData.phone !== undefined) set.phone = userData.phone;
        if (userData.organization !== undefined) set.organization = userData.organization;
        if (userData.credits !== undefined) set.credits = userData.credits;
        if (userData.bundleCreditsRemaining !== undefined) set.bundleCreditsRemaining = userData.bundleCreditsRemaining;
        if (userData.creditsExpiresAt !== undefined) set.creditsExpiresAt = userData.creditsExpiresAt;
        if (userData.packageType !== undefined) set.packageType = userData.packageType;
        if (userData.journalistProfile !== undefined) set.journalistProfile = userData.journalistProfile;
        if (userData.passwordResetToken !== undefined) set.passwordResetToken = userData.passwordResetToken;
        if (userData.passwordResetExpiresAt !== undefined) set.passwordResetExpiresAt = userData.passwordResetExpiresAt;

        const result = await collection().findOneAndUpdate(
            { _id: objectId },
            { $set: set },
            { returnDocument: 'after', projection: { password: 0 } },
        );

        if (isRedisCacheEnabled() && result) {
            await invalidatePortalUserCache(objectId.toHexString());
        }

        return result;
    }

    async delete(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return false;
        }

        const result = await collection().deleteOne({ _id: objectId, role: { $ne: 'admin' } });

        return result.deletedCount === 1;
    }

    /**
     * One-time: legacy users only had `credits` + `creditsExpiresAt` for bundle purchases.
     * Treat the full balance as bundle-tagged so expiry removes only that pool after we ship split buckets.
     */
    async migrateLegacyBundleCreditsIfNeeded(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return;
        }

        await collection().updateOne(
            {
                _id: objectId,
                bundleCreditsRemaining: { $exists: false },
                packageType: 'bundle',
                credits: { $gt: 0 },
            },
            [{ $set: { bundleCreditsRemaining: '$credits', updatedAt: new Date() } }],
        );
    }

    /**
     * Removes expired 3-Release Package wallet credits only; leaves other credits untouched.
     */
    async applyBundleCreditExpiry(id: string | ObjectId): Promise<UserRecord | null> {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        await this.migrateLegacyBundleCreditsIfNeeded(objectId);

        const user = await this.findById(objectId);

        if (!user) {
            return null;
        }

        const bundleRemaining = user.bundleCreditsRemaining ?? 0;
        const exp = user.creditsExpiresAt;

        if (bundleRemaining <= 0 || !exp || exp > new Date()) {
            return user;
        }

        const strip = Math.min(bundleRemaining, user.credits ?? 0);
        const nextCredits = Math.max(0, (user.credits ?? 0) - strip);
        const nextPackageType: UserRecord['packageType'] = nextCredits > 0 ? 'single' : null;

        const updated = await collection().findOneAndUpdate(
            { _id: objectId },
            {
                $set: {
                    credits: nextCredits,
                    bundleCreditsRemaining: 0,
                    creditsExpiresAt: null,
                    packageType: nextPackageType,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: 'after', projection: { password: 0 } },
        );

        if (isRedisCacheEnabled() && updated) {
            await invalidatePortalUserCache(objectId.toHexString());
        }

        return updated ?? this.findById(objectId);
    }

    async addCredits(id: string | ObjectId, credits: number, packageType: UserRecord['packageType'], expiresAt: Date | null) {
        const objectId = toObjectId(id);

        if (!objectId || !Number.isFinite(credits) || credits <= 0) {
            return null;
        }

        await this.applyBundleCreditExpiry(objectId);

        const now = new Date();

        let updated: UserRecord | null = null;

        if (expiresAt) {
            updated = await collection().findOneAndUpdate(
                { _id: objectId },
                [
                    {
                        $set: {
                            credits: { $add: [{ $ifNull: ['$credits', 0] }, credits] },
                            bundleCreditsRemaining: { $add: [{ $ifNull: ['$bundleCreditsRemaining', 0] }, credits] },
                            creditsExpiresAt: {
                                $cond: {
                                    if: {
                                        $or: [
                                            { $lte: [{ $ifNull: ['$bundleCreditsRemaining', 0] }, 0] },
                                            { $eq: ['$creditsExpiresAt', null] },
                                            { $lte: ['$creditsExpiresAt', { $literal: now }] },
                                        ],
                                    },
                                    then: { $literal: expiresAt },
                                    else: { $max: ['$creditsExpiresAt', { $literal: expiresAt }] },
                                },
                            },
                            packageType: 'bundle',
                            updatedAt: { $literal: now },
                        },
                    },
                ],
                { returnDocument: 'after', projection: { password: 0 } },
            );
        } else {
            updated = await collection().findOneAndUpdate(
                { _id: objectId },
                [
                    {
                        $set: {
                            credits: { $add: [{ $ifNull: ['$credits', 0] }, credits] },
                            packageType: {
                                $cond: [
                                    { $gt: [{ $ifNull: ['$bundleCreditsRemaining', 0] }, 0] },
                                    'bundle',
                                    packageType ?? 'single',
                                ],
                            },
                            updatedAt: { $literal: now },
                        },
                    },
                ],
                { returnDocument: 'after', projection: { password: 0 } },
            );
        }

        if (isRedisCacheEnabled() && updated) {
            await invalidatePortalUserCache(objectId.toHexString());
        }

        return updated;
    }

    async incrementCreditsByDelta(id: string | ObjectId, delta: number) {
        const objectId = toObjectId(id);

        if (!objectId || !Number.isFinite(delta) || delta <= 0) {
            return null;
        }

        await this.applyBundleCreditExpiry(objectId);

        const now = new Date();
        const updated = await collection().findOneAndUpdate(
            { _id: objectId },
            [
                {
                    $set: {
                        credits: { $add: [{ $ifNull: ['$credits', 0] }, delta] },
                        packageType: {
                            $cond: [
                                { $gt: [{ $ifNull: ['$bundleCreditsRemaining', 0] }, 0] },
                                'bundle',
                                'single',
                            ],
                        },
                        updatedAt: { $literal: now },
                    },
                },
            ],
            { returnDocument: 'after', projection: { password: 0 } },
        );

        if (isRedisCacheEnabled() && updated) {
            await invalidatePortalUserCache(objectId.toHexString());
        }

        return updated;
    }

    /** Uses one bundle credit first when available, then non-expiring credits. */
    async consumeCredit(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        await this.applyBundleCreditExpiry(objectId);

        const now = new Date();

        const updated = await collection().findOneAndUpdate(
            {
                _id: objectId,
                credits: { $gt: 0 },
            },
            [
                {
                    $set: {
                        credits: { $subtract: [{ $ifNull: ['$credits', 0] }, 1] },
                        bundleCreditsRemaining: {
                            $max: [
                                0,
                                {
                                    $subtract: [
                                        { $ifNull: ['$bundleCreditsRemaining', 0] },
                                        {
                                            $cond: [
                                                { $gt: [{ $ifNull: ['$bundleCreditsRemaining', 0] }, 0] },
                                                1,
                                                0,
                                            ],
                                        },
                                    ],
                                },
                            ],
                        },
                    },
                },
                {
                    $set: {
                        creditsExpiresAt: {
                            $cond: [{ $eq: ['$bundleCreditsRemaining', 0] }, null, '$creditsExpiresAt'],
                        },
                        packageType: {
                            $cond: [
                                { $eq: ['$bundleCreditsRemaining', 0] },
                                {
                                    $cond: [{ $gt: ['$credits', 0] }, 'single', null],
                                },
                                'bundle',
                            ],
                        },
                        updatedAt: { $literal: now },
                    },
                },
            ],
            { returnDocument: 'after', projection: { password: 0 } },
        );

        if (isRedisCacheEnabled() && updated) {
            await invalidatePortalUserCache(objectId.toHexString());
        }

        return updated;
    }

    async count(role?: UserRole) {
        return collection().countDocuments(role ? { role } : { role: { $ne: 'admin' } });
    }

    async countNewUsers(days = 30, role?: UserRole) {
        const since = new Date();
        since.setDate(since.getDate() - days);

        return collection().countDocuments({
            ...(role ? { role } : { role: { $ne: 'admin' } }),
            createdAt: { $gte: since },
        });
    }
}
