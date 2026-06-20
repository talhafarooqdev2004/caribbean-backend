import cron from 'node-cron';
import { PressReleaseRepository } from '../repositories/pressRelease.repository.js';
import { logger } from '../utils/logger.util.js';

const pressReleaseRepository = new PressReleaseRepository();

export const runFeaturedPlacementExpiry = async () => {
    const expiredCount = await pressReleaseRepository.expireFeaturedPlacements();

    if (expiredCount > 0) {
        logger.info(`Expired featured placement for ${expiredCount} press release(s)`);
    }

    return expiredCount;
};

export const startFeaturedPlacementScheduler = () => {
    runFeaturedPlacementExpiry().catch((error) => {
        logger.error('Featured placement expiry check failed on startup', error);
    });

    cron.schedule('0 * * * *', () => {
        runFeaturedPlacementExpiry().catch((error) => {
            logger.error('Featured placement expiry scheduler failed', error);
        });
    });
};
