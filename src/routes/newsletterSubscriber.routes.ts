import express from 'express';
import {
    subscribeToNewsletter,
    unsubscribeNewsletterGet,
} from '../controllers/v1/newsletterSubscriber.controller.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { NewsletterSubscribeSchema } from '../schemas/newsletterSubscriber.schema.js';

const router = express.Router();

router.post('/subscribe', apiLimiter, validate(NewsletterSubscribeSchema), subscribeToNewsletter);
router.get('/unsubscribe', readLimiter, unsubscribeNewsletterGet);

export default router;
