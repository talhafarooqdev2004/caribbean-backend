import { ObjectId, type OptionalUnlessRequiredId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import type { CreditCheckoutSessionRecord } from '../types/CreditCheckoutSession.js';
import { toObjectId } from '../utils/mongo.util.js';

type CreateCreditCheckoutSessionPayload = Omit<CreditCheckoutSessionRecord, '_id' | 'createdAt' | 'expiresAt'> & {
    expiresAt?: Date;
};

const collection = () => getDb().collection<CreditCheckoutSessionRecord>('credit_checkout_sessions');

export class CreditCheckoutSessionRepository {
    async findById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId });
    }

    async create(payload: CreateCreditCheckoutSessionPayload) {
        const now = new Date();
        const expiresAt = payload.expiresAt ?? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const document: OptionalUnlessRequiredId<CreditCheckoutSessionRecord> = {
            ...payload,
            _id: new ObjectId(),
            createdAt: now,
            expiresAt,
        };

        await collection().insertOne(document);

        return this.findById(document._id);
    }

    async delete(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return;
        }

        await collection().deleteOne({ _id: objectId });
    }
}
