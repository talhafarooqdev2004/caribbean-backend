import type { PressReleaseRecord } from '../types/PressRelease.js';
import { PressReleaseRepository } from '../repositories/pressRelease.repository.js';
import { NewsletterSubscriberRepository } from '../repositories/newsletterSubscriber.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { emailService } from './email.service.js';
import { ENV } from '../config/env.js';
import { emailAnchor, emailPublicUrl } from '../utils/email-html.util.js';
import crypto from 'crypto';
import { ObjectId } from 'mongodb';
import { AppConfigRepository } from '../repositories/appConfig.repository.js';
import { APP_CONFIG_KEYS } from '../config/constants.js';
import type { UserRecord } from '../types/User.js';
import type { NewsletterSubscriberRecord } from '../types/NewsletterSubscriber.js';
import { logger } from '../utils/logger.util.js';

const pressReleaseRepository = new PressReleaseRepository();
const userRepository = new UserRepository();
const newsletterSubscriberRepository = new NewsletterSubscriberRepository();
const appConfigRepository = new AppConfigRepository();

const DIGEST_RELEASE_LIMIT = 10; // max stories included in each digest email body
/** Send every active subscriber, but batch SMTP calls to avoid a large simultaneous burst. */
const DIGEST_SEND_BATCH_SIZE = 25;
const SUMMARY_MAX_LENGTH = 280;

type DigestRecipient = {
    email: string;
    unsubscribeToken: string;
    kind: 'user' | 'newsletter';
    user?: UserRecord;
    subscriber?: NewsletterSubscriberRecord;
};

type DigestRunSource = 'manual' | 'scheduler';

type DigestReleaseMarker = {
    publishedAt: Date;
    releaseId?: ObjectId | null;
};

const formatDigestDate = () => new Date().toLocaleDateString('en-US');

const twoSentenceSummary = (release: PressReleaseRecord) => {
    const base = (release.summary || '').trim()
        || release.content.replace(/\s+/g, ' ').trim();
    const sentences = base.split(/(?<=[.!?])\s+/).filter(Boolean);
    const text = sentences.slice(0, 2).join(' ') || base;
    if (text.length <= SUMMARY_MAX_LENGTH) {
        return text;
    }

    return `${text.slice(0, SUMMARY_MAX_LENGTH - 1)}…`;
};

const releaseDisplayDate = (release: PressReleaseRecord) => {
    const d = release.publishedAt ?? release.createdAt;
    return d instanceof Date ? d.toLocaleDateString('en-US') : new Date(d).toLocaleDateString('en-US');
};

