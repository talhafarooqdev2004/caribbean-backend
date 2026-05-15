import express from 'express';
import {
    createMediaSignup,
    deleteMediaSignup,
    getAllMediaSignups,
    updateMediaSignupStatus,
} from '../controllers/v1/mediaSignups.controller.js';
import {
    createMediaPortalInviteJob,
    getMediaPortalInviteJob,
} from '../controllers/v1/mediaPortalInvite.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate, validateQuery } from '../middlewares/validate.middleware.js';
import {
    MediaSignupQuerySchema,
    MediaSignupStatusSchema,
    MediaSignupStoreSchema,
} from '../schemas/mediaSignup.schema.js';
import { MediaPortalInviteEnqueueSchema } from '../schemas/mediaPortalInvite.schema.js';

const router = express.Router();

router.post(
    '/portal-invite-jobs',
    authMiddleware,
    authorize('admin'),
    apiLimiter,
    validate(MediaPortalInviteEnqueueSchema),
    createMediaPortalInviteJob,
);
router.get(
    '/portal-invite-jobs/:jobId',
    authMiddleware,
    authorize('admin'),
    readLimiter,
    getMediaPortalInviteJob,
);

router.post('/', apiLimiter, validate(MediaSignupStoreSchema), createMediaSignup);
router.get('/', authMiddleware, authorize('admin'), readLimiter, validateQuery(MediaSignupQuerySchema), getAllMediaSignups);
router.patch('/:id/status', authMiddleware, authorize('admin'), apiLimiter, validate(MediaSignupStatusSchema), updateMediaSignupStatus);
router.delete('/:id', authMiddleware, authorize('admin'), apiLimiter, deleteMediaSignup);

export default router;
