import { ObjectId, type OptionalUnlessRequiredId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import type {
    MediaPortalInviteJobRecord,
    MediaPortalInviteJobResultEntry,
    MediaPortalInviteJobStatus,
} from '../types/MediaPortalInviteJob.js';
import { toObjectId } from '../utils/mongo.util.js';

const collection = () => getDb().collection<MediaPortalInviteJobRecord>('media_portal_invite_jobs');

export class MediaPortalInviteJobRepository {
    async create(signupIds: ObjectId[]) {
        const now = new Date();
        const document: OptionalUnlessRequiredId<MediaPortalInviteJobRecord> = {
            _id: new ObjectId(),
            status: 'queued',
            signupIds,
            currentIndex: 0,
            results: [],
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            completedAt: null,
            lastError: null,
        };

        await collection().insertOne(document);

        return collection().findOne({ _id: document._id });
    }

    async findById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId });
    }

    async markProcessing(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        const now = new Date();

        return collection().findOneAndUpdate(
            { _id: objectId, status: 'queued' },
            {
                $set: {
                    status: 'processing' as MediaPortalInviteJobStatus,
                    startedAt: now,
                    updatedAt: now,
                },
            },
            { returnDocument: 'after' },
        );
    }

    async appendResultAndAdvance(
        id: string | ObjectId,
        entry: MediaPortalInviteJobResultEntry,
        nextIndex: number,
        totalSignups: number,
    ) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        const now = new Date();
        const done = nextIndex >= totalSignups;
        const set: Partial<MediaPortalInviteJobRecord> = {
            currentIndex: nextIndex,
            updatedAt: now,
        };

        if (done) {
            set.status = 'completed';
            set.completedAt = now;
        }

        return collection().findOneAndUpdate(
            { _id: objectId },
            {
                $push: { results: entry },
                $set: set,
            },
            { returnDocument: 'after' },
        );
    }

    async setFailed(id: string | ObjectId, message: string) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        const now = new Date();

        return collection().findOneAndUpdate(
            { _id: objectId },
            {
                $set: {
                    status: 'failed' as MediaPortalInviteJobStatus,
                    lastError: message,
                    completedAt: now,
                    updatedAt: now,
                },
            },
            { returnDocument: 'after' },
        );
    }

    async findStaleProcessing(olderThan: Date) {
        return collection()
            .find({
                status: 'processing',
                updatedAt: { $lt: olderThan },
            })
            .toArray();
    }

    async touchUpdatedAt(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return;
        }

        await collection().updateOne(
            { _id: objectId },
            { $set: { updatedAt: new Date() } },
        );
    }
}
