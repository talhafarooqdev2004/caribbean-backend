import express from 'express';
import {
    approveRelease,
    createRelease,
    rejectRelease,
    updateActive,
    updateFeature,
    updateFeaturedPriority,
    updateRelease,
    updateReleaseFiles,
} from '../controllers/v1/admin/pressReleaseAdmin.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rateLimiter.middleware.js';
import { pressReleaseUpload } from '../middlewares/upload.middleware.js';
import { validatePressReleaseUpload } from '../middlewares/validatePressReleaseUpload.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { AdminPressReleaseCreateSchema } from '../schemas/pressRelease.schema.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.post(
    '/',
    apiLimiter,
    pressReleaseUpload.fields([
        { name: 'coverPhoto', maxCount: 1 },
        { name: 'document', maxCount: 1 },
    ]),
    validatePressReleaseUpload,
    validate(AdminPressReleaseCreateSchema),
    createRelease,
);
router.put('/:id/feature', apiLimiter, updateFeature);
router.put('/:id/featured-priority', apiLimiter, updateFeaturedPriority);
router.put('/:id/active', apiLimiter, updateActive);
router.put(
    '/:id/files',
    apiLimiter,
    pressReleaseUpload.fields([
        { name: 'coverPhoto', maxCount: 1 },
        { name: 'document', maxCount: 1 },
    ]),
    validatePressReleaseUpload,
    updateReleaseFiles,
);
router.put('/:id', apiLimiter, updateRelease);
router.post('/:id/approve', apiLimiter, approveRelease);
router.post('/:id/reject', apiLimiter, rejectRelease);

export default router;
