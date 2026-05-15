import { ObjectId, type Filter, type OptionalUnlessRequiredId, type UpdateFilter } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import { invalidatePortalUserCache, isRedisCacheEnabled } from '../services/apiCache.service.js';
import type { UserCreditLot, UserCreditLotKind, UserRecord, UserRole } from '../types/User.js';
import {
    activeCreditLotsSorted,
    buildLegacyMigrationLots,
    deriveCreditFieldsFromLots,
    walletGrantExpiresAt,
} from '../utils/creditLots.util.js';
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
    creditLots?: UserCreditLot[];
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
            creditLots: userData.creditLots ?? [],
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
        if (userData.creditLots !== undefined) set.creditLots = userData.creditLots;
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
     * Strips expired legacy bundle wallet fields before first migration to `creditLots`.
     * No-op when `creditLots` is already populated.
     */
    private async legacyExpireBundleWalletOnly(objectId: ObjectId): Promise<void> {
        const user = await this.findById(objectId);

        if (!user || (user.creditLots && user.creditLots.length > 0)) {
            return;
        }

        const bundleRemaining = user.bundleCreditsRemaining ?? 0;
        const exp = user.creditsExpiresAt;

        if (bundleRemaining <= 0 || !exp || exp > new Date()) {
            return;
        }

        const strip = Math.min(bundleRemaining, user.credits ?? 0);
        const nextCredits = Math.max(0, (user.credits ?? 0) - strip);
        const nextPackageType: UserRecord['packageType'] = nextCredits > 0 ? 'single' : null;

        await collection().findOneAndUpdate(
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
        );

        if (isRedisCacheEnabled()) {
            await invalidatePortalUserCache(objectId.toHexString());
        }
    }

    private async persistCreditLots(objectId: ObjectId, lots: UserCreditLot[]): Promise<UserRecord | null> {
        const now = new Date();
        const derived = deriveCreditFieldsFromLots(lots, now);

        const updated = await collection().findOneAndUpdate(
            { _id: objectId },
            {
                $set: {
                    creditLots: lots,
                    credits: derived.credits,
                    bundleCreditsRemaining: derived.bundleCreditsRemaining,
                    creditsExpiresAt: derived.creditsExpiresAt,
                    packageType: derived.packageType,
                    updatedAt: now,
                },
            },
            { returnDocument: 'after', projection: { password: 0 } },
        );

        if (isRedisCacheEnabled() && updated) {
            await invalidatePortalUserCache(objectId.toHexString());
        }

        return updated ?? this.findById(objectId);
    }

    /** Builds `creditLots` from legacy denormalized fields when missing. */
    private async ensureCreditLotsMigrated(objectId: ObjectId): Promise<void> {
        const user = await this.findById(objectId);

        if (!user) {
            return;
        }

        if (user.creditLots && user.creditLots.length > 0) {
            return;
        }

        await this.migrateLegacyBundleCreditsIfNeeded(objectId);
        await this.legacyExpireBundleWalletOnly(objectId);

        const u2 = await this.findById(objectId);

        if (!u2) {
            return;
        }

        const lots = buildLegacyMigrationLots(u2);
        await this.persistCreditLots(objectId, lots);
    }

    /**
     * Drops expired credit lots and syncs denormalized counters. Call on portal load / before mutating wallet.
     */
    async applyBundleCreditExpiry(id: string | ObjectId): Promise<UserRecord | null> {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        await this.ensureCreditLotsMigrated(objectId);

        const user = await this.findById(objectId);

        if (!user) {
            return null;
        }

        const now = new Date();
        const nextLots = activeCreditLotsSorted(user.creditLots, now);

        return this.persistCreditLots(objectId, nextLots);
    }

    /**
     * Adds wallet credits as a new lot. Each lot expires on `expiresAt` (typically six months from grant).
     * @param kind `bundle` = 3-Release wallet; `single` = pricing / release top-ups; `admin` = manual grant.
     */
    async addCredits(
        id: string | ObjectId,
        credits: number,
        kind: UserCreditLotKind,
        expiresAt: Date,
    ): Promise<UserRecord | null> {
        const objectId = toObjectId(id);

        if (!objectId || !Number.isFinite(credits) || credits <= 0) {
            return null;
        }

        await this.applyBundleCreditExpiry(objectId);

        const user = await this.findById(objectId);

        if (!user) {
            return null;
        }

        const now = new Date();
        const lots = activeCreditLotsSorted(user.creditLots, now);
        lots.push({ credits, expiresAt, kind });

        return this.persistCreditLots(objectId, lots);
    }

    async incrementCreditsByDelta(id: string | ObjectId, delta: number) {
        return this.addCredits(id, delta, 'admin', walletGrantExpiresAt());
    }

    /** Consumes one credit from the non-expired lot with the soonest expiry. */
    async consumeCredit(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        await this.applyBundleCreditExpiry(objectId);

        const user = await this.findById(objectId);

        if (!user || (user.credits ?? 0) <= 0) {
            return null;
        }

        const now = new Date();
        const sorted = activeCreditLotsSorted(user.creditLots, now);

        if (sorted.length === 0) {
            return null;
        }

        const nextLots = sorted
            .map((lot, index) => (index === 0 ? { ...lot, credits: lot.credits - 1 } : lot))
            .filter((lot) => lot.credits > 0);

        return this.persistCreditLots(objectId, nextLots);
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
