import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS, SUCCESS_MESSAGES } from '../../../config/constants.js';
import { ApiError } from '../../../exceptions/ApiError.js';
import { PressReleaseRepository } from '../../../repositories/pressRelease.repository.js';
import { PressReleaseResponseDTO } from '../../../dtos/v1/PressReleases/PressReleaseResponseDTO.js';
import { successResponse } from '../../../utils/response.util.js';
import { emailService, scheduleBackgroundEmail } from '../../../services/email.service.js';
import { ENV } from '../../../config/env.js';

const pressReleaseRepository = new PressReleaseRepository();

const sendApprovalEmail = async (release) => {
    const releaseUrl = `${ENV.FRONTEND_URL}/newsroom/${release.slug}`;

    await emailService.sendMail({
        to: release.email,
        subject: 'Your Press Release is Live!',
        html: `
            <h1>Congratulations</h1>
            <p>Title: <strong>${release.title}</strong></p>
            <p>Your press release is now live on Carib Newswire.</p>
            <p><a href="${releaseUrl}">View Your Release</a></p>
        `,
    });
};

const sendRejectionEmail = async (release, reason = '') => {
    await emailService.sendMail({
        to: release.email,
        subject: 'Press Release Status Update',
        html: `
            <h1>Press Release Status Update</h1>
            <p>Your press release was not approved.</p>
            <p><strong>Reason:</strong> ${reason || 'No specific reason was provided.'}</p>
            <p>Contact: <a href="mailto:info@caribnewswire.com">info@caribnewswire.com</a></p>
        `,
    });
};

export const updateFeature = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const release = await pressReleaseRepository.setFeatured(req.params.id, Boolean(req.body.featured));

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

const requireNonEmptyTrimmed = (value: unknown, label: string, max: number) => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new ApiError(HTTP_STATUS.BAD_REQUEST, `${label} is required`);
    }

    const normalized = value.trim().replace(/\s+/g, ' ');

    return normalized.length > max ? normalized.slice(0, max) : normalized;
};

const getUploadedPath = (req: Request, fieldName: 'coverPhoto' | 'document') => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const file = files?.[fieldName]?.[0];

    if (!file) {
        return null;
    }

    return `/uploads/press-releases/${file.filename}`;
};

export const updateReleaseFiles = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const coverImagePath = getUploadedPath(req, 'coverPhoto');
        const documentPath = getUploadedPath(req, 'document');

        if (!coverImagePath && !documentPath) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Provide a cover image and/or document file to upload.');
        }

        const payload: Record<string, unknown> = {};

        if (coverImagePath) {
            payload.coverImagePath = coverImagePath;
        }

        if (documentPath) {
            payload.documentPath = documentPath;
        }

        const release = await pressReleaseRepository.update(req.params.id, payload as any);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const updateRelease = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const payload: Record<string, unknown> = {};

        payload.fullName = requireNonEmptyTrimmed(req.body.fullName, 'Full name', 160);

        const email = requireNonEmptyTrimmed(req.body.email, 'Email', 254).toLowerCase();

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid email address');
        }

        payload.email = email;

        if (typeof req.body.phoneNumber === 'string') {
            payload.phoneNumber = req.body.phoneNumber.trim().slice(0, 40);
        } else {
            payload.phoneNumber = '';
        }

        payload.organization = requireNonEmptyTrimmed(req.body.organization, 'Organization', 160);
        payload.title = requireNonEmptyTrimmed(req.body.title, 'Title', 180);
        payload.category = requireNonEmptyTrimmed(req.body.category, 'Category', 80);

        if (typeof req.body.island === 'string') {
            const isl = req.body.island.trim().slice(0, 80);
            payload.island = isl || 'Regional';
        } else {
            payload.island = 'Regional';
        }

        if (typeof req.body.preferredDistributionDate === 'string') {
            payload.preferredDistributionDate = req.body.preferredDistributionDate.trim().slice(0, 60);
        } else {
            payload.preferredDistributionDate = '';
        }

        if (typeof req.body.targetRegions === 'string') {
            payload.targetRegions = req.body.targetRegions.trim().slice(0, 200);
        } else {
            payload.targetRegions = '';
        }

        if (typeof req.body.specialInstructions === 'string') {
            payload.specialInstructions = req.body.specialInstructions.trim().slice(0, 1000);
        } else {
            payload.specialInstructions = '';
        }

        if (typeof req.body.content !== 'string' || !req.body.content.trim()) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Press release content is required');
        }

        const content = req.body.content.trim();

        if (content.length > 10_000_000) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Press release content is too long');
        }

        const visibleText = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

        if (!visibleText) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Press release content is required');
        }

        payload.content = content;

        if (req.body.outboundLink !== undefined) {
            if (typeof req.body.outboundLink !== 'string') {
                throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Outbound link must be a string.');
            }

            let link = req.body.outboundLink.trim().slice(0, 2048);

            if (link === '') {
                payload.outboundLink = '';
            } else {
                if (/^www\./i.test(link)) {
                    link = `https://${link}`;
                }

                try {
                    const u = new URL(link);

                    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
                        throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Outbound link must use http or https.');
                    }

                    payload.outboundLink = link;
                } catch (error) {
                    if (error instanceof ApiError) {
                        throw error;
                    }

                    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Outbound link must be empty or a valid http(s) URL.');
                }
            }
        }

        const release = await pressReleaseRepository.update(req.params.id, payload as any);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.UPDATED, PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const approveRelease = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const existing = await pressReleaseRepository.findById(req.params.id);

        if (!existing) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        if (existing.paymentStatus !== 'paid') {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Cannot approve press release until payment is completed');
        }

        const release = await pressReleaseRepository.updateStatus(req.params.id, 'approved');

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        scheduleBackgroundEmail('admin-press-release-approved', () => sendApprovalEmail(release));

        res.status(HTTP_STATUS.OK).json(successResponse(SUCCESS_MESSAGES.PUBLISHED, PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};

export const rejectRelease = async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
    try {
        const reason = typeof req.body.reason === 'string'
            ? req.body.reason
            : typeof req.body.rejectionReason === 'string'
                ? req.body.rejectionReason
                : '';
        const release = await pressReleaseRepository.updateStatus(req.params.id, 'rejected', reason);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        scheduleBackgroundEmail('admin-press-release-rejected', () => sendRejectionEmail(release, reason));
        res.status(HTTP_STATUS.OK).json(successResponse('Press release rejected successfully', PressReleaseResponseDTO.fromModel(release)));
    } catch (error) {
        next(error);
    }
};
