import crypto from 'crypto';
import type { JournalistProfile, UserRole } from '../../../types/User.js';
import type { RegisterInput } from '../../../schemas/auth.schema.js';

export class RegisterRequestDTO {
    readonly firstName: string;
    readonly lastName: string;
    readonly email: string;
    readonly password: string;
    readonly role: UserRole;
    readonly phone: string | null;
    readonly organization: string | null;
    readonly journalistProfile: JournalistProfile | null;

    constructor(data: RegisterInput) {
        this.firstName = data.firstName;
        this.lastName = data.lastName;
        this.email = data.email;
        this.password = data.password;
        this.role = 'submitter';
        this.phone = data.phone?.trim() ? data.phone.trim() : null;
        this.organization = data.organization?.trim() ? data.organization.trim() : null;
        const outlet = data.mediaOutlet?.trim() ? data.mediaOutlet.trim() : null;
        const location = data.location?.trim() ? data.location.trim() : null;
        const primaryBeat = data.primaryBeat?.trim() ? data.primaryBeat.trim() : null;
        const bio = data.bio?.trim() ? data.bio.trim() : null;

        this.journalistProfile = {
            mediaOutlet: outlet,
            location,
            primaryBeat,
            website: null,
            bio,
            digestOptIn: data.digestOptIn === true,
            digestFrequency: '3x-weekly',
            unsubscribeToken: crypto.randomUUID(),
        };
    }

    toPersistence() {
        return {
            firstName: this.firstName,
            lastName: this.lastName,
            email: this.email,
            password: this.password,
            role: this.role,
            phone: this.phone,
            organization: this.organization,
            journalistProfile: this.journalistProfile,
        };
    }
}
