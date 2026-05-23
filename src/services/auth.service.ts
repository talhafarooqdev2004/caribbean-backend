import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ENV } from '../config/env.js';
import { UserRepository } from '../repositories/user.repository.js';

const userRepository = new UserRepository();

const getAdminEmail = () => {
    if (ENV.ADMIN_USERNAME.includes('@')) {
        return ENV.ADMIN_USERNAME.toLowerCase();
    }

    return `${ENV.ADMIN_USERNAME}@caribnewswire.local`.toLowerCase();
};

export { getAdminEmail };

export const resolveAdminLoginEmail = (emailOrUsername: string) => {
    const normalized = emailOrUsername.trim().toLowerCase();

    if (normalized.includes('@')) {
        return normalized;
    }

    if (normalized === ENV.ADMIN_USERNAME.toLowerCase()) {
        return getAdminEmail();
    }

    return normalized;
};

function timingSafeEqualPlain(a: string, b: string): boolean {
    const ah = crypto.createHash('sha256').update(a, 'utf8').digest();
    const bh = crypto.createHash('sha256').update(b, 'utf8').digest();
    return crypto.timingSafeEqual(ah, bh);
}

/**
 * Admin login validates against ENV only (not the password hash stored in Mongo).
 */
export const envAdminCredentialsMatch = (emailOrUsername: string, plainPassword: string): boolean => {
    const resolved = resolveAdminLoginEmail(emailOrUsername);
    if (resolved !== getAdminEmail()) {
        return false;
    }

    return timingSafeEqualPlain(plainPassword, ENV.ADMIN_PASSWORD);
};

export const ensureDefaultAdminUser = async () => {
    const adminEmail = getAdminEmail();
    const existing = await userRepository.findByEmail(adminEmail);

    if (existing) {
        return existing;
    }

    const hashedPassword = await bcrypt.hash(ENV.ADMIN_PASSWORD, 10);

    return userRepository.create({
        firstName: 'Carib',
        lastName: 'Admin',
        email: adminEmail,
        password: hashedPassword,
        role: 'admin',
        organization: 'Carib Newswire',
    });
};
