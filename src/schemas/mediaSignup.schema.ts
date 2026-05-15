import { z } from 'zod';
import { MEDIA_SIGNUP_STATUSES } from '../types/MediaSignup.js';

const normalizeString = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const normalizeEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export const MediaSignupStoreSchema = z.object({
    requestId: z.string().uuid(),
    firstName: z.preprocess(normalizeString, z.string().min(1).max(80)),
    lastName: z.preprocess(normalizeString, z.string().min(1).max(80)),
    email: z.preprocess(normalizeEmail, z.string().email().max(254)),
    publicationName: z.preprocess(normalizeString, z.string().min(1).max(140)),
    role: z.preprocess(normalizeString, z.string().min(1).max(80)),
    coverageArea: z.preprocess(normalizeString, z.string().max(160).optional().default('')),
    region: z.preprocess(normalizeString, z.string().min(1).max(80)),
    website: z.preprocess(normalizeString, z.string().max(200).optional().default('')),
    notes: z.preprocess(normalizeString, z.string().max(1000).optional().default('')),
});

export const MediaSignupStatusSchema = z.object({
    status: z.enum(MEDIA_SIGNUP_STATUSES),
});

export const MediaSignupQuerySchema = z.object({
    status: z.enum(MEDIA_SIGNUP_STATUSES).optional(),
});

export type MediaSignupStoreInput = z.infer<typeof MediaSignupStoreSchema>;
export type MediaSignupStatusInput = z.infer<typeof MediaSignupStatusSchema>;
export type MediaSignupQueryInput = z.infer<typeof MediaSignupQuerySchema>;
