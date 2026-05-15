import express from 'express';
import { getDigestSettings, updateDigestSettings } from '../controllers/v1/admin/digestSettings.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.get('/', readLimiter, getDigestSettings);
router.put('/', apiLimiter, updateDigestSettings);

export default router;
