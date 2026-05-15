import express from 'express';
import * as paymentGatewayController from '../controllers/v1/admin/paymentGateway.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin', 'super_admin'));
router.get('/', readLimiter, paymentGatewayController.getAllPaymentGateways);
router.put('/square/test-mode', apiLimiter, paymentGatewayController.updateSquareTestMode);

export default router;
