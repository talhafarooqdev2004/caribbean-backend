import express from 'express';
import * as appConfigController from '../controllers/v1/admin/appConfig.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { AppConfigUpdateSchema } from '../schemas/appConfig.schema.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.get('/:key', readLimiter, appConfigController.getAppConfig);
router.put('/:key', apiLimiter, validate(AppConfigUpdateSchema), appConfigController.updateAppConfig);

export default router;
