import type { PressReleaseRecord } from '../../../types/PressRelease.js';
import { pressReleaseReadingMinutes } from '../../../utils/press-release-reading.util.js';

export class PressReleaseResponseDTO {
    readonly id: string;
    readonly submitterId: string | null;
    readonly fullName: string;
    readonly email: string;
    readonly phoneNumber: string;
    readonly organization: string;
    readonly title: string;
    readonly slug: string;
    readonly summary: string;
    readonly content: string;
    readonly category: string;
    readonly island: string;
    readonly preferredDistributionDate: string;
    readonly targetRegions: string;
    readonly specialInstructions: string;
    readonly outboundLink: string;
    readonly coverImagePath: string | null;
    readonly documentPath: string | null;
    readonly packageId: string;
    readonly featuredUpgrade: boolean;
    readonly featured: boolean;
    readonly featuredPriority: number;
    readonly featuredUntil: string | null;
    readonly isActive: boolean;
    readonly rejectionReason: string | null;
    readonly amountCents: number;
    readonly status: string;
    readonly paymentStatus: string;
    readonly paymentId: string | null;
    readonly views: number;
    readonly clicks: number;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly publishedAt: string | null;
    readonly readingMinutes: number;

    constructor(record: PressReleaseRecord) {
        this.id = record._id.toHexString();
        this.submitterId = record.submitterId?.toHexString() ?? null;
        this.fullName = record.fullName;
        this.email = record.email;
        this.phoneNumber = record.phoneNumber;
        this.organization = record.organization;
        this.title = record.title;
        this.slug = record.slug;
        this.summary = record.summary;
        this.content = record.content;
        this.category = record.category;
        this.island = record.island;
        this.preferredDistributionDate = record.preferredDistributionDate;
        this.targetRegions = record.targetRegions;
        this.specialInstructions = record.specialInstructions;
        this.outboundLink = record.outboundLink ?? '';
        this.coverImagePath = record.coverImagePath;
        this.documentPath = record.documentPath;
        this.packageId = record.packageId;
        this.featuredUpgrade = record.featuredUpgrade;
        this.featured = record.featured;
        this.featuredPriority = typeof record.featuredPriority === 'number' ? record.featuredPriority : 0;
        this.featuredUntil = record.featuredUntil?.toISOString() ?? null;
        this.isActive = record.isActive !== false;
        this.rejectionReason = record.rejectionReason ?? null;
        this.amountCents = record.amountCents;
        this.status = record.status;
        this.paymentStatus = record.paymentStatus;
        this.paymentId = record.paymentId?.toHexString() ?? null;
        this.views = record.views;
        this.clicks = record.clicks;
        this.createdAt = record.createdAt.toISOString();
        this.updatedAt = record.updatedAt.toISOString();
        this.publishedAt = record.publishedAt?.toISOString() ?? null;
        this.readingMinutes = pressReleaseReadingMinutes(record.content, record.summary);
    }

    static fromModel(record: PressReleaseRecord): PressReleaseResponseDTO {
        return new this(record);
    }
}
