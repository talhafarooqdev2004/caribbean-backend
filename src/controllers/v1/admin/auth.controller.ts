import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../../config/constants.js';
import { ENV } from '../../../config/env.js';
import { ApiError } from '../../../exceptions/ApiError.js';
import { UserRepository } from '../../../repositories/user.repository.js';
import type { UserRecord } from '../../../types/User.js';
import type { AdminLoginInput, ForgotPasswordInput, LoginInput, RegisterInput, ResetPasswordInput, UpdateMeInput } from '../../../schemas/auth.schema.js';
import { RegisterRequestDTO } from '../../../dtos/v1/Auth/RegisterRequestDTO.js';
import { UserResponseDTO } from '../../../dtos/v1/Auth/UserResponseDTO.js';
import { successResponse } from '../../../utils/response.util.js';
import { generateToken } from '../../../utils/jwt.util.js';
import { resolveAdminLoginEmail } from '../../../services/auth.service.js';
import { emailService, scheduleBackgroundEmail } from '../../../services/email.service.js';
import { logger } from '../../../utils/logger.util.js';

const userRepository = new UserRepository();

const stripPassword = (user) => {
    const { password, ...rest } = user;
    return rest;
};

const buildAuthPayload = (user) => ({
    token: generateToken({
        id: user._id.toHexString(),
        email: user.email,
        role: user.role,
    }),
    user: UserResponseDTO.fromModel(stripPassword(user)),
});

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const resolveStoredPasswordHash = (user: { password?: string | null; passwordHash?: string | null; hashedPassword?: string | null } | null | undefined) => {
    if (!user) {
        return null;
    }

    if (typeof user.password === 'string' && user.password.length > 0) {
        return user.password;
    }

    if (typeof user.passwordHash === 'string' && user.passwordHash.length > 0) {
        return user.passwordHash;
    }

    if (typeof user.hashedPassword === 'string' && user.hashedPassword.length > 0) {
        return user.hashedPassword;
    }

    return null;
};

const isPortalPasswordResetRole = (role: UserRecord['role']) => role === 'submitter' || role === 'journalist';

export const forgotPassword = async (
    req: Request<{}, unknown, ForgotPasswordInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { email } = req.body;
        const user = await userRepository.findByEmail(email);

        if (user && isPortalPasswordResetRole(user.role) && resolveStoredPasswordHash(user)) {
            const token = crypto.randomBytes(32).toString('hex');
            const passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

            await userRepository.update(user._id, {
                passwordResetToken: token,
                passwordResetExpiresAt,
            });

            const baseUrl = ENV.FRONTEND_URL.replace(/\/$/, '');
            const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
            const firstName = typeof user.firstName === 'string' && user.firstName.trim() ? user.firstName.trim() : 'there';

            scheduleBackgroundEmail('forgot-password', () => emailService.sendMail({
                to: email,
                subject: 'Reset your Carib Newswire password',
                html: `<p>Hi ${escapeHtml(firstName)},</p>`
                    + '<p>We received a request to reset the password for your Carib Newswire account.</p>'
                    + `<p><a href="${resetUrl}">Choose a new password</a> (link expires in one hour).</p>`
                    + '<p>If you did not request this, you can ignore this email.</p>',
            }));
        }

        res.status(HTTP_STATUS.OK).json(successResponse(
            'If an account exists for that email, we sent password reset instructions.',
            null,
        ));
    } catch (error) {
        next(error);
    }
};

export const resetPassword = async (
    req: Request<{}, unknown, ResetPasswordInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { token, password } = req.body;
        const user = await userRepository.findByPasswordResetToken(token);

        if (!user) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'This reset link is invalid or has expired. Please request a new one.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        await userRepository.update(user._id, {
            password: hashedPassword,
            passwordResetToken: null,
            passwordResetExpiresAt: null,
        });

        res.status(HTTP_STATUS.OK).json(successResponse('Your password has been updated. You can sign in with your new password.', null));
    } catch (error) {
        next(error);
    }
};

