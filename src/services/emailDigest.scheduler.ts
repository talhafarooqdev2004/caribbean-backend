import cron from 'node-cron';
import { logger } from '../utils/logger.util.js';
import { getEmailDigestFrequency } from './appConfig.service.js';
import { sendJournalistDigest } from './emailDigest.service.js';

/**
 * Scheduled digest sends (node-cron, timezone America/New_York):
 *
 * Two jobs are registered; each checks the saved admin frequency (`EMAIL_DIGEST_FREQUENCY`) before sending.
 *
 * 1) Daily job — cron `0 8 * * *` → every day at 8:00 a.m. ET. Runs `sendJournalistDigest` only when frequency is `daily`.
 *
 * 2) 3× weekly job — cron `0 8 * * 1,3,5` → Monday, Wednesday, Friday at 8:00 a.m. ET. Runs only when frequency is `3x-weekly`.
 *
 * Admin “Save frequency” persists the cadence and syncs opted-in users’ `journalistProfile.digestFrequency` so recipients
 * match the active schedule. Skips when there are no matching opted-in journalists or no approved releases are handled
 * inside `sendJournalistDigest`.
 *
 * Cron runs only while the Node process is up.
 */
const runDigestIfFrequency = async (frequency: 'daily' | '3x-weekly') => {
    const configuredFrequency = await getEmailDigestFrequency();

    if (configuredFrequency !== frequency) {
        return;
    }

    await sendJournalistDigest(frequency, 'scheduler');
};

export const startEmailDigestScheduler = () => {
    cron.schedule('0 8 * * *', () => {
        runDigestIfFrequency('daily').catch((error) => logger.error('Daily digest scheduler failed', error));
    }, { timezone: 'America/New_York' });

    cron.schedule('0 8 * * 1,3,5', () => {
        runDigestIfFrequency('3x-weekly').catch((error) => logger.error('3x weekly digest scheduler failed', error));
    }, { timezone: 'America/New_York' });
};
