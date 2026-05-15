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
