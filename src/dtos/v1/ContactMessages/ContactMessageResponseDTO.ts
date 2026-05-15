import type { ContactMessageRecord } from '../../../types/ContactMessage.js';

export class ContactMessageResponseDTO {
    readonly id: string;
    readonly name: string;
    readonly email: string;
    readonly organization: string;
    readonly inquiryType: string;
    readonly message: string;
    readonly entrySource: ContactMessageRecord['entrySource'];
    readonly promotedMediaSignupId: string | null;
    /** True when the linked media-signup row has a provisioned portal user. */
    readonly portalInviteComplete: boolean;
    readonly status: string;
    readonly createdAt: string;
    readonly updatedAt: string;

    constructor(record: ContactMessageRecord, portalInviteComplete = false) {
        this.id = record._id.toHexString();
        this.name = record.name;
        this.email = record.email;
        this.organization = record.organization;
        this.inquiryType = record.inquiryType;
        this.message = record.message;
        this.entrySource = record.entrySource ?? 'general';
        this.promotedMediaSignupId = record.promotedMediaSignupId ? record.promotedMediaSignupId.toHexString() : null;
        this.portalInviteComplete = portalInviteComplete;
        this.status = record.status;
        this.createdAt = record.createdAt.toISOString();
        this.updatedAt = record.updatedAt.toISOString();
    }

    static fromModel(record: ContactMessageRecord, linkedSignup?: { portalInvitedAt?: Date | null; portalUserId?: unknown } | null): ContactMessageResponseDTO {
        const portalInviteComplete = Boolean(
            linkedSignup?.portalInvitedAt && linkedSignup?.portalUserId,
        );

        return new this(record, portalInviteComplete);
    }
}
