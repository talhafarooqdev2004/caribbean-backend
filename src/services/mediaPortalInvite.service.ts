import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { MongoServerError, type ObjectId } from 'mongodb';
import { emailAnchor, emailButton, emailPublicUrl } from '../utils/email-html.util.js';
import { emailService } from './email.service.js';
import { MediaSignupRepository } from '../repositories/mediaSignup.repository.js';
import { MediaPortalInviteJobRepository } from '../repositories/mediaPortalInviteJob.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { logger } from '../utils/logger.util.js';
import { toObjectId } from '../utils/mongo.util.js';
import type { MediaPortalInviteJobRecord, MediaPortalInviteJobResultEntry } from '../types/MediaPortalInviteJob.js';
import type { MediaSignupRecord } from '../types/MediaSignup.js';

const mediaSignupRepository = new MediaSignupRepository();
const mediaPortalInviteJobRepository = new MediaPortalInviteJobRepository();
const userRepository = new UserRepository();

const runningJobIds = new Set<string>();

const delay = (ms: number) => new Promise((resolve) => {
    setTimeout(resolve, ms);
});

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const isValidEmail = (email: string) => {
    const trimmed = email.trim();

    if (!trimmed || trimmed.length > 254) {
        return false;
    }

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
};

const generateSecurePassword = () => crypto.randomBytes(18).toString('base64url');

const buildInviteEmailHtml = (firstName: string, email: string, plainPassword: string) => {
    const loginUrl = emailPublicUrl('/login');
    const portalUrl = emailPublicUrl('/portal');

    const intro = 'Your Carib Newswire portal is ready. Sign in using the email address and temporary password below. From your dashboard you can manage press releases, credits, bookmarks, and your profile.';

    return `
        <div style="font-family: Arial, sans-serif; color: #274060; max-width: 560px;">
            <h1>Carib Newswire</h1>
            <p>Hi ${escapeHtml(firstName)},</p>
            <p>${intro}</p>
            <p><strong>Email:</strong> ${escapeHtml(email)}</p>
            <p><strong>Temporary password:</strong> <code style="font-size: 15px;">${escapeHtml(plainPassword)}</code></p>
            ${emailButton(loginUrl, 'Sign in')}
            <p>${emailAnchor(portalUrl, 'Open your portal')}</p>
            <p style="color: #667085; font-size: 14px;">For security, please change this password after you sign in (use Forgot password on the login page if needed).</p>
        </div>
    `;
};

