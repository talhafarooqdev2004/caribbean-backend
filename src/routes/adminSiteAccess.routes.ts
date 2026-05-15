import express from 'express';
import { getAdminSiteAccess, putAdminSiteAccess } from '../controllers/v1/admin/siteAccess.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.get('/', readLimiter, getAdminSiteAccess);
router.put('/', apiLimiter, putAdminSiteAccess);

export default router;
