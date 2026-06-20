import type { ObjectId } from 'mongodb';

export type NewsletterSubscriberStatus = 'active' | 'unsubscribed';

export type NewsletterSubscriberSource = 'homepage';

export type NewsletterSubscriberRecord = {
    _id: ObjectId;
    email: string;
    status: NewsletterSubscriberStatus;
    source: NewsletterSubscriberSource;
    unsubscribeToken: string;
    userId?: ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
};
