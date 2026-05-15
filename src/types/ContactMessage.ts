import type { ObjectId } from 'mongodb';

export type ContactMessageEntrySource = 'general' | 'pricing_proposal';

export type ContactMessageRecord = {
    _id: ObjectId;
    name: string;
    email: string;
    organization: string;
    inquiryType: string;
    message: string;
    /** How the visitor reached the form (e.g. Pricing “Request a Proposal”). */
    entrySource?: ContactMessageEntrySource;
    /** Media signup row created when admin runs “Invite to Portal” from this message. */
    promotedMediaSignupId?: ObjectId | null;
    status: 'new' | 'read' | 'archived';
    createdAt: Date;
    updatedAt: Date;
};
