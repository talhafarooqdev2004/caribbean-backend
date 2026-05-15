import type { ObjectId } from 'mongodb';

export const PRESS_RELEASE_STATUSES = ['draft', 'pending', 'approved', 'rejected'] as const;
export type PressReleaseStatus = (typeof PRESS_RELEASE_STATUSES)[number];

export const PAYMENT_STATUSES = ['unpaid', 'created', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PRESS_RELEASE_PACKAGES = ['single', 'bundle', 'custom'] as const;
export type PressReleasePackage = (typeof PRESS_RELEASE_PACKAGES)[number];

export type PressReleaseRecord = {
    _id: ObjectId;
    submitterId: ObjectId | null;
    fullName: string;
    email: string;
    phoneNumber: string;
    organization: string;
    title: string;
    slug: string;
    summary: string;
    content: string;
    category: string;
    island: string;
    preferredDistributionDate: string;
    targetRegions: string;
    specialInstructions: string;
    /** Optional public URL (http/https) shown at the bottom of the published newsroom article. */
    outboundLink?: string;
    coverImagePath: string | null;
    documentPath: string | null;
    packageId: PressReleasePackage;
    featuredUpgrade: boolean;
    featured: boolean;
    rejectionReason: string | null;
    amountCents: number;
    status: PressReleaseStatus;
    paymentStatus: PaymentStatus;
    paymentId: ObjectId | null;
    views: number;
    clicks: number;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
    /** True when user is paying $99 featured fee before 1 wallet credit is consumed (credit submission + featured). */
    pendingCreditWithFeaturedCheckout?: boolean;
    /** True when release was saved before Square credit checkout; finalized after payment. */
    pendingCreditPackageCheckout?: boolean;
};
