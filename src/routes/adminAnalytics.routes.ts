import express from 'express';
import { getAnalytics } from '../controllers/v1/admin/analytics.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.get('/', readLimiter, getAnalytics);

export default router;
