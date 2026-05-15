import express from 'express';
import * as userController from '../controllers/v1/admin/user.controller.js';
import { authMiddleware, authorize } from '../middlewares/auth.middleware.js';
import { apiLimiter, readLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { AdminUserCreditsIncrementSchema } from '../schemas/adminUserCredits.schema.js';

const router = express.Router();

router.use(authMiddleware, authorize('admin'));
router.get('/stats', readLimiter, userController.getUserStats);
router.post('/:id/credits', apiLimiter, validate(AdminUserCreditsIncrementSchema), userController.addUserCredits);
router.get('/', readLimiter, userController.getAllUsers);
router.get('/:id', readLimiter, userController.getUserById);
router.delete('/:id', apiLimiter, userController.deleteUser);

export default router;
