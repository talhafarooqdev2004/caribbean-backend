import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import { ApiError } from '../../exceptions/ApiError.js';
import { NewsletterSubscriberRepository } from '../../repositories/newsletterSubscriber.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import { getEmailDigestFrequency } from '../../services/appConfig.service.js';
import type { NewsletterSubscribeInput } from '../../schemas/newsletterSubscriber.schema.js';
import type { JournalistProfile } from '../../types/User.js';
import { successResponse } from '../../utils/response.util.js';

const newsletterSubscriberRepository = new NewsletterSubscriberRepository();
const userRepository = new UserRepository();

const isDigestOptedIn = (profile: JournalistProfile | null | undefined) => profile?.digestOptIn === true;

const optInRegisteredUser = async (userId: import('mongodb').ObjectId, existingProfile: JournalistProfile | null, organization: string | null) => {
    const globalFrequency = await getEmailDigestFrequency();
    const profile: JournalistProfile = existingProfile
        ? {
            ...existingProfile,
            digestOptIn: true,
            digestFrequency: globalFrequency,
            unsubscribeToken: existingProfile.unsubscribeToken ?? crypto.randomUUID(),
        }
        : {
            mediaOutlet: organization,
            location: null,
            primaryBeat: null,
            website: null,
            bio: null,
            digestOptIn: true,
            digestFrequency: globalFrequency,
            unsubscribeToken: crypto.randomUUID(),
        };

    return userRepository.update(userId, { journalistProfile: profile });
};

export const subscribeToNewsletter = async (
    req: Request<{}, unknown, NewsletterSubscribeInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const email = req.body.email;
        const existingUser = await userRepository.findByEmail(email);

        if (existingUser) {
            if (isDigestOptedIn(existingUser.journalistProfile)) {
                res.status(HTTP_STATUS.OK).json(successResponse('You are already subscribed to the news digest.', {
                    status: 'already_subscribed',
                    email,
                }));
                return;
            }

            await optInRegisteredUser(
                existingUser._id,
                existingUser.journalistProfile,
                existingUser.organization,
            );

            res.status(HTTP_STATUS.OK).json(successResponse('You are subscribed to the news digest.', {
                status: 'subscribed',
                email,
            }));
            return;
        }

        const existingSubscriber = await newsletterSubscriberRepository.findByEmail(email);

        if (existingSubscriber?.status === 'active') {
            res.status(HTTP_STATUS.OK).json(successResponse('You are already subscribed to the news digest.', {
                status: 'already_subscribed',
                email,
            }));
            return;
        }

        await newsletterSubscriberRepository.subscribe(email, 'homepage');

        res.status(HTTP_STATUS.CREATED).json(successResponse('You are subscribed to the news digest.', {
            status: 'subscribed',
            email,
        }));
    } catch (error) {
        next(error);
    }
};

export const unsubscribeNewsletterGet = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = typeof req.query.token === 'string' ? req.query.token : '';

        if (!token) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Unsubscribe token is required');
        }

        const subscriber = await newsletterSubscriberRepository.unsubscribeByToken(token);

        if (!subscriber) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Unsubscribe token not found');
        }

        res.status(HTTP_STATUS.OK).type('html').send(
            '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Unsubscribed</title></head>'
            + '<body style="font-family: Arial, sans-serif; color: #274060; padding: 24px; max-width: 560px;">'
            + '<p>You have been successfully unsubscribed from Carib Newswire email digests.</p>'
            + '</body></html>',
        );
    } catch (error) {
        next(error);
    }
};
