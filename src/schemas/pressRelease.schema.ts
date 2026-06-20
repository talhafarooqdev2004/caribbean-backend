import { z } from 'zod';
import { PAYMENT_STATUSES, PRESS_RELEASE_PACKAGES, PRESS_RELEASE_STATUSES } from '../types/PressRelease.js';

const normalizeString = (value: unknown) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value;
const normalizeContent = (value: unknown) => typeof value === 'string' ? value.trim() : value;

const normalizeOutboundLink = (value: unknown) => {
    if (typeof value !== 'string') {
        return '';
    }

    let s = value.trim().slice(0, 2048);

    if (!s) {
        return '';
    }

    if (/^www\./i.test(s)) {
        s = `https://${s}`;
    }

    return s;
};

const optionalHttpUrl = z.string().max(2048).refine(
    (s) => {
        if (!s) {
            return true;
        }

        try {
            const u = new URL(s);

            return u.protocol === 'http:' || u.protocol === 'https:';
        } catch {
            return false;
        }
    },
    { message: 'Outbound link must be empty or a valid http(s) URL' },
);
const normalizeEmail = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : value;

/** Same word rule as the public submit form (whitespace-separated tokens). */
const countSubmitterWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

const SUBMITTER_MAX_PRESS_WORDS = 700;
const SUBMITTER_MAX_SUMMARY_CHARS = 300;

const submitterPressReleaseContentSchema = z
    .string()
    .min(1)
    .max(10_000_000)
    .refine((s) => countSubmitterWords(s) <= SUBMITTER_MAX_PRESS_WORDS, {
        message: `Press release content must be ${SUBMITTER_MAX_PRESS_WORDS} words or less.`,
    });
const parseBoolean = (value: unknown) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0' || normalized === '') return false;
    }

    return false;
};

export const PressReleaseStoreSchema = z.object({
    fullName: z.preprocess(normalizeString, z.string().min(1).max(160)),
    email: z.preprocess(normalizeEmail, z.string().email().max(254)),
    phoneNumber: z.preprocess(normalizeString, z.string().max(40).optional().default('')),
    organization: z.preprocess(normalizeString, z.string().min(1).max(160)),
    releaseTitle: z.preprocess(normalizeString, z.string().min(3).max(180)),
    category: z.preprocess(normalizeString, z.string().min(1).max(80)),
    island: z.preprocess(normalizeString, z.string().max(80).optional().default('Regional')),
    preferredDistributionDate: z.preprocess(normalizeString, z.string().max(60).optional().default('')),
    summary: z.preprocess(normalizeString, z.string().min(1).max(SUBMITTER_MAX_SUMMARY_CHARS)),
    pressReleaseContent: z.preprocess(normalizeContent, submitterPressReleaseContentSchema),
    targetRegions: z.preprocess(normalizeString, z.string().max(200).optional().default('')),
    specialInstructions: z.preprocess(normalizeContent, z.string().max(1000).optional().default('')),
    outboundLink: z.preprocess(normalizeOutboundLink, optionalHttpUrl),
    packageId: z.enum(PRESS_RELEASE_PACKAGES).optional().default('single'),
    featuredUpgrade: z.preprocess(parseBoolean, z.boolean()).optional().default(false),
    useExistingCredit: z.preprocess(parseBoolean, z.boolean()).optional().default(true),
});

/** Admin panel: create a release without credits or payment (saved as paid + pending review). */
export const AdminPressReleaseCreateSchema = PressReleaseStoreSchema.omit({
    useExistingCredit: true,
});

/** Same fields as press release store, without credit flags — staging only until payment succeeds. */
export const CreditCheckoutSessionStoreSchema = PressReleaseStoreSchema.omit({
    useExistingCredit: true,
});

export const PressReleaseQuerySchema = z.object({
    status: z.enum(PRESS_RELEASE_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    category: z.preprocess(normalizeString, z.string().optional()),
    island: z.preprocess(normalizeString, z.string().optional()),
    featured: z.coerce.boolean().optional(),
    dateRange: z.enum(['today', 'thisWeek', 'thisMonth', 'last3Months', 'allTime']).optional().default('allTime'),
    sort: z.enum(['newest', 'oldest', 'mostViewed', 'featured', 'featuredFirst', 'adminQueue']).optional().default('newest'),
    limit: z.coerce.number().int().min(1).max(100).optional().default(100),
    page: z.coerce.number().int().min(1).max(500).optional().default(1),
    search: z.preprocess(
        (value) => (typeof value === 'string' ? value.trim().slice(0, 200) : ''),
        z.string().max(200).optional().default(''),
    ),
});

export const PressReleaseStatusSchema = z.object({
    status: z.enum(PRESS_RELEASE_STATUSES),
    rejectionReason: z.preprocess(normalizeContent, z.string().max(1000).optional().default('')),
});

export const PressReleaseFeatureSchema = z.object({
    featured: z.coerce.boolean().optional(),
});

export const PressReleaseActiveSchema = z.object({
    isActive: z.coerce.boolean(),
});

export type PressReleaseStoreInput = z.infer<typeof PressReleaseStoreSchema>;
export type AdminPressReleaseCreateInput = z.infer<typeof AdminPressReleaseCreateSchema>;
export type CreditCheckoutSessionStoreInput = z.infer<typeof CreditCheckoutSessionStoreSchema>;
export type PressReleaseQueryInput = z.infer<typeof PressReleaseQuerySchema>;
export type PressReleaseStatusInput = z.infer<typeof PressReleaseStatusSchema>;
