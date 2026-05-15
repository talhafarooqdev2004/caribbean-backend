import type { UserRecord } from '../../../types/User.js';
import { deriveCreditFieldsFromLots } from '../../../utils/creditLots.util.js';

export class UserResponseDTO {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly role: string;
    readonly phone: string | null;
    readonly organization: string | null;
    readonly credits: number;
    /** Credits from 3-Release bundle lots (subset of `credits`). */
    readonly bundleCreditsRemaining: number;
    /** Credits from single / admin / pricing lots (subset of `credits`). */
    readonly permanentCredits: number;
    /** Earliest expiry among all active wallet lots. */
    readonly creditsExpiresAt: string | null;
    /** Earliest expiry among active bundle (`kind: bundle`) lots only. */
    readonly bundleCreditsExpiresAt: string | null;
    readonly packageType: string | null;
    readonly journalistProfile: UserRecord['journalistProfile'];
    readonly createdAt: string;
    readonly updatedAt: string;

    constructor(user: Omit<UserRecord, 'password'>) {
        this.id = user._id.toHexString();
        this.firstName = user.firstName;
        this.lastName = user.lastName;
        this.email = user.email;
        this.role = user.role;
        this.phone = user.phone;
        this.organization = user.organization;
        const now = new Date();

        if (user.creditLots && user.creditLots.length > 0) {
            const d = deriveCreditFieldsFromLots(user.creditLots, now);
            this.credits = d.credits;
            this.bundleCreditsRemaining = d.bundleCreditsRemaining;
            this.permanentCredits = Math.max(0, d.credits - d.bundleCreditsRemaining);
            this.creditsExpiresAt = d.creditsExpiresAt?.toISOString() ?? null;
            this.bundleCreditsExpiresAt = d.bundleCreditsExpiresAt?.toISOString() ?? null;
            this.packageType = d.packageType;
        } else {
            this.credits = user.credits ?? 0;
            const bundleRem = Math.max(0, user.bundleCreditsRemaining ?? 0);
            this.bundleCreditsRemaining = bundleRem;
            this.permanentCredits = Math.max(0, this.credits - bundleRem);
            this.creditsExpiresAt = user.creditsExpiresAt?.toISOString() ?? null;
            this.bundleCreditsExpiresAt = null;
            this.packageType = user.packageType ?? null;
        }

        this.journalistProfile = user.journalistProfile;
        this.createdAt = user.createdAt.toISOString();
        this.updatedAt = user.updatedAt.toISOString();
    }

    static fromModel(user: Omit<UserRecord, 'password'>): UserResponseDTO {
        return new this(user);
    }
}
