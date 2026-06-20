import express from 'express';
import {
    getPublicSiteAccess,
    postDisableSiteMaintenance,
    postEnableSiteMaintenance,
} from '../controllers/v1/siteAccess.controller.js';
import { siteAccessControlSecretMiddleware } from '../middlewares/siteAccessControlSecret.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.get('/', readLimiter, getPublicSiteAccess);
router.post('/maintenance/off', apiLimiter, siteAccessControlSecretMiddleware, postDisableSiteMaintenance);
router.post('/maintenance/on', apiLimiter, siteAccessControlSecretMiddleware, postEnableSiteMaintenance);

export default router;
