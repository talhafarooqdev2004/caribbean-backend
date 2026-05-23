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

router.post('/login', validate(LoginSchema), login);
router.post('/forgot-password', validate(ForgotPasswordSchema), forgotPassword);
router.post('/reset-password', validate(ResetPasswordSchema), resetPassword);
router.post('/admin/login', validate(AdminLoginSchema), adminLogin);
router.post('/register', validate(RegisterSchema), register);
router.get('/me', authMiddleware, getMe);
router.put('/me', authMiddleware, validate(UpdateMeSchema), updateMe);

export default router;
