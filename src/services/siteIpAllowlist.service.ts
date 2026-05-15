import { APP_CONFIG_KEYS } from '../config/constants.js';
import { AppConfigRepository } from '../repositories/appConfig.repository.js';
import type { SiteIpAllowlistEntry, SiteIpAllowlistStored } from '../types/siteIpAllowlist.js';

const repository = new AppConfigRepository();

/**
 * Allowed IPv4 addresses for the public Next.js site (middleware).
 * Not stored in the database — change here and redeploy to update the list.
 */
export const STATIC_SITE_IP_ALLOWLIST_ENTRIES: readonly SiteIpAllowlistEntry[] = [
    { label: 'Client', ip: '209.221.211.154' },
    { label: 'MAM', ip: '139.135.53.133' },
    { label: 'Admin', ip: '182.188.241.67' },
];

/** Persisted in MongoDB under `site_ip_allowlist` — only the toggle. */
export type SiteIpRestrictionDbValue = {
    enabled: boolean;
};

export const DEFAULT_SITE_IP_ALLOWLIST_DB: SiteIpRestrictionDbValue = {
    enabled: false,
};

const IPV4_REGEX = /^(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)){3}$/;

export const isValidIpv4 = (ip: string) => IPV4_REGEX.test(ip.trim());

const staticEntriesCopy = (): SiteIpAllowlistEntry[] =>
    STATIC_SITE_IP_ALLOWLIST_ENTRIES.map((e) => ({ ...e }));

const readEnabledFromDbValue = (raw: unknown): boolean => {
    if (raw === true || raw === 'true') {
        return true;
    }

    if (raw === false || raw === 'false') {
        return false;
    }

    if (!raw || typeof raw !== 'object') {
        return false;
    }

    const obj = raw as Record<string, unknown>;
    return obj.enabled === true || obj.enabled === 'true';
};

export const getSiteIpAllowlistStored = async (): Promise<SiteIpAllowlistStored> => {
    const config = await repository.findByKey(APP_CONFIG_KEYS.SITE_IP_ALLOWLIST);
    const enabled = readEnabledFromDbValue(config?.value);

    return {
        enabled,
        entries: staticEntriesCopy(),
    };
};

export const getSiteIpAllowlistPublic = async () => {
    const stored = await getSiteIpAllowlistStored();

    return {
        restrictEnabled: stored.enabled,
        allowedIps: stored.entries.map((e) => e.ip),
    };
};

export const saveSiteIpRestrictionEnabled = async (enabled: boolean) => {
    const payload: SiteIpRestrictionDbValue = { enabled };

    await repository.updateOrCreate(
        APP_CONFIG_KEYS.SITE_IP_ALLOWLIST,
        payload,
        'When true, only STATIC_SITE_IP_ALLOWLIST_ENTRIES may use the public Next.js site (middleware). IPs are defined in code, not in this document.',
    );
};
