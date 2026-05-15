import express from 'express';
import { sendDigestNow } from '../controllers/v1/admin/emailDigest.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.post('/send', apiLimiter, sendDigestNow);

export default router;
