import { z } from 'zod';

const normalizeString = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const normalizeContent = (value: unknown) => typeof value === 'string' ? value.trim() : value;
const normalizeEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export const ContactMessageStoreSchema = z.object({
    name: z.preprocess(normalizeString, z.string().min(1).max(160)),
    email: z.preprocess(normalizeEmail, z.string().email().max(254)),
    organization: z.preprocess(normalizeString, z.string().max(160).optional().default('')),
    inquiryType: z.preprocess(normalizeString, z.string().min(1).max(80)),
    message: z.preprocess(normalizeContent, z.string().min(1).max(5000)),
    entrySource: z.preprocess(
        (v) => (v === 'pricing_proposal' ? 'pricing_proposal' : v === 'general' ? 'general' : undefined),
        z.enum(['general', 'pricing_proposal']).optional(),
    ),
});

export type ContactMessageStoreInput = z.infer<typeof ContactMessageStoreSchema>;
