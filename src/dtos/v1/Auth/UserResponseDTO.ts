import type { UserRecord } from '../../../types/User.js';

export class UserResponseDTO {
    readonly id: string;
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly role: string;
    readonly phone: string | null;
    readonly organization: string | null;
    readonly credits: number;
    /** Credits from the 3-Release Package pool (expire with `creditsExpiresAt`). */
    readonly bundleCreditsRemaining: number;
    /** Credits not tied to the bundle expiry window. */
    readonly permanentCredits: number;
    readonly creditsExpiresAt: string | null;
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
        this.credits = user.credits ?? 0;
        const bundleRem = Math.max(0, user.bundleCreditsRemaining ?? 0);
        this.bundleCreditsRemaining = bundleRem;
        this.permanentCredits = Math.max(0, this.credits - bundleRem);
        this.creditsExpiresAt = user.creditsExpiresAt?.toISOString() ?? null;
        this.packageType = user.packageType ?? null;
        this.journalistProfile = user.journalistProfile;
        this.createdAt = user.createdAt.toISOString();
        this.updatedAt = user.updatedAt.toISOString();
    }

    static fromModel(user: Omit<UserRecord, 'password'>): UserResponseDTO {
        return new this(user);
    }
}
