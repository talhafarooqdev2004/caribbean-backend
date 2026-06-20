import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS, SUCCESS_MESSAGES } from '../../../config/constants.js';
import { ENV } from '../../../config/env.js';
import { ApiError } from '../../../exceptions/ApiError.js';
import { UserResponseDTO } from '../../../dtos/v1/Auth/UserResponseDTO.js';
import { PressReleaseRepository } from '../../../repositories/pressRelease.repository.js';
import { UserRepository } from '../../../repositories/user.repository.js';
import type { AdminUserCreditsIncrementInput } from '../../../schemas/adminUserCredits.schema.js';
import { AdminUserListQuerySchema } from '../../../schemas/adminList.schema.js';
import { emailService } from '../../../services/email.service.js';
import { successResponse } from '../../../utils/response.util.js';
import { emailAnchor, emailPublicUrl } from '../../../utils/email-html.util.js';
import { logger } from '../../../utils/logger.util.js';

const userRepository = new UserRepository();
const pressReleaseRepository = new PressReleaseRepository();

export const getAllUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = AdminUserListQuerySchema.parse(req.query);
        const [users, total] = await Promise.all([
            userRepository.findPortalMembersPage(query.page, query.limit, query.search),
            userRepository.countPortalMembers(query.search),
        ]);
        const enrichedUsers = await Promise.all(users.map(async (user) => ({
            ...UserResponseDTO.fromModel(user),
            totalSubmissions: await pressReleaseRepository.countBySubmitter(user._id),
            digestSubscribed: user.journalistProfile?.digestOptIn === true,
        })));
        const totalPages = Math.max(1, Math.ceil(total / query.limit));

        res.status(HTTP_STATUS.OK).json(successResponse('Users retrieved successfully', enrichedUsers, {
            total,
            page: query.page,
            limit: query.limit,
            totalPages,
        }));
    } catch (error) {
        next(error);
    }
};

export const getUserById = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const user = await userRepository.findById(req.params.id);

        if (!user) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse('User retrieved successfully', UserResponseDTO.fromModel(user)));
    } catch (error) {
        next(error);
    }
};

export const getUserStats = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [totalUsers, journalistUsers, submitterUsers, newUsers] = await Promise.all([
            userRepository.count(),
            userRepository.count('journalist'),
            userRepository.count('submitter'),
            userRepository.countNewUsers(30),
        ]);

        const portalMemberUsers = journalistUsers + submitterUsers;

        res.status(HTTP_STATUS.OK).json(successResponse('User statistics retrieved successfully', {
            total_users: totalUsers,
            portal_member_users: portalMemberUsers,
            new_users_last_30_days: newUsers,
        }));
    } catch (error) {
        next(error);
    }
};

export const deleteUser = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const deleted = await userRepository.delete(req.params.id);

        if (!deleted) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.DELETED));
    } catch (error) {
        next(error);
    }
};

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const addUserCredits = async (
    req: Request<{ id: string }, unknown, AdminUserCreditsIncrementInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const user = await userRepository.findById(req.params.id);

        if (!user) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'User not found');
        }

        if (user.role !== 'submitter' && user.role !== 'journalist') {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Credits can only be added to portal member accounts.');
        }

        const delta = req.body.credits;
        const updated = await userRepository.incrementCreditsByDelta(req.params.id, delta);

        if (!updated) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Unable to update credits.');
        }

        const portalUrl = emailPublicUrl('/portal');
        const creditsNow = updated.credits ?? 0;
        const emailHtml = `
                <div style="font-family: Arial, sans-serif; color: #274060; max-width: 560px;">
                    <h1>Carib Newswire</h1>
                    <p>Hi ${escapeHtml(updated.firstName)},</p>
                    <p><strong>${delta}</strong> distribution credit${delta === 1 ? '' : 's'} ${delta === 1 ? 'has' : 'have'} been added to your account by our team.</p>
                    <p>Your current balance is <strong>${creditsNow}</strong> credit${creditsNow === 1 ? '' : 's'}.</p>
                    <p>${emailAnchor(portalUrl, 'Open your portal')} to manage releases and credits.</p>
                </div>
            `;

        res.status(HTTP_STATUS.OK).json(successResponse(
            'Credits added successfully',
            UserResponseDTO.fromModel(updated),
        ));

        void emailService.sendMail({
            to: updated.email,
            subject: 'Credits added to your Carib Newswire account',
            html: emailHtml,
            logDeliveryDetail: true,
        }).catch((error: unknown) => {
            logger.error('Failed to send credits-added email', { error, userId: req.params.id });
        });
    } catch (error) {
        next(error);
    }
};
