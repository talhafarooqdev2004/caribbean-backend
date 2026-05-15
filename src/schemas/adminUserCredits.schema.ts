import { z } from 'zod';

export const AdminUserCreditsIncrementSchema = z.object({
    credits: z.coerce.number().int().min(1).max(10_000),
});

export type AdminUserCreditsIncrementInput = z.infer<typeof AdminUserCreditsIncrementSchema>;
