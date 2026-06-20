import { z } from 'zod';

const normalizeString = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const normalizeEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : value;
const trimOnly = (value: unknown) => typeof value === 'string' ? value.trim() : value;

export const LoginSchema = z.object({
    email: z.preprocess(normalizeEmail, z.string().email()),
    password: z.string().min(1),
});

export const ForgotPasswordSchema = z.object({
    email: z.preprocess(normalizeEmail, z.string().email()),
});

export const ResetPasswordSchema = z.object({
    token: z.preprocess(trimOnly, z.string().min(32).max(128)),
    password: z.string().min(8).max(200),
});

export const AdminLoginSchema = z.object({
    email: z.preprocess(normalizeEmail, z.string().email()).optional(),
    username: z.preprocess(normalizeString, z.string().min(1)).optional(),
    password: z.string().min(1),
}).refine((value) => value.email || value.username, {
    message: 'Email or username is required',
    path: ['email'],
});

export const RegisterSchema = z.object({
    firstName: z.preprocess(normalizeString, z.string().min(1).max(80)),
    lastName: z.preprocess(normalizeString, z.string().min(1).max(80)),
    email: z.preprocess(normalizeEmail, z.string().email().max(254)),
    password: z.string().min(8).max(200),
    confirmPassword: z.string().min(8).max(200),
    organization: z.preprocess(normalizeString, z.string().max(140).optional().default('')),
    phone: z.preprocess(normalizeString, z.string().max(40).optional().default('')),
    mediaOutlet: z.preprocess(normalizeString, z.string().max(140).optional().default('')),
    location: z.preprocess(normalizeString, z.string().max(160).optional().default('')),
    primaryBeat: z.preprocess(normalizeString, z.string().max(160).optional().default('')),
    bio: z.preprocess(normalizeString, z.string().max(1000).optional().default('')),
    digestOptIn: z.coerce.boolean().optional().default(false),
}).refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
});

export const UpdateMeSchema = z.object({
    firstName: z.preprocess(normalizeString, z.string().min(1).max(80).optional()),
    lastName: z.preprocess(normalizeString, z.string().min(1).max(80).optional()),
    email: z.preprocess(normalizeEmail, z.string().email().max(254).optional()),
    phone: z.preprocess(normalizeString, z.string().max(40).optional()),
    organization: z.preprocess(normalizeString, z.string().max(140).optional()),
    country: z.preprocess(normalizeString, z.string().max(160).optional()),
}).refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
});

export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;
