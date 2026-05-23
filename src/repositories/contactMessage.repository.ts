import { ObjectId, type Filter, type OptionalUnlessRequiredId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import type { ContactMessageRecord } from '../types/ContactMessage.js';
import { toObjectId } from '../utils/mongo.util.js';

type CreateContactMessagePayload = Omit<ContactMessageRecord, '_id' | 'status' | 'createdAt' | 'updatedAt' | 'promotedMediaSignupId'>;

const collection = () => getDb().collection<ContactMessageRecord>('contact_messages');

const buildListFilter = (excludeEmailsLower: string[] = []) => {
    const filter: Filter<ContactMessageRecord> = {};

    if (excludeEmailsLower.length > 0) {
        filter.email = { $nin: excludeEmailsLower };
    }

    return filter;
};

export class ContactMessageRepository {
    async findAll(page = 1, limit = 100, excludeEmailsLower: string[] = []) {
        const safeLimit = Math.min(Math.max(1, limit), 100);
        const safePage = Math.max(1, page);
        const skip = (safePage - 1) * safeLimit;
        const filter = buildListFilter(excludeEmailsLower);

        return collection().find(filter).sort({ createdAt: -1 }).skip(skip).limit(safeLimit).toArray();
    }

    async count(excludeEmailsLower: string[] = []) {
        return collection().countDocuments(buildListFilter(excludeEmailsLower));
    }

    async findById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId });
    }

    async create(payload: CreateContactMessagePayload) {
        const now = new Date();
        const document: OptionalUnlessRequiredId<ContactMessageRecord> = {
            ...payload,
            entrySource: payload.entrySource ?? 'general',
            promotedMediaSignupId: null,
            _id: new ObjectId(),
            status: 'new',
            createdAt: now,
            updatedAt: now,
        };

        await collection().insertOne(document);

        const message = await collection().findOne({ _id: document._id });

        if (!message) {
            throw new Error('Unable to persist contact message');
        }

        return message;
    }

    async updateStatus(id: string, status: ContactMessageRecord['status']) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOneAndUpdate(
            { _id: objectId },
            { $set: { status, updatedAt: new Date() } },
            { returnDocument: 'after' },
        );
    }

    async setPromotedMediaSignupId(id: string | ObjectId, promotedMediaSignupId: ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOneAndUpdate(
            { _id: objectId },
            { $set: { promotedMediaSignupId, updatedAt: new Date() } },
            { returnDocument: 'after' },
        );
    }
}