export const login = async (
    req: Request<{}, unknown, LoginInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { email, password } = req.body;
        const user = await userRepository.findByEmail(email) as (Record<string, unknown> & { password?: string | null; role?: string; _id?: { toHexString: () => string }; email?: string }) | null;
        const storedHash = resolveStoredPasswordHash(user);

        if (!user || !storedHash) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
        }

        if (!['submitter', 'journalist'].includes(String(user.role))) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
        }

        const passwordValid = await bcrypt.compare(password, storedHash);

        if (!passwordValid) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
        }

        if (!user._id) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
        }

        const refreshed = await userRepository.applyBundleCreditExpiry(user._id.toHexString());

        if (refreshed) {
            Object.assign(user, {
                credits: refreshed.credits,
                bundleCreditsRemaining: refreshed.bundleCreditsRemaining,
                creditsExpiresAt: refreshed.creditsExpiresAt,
                packageType: refreshed.packageType,
                updatedAt: refreshed.updatedAt,
            });
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Login successful', buildAuthPayload(user)));
    } catch (error) {
        next(error);
    }
};

export const adminLogin = async (
    req: Request<{}, unknown, AdminLoginInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const emailOrUsername = req.body.email || req.body.username || '';
        const user = await userRepository.findByEmail(resolveAdminLoginEmail(emailOrUsername));

        if (!user?.password || user.role !== 'admin') {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
        }

        const passwordValid = await bcrypt.compare(req.body.password, user.password);

        if (!passwordValid) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid credentials');
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Admin login successful', buildAuthPayload(user)));
    } catch (error) {
        next(error);
    }
};

export const register = async (
    req: Request<{}, unknown, RegisterInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const requestDto = new RegisterRequestDTO(req.body);

        const existingUser = await userRepository.findByEmail(requestDto.email);

        if (existingUser) {
            throw new ApiError(HTTP_STATUS.CONFLICT, 'Email already exists');
        }

        const hashedPassword = await bcrypt.hash(requestDto.password, 10);
        const user = await userRepository.create({
            ...requestDto.toPersistence(),
            password: hashedPassword,
        });

        logger.info('Portal registration created; scheduling welcome and admin emails', {
            userId: user ? String(user._id) : 'unknown',
        });

        const firstName = typeof user?.firstName === 'string' ? escapeHtml(user.firstName.trim()) : 'there';
        const portalBase = ENV.FRONTEND_URL.replace(/\/$/, '');

        scheduleBackgroundEmail('register-welcome', () => emailService.sendMail({
            to: requestDto.email,
            subject: 'Welcome to Carib Newswire',
            html: `<p>Hi ${firstName},</p>`
                + '<p>Your Carib Newswire account is ready. You can submit press releases, manage credits, save newsroom stories, and control your email digest from your portal.</p>'
                + `<p><a href="${portalBase}/portal">Open your portal</a></p>`,
        }));

        const orgLine = requestDto.organization
            ? `<p>Organization: ${escapeHtml(requestDto.organization)}</p>`
            : '';

        scheduleBackgroundEmail('register-admin-notify', () => emailService.notifyAdmin(
            'New portal registration (Join the Network)',
            `<p><strong>${escapeHtml(requestDto.firstName)} ${escapeHtml(requestDto.lastName)}</strong> registered a portal account.</p>`
            + `<p>Email: ${escapeHtml(requestDto.email)}</p>${orgLine}`,
        ));

        res.status(HTTP_STATUS.CREATED).json(successResponse('Registration successful', buildAuthPayload(user)));
    } catch (error) {
        next(error);
    }
};

export const getMe = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!req.user) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication token required');
        }

        const user = await userRepository.findById(req.user.id);

        if (!user) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        }

        const refreshed = await userRepository.applyBundleCreditExpiry(user._id);

        res.status(HTTP_STATUS.OK).json(successResponse('User profile retrieved successfully', UserResponseDTO.fromModel(refreshed ?? user)));
    } catch (error) {
        next(error);
    }
};

export const updateMe = async (
    req: Request<{}, unknown, UpdateMeInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        if (!req.user) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication token required');
        }

        const updatedUser = await userRepository.update(req.user.id, req.body);

        if (!updatedUser) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Profile updated successfully', UserResponseDTO.fromModel(updatedUser)));
    } catch (error) {
        next(error);
    }
};
