import express from 'express';
import {
    adminLogin,
    forgotPassword,
    getMe,
    login,
    register,
    resetPassword,
    updateMe,
} from '../controllers/v1/admin/auth.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { authLimiter } from '../middlewares/rateLimiter.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
    AdminLoginSchema,
    ForgotPasswordSchema,
    LoginSchema,
    RegisterSchema,
    ResetPasswordSchema,
    UpdateMeSchema,
} from '../schemas/auth.schema.js';

const router = express.Router();

router.post('/login', authLimiter, validate(LoginSchema), login);
router.post('/forgot-password', authLimiter, validate(ForgotPasswordSchema), forgotPassword);
router.post('/reset-password', authLimiter, validate(ResetPasswordSchema), resetPassword);
router.post('/admin/login', authLimiter, validate(AdminLoginSchema), adminLogin);
router.post('/register', validate(RegisterSchema), register);
router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, validate(UpdateMeSchema), updateMe);

export default router;
