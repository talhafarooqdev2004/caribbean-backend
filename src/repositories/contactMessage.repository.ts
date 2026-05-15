import { ObjectId, type OptionalUnlessRequiredId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import type { ContactMessageRecord } from '../types/ContactMessage.js';
import { toObjectId } from '../utils/mongo.util.js';

type CreateContactMessagePayload = Omit<ContactMessageRecord, '_id' | 'status' | 'createdAt' | 'updatedAt' | 'promotedMediaSignupId'>;

const collection = () => getDb().collection<ContactMessageRecord>('contact_messages');

export class ContactMessageRepository {
    async findAll() {
        return collection().find({}).sort({ createdAt: -1 }).toArray();
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
