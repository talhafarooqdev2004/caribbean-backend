import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG_KEYS, HTTP_STATUS } from '../../../config/constants.js';
import { AppConfigRepository } from '../../../repositories/appConfig.repository.js';
import { NewsletterSubscriberRepository } from '../../../repositories/newsletterSubscriber.repository.js';
import { UserRepository } from '../../../repositories/user.repository.js';
import { successResponse } from '../../../utils/response.util.js';

const appConfigRepository = new AppConfigRepository();
const userRepository = new UserRepository();
const newsletterSubscriberRepository = new NewsletterSubscriberRepository();

export const getDigestSettings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [frequencyConfig, lastSentConfig, portalUsers, newsletterSubscribers] = await Promise.all([
            appConfigRepository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_FREQUENCY),
            appConfigRepository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_SENT_AT),
            userRepository.findPortalMembers(),
            newsletterSubscriberRepository.findAllActive(),
        ]);

        const optedInUsers = portalUsers.filter((user) => user.journalistProfile?.digestOptIn === true);
        const userEmails = new Set(optedInUsers.map((user) => user.email.trim().toLowerCase()));
        const optedInNewsletterSubscribers = newsletterSubscribers.filter((subscriber) => !userEmails.has(subscriber.email));

        res.status(HTTP_STATUS.OK).json(successResponse('Digest settings retrieved successfully', {
            frequency: frequencyConfig?.value === '3x-weekly' ? '3x-weekly' : 'daily',
            lastDigestSent: lastSentConfig?.value ?? null,
            optedInJournalists: optedInUsers.map((user) => ({
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
            })),
            optedInNewsletterSubscribers: optedInNewsletterSubscribers.map((subscriber) => ({
                email: subscriber.email,
            })),
        }));
    } catch (error) {
        next(error);
    }
};

export const updateDigestSettings = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const frequency = req.body.frequency === '3x-weekly' ? '3x-weekly' : 'daily';
        const config = await appConfigRepository.updateOrCreate(
            APP_CONFIG_KEYS.EMAIL_DIGEST_FREQUENCY,
            frequency,
            'Email digest cadence for opted-in users. Supported values: daily, 3x-weekly.',
        );

        await userRepository.syncDigestFrequencyForOptedInPortalUsers(frequency);

        res.status(HTTP_STATUS.OK).json(successResponse('Digest settings updated successfully', {
            frequency: config.value,
        }));
    } catch (error) {
        next(error);
    }
};
