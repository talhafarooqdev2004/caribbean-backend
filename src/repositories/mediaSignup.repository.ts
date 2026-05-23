import { ObjectId, type Filter, type OptionalUnlessRequiredId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import { bumpMediaSignupListCache, isRedisCacheEnabled } from '../services/apiCache.service.js';
import type { MediaSignupRecord, MediaSignupStatus } from '../types/MediaSignup.js';
import { toObjectId } from '../utils/mongo.util.js';

type CreateMediaSignupPayload = Omit<MediaSignupRecord, '_id' | 'status' | 'createdAt' | 'updatedAt' | 'source'> & {
    source?: MediaSignupRecord['source'];
};

const collection = () => getDb().collection<MediaSignupRecord>('media_signups');

const mediaSignupOnlyFilter = (): Filter<MediaSignupRecord> => ({
    $or: [
        { source: 'media-signup' },
        { source: { $exists: false } },
    ],
});

export class MediaSignupRepository {
    async findAll(status?: MediaSignupStatus, page = 1, limit = 100) {
        const filter: Filter<MediaSignupRecord> = {
            ...mediaSignupOnlyFilter(),
            ...(status ? { status } : {}),
        };
        const safeLimit = Math.min(Math.max(1, limit), 100);
        const safePage = Math.max(1, page);
        const skip = (safePage - 1) * safeLimit;

        return collection().find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).toArray();
    }

    async countStatusBreakdown() {
        const [total, pending, approved, rejected] = await Promise.all([
            this.count(),
            this.count('pending'),
            this.count('approved'),
            this.count('rejected'),
        ]);

        return { total, pending, approved, rejected };
    }

    async findById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId });
    }

    async create(payload: CreateMediaSignupPayload) {
        const now = new Date();
        const document: OptionalUnlessRequiredId<MediaSignupRecord> = {
            ...payload,
            _id: new ObjectId(),
            source: payload.source ?? 'media-signup',
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };

        await collection().updateOne(
            { requestId: payload.requestId },
            { $setOnInsert: document },
            { upsert: true },
        );

        const signup = await collection().findOne({ requestId: payload.requestId });

        if (!signup) {
            throw new Error('Unable to persist media signup');
        }

        if (isRedisCacheEnabled()) {
            await bumpMediaSignupListCache();
        }

        return signup;
    }

    async updateStatus(id: string | ObjectId, status: MediaSignupStatus) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        const updated = await collection().findOneAndUpdate(
            { _id: objectId },
            {
                $set: {
                    status,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: 'after' },
        );

        if (isRedisCacheEnabled() && updated) {
            await bumpMediaSignupListCache();
        }

        return updated;
    }

    async delete(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return false;
        }

        const result = await collection().deleteOne({ _id: objectId });

        if (result.deletedCount === 1 && isRedisCacheEnabled()) {
            await bumpMediaSignupListCache();
        }

        return result.deletedCount === 1;
    }

    async markPortalInvited(id: string | ObjectId, portalUserId: ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        const now = new Date();

        const updated = await collection().findOneAndUpdate(
            { _id: objectId },
            {
                $set: {
                    portalInvitedAt: now,
                    portalUserId,
                    updatedAt: now,
                },
            },
            { returnDocument: 'after' },
        );

        if (isRedisCacheEnabled() && updated) {
            await bumpMediaSignupListCache();
        }

        return updated;
    }

    async count(status?: MediaSignupStatus) {
        return collection().countDocuments({
            ...mediaSignupOnlyFilter(),
            ...(status ? { status } : {}),
        });
    }
}
