import type { ObjectId } from 'mongodb';

export const MEDIA_PORTAL_INVITE_JOB_STATUSES = ['queued', 'processing', 'completed', 'failed'] as const;
export type MediaPortalInviteJobStatus = (typeof MEDIA_PORTAL_INVITE_JOB_STATUSES)[number];

export const MEDIA_PORTAL_INVITE_OUTCOMES = [
    'created',
    'skipped_exists',
    'skipped_already_invited',
    'skipped_rejected',
    'skipped_not_found',
    'skipped_invalid_email',
    'failed',
] as const;
export type MediaPortalInviteOutcome = (typeof MEDIA_PORTAL_INVITE_OUTCOMES)[number];

export type MediaPortalInviteJobResultEntry = {
    signupId: string;
    email: string;
    outcome: MediaPortalInviteOutcome;
    detail?: string;
    userId?: string;
};

export type MediaPortalInviteJobRecord = {
    _id: ObjectId;
    status: MediaPortalInviteJobStatus;
    signupIds: ObjectId[];
    currentIndex: number;
    results: MediaPortalInviteJobResultEntry[];
    createdAt: Date;
    updatedAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    lastError: string | null;
};