const processOneSignup = async (signupObjectId: ObjectId): Promise<MediaPortalInviteJobResultEntry> => {
    const signupIdHex = signupObjectId.toHexString();
    const signup = await mediaSignupRepository.findById(signupObjectId);

    if (!signup) {
        return {
            signupId: signupIdHex,
            email: '',
            outcome: 'skipped_not_found',
            detail: 'Signup was not found.',
        };
    }

    const email = (signup.email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
        return {
            signupId: signupIdHex,
            email: signup.email || '',
            outcome: 'skipped_invalid_email',
            detail: 'Email address is missing or invalid.',
        };
    }

    if (signup.status === 'rejected') {
        return {
            signupId: signupIdHex,
            email,
            outcome: 'skipped_rejected',
            detail: 'Rejected signups are not invited automatically.',
        };
    }

    if (signup.portalInvitedAt && signup.portalUserId) {
        return {
            signupId: signupIdHex,
            email,
            outcome: 'skipped_already_invited',
            detail: 'A portal account was already created from this signup.',
        };
    }

    const existing = await userRepository.findByEmail(email);

    if (existing && (existing.role === 'journalist' || existing.role === 'submitter')) {
        return {
            signupId: signupIdHex,
            email,
            outcome: 'skipped_exists',
            detail: 'A portal user with this email already exists.',
        };
    }

    if (existing) {
        return {
            signupId: signupIdHex,
            email,
            outcome: 'skipped_exists',
            detail: 'This email is already in use by another account type.',
        };
    }

    const plainPassword = generateSecurePassword();
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const firstName = (signup.firstName || '').trim() || 'Media';
    const lastName = (signup.lastName || '').trim() || 'Partner';
    const isContactProposalInvite = signup.source === 'contact-proposal';

    let createdUserId: ObjectId | null = null;

    try {
        const journalistProfile = isContactProposalInvite
            ? null
            : {
                mediaOutlet: signup.publicationName?.trim() || null,
                location: signup.region?.trim() || null,
                primaryBeat: signup.coverageArea?.trim() || null,
                website: signup.website?.trim() || null,
                bio: signup.notes?.trim() || null,
                digestOptIn: true,
                digestFrequency: '3x-weekly' as const,
                unsubscribeToken: crypto.randomUUID(),
            };

        const user = await userRepository.create({
            firstName,
            lastName,
            email,
            password: passwordHash,
            role: 'submitter',
            phone: null,
            organization: signup.publicationName?.trim() || null,
            credits: 0,
            creditsExpiresAt: null,
            packageType: null,
            journalistProfile,
        });

        if (!user?._id) {
            return {
                signupId: signupIdHex,
                email,
                outcome: 'failed',
                detail: 'User record was not created.',
            };
        }

        createdUserId = user._id;

        const subject = 'Your Carib Newswire portal access';

        const textIntro = 'Your Carib Newswire portal is ready. Sign in using the email address and temporary password below. From your dashboard you can manage press releases, credits, bookmarks, and your profile.';

        const sent = await emailService.sendMail({
            to: email,
            subject,
            html: buildInviteEmailHtml(firstName, email, plainPassword),
            text: [
                `Hi ${firstName},`,
                '',
                textIntro,
                '',
                `Email: ${email}`,
                `Temporary password: ${plainPassword}`,
                '',
                `Sign in: ${emailPublicUrl('/login')}`,
                `Portal: ${emailPublicUrl('/portal')}`,
                '',
                'For security, please change this password after you sign in (use Forgot password on the login page if needed).',
            ].join('\n'),
        });

        if (!sent) {
            await userRepository.delete(user._id);

            return {
                signupId: signupIdHex,
                email,
                outcome: 'failed',
                detail: 'Email could not be sent (check SMTP). No account was kept.',
            };
        }

        await mediaSignupRepository.markPortalInvited(signup._id, user._id);

        return {
            signupId: signupIdHex,
            email,
            outcome: 'created',
            userId: user._id.toHexString(),
        };
    } catch (error) {
        if (createdUserId) {
            await userRepository.delete(createdUserId).catch(() => null);
        }

        if (error instanceof MongoServerError && error.code === 11000) {
            return {
                signupId: signupIdHex,
                email,
                outcome: 'skipped_exists',
                detail: 'Duplicate email while creating the account.',
            };
        }

        logger.error('Media portal invite failed for signup', { signupId: signupIdHex, error });

        return {
            signupId: signupIdHex,
            email,
            outcome: 'failed',
            detail: error instanceof Error ? error.message : 'Unexpected error.',
        };
    }
};

export const jobToPublicJson = (job: MediaPortalInviteJobRecord) => ({
    id: job._id.toHexString(),
    status: job.status,
    signupIds: job.signupIds.map((id) => id.toHexString()),
    currentIndex: job.currentIndex,
    total: job.signupIds.length,
    results: job.results,
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    startedAt: job.startedAt ? job.startedAt.toISOString() : null,
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
    lastError: job.lastError,
});

export const runMediaPortalInviteJob = async (jobId: string) => {
    if (runningJobIds.has(jobId)) {
        return;
    }

    runningJobIds.add(jobId);

    try {
        let job = await mediaPortalInviteJobRepository.findById(jobId);

        if (!job || job.status === 'completed' || job.status === 'failed') {
            return;
        }

        if (job.status === 'queued') {
            const promoted = await mediaPortalInviteJobRepository.markProcessing(jobId);

            if (!promoted) {
                job = await mediaPortalInviteJobRepository.findById(jobId);

                if (!job || job.status !== 'processing') {
                    return;
                }
            } else {
                job = promoted;
            }
        }

        const total = job.signupIds.length;
        let index = job.currentIndex;

        while (index < total) {
            const signupObjectId = job.signupIds[index];
            const entry = await processOneSignup(signupObjectId);
            const nextIndex = index + 1;

            const updated = await mediaPortalInviteJobRepository.appendResultAndAdvance(
                jobId,
                entry,
                nextIndex,
                total,
            );

            if (updated) {
                job = updated;
            }

            index = nextIndex;

            if (index < total) {
                await delay(1200);
                await mediaPortalInviteJobRepository.touchUpdatedAt(jobId);
            }
        }
    } catch (error) {
        logger.error('Media portal invite job crashed', { jobId, error });
        await mediaPortalInviteJobRepository.setFailed(
            jobId,
            error instanceof Error ? error.message : 'Job failed',
        );
    } finally {
        runningJobIds.delete(jobId);
    }
};

