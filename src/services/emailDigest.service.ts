import type { PressReleaseRecord } from '../types/PressRelease.js';
import { PressReleaseRepository } from '../repositories/pressRelease.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { emailService } from './email.service.js';
import { ENV } from '../config/env.js';
import crypto from 'crypto';
import { AppConfigRepository } from '../repositories/appConfig.repository.js';
import { APP_CONFIG_KEYS } from '../config/constants.js';

const pressReleaseRepository = new PressReleaseRepository();
const userRepository = new UserRepository();
const appConfigRepository = new AppConfigRepository();

const DIGEST_RELEASE_LIMIT = 10; // max stories included in each digest email body
/** Max opted-in portal users who receive each digest send (stable order: email ascending). */
const DIGEST_RECIPIENT_LIMIT = 10;
const SUMMARY_MAX_LENGTH = 280;

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
        const href = `${ENV.FRONTEND_URL}/newsroom/${release.slug}`;
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
                <p>Receiving this because you opted in as a media partner.</p>
                <p><a href="${unsubscribeUrl}">Unsubscribe</a></p>
            </footer>
        </div>
    `;
};

export type DigestSendResult = {
    recipients: number;
    releases: number;
    sent: number;
    skipped: boolean;
    skipReason?: 'no_journalists' | 'no_releases';
};

export const sendJournalistDigest = async (cadence: 'daily' | '3x-weekly'): Promise<DigestSendResult> => {
    const [portalUsers, releases] = await Promise.all([
        userRepository.findPortalMembers(),
        pressReleaseRepository.findAll({
            status: 'approved',
            paymentStatus: 'paid',
            sort: 'featuredFirst',
            limit: DIGEST_RELEASE_LIMIT,
        }),
    ]);

    const optedInJournalists = portalUsers.filter((user) => user.journalistProfile && user.journalistProfile.digestOptIn !== false)
        .filter((user) => {
            const userCadence = user.journalistProfile?.digestFrequency === '3x-weekly' ? '3x-weekly' : 'daily';
            return userCadence === cadence;
        });

    if (optedInJournalists.length === 0 || releases.length === 0) {
        return {
            recipients: 0,
            releases: releases.length,
            sent: 0,
            skipped: true,
            skipReason: optedInJournalists.length === 0 ? 'no_journalists' : 'no_releases',
        };
    }

    const digestRecipients = [...optedInJournalists]
        .sort((a, b) => a.email.localeCompare(b.email, 'en'))
        .slice(0, DIGEST_RECIPIENT_LIMIT);

    const digestDateLabel = formatDigestDate();
    const storyCount = releases.length;
    const storyWord = storyCount === 1 ? 'Story' : 'Stories';
    const subject = `Caribbean News Digest - ${storyCount} ${storyWord} - ${digestDateLabel}`;

    const results = await Promise.allSettled(
        digestRecipients.map(async (journalist) => {
            const unsubscribeToken = journalist.journalistProfile?.unsubscribeToken || crypto.randomUUID();

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
                        unsubscribeToken,
                    },
                });
            }

            return emailService.sendMail({
                to: journalist.email,
                subject,
                html: renderDigest(releases, unsubscribeToken, digestDateLabel),
            });
        }),
    );

    await appConfigRepository.updateOrCreate(
        APP_CONFIG_KEYS.EMAIL_DIGEST_LAST_SENT_AT,
        new Date().toISOString(),
        'Timestamp of the latest journalist digest send.',
    );

    return {
        recipients: digestRecipients.length,
        releases: storyCount,
        sent: results.filter((result) => result.status === 'fulfilled' && result.value).length,
        skipped: false,
    };
};
