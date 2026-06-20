import http from 'http';
import app from './src/app.js';
import { ENV } from './src/config/env.js';
import { connectDB } from './src/lib/mongodb.js';
import { logger } from './src/utils/logger.util.js';
import { logRedisCacheConnectivity } from './src/services/apiCache.service.js';
import { ensureDefaultAppConfig } from './src/services/appConfig.service.js';
import { verifySquareLocationForActiveCredentials } from './src/services/square.service.js';
import { ensureDefaultAdminUser } from './src/services/auth.service.js';
import { startEmailDigestScheduler } from './src/services/emailDigest.scheduler.js';
import { startFeaturedPlacementScheduler } from './src/services/featuredPlacement.scheduler.js';
import { recoverStaleMediaPortalInviteJobs, startMediaPortalInviteRecoveryScheduler } from './src/services/mediaPortalInvite.service.js';

const PORT = ENV.PORT || 5000;

const httpServer = http.createServer(app);

await connectDB();
await logRedisCacheConnectivity();
await ensureDefaultAppConfig();
await verifySquareLocationForActiveCredentials();
await ensureDefaultAdminUser();
startEmailDigestScheduler();
startFeaturedPlacementScheduler();
await recoverStaleMediaPortalInviteJobs();
startMediaPortalInviteRecoveryScheduler();

httpServer.listen(PORT, () => {
    logger.info(`Carib Newswire Backend running on port ${PORT} in ${ENV.NODE_ENV} mode`);
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled promise rejection', error);
    httpServer.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    httpServer.close(() => {
        logger.info('Process terminated');
    });
});
