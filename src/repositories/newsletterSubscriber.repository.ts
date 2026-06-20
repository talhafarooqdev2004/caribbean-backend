import crypto from 'crypto';
import { ObjectId, type OptionalUnlessRequiredId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import type {
    NewsletterSubscriberRecord,
    NewsletterSubscriberSource,
    NewsletterSubscriberStatus,
} from '../types/NewsletterSubscriber.js';

const collection = () => getDb().collection<NewsletterSubscriberRecord>('newsletter_subscribers');

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export class NewsletterSubscriberRepository {
    async findByEmail(email: string) {
        return collection().findOne({ email: normalizeEmail(email) });
    }

    async findByUnsubscribeToken(token: string) {
        const trimmed = token.trim();

        if (!trimmed) {
            return null;
        }

        return collection().findOne({ unsubscribeToken: trimmed });
    }

    async findAllActive() {
        return collection().find({ status: 'active' }).sort({ email: 1 }).toArray();
    }

    async countActive() {
        return collection().countDocuments({ status: 'active' });
    }

    async subscribe(email: string, source: NewsletterSubscriberSource = 'homepage') {
        const normalizedEmail = normalizeEmail(email);
        const existing = await this.findByEmail(normalizedEmail);
        const now = new Date();

        if (existing) {
            if (existing.status === 'active') {
                return { subscriber: existing, created: false, reactivated: false };
            }

            const updated = await collection().findOneAndUpdate(
                { _id: existing._id },
                {
                    $set: {
                        status: 'active' as NewsletterSubscriberStatus,
                        source,
                        updatedAt: now,
                    },
                },
                { returnDocument: 'after' },
            );

            if (!updated) {
                throw new Error('Unable to reactivate newsletter subscription');
            }

            return { subscriber: updated, created: false, reactivated: true };
        }

        const document: OptionalUnlessRequiredId<NewsletterSubscriberRecord> = {
            _id: new ObjectId(),
            email: normalizedEmail,
            status: 'active',
            source,
            unsubscribeToken: crypto.randomUUID(),
            userId: null,
            createdAt: now,
            updatedAt: now,
        };

        await collection().insertOne(document);

        const subscriber = await collection().findOne({ _id: document._id });

        if (!subscriber) {
            throw new Error('Unable to persist newsletter subscription');
        }

        return { subscriber, created: true, reactivated: false };
    }

    async unsubscribeByToken(token: string) {
        const subscriber = await this.findByUnsubscribeToken(token);

        if (!subscriber || subscriber.status !== 'active') {
            return null;
        }

        const updated = await collection().findOneAndUpdate(
            { _id: subscriber._id },
            {
                $set: {
                    status: 'unsubscribed' as NewsletterSubscriberStatus,
                    updatedAt: new Date(),
                },
            },
            { returnDocument: 'after' },
        );

        return updated;
    }
}
