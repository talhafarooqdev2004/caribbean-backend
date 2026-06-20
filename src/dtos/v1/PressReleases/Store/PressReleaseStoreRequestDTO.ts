import type { PressReleasePackage } from '../../../../types/PressRelease.js';

export class PressReleaseStoreRequestDTO {
    readonly fullName: string;
    readonly email: string;
    readonly phoneNumber: string;
    readonly organization: string;
    readonly title: string;
    readonly category: string;
    readonly island: string;
    readonly preferredDistributionDate: string;
    readonly content: string;
    readonly summary: string;
    readonly targetRegions: string;
    readonly specialInstructions: string;
    readonly outboundLink: string;
    readonly packageId: PressReleasePackage;
    readonly featuredUpgrade: boolean;
    readonly coverImagePath: string | null;
    readonly documentPath: string | null;

    constructor(data) {
        this.fullName = data.fullName;
        this.email = data.email;
        this.phoneNumber = data.phoneNumber || '';
        this.organization = data.organization;
        this.title = data.releaseTitle || data.title;
        this.category = data.category;
        this.island = data.island || data.region || data.targetRegions || 'Regional';
        this.preferredDistributionDate = data.preferredDistributionDate || '';
        this.summary = typeof data.summary === 'string' ? data.summary.trim() : '';
        this.content = data.pressReleaseContent || data.content;
        this.targetRegions = data.targetRegions || '';
        this.specialInstructions = data.specialInstructions || '';
        this.outboundLink = typeof data.outboundLink === 'string' ? data.outboundLink.trim().slice(0, 2048) : '';
        this.packageId = data.packageId || 'single';
        this.featuredUpgrade = Boolean(data.featuredUpgrade);
        this.coverImagePath = data.coverImagePath || null;
        this.documentPath = data.documentPath || null;
    }

    toPersistence(amountCents: number) {
        return {
            submitterId: null,
            fullName: this.fullName,
            email: this.email,
            phoneNumber: this.phoneNumber,
            organization: this.organization,
            title: this.title,
            summary: this.summary,
            content: this.content,
            category: this.category,
            island: this.island,
            preferredDistributionDate: this.preferredDistributionDate,
            targetRegions: this.targetRegions,
            specialInstructions: this.specialInstructions,
            outboundLink: this.outboundLink,
            coverImagePath: this.coverImagePath,
            documentPath: this.documentPath,
            packageId: this.packageId,
            featuredUpgrade: this.featuredUpgrade,
            featured: this.featuredUpgrade,
            featuredPriority: 0,
            featuredUntil: null,
            rejectionReason: null,
            amountCents,
            status: 'draft' as const,
            paymentStatus: 'unpaid' as const,
        };
    }
}
