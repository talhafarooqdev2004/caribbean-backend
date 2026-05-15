import type { NextFunction, Request, Response } from 'express';
import { APP_CONFIG_KEYS, HTTP_STATUS } from '../../../config/constants.js';
import { AppConfigRepository } from '../../../repositories/appConfig.repository.js';
import { UserRepository } from '../../../repositories/user.repository.js';
import { successResponse } from '../../../utils/response.util.js';

const appConfigRepository = new AppConfigRepository();
const userRepository = new UserRepository();

export const getDigestSettings = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [frequencyConfig, lastSentConfig, portalUsers] = await Promise.all([
            appConfigRepository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_FREQUENCY),
            appConfigRepository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_SENT_AT),
            userRepository.findPortalMembers(),
        ]);

        const optedIn = portalUsers.filter((user) => user.journalistProfile && user.journalistProfile.digestOptIn !== false);

        res.status(HTTP_STATUS.OK).json(successResponse('Digest settings retrieved successfully', {
            frequency: frequencyConfig?.value === '3x-weekly' ? '3x-weekly' : 'daily',
            lastDigestSent: lastSentConfig?.value ?? null,
            optedInJournalists: optedIn.map((user) => ({
                name: `${user.firstName} ${user.lastName}`.trim(),
                email: user.email,
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
