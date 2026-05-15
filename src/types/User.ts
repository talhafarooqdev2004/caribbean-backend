import type { ObjectId } from 'mongodb';

export const USER_ROLES = ['admin', 'super_admin', 'submitter', 'journalist'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export type UserCreditLotKind = 'bundle' | 'single' | 'admin';

/** One grant of wallet credits; each lot expires independently (default six months from issue). */
export type UserCreditLot = {
    credits: number;
    expiresAt: Date;
    kind: UserCreditLotKind;
};

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
    /**
     * Remaining credits per grant, each with its own expiry. When present, this is the source of truth;
     * `credits`, `bundleCreditsRemaining`, `creditsExpiresAt`, and `packageType` are kept in sync.
     */
    creditLots?: UserCreditLot[];
    /** Denormalized: credits in lots with `kind: 'bundle'` (3-Release package wallet). */
    bundleCreditsRemaining?: number;
    /** Denormalized: earliest expiry among active lots (for UX / warnings). */
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
