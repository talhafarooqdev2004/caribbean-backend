import { z } from 'zod';

export const SquareCheckoutSchema = z.object({
    releaseId: z.string().min(1),
    quantity: z.coerce.number().int().min(1).max(25).optional().default(1),
    email: z.string().email().optional(),
    cardholderName: z.string().max(160).optional(),
});

export const SquareProcessSchema = z.object({
    sourceId: z.string().min(1),
    releaseId: z.string().min(1).optional(),
    creditPackage: z.enum(['single', 'bundle']).optional(),
    packageType: z.enum(['single', 'bundle', 'custom']).optional(),
    featuredAddon: z.coerce.boolean().optional().default(false),
    /** Staged checkout session (no press release row until paid); amount must match package × quantity + featured. */
    creditCheckoutSessionId: z.string().min(1).optional(),
    amount: z.coerce.number().min(0),
    quantity: z.coerce.number().int().min(1).max(25).optional().default(1),
    email: z.string().email().optional(),
    cardholderName: z.string().max(160).optional(),
}).superRefine((data, ctx) => {
    if (data.creditPackage && data.releaseId) {
        ctx.addIssue({
            code: 'custom',
            message: 'Provide either creditPackage or releaseId, not both',
            path: ['creditPackage'],
        });
    }

    if (!data.creditPackage && !data.releaseId) {
        ctx.addIssue({
            code: 'custom',
            message: 'Either creditPackage or releaseId is required',
            path: ['releaseId'],
        });
    }

});

export type SquareCheckoutInput = z.infer<typeof SquareCheckoutSchema>;
export type SquareProcessInput = z.infer<typeof SquareProcessSchema>;
