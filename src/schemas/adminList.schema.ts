import { z } from 'zod';

const normalizeSearch = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 200) : '');

export const AdminUserListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(500).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(8),
    search: z.preprocess(normalizeSearch, z.string().max(200).optional().default('')),
});

export const ContactMessageQuerySchema = z.object({
    page: z.coerce.number().int().min(1).max(500).optional().default(1),
    limit: z.coerce.number().int().min(1).max(100).optional().default(8),
    contactOnly: z.preprocess(
        (value) => value === true || value === 'true' || value === '1',
        z.boolean().optional().default(false),
    ),
});

export type AdminUserListQueryInput = z.infer<typeof AdminUserListQuerySchema>;
export type ContactMessageQueryInput = z.infer<typeof ContactMessageQuerySchema>;
