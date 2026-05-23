import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import { ContactMessageResponseDTO } from '../../dtos/v1/ContactMessages/ContactMessageResponseDTO.js';
import { ApiError } from '../../exceptions/ApiError.js';
import { ContactMessageRepository } from '../../repositories/contactMessage.repository.js';
import { MediaSignupRepository } from '../../repositories/mediaSignup.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import type { ContactMessageStoreInput } from '../../schemas/contactMessage.schema.js';
import { ContactMessageQuerySchema } from '../../schemas/adminList.schema.js';
import { emailService, scheduleBackgroundEmail } from '../../services/email.service.js';
import {
    enqueueMediaPortalInviteJob,
    jobToPublicJson,
} from '../../services/mediaPortalInvite.service.js';
import { successResponse } from '../../utils/response.util.js';
import { toObjectId } from '../../utils/mongo.util.js';

const contactMessageRepository = new ContactMessageRepository();
const mediaSignupRepository = new MediaSignupRepository();
const userRepository = new UserRepository();

const splitDisplayName = (name: string) => {
    const trimmed = name.trim();
    const parts = trimmed.split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
        return { firstName: 'Press', lastName: 'Submitter' };
    }

    if (parts.length === 1) {
        return { firstName: parts[0], lastName: 'Submitter' };
    }

    return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
};

export const createContactMessage = async (
    req: Request<{}, unknown, ContactMessageStoreInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const message = await contactMessageRepository.create(req.body);

        const isProposal = req.body.entrySource === 'pricing_proposal';

        scheduleBackgroundEmail('contact-message-admin-notify', () => emailService.notifyAdmin(
            isProposal ? `New proposal / campaign inquiry from ${req.body.name}` : `New contact message from ${req.body.name}`,
            `<p><strong>${req.body.inquiryType}</strong>${isProposal ? ' <em>(from Pricing — Request a Proposal)</em>' : ''}</p><p>${req.body.message}</p><p>${req.body.email}</p>`,
        ));

        res.status(HTTP_STATUS.CREATED).json(successResponse('Contact message submitted successfully', ContactMessageResponseDTO.fromModel(message, null)));
    } catch (error) {
        next(error);
    }
};

export const getAllContactMessages = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = ContactMessageQuerySchema.parse(req.query);
        const excludeEmails = query.contactOnly ? await userRepository.getPortalMemberEmailsLowercase() : [];
        const [messages, total] = await Promise.all([
            contactMessageRepository.findAll(query.page, query.limit, excludeEmails),
            contactMessageRepository.count(excludeEmails),
        ]);
        const dtos = await Promise.all(messages.map(async (message) => {
            const linked = message.promotedMediaSignupId
                ? await mediaSignupRepository.findById(message.promotedMediaSignupId)
                : null;

            return ContactMessageResponseDTO.fromModel(message, linked);
        }));
        const totalPages = Math.max(1, Math.ceil(total / query.limit));

        res.status(HTTP_STATUS.OK).json(successResponse('Contact messages retrieved successfully', dtos, {
            total,
            page: query.page,
            limit: query.limit,
            totalPages,
        }));
    } catch (error) {
        next(error);
    }
};

export const promoteContactMessagePortalInvite = async (
    req: Request<{ id: string }>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const messageId = req.params.id;

        if (!toObjectId(messageId)) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid contact message id');
        }

        const message = await contactMessageRepository.findById(messageId);

        if (!message) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Contact message not found');
        }

        const email = (message.email || '').trim().toLowerCase();
        const existing = await userRepository.findByEmail(email);

        if (existing && (existing.role === 'journalist' || existing.role === 'submitter')) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'A portal account with this email already exists.');
        }

        let signupId = message.promotedMediaSignupId ?? null;

        if (signupId) {
            const existingSignup = await mediaSignupRepository.findById(signupId);

            if (existingSignup?.portalInvitedAt && existingSignup.portalUserId) {
                throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Portal invitation was already completed for this contact.');
            }
        }

        if (!signupId) {
            const { firstName, lastName } = splitDisplayName(message.name);
            const publicationName = (message.organization || '').trim() || 'Proposal / contact enquiry';
            const notesMax = 1000;
            const notesBody = [
                `Inquiry type: ${message.inquiryType}`,
                '',
                message.message,
            ].join('\n').slice(0, notesMax);

            const signup = await mediaSignupRepository.create({
                requestId: randomUUID(),
                firstName,
                lastName,
                email,
                publicationName,
                role: 'Press submitter (proposal path)',
                coverageArea: message.inquiryType,
                region: 'Other',
                website: '',
                notes: notesBody,
                source: 'contact-proposal',
            });

            signupId = signup._id;
            await contactMessageRepository.setPromotedMediaSignupId(message._id, signupId);
        }

        const { job, skippedReasons } = await enqueueMediaPortalInviteJob([signupId.toHexString()]);

        if (!job) {
            const detail = skippedReasons[0]?.reason ?? 'unknown';
            throw new ApiError(
                HTTP_STATUS.UNPROCESSABLE_ENTITY,
                `Could not queue portal invite (${detail}).`,
            );
        }

        res.status(202).json(successResponse(
            'Portal invite job queued. The portal account is created in the background and the recipient will receive login details by email.',
            jobToPublicJson(job),
            { skipped: skippedReasons },
        ));
    } catch (error) {
        next(error);
    }
};
