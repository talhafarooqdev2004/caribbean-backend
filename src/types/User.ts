import type { ObjectId } from 'mongodb';

export const USER_ROLES = ['admin', 'super_admin', 'submitter', 'journalist'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type JournalistProfile = {
    mediaOutlet: string | null;
    location: string | null;
    primaryBeat: string | null;
    website: string | null;
    bio: string | null;
    digestOptIn: boolean;
    digestFrequency?: 'daily' | '3x-weekly';
    unsubscribeToken?: string | null;
};

export type UserRecord = {
    _id: ObjectId;
    firstName: string;
    lastName: string;
    email: string;
    password: string | null;
    role: UserRole;
    phone: string | null;
    organization: string | null;
    credits: number;
    /** Credits from the 3-Release Package wallet; subject to `creditsExpiresAt`. */
    bundleCreditsRemaining?: number;
    /** Applies only to `bundleCreditsRemaining` (not to single-purchase / admin credits). */
    creditsExpiresAt: Date | null;
    packageType: 'single' | 'bundle' | null;
    journalistProfile: JournalistProfile | null;
    passwordResetToken?: string | null;
    passwordResetExpiresAt?: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

export type PublicUserRecord = Omit<UserRecord, 'password'> & {
    id: string;
};
