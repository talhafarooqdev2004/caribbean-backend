import express from 'express';
import {
    approveRelease,
    rejectRelease,
    updateFeature,
    updateRelease,
    updateReleaseFiles,
} from '../controllers/v1/admin/pressReleaseAdmin.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter } from '../middlewares/rateLimiter.middleware.js';
import { pressReleaseUpload } from '../middlewares/upload.middleware.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.put('/:id/feature', apiLimiter, updateFeature);
router.put(
    '/:id/files',
    apiLimiter,
    pressReleaseUpload.fields([
        { name: 'coverPhoto', maxCount: 1 },
        { name: 'document', maxCount: 1 },
    ]),
    updateReleaseFiles,
);
router.put('/:id', apiLimiter, updateRelease);
router.post('/:id/approve', apiLimiter, approveRelease);
router.post('/:id/reject', apiLimiter, rejectRelease);

export default router;
