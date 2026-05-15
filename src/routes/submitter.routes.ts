import express from 'express';
import {
    addPortalBookmark,
    getPortalBookmarks,
    getPortalCredits,
    getPortalDashboard,
    getPortalProfile,
    getPortalSubmissions,
    removePortalBookmark,
    unsubscribeDigestGet,
    updatePortalDigestSettings,
    updatePortalProfile,
} from '../controllers/v1/portalUser.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.get('/unsubscribe', readLimiter, unsubscribeDigestGet);
router.use(authMiddleware, authorize('submitter', 'journalist'));
router.get('/profile', readLimiter, getPortalProfile);
router.put('/profile', apiLimiter, updatePortalProfile);
router.get('/credits', readLimiter, getPortalCredits);
router.get('/submissions', readLimiter, getPortalSubmissions);
router.get('/bookmarks', readLimiter, getPortalBookmarks);
router.post('/bookmarks', apiLimiter, addPortalBookmark);
router.delete('/bookmarks/:id', apiLimiter, removePortalBookmark);
router.put('/digest-settings', apiLimiter, updatePortalDigestSettings);
router.get('/dashboard', readLimiter, getPortalDashboard);

export default router;
