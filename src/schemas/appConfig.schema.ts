import { z } from 'zod';

export const AppConfigUpdateSchema = z.object({
    value: z.unknown(),
    description: z.string().max(300).nullable().optional(),
});

export type AppConfigUpdateInput = z.infer<typeof AppConfigUpdateSchema>;
