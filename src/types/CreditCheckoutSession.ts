import type { ObjectId } from 'mongodb';

import type { PressReleasePackage } from './PressRelease.js';

/** Staging data for “buy credits + submit this release” until Square payment succeeds (no press_releases row yet). */
export type CreditCheckoutSessionPayload = {
    fullName: string;
    email: string;
    phoneNumber: string;
    organization: string;
    title: string;
    category: string;
    island: string;
    preferredDistributionDate: string;
    content: string;
    targetRegions: string;
    specialInstructions: string;
    /** Optional; omitted on legacy checkout sessions. */
    outboundLink?: string;
    coverImagePath: string | null;
    documentPath: string | null;
};

export type CreditCheckoutSessionRecord = {
    _id: ObjectId;
    submitterId: ObjectId;
    packageId: PressReleasePackage;
    featuredUpgrade: boolean;
    amountCents: number;
    payload: CreditCheckoutSessionPayload;
    createdAt: Date;
    expiresAt: Date;
};