const dedupeIds = (ids: string[]) => {
    const seen = new Set<string>();
    const ordered: string[] = [];

    for (const raw of ids) {
        const id = raw.trim();

        if (!id || seen.has(id)) {
            continue;
        }

        seen.add(id);
        ordered.push(id);
    }

    return ordered;
};

export const createMediaPortalInviteJobFromSignupIds = async (rawSignupIds: string[]) => {
    const uniqueIds = dedupeIds(rawSignupIds);
    const eligible: ObjectId[] = [];
    const skippedReasons: { id: string; reason: string }[] = [];

    for (const hex of uniqueIds) {
        const oid = toObjectId(hex);

        if (!oid) {
            skippedReasons.push({ id: hex, reason: 'invalid_id' });
            continue;
        }

        const signup = await mediaSignupRepository.findById(oid) as MediaSignupRecord | null;

        if (!signup) {
            skippedReasons.push({ id: hex, reason: 'not_found' });
            continue;
        }

        if (signup.status === 'rejected') {
            skippedReasons.push({ id: hex, reason: 'rejected' });
            continue;
        }

        if (signup.portalInvitedAt && signup.portalUserId) {
            skippedReasons.push({ id: hex, reason: 'already_invited' });
            continue;
        }

        const email = (signup.email || '').trim();

        if (!isValidEmail(email)) {
            skippedReasons.push({ id: hex, reason: 'invalid_email' });
            continue;
        }

        const existing = await userRepository.findByEmail(email);

        if (existing && (existing.role === 'journalist' || existing.role === 'submitter' || existing.role === 'admin')) {
            skippedReasons.push({ id: hex, reason: 'email_in_use' });
            continue;
        }

        eligible.push(oid);
    }

    return { eligible, skippedReasons };
};

export const enqueueMediaPortalInviteJob = async (rawSignupIds: string[]) => {
    const { eligible, skippedReasons } = await createMediaPortalInviteJobFromSignupIds(rawSignupIds);

    if (eligible.length === 0) {
        return {
            job: null as MediaPortalInviteJobRecord | null,
            skippedReasons,
        };
    }

    const job = await mediaPortalInviteJobRepository.create(eligible);

    if (!job) {
        return { job: null, skippedReasons };
    }

    const jobId = job._id.toHexString();

    setImmediate(() => {
        runMediaPortalInviteJob(jobId).catch((error) => {
            logger.error('runMediaPortalInviteJob async error', { jobId, error });
        });
    });

    return { job, skippedReasons };
};

export const getMediaPortalInviteJobById = async (jobId: string) => mediaPortalInviteJobRepository.findById(jobId);

const STALE_MS = 15 * 60 * 1000;

export const recoverStaleMediaPortalInviteJobs = async () => {
    const threshold = new Date(Date.now() - STALE_MS);
    const stale = await mediaPortalInviteJobRepository.findStaleProcessing(threshold);

    for (const job of stale) {
        const id = job._id.toHexString();

        setImmediate(() => {
            runMediaPortalInviteJob(id).catch((error) => {
                logger.error('recover runMediaPortalInviteJob error', { jobId: id, error });
            });
        });
    }

    if (stale.length > 0) {
        logger.info(`Recovered ${stale.length} stale media portal invite job(s)`);
    }
};

export const startMediaPortalInviteRecoveryScheduler = () => {
    setInterval(() => {
        recoverStaleMediaPortalInviteJobs().catch((error) => {
            logger.error('recoverStaleMediaPortalInviteJobs interval error', error);
        });
    }, 120_000);
};
