import { z } from 'zod';

const normalizeEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : value;

export const NewsletterSubscribeSchema = z.object({
    email: z.preprocess(normalizeEmail, z.string().email().max(254)),
});

export type NewsletterSubscribeInput = z.infer<typeof NewsletterSubscribeSchema>;
