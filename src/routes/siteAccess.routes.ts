import express from 'express';
import { getPublicSiteAccess } from '../controllers/v1/siteAccess.controller.js';
import { readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.get('/', readLimiter, getPublicSiteAccess);

export default router;
