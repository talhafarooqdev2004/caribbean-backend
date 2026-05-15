import type { ObjectId } from 'mongodb';

export const MEDIA_SIGNUP_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type MediaSignupStatus = (typeof MEDIA_SIGNUP_STATUSES)[number];

export type MediaSignupSource = 'media-signup' | 'contact-proposal';

export type MediaSignupRecord = {
    _id: ObjectId;
    requestId: string;
    source: MediaSignupSource;
    firstName: string;
    lastName: string;
    email: string;
    publicationName: string;
    role: string;
    coverageArea: string;
    region: string;
    website: string;
    notes: string;
    status: MediaSignupStatus;
    /** Set when an admin portal-invite job successfully created a user and sent credentials. */
    portalInvitedAt?: Date | null;
    portalUserId?: ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
};
