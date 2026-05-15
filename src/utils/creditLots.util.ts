import type { UserCreditLot } from '../types/User.js';

/** Wallet credits expire six months after they are issued (per grant / lot). */
export const CREDIT_WALLET_EXPIRY_MONTHS = 6;

export function monthsFromDate(base: Date, months: number): Date {
    const d = new Date(base);
    d.setMonth(d.getMonth() + months);
    return d;
}

export function walletGrantExpiresAt(from: Date = new Date()): Date {
    return monthsFromDate(from, CREDIT_WALLET_EXPIRY_MONTHS);
}

export function activeCreditLotsSorted(lots: UserCreditLot[] | undefined, now: Date): UserCreditLot[] {
    return (lots ?? [])
        .filter((l) => l.credits > 0 && l.expiresAt > now)
        .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
}

export function deriveCreditFieldsFromLots(lots: UserCreditLot[], now: Date): {
    credits: number;
    bundleCreditsRemaining: number;
    creditsExpiresAt: Date | null;
    bundleCreditsExpiresAt: Date | null;
    packageType: 'bundle' | 'single' | null;
} {
    const active = activeCreditLotsSorted(lots, now);
    const credits = active.reduce((s, l) => s + l.credits, 0);
    const bundleActive = active.filter((l) => l.kind === 'bundle');
    const bundleCreditsRemaining = bundleActive.reduce((s, l) => s + l.credits, 0);

    const earliest = (ls: UserCreditLot[]): Date | null => {
        if (ls.length === 0) {
            return null;
        }

        return new Date(Math.min(...ls.map((l) => l.expiresAt.getTime())));
    };

    const creditsExpiresAt = earliest(active);
    const bundleCreditsExpiresAt = earliest(bundleActive);
    const packageType: 'bundle' | 'single' | null = bundleCreditsRemaining > 0
        ? 'bundle'
        : credits > 0
            ? 'single'
            : null;

    return {
        credits,
        bundleCreditsRemaining,
        creditsExpiresAt,
        bundleCreditsExpiresAt,
        packageType,
    };
}

export function buildLegacyMigrationLots(user: {
    credits?: number;
    bundleCreditsRemaining?: number;
    creditsExpiresAt: Date | null;
}): UserCreditLot[] {
    const now = new Date();
    const total = Math.max(0, user.credits ?? 0);

    if (total === 0) {
        return [];
    }

    const bundleRem = Math.max(0, user.bundleCreditsRemaining ?? 0);
    const exp = user.creditsExpiresAt;

    if (bundleRem > 0 && exp && exp > now) {
        const inBundle = Math.min(bundleRem, total);
        const lots: UserCreditLot[] = [{ credits: inBundle, expiresAt: exp, kind: 'bundle' }];
        const rest = total - inBundle;

        if (rest > 0) {
            lots.push({ credits: rest, expiresAt: walletGrantExpiresAt(now), kind: 'single' });
        }

        return lots;
    }

    return [{ credits: total, expiresAt: walletGrantExpiresAt(now), kind: 'single' }];
}
