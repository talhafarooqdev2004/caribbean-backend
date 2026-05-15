import { z } from 'zod';

export const MediaPortalInviteEnqueueSchema = z.object({
    signupIds: z.array(z.string().min(1)).min(1).max(200),
});

export type MediaPortalInviteEnqueueInput = z.infer<typeof MediaPortalInviteEnqueueSchema>;