const escapeHtml = (value: string) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const renderDigest = (releases: PressReleaseRecord[], unsubscribeToken: string, digestDateLabel: string) => {
    const items = releases.map((release) => {
        const href = emailPublicUrl(`/newsroom/${release.slug}`);
        const featuredBadge = release.featured
            ? '<span style="display: inline-block; margin-right: 8px; padding: 2px 8px; font-size: 11px; font-weight: bold; letter-spacing: 0.04em; text-transform: uppercase; color: #fff; background: #16477c; border-radius: 4px;">Featured</span>'
            : '';

        return `
            <tr>
                <td style="padding: 18px 0; border-bottom: 1px solid #e8edf3;">
                    <h2 style="margin: 0 0 8px; font-size: 20px;">${featuredBadge}<a href="${href}" style="color: #16477c;">${escapeHtml(release.title)}</a></h2>
                    <p style="margin: 0 0 8px; color: #667085;">${release.island || 'All Caribbean'} | ${release.category || 'News'} | ${releaseDisplayDate(release)}</p>
                    <p style="margin: 0 0 14px;">${twoSentenceSummary(release)}</p>
                    <a href="${href}" style="display: inline-block; padding: 10px 14px; background: #16477c; color: #fff; text-decoration: none; border-radius: 6px;">Read Full Release →</a>
                </td>
            </tr>
        `;
    }).join('');
    const unsubscribeUrl = `${ENV.BACKEND_URL}/api/v1/user/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;

    return `
        <div style="font-family: Arial, sans-serif; color: #274060; max-width: 680px; margin: 0 auto;">
            <header style="padding: 24px 0; border-bottom: 3px solid #16477c;">
                <h1 style="margin: 0;">Carib Newswire</h1>
            </header>
            <h2>Today's Caribbean News Digest</h2>
            <p>${digestDateLabel}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${items}</table>
            <footer style="margin-top: 28px; padding-top: 18px; border-top: 1px solid #e8edf3; color: #667085;">
                <p>Receiving this because you subscribed to Caribbean news updates.</p>
                <p>${emailAnchor(unsubscribeUrl, 'Unsubscribe')}</p>
            </footer>
        </div>
    `;
};

const buildDigestRecipients = async (cadence: 'daily' | '3x-weekly'): Promise<DigestRecipient[]> => {
    const [portalUsers, newsletterSubscribers] = await Promise.all([
        userRepository.findPortalMembers(),
        newsletterSubscriberRepository.findAllActive(),
    ]);

    const optedInUsers = portalUsers.filter((user) => user.journalistProfile?.digestOptIn === true)
        .filter((user) => {
            const userCadence = user.journalistProfile?.digestFrequency === '3x-weekly' ? '3x-weekly' : 'daily';
            return userCadence === cadence;
        });

    const userEmails = new Set(optedInUsers.map((user) => user.email.trim().toLowerCase()));

    const recipients: DigestRecipient[] = optedInUsers.map((user) => ({
        email: user.email,
        unsubscribeToken: user.journalistProfile?.unsubscribeToken || crypto.randomUUID(),
        kind: 'user',
        user,
    }));

    for (const subscriber of newsletterSubscribers) {
        if (userEmails.has(subscriber.email)) {
            continue;
        }

        recipients.push({
            email: subscriber.email,
            unsubscribeToken: subscriber.unsubscribeToken,
            kind: 'newsletter',
            subscriber,
        });
    }

    return recipients;
};

export type DigestSendResult = {
    recipients: number;
    releases: number;
    sent: number;
    failed: number;
    skipped: boolean;
    skipReason?: 'no_recipients' | 'no_releases' | 'no_new_releases';
    lastIncludedReleaseAt?: string | null;
    lastIncludedReleaseId?: string | null;
};

function parseDigestMarkerDate(value: unknown) {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseDigestMarkerId(value: unknown) {
    if (typeof value !== 'string' || !ObjectId.isValid(value)) {
        return null;
    }

    return new ObjectId(value);
}

async function getLastDigestReleaseMarker(): Promise<DigestReleaseMarker | null> {
    const [lastIncludedAtConfig, lastIncludedIdConfig, lastSentConfig] = await Promise.all([
        appConfigRepository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_INCLUDED_RELEASE_AT),
        appConfigRepository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_INCLUDED_RELEASE_ID),
        appConfigRepository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_SENT_AT),
    ]);

    const lastIncludedAt = parseDigestMarkerDate(lastIncludedAtConfig?.value);

    if (lastIncludedAt) {
        return {
            publishedAt: lastIncludedAt,
            releaseId: parseDigestMarkerId(lastIncludedIdConfig?.value),
        };
    }

    const legacyLastSentAt = parseDigestMarkerDate(lastSentConfig?.value);

    return legacyLastSentAt ? { publishedAt: legacyLastSentAt, releaseId: null } : null;
}

function digestMarkerForRelease(release: PressReleaseRecord): DigestReleaseMarker {
    return {
        publishedAt: release.publishedAt ?? release.createdAt,
        releaseId: release._id,
    };
}

function logDigestRun(source: DigestRunSource, cadence: 'daily' | '3x-weekly', result: DigestSendResult) {
    const status = result.skipped ? 'skipped' : 'sent';
    logger.info(`Journalist digest ${status}: ${JSON.stringify({ source, cadence, ...result })}`);
}

async function sendDigestBatch(
    recipients: DigestRecipient[],
    releases: PressReleaseRecord[],
    subject: string,
    digestDateLabel: string,
) {
    return Promise.allSettled(
        recipients.map(async (recipient) => {
            if (recipient.kind === 'user' && recipient.user) {
                const journalist = recipient.user;

                if (!journalist.journalistProfile?.unsubscribeToken) {
                    await userRepository.update(journalist._id, {
                        journalistProfile: {
                            ...(journalist.journalistProfile ?? {
                                mediaOutlet: null,
                                location: null,
                                primaryBeat: null,
                                website: null,
                                bio: null,
                                digestOptIn: true,
                                digestFrequency: 'daily',
                            }),
                            unsubscribeToken: recipient.unsubscribeToken,
                        },
                    });
                }
            }

            return emailService.sendMail({
                to: recipient.email,
                subject,
                html: renderDigest(releases, recipient.unsubscribeToken, digestDateLabel),
            });
        }),
    );
}

export const sendJournalistDigest = async (
    cadence: 'daily' | '3x-weekly',
    source: DigestRunSource = 'manual',
): Promise<DigestSendResult> => {
    const [digestRecipients, marker] = await Promise.all([
        buildDigestRecipients(cadence),
        getLastDigestReleaseMarker(),
    ]);
    const releases = await pressReleaseRepository.findDigestCandidatesAfterMarker(marker, DIGEST_RELEASE_LIMIT);

    if (digestRecipients.length === 0 || releases.length === 0) {
        const result: DigestSendResult = {
            recipients: digestRecipients.length,
            releases: releases.length,
            sent: 0,
            failed: 0,
            skipped: true,
            skipReason: digestRecipients.length === 0
                ? 'no_recipients'
                : marker
                    ? 'no_new_releases'
                    : 'no_releases',
        };

        logDigestRun(source, cadence, result);
        return result;
    }

    const recipients = [...digestRecipients]
        .sort((a, b) => a.email.localeCompare(b.email, 'en'));

    const digestDateLabel = formatDigestDate();
    const storyCount = releases.length;
    const storyWord = storyCount === 1 ? 'Story' : 'Stories';
    const subject = `Caribbean News Digest - ${storyCount} ${storyWord} - ${digestDateLabel}`;

    const results: PromiseSettledResult<boolean>[] = [];

    for (let start = 0; start < recipients.length; start += DIGEST_SEND_BATCH_SIZE) {
        const batch = recipients.slice(start, start + DIGEST_SEND_BATCH_SIZE);
        results.push(...await sendDigestBatch(batch, releases, subject, digestDateLabel));
    }

    const sent = results.filter((result) => result.status === 'fulfilled' && result.value).length;

    const lastIncludedRelease = releases[releases.length - 1]!;
    const lastIncludedMarker = digestMarkerForRelease(lastIncludedRelease);

    if (sent > 0) {
        await Promise.all([
            appConfigRepository.updateOrCreate(
                APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_SENT_AT,
                new Date().toISOString(),
                'Timestamp of the latest journalist digest send.',
            ),
            appConfigRepository.updateOrCreate(
                APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_INCLUDED_RELEASE_AT,
                lastIncludedMarker.publishedAt.toISOString(),
                'Publish/create timestamp of the newest release included in the latest sent digest.',
            ),
            appConfigRepository.updateOrCreate(
                APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_INCLUDED_RELEASE_ID,
                lastIncludedMarker.releaseId?.toHexString() ?? null,
                'ID tie-breaker for the newest release included in the latest sent digest.',
            ),
        ]);
    }

    const result: DigestSendResult = {
        recipients: recipients.length,
        releases: storyCount,
        sent,
        failed: recipients.length - sent,
        skipped: false,
        lastIncludedReleaseAt: sent > 0 ? lastIncludedMarker.publishedAt.toISOString() : null,
        lastIncludedReleaseId: sent > 0 ? lastIncludedMarker.releaseId?.toHexString() ?? null : null,
    };

    logDigestRun(source, cadence, result);
    return result;
};
