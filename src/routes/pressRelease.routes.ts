import express from 'express';
import {
    approvePressRelease,
    createCreditCheckoutSession,
    createPressRelease,
    deletePressRelease,
    getAllPressReleases,
    getPressReleaseById,
    getPublicPressReleases,
    incrementPressReleaseClicks,
    incrementPressReleaseViews,
    rejectPressRelease,
    toggleFeaturedPressRelease,
    updatePressReleaseStatus,
} from '../controllers/v1/pressReleases.controller.js';
import { authMiddleware, authorize, optionalAuth } from '../middlewares/auth.middleware.js';
import { pressReleaseUpload } from '../middlewares/upload.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate, validateQuery } from '../middlewares/validate.middleware.js';
import {
    PressReleaseQuerySchema,
    PressReleaseStatusSchema,
    PressReleaseStoreSchema,
    CreditCheckoutSessionStoreSchema,
} from '../schemas/pressRelease.schema.js';

const router = express.Router();

router.get('/admin/all/list', authMiddleware, authorize('admin'), readLimiter, validateQuery(PressReleaseQuerySchema), getAllPressReleases);
router.patch('/admin/:id/status', authMiddleware, authorize('admin'), apiLimiter, validate(PressReleaseStatusSchema), updatePressReleaseStatus);
router.patch('/admin/:id/approve', authMiddleware, authorize('admin'), apiLimiter, approvePressRelease);
router.patch('/admin/:id/reject', authMiddleware, authorize('admin'), apiLimiter, rejectPressRelease);
router.patch('/admin/:id/toggle-featured', authMiddleware, authorize('admin'), apiLimiter, toggleFeaturedPressRelease);
router.delete('/admin/:id', authMiddleware, authorize('admin'), apiLimiter, deletePressRelease);

router.post(
    '/credit-checkout-session',
    apiLimiter,
    optionalAuth,
    pressReleaseUpload.fields([
        { name: 'coverPhoto', maxCount: 1 },
        { name: 'document', maxCount: 1 },
    ]),
    validate(CreditCheckoutSessionStoreSchema),
    createCreditCheckoutSession,
);
router.get('/', readLimiter, validateQuery(PressReleaseQuerySchema), getPublicPressReleases);
router.get('/:id', readLimiter, optionalAuth, getPressReleaseById);
router.post(
    '/',
    apiLimiter,
    optionalAuth,
    pressReleaseUpload.fields([
        { name: 'coverPhoto', maxCount: 1 },
        { name: 'document', maxCount: 1 },
    ]),
    validate(PressReleaseStoreSchema),
    createPressRelease,
);
router.post('/:id/views', apiLimiter, incrementPressReleaseViews);
router.post('/:id/click', apiLimiter, incrementPressReleaseClicks);
router.post('/:id/clicks', apiLimiter, incrementPressReleaseClicks);

export default router;
