import express from 'express';
import {
    createSquareCheckout,
    getLatestPaymentByReleaseId,
    getPaymentByOrderNumber,
    getSquareWebClientConfig,
    processSquarePayment,
} from '../controllers/v1/payments.controller.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';
import { optionalAuth } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { SquareCheckoutSchema, SquareProcessSchema } from '../schemas/payment.schema.js';

const router = express.Router();

router.get('/square/web-client-config', readLimiter, getSquareWebClientConfig);
router.post('/square/checkout', apiLimiter, optionalAuth, validate(SquareCheckoutSchema), createSquareCheckout);
router.post('/square/process', apiLimiter, optionalAuth, validate(SquareProcessSchema), processSquarePayment);
router.get('/square/release/:releaseId', readLimiter, getLatestPaymentByReleaseId);
router.get('/square/order/:orderId', readLimiter, getPaymentByOrderNumber);

export default router;
