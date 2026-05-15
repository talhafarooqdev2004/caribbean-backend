import type { MediaSignupRecord } from '../../../types/MediaSignup.js';

export class MediaSignupResponseDTO {
    readonly id: string;
    readonly requestId: string;
    readonly source: MediaSignupRecord['source'];
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly publicationName: string;
    readonly role: string;
    readonly coverageArea: string;
    readonly region: string;
    readonly website: string;
    readonly notes: string;
    readonly status: string;
    readonly portalInvitedAt: string | null;
    readonly portalUserId: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;

    constructor(record: MediaSignupRecord) {
        this.id = record._id.toHexString();
        this.requestId = record.requestId;
        this.source = record.source;
        this.firstName = record.firstName;
        this.lastName = record.lastName;
        this.email = record.email;
        this.publicationName = record.publicationName;
        this.role = record.role;
        this.coverageArea = record.coverageArea;
        this.region = record.region;
        this.website = record.website;
        this.notes = record.notes;
        this.status = record.status;
        this.portalInvitedAt = record.portalInvitedAt instanceof Date ? record.portalInvitedAt.toISOString() : null;
        this.portalUserId = record.portalUserId ? record.portalUserId.toHexString() : null;
        this.createdAt = record.createdAt.toISOString();
        this.updatedAt = record.updatedAt.toISOString();
    }

    static fromModel(record: MediaSignupRecord): MediaSignupResponseDTO {
        return new this(record);
    }
}
