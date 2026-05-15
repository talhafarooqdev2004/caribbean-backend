import { ObjectId, type OptionalUnlessRequiredId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import type { PaymentRecord } from '../types/Payment.js';
import type { PaymentStatus } from '../types/PressRelease.js';
import { toObjectId } from '../utils/mongo.util.js';

type CreatePaymentPayload = Omit<PaymentRecord, '_id' | 'createdAt' | 'updatedAt'>;

const collection = () => getDb().collection<PaymentRecord>('payments');

export class PaymentRepository {
    async findById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ _id: objectId });
    }

    async findBySquareOrderId(squareOrderId: string) {
        return collection().findOne({ squareOrderId });
    }

    async findLatestByReleaseId(releaseId: string | ObjectId) {
        const objectId = toObjectId(releaseId);

        if (!objectId) {
            return null;
        }

        return collection().findOne({ releaseId: objectId }, { sort: { createdAt: -1 } });
    }

    async findByOrderNumber(orderNumber: string) {
        return collection().findOne({ orderNumber });
    }

    async create(payload: CreatePaymentPayload) {
        const now = new Date();
        const document: OptionalUnlessRequiredId<PaymentRecord> = {
            ...payload,
            _id: new ObjectId(),
            createdAt: now,
            updatedAt: now,
        };

        await collection().insertOne(document);

        const payment = await this.findById(document._id);

        if (!payment) {
            throw new Error('Unable to persist payment');
        }

        return payment;
    }

    async update(id: string | ObjectId, payload: Partial<PaymentRecord>) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return null;
        }

        return collection().findOneAndUpdate(
            { _id: objectId },
            {
                $set: {
                    ...payload,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: 'after' },
        );
    }

    async updateStatusBySquarePaymentId(squarePaymentId: string, status: PaymentStatus) {
        return collection().findOneAndUpdate(
            { squarePaymentId },
            {
                $set: {
                    status,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: 'after' },
        );
    }

    async findPaidSince(since: Date) {
        return collection().find({
            status: 'paid',
            createdAt: { $gte: since },
        }).toArray();
    }

    async deleteManyByReleaseId(releaseId: string | ObjectId) {
        const objectId = toObjectId(releaseId);

        if (!objectId) {
            return 0;
        }

        const result = await collection().deleteMany({ releaseId: objectId });

        return result.deletedCount;
    }

    async deleteById(id: string | ObjectId) {
        const objectId = toObjectId(id);

        if (!objectId) {
            return false;
        }

        const result = await collection().deleteOne({ _id: objectId });

        return result.deletedCount === 1;
    }
}
