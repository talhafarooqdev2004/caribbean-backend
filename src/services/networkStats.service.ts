import { MediaSignupRepository } from '../repositories/mediaSignup.repository.js';
import { PressReleaseRepository } from '../repositories/pressRelease.repository.js';
import { UserRepository } from '../repositories/user.repository.js';

const userRepository = new UserRepository();
const mediaSignupRepository = new MediaSignupRepository();
const pressReleaseRepository = new PressReleaseRepository();

const formatPublicCount = (value: number): string => {
    const safe = Math.max(0, Math.floor(value));

    if (safe >= 1000) {
        const thousands = safe / 1000;
        const rounded = thousands >= 10 ? Math.round(thousands) : Number(thousands.toFixed(1));
        return `${String(rounded).replace(/\.0$/, '')}k+`;
    }

    if (safe >= 100) {
        return `${Math.floor(safe / 50) * 50}+`;
    }

    return `${Math.max(safe, 1)}+`;
};

const formatRelativeAgo = (date: Date | null): string | null => {
    if (!date || Number.isNaN(date.getTime())) {
        return null;
    }

    const diffMs = Date.now() - date.getTime();

    if (diffMs < 0) {
        return 'Just now';
    }

    const minutes = Math.floor(diffMs / 60_000);

    if (minutes < 1) {
        return 'Just now';
    }

    if (minutes < 60) {
        return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }

    const hours = Math.floor(minutes / 60);

    if (hours < 24) {
        return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    const days = Math.floor(hours / 24);

    if (days < 14) {
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(date);
};

export const getPublicNetworkStats = async () => {
    const [
        journalistUsers,
        approvedMediaSignups,
        releasesSent,
        paidStatuses,
        latestRelease,
        islandsCovered,
    ] = await Promise.all([
        userRepository.count('journalist'),
        mediaSignupRepository.count('approved'),
        pressReleaseRepository.countByQuery({ paymentStatus: 'paid' }),
        pressReleaseRepository.countPaidByStatuses(),
        pressReleaseRepository.findLatestApprovedPaid(),
        pressReleaseRepository.countDistinctApprovedIslands(),
    ]);

    const mediaMembers = journalistUsers + approvedMediaSignups;
    const reviewedTotal = paidStatuses.approved + paidStatuses.rejected;
    const distributionRate = reviewedTotal > 0
        ? Math.round((paidStatuses.approved / reviewedTotal) * 100)
        : 98;

    const lastReleaseAt = latestRelease?.publishedAt ?? latestRelease?.createdAt ?? null;
    const lastReleaseLabel = formatRelativeAgo(lastReleaseAt);

    return {
        mediaMembers,
        mediaMembersLabel: formatPublicCount(mediaMembers),
        islandsCovered: Math.max(islandsCovered, 15),
        islandsCoveredLabel: `${Math.max(islandsCovered, 15)}+`,
        releasesSent,
        releasesSentLabel: formatPublicCount(releasesSent),
        distributionRate,
        distributionRateLabel: `${distributionRate}%`,
        lastReleaseAt: lastReleaseAt ? lastReleaseAt.toISOString() : null,
        lastReleaseLabel: lastReleaseLabel ? `Last release: ${lastReleaseLabel}` : null,
        updatedAt: new Date().toISOString(),
    };
};
