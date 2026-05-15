import express from 'express';
import { getPaymentMode, updatePaymentMode } from '../controllers/v1/admin/paymentMode.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.get('/', readLimiter, authMiddleware, authorize('admin'), getPaymentMode);
router.put('/', authMiddleware, authorize('admin'), apiLimiter, updatePaymentMode);

export default router;
