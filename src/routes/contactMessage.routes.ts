import express from 'express';
import {
    createContactMessage,
    getAllContactMessages,
    promoteContactMessagePortalInvite,
} from '../controllers/v1/contactMessages.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { ContactMessageStoreSchema } from '../schemas/contactMessage.schema.js';

const router = express.Router();

router.post('/', apiLimiter, validate(ContactMessageStoreSchema), createContactMessage);
router.post('/:id/promote-portal-invite', authMiddleware, authorize('admin'), apiLimiter, promoteContactMessagePortalInvite);
router.get('/', authMiddleware, authorize('admin'), readLimiter, getAllContactMessages);

export default router;
