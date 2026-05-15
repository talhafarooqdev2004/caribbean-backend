import { Redis } from 'ioredis';
import { ENV } from '../config/env.js';
import { logger } from '../utils/logger.util.js';

let redis: Redis | null = null;

export const isRedisCacheEnabled = (): boolean => Boolean(ENV.REDIS_URL?.trim());

const getClient = (): Redis | null => {
    if (!isRedisCacheEnabled()) {
        return null;
    }

    if (!redis) {
        const url = ENV.REDIS_URL!;

        redis = new Redis(url, {
            maxRetriesPerRequest: 2,
            enableReadyCheck: true,
        });

        redis.on('error', (err) => {
            logger.warn('Redis cache error', { message: err?.message ?? String(err) });
        });
    }

    return redis;
};

/** Log once at startup so operators can confirm Redis is reachable (newsroom list cache). */
export async function logRedisCacheConnectivity(): Promise<void> {
    if (!isRedisCacheEnabled()) {
        logger.info('API cache (Redis): disabled — set REDIS_URL to cache newsroom lists and cut Mongo load.');
        return;
    }

    const r = getClient();

    if (!r) {
        return;
    }

    try {
        const pong = await r.ping();

        if (pong === 'PONG') {
            logger.info('API cache (Redis): connected', {
                newsroomPublicListTtlSec: NEWSROOM_PUBLIC_LIST_CACHE_TTL_SEC,
            });
        } else {
            logger.warn('API cache (Redis): unexpected PING response', { pong });
        }
    } catch (err) {
        logger.warn('API cache (Redis): unreachable — reads will skip cache until Redis is available', {
            message: err instanceof Error ? err.message : String(err),
        });
    }
}

const KEY_PR_LIST_VER = 'carib:api:ver:press-releases';
const KEY_MS_LIST_VER = 'carib:api:ver:media-signups';

/** Redis rejects EX 0 / invalid TTL. */
function normalizeRedisSetTtl(ttlSeconds: number, fallback = 180): number {
    const n = Number(ttlSeconds);
    if (!Number.isFinite(n) || n < 1) {
        return fallback;
    }

    return Math.min(Math.floor(n), 86_400);
}

/** Public newsroom list cache: one key per unique filter/sort/pagination (1 hour, no version prefix). */
export const NEWSROOM_PUBLIC_LIST_CACHE_PREFIX = 'carib:newsroom:list:';
export const NEWSROOM_PUBLIC_LIST_CACHE_TTL_SEC = 3600;

/** Portal user read caches (profile, credits, bookmarks, dashboard): 1h TTL; submissions list is not cached (views/clicks must stay fresh). Mutations call `invalidatePortalUserCache`. */
export const PORTAL_USER_CACHE_TTL_SEC = 3600;

export type CacheAsideRedisStatus = 'HIT' | 'MISS' | 'OFF';

export type CacheAsideResult<T> = { value: T; redis: CacheAsideRedisStatus };

/**
 * Simple cache-aside (like cacheRemember): GET key → HIT; else producer(), SET EX ttl, return MISS.
 * Used for the public newsroom list only.
 */
export async function cacheRememberJson<T>(
    key: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
): Promise<CacheAsideResult<T>> {
    const r = getClient();

    if (!r) {
        const value = await producer();
        return { value, redis: 'OFF' };
    }

    const ttl = normalizeRedisSetTtl(ttlSeconds, NEWSROOM_PUBLIC_LIST_CACHE_TTL_SEC);

    try {
        const hit = await r.get(key);

        if (hit != null) {
            try {
                return { value: JSON.parse(hit) as T, redis: 'HIT' };
            } catch {
                logger.warn('Redis cache read corrupt JSON, rebuilding', { key });
            }
        }
    } catch (err) {
        logger.warn('Redis cache read failed', { key, message: String(err) });
    }

    const value = await producer();

    let payload: string;

    try {
        payload = JSON.stringify(value);
    } catch (stringifyErr) {
        logger.error('Redis cache SET skipped: JSON.stringify failed', {
            key,
            message: stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr),
        });

        return { value, redis: 'MISS' };
    }

    try {
        await r.set(key, payload, 'EX', ttl);
        const exists = await r.exists(key);

        if (exists !== 1) {
            logger.error('Redis SET did not persist key', { key, exists });
        }
    } catch (err) {
        logger.error('Redis SET failed', {
            key,
            ttlSec: ttl,
            bytes: payload.length,
            message: err instanceof Error ? err.message : String(err),
        });
    }

    return { value, redis: 'MISS' };
}

/** Same as `cacheAsideJson` but reports whether the payload came from Redis (for diagnostics / BFF headers). */
export async function cacheAsideJsonWithRedis<T>(
    fullKey: string,
    ttlSeconds: number,
    producer: () => Promise<T>,
): Promise<CacheAsideResult<T>> {
    const r = getClient();

    if (!r) {
        const value = await producer();
        return { value, redis: 'OFF' };
    }

    try {
        const hit = await r.get(fullKey);

        if (hit != null) {
            try {
                return { value: JSON.parse(hit) as T, redis: 'HIT' };
            } catch {
                logger.warn('Redis cache read corrupt JSON, rebuilding', { key: fullKey });
            }
        }
    } catch (err) {
        logger.warn('Redis cache read failed', { key: fullKey, message: String(err) });
    }

    const value = await producer();

    const ttl = normalizeRedisSetTtl(ttlSeconds, 180);

    let payload: string;

    try {
        payload = JSON.stringify(value);
    } catch (stringifyErr) {
        logger.error('Redis cache SET skipped: JSON.stringify failed', {
            key: fullKey,
            message: stringifyErr instanceof Error ? stringifyErr.message : String(stringifyErr),
        });

        return { value, redis: 'MISS' };
    }

    try {
        const setReply = await r.set(fullKey, payload, 'EX', ttl);

        const exists = await r.exists(fullKey);

        if (exists !== 1) {
            logger.error('Redis SET did not leave key present (EXISTS check)', {
                key: fullKey,
                exists,
                setReply,
                bytes: payload.length,
            });
        } else {
            const ttlRemaining = await r.ttl(fullKey);

            if (ttlRemaining < 1) {
                logger.error('Redis key TTL invalid immediately after SET', {
                    key: fullKey,
                    ttlRemaining,
                    setTtlSec: ttl,
                });
            }
        }
    } catch (err) {
        logger.error('Redis SET failed', {
            key: fullKey,
            ttlSec: ttl,
            bytes: payload.length,
            message: err instanceof Error ? err.message : String(err),
        });
    }

    return { value, redis: 'MISS' };
}

export async function cacheAsideJson<T>(fullKey: string, ttlSeconds: number, producer: () => Promise<T>): Promise<T> {
    const { value } = await cacheAsideJsonWithRedis(fullKey, ttlSeconds, producer);
    return value;
}

export function stableQueryKey(query: Record<string, unknown>): string {
    const sorted = Object.keys(query).sort().reduce<Record<string, unknown>>((acc, key) => {
        const v = query[key];

        if (v !== undefined && v !== null && v !== '') {
            acc[key] = v;
        }

        return acc;
    }, {});

    return JSON.stringify(sorted);
}

export async function getPressReleaseListCacheVersion(): Promise<number> {
    const r = getClient();

    if (!r) {
        return 0;
    }

    try {
        const v = await r.get(KEY_PR_LIST_VER);

        return v ? Number.parseInt(v, 10) || 0 : 0;
    } catch {
        return 0;
    }
}

export async function bumpPressReleaseListCache(): Promise<void> {
    const r = getClient();

    if (!r) {
        return;
    }

    try {
        await r.incr(KEY_PR_LIST_VER);
    } catch (err) {
        logger.warn('Redis bump press release list version failed', { message: String(err) });
    }

    await invalidateNewsroomPublicListCache();
}

/** Deletes all cached public newsroom list payloads (`carib:newsroom:list:*`). */
export async function invalidateNewsroomPublicListCache(): Promise<void> {
    const r = getClient();

    if (!r) {
        return;
    }

    const pattern = `${NEWSROOM_PUBLIC_LIST_CACHE_PREFIX}*`;

    try {
        let cursor = '0';

        do {
            const [nextCursor, keys] = await r.scan(cursor, 'MATCH', pattern, 'COUNT', 256);
            cursor = nextCursor;

            if (keys.length) {
                await r.del(...keys);
            }
        } while (cursor !== '0');
    } catch (err) {
        logger.warn('Redis invalidate newsroom public list cache failed', { message: String(err) });
    }
}

export async function invalidatePublicPressReleaseDetailKeys(idHex: string, slugs: string[]): Promise<void> {
    const r = getClient();

    if (!r) {
        return;
    }

    const uniqueSlugs = [...new Set(slugs.filter(Boolean))];
    const keys = [`carib:api:pr:pubdetail:id:${idHex}`, ...uniqueSlugs.map((s) => `carib:api:pr:pubdetail:slug:${s}`)];

    try {
        if (keys.length) {
            await r.del(...keys);
        }
    } catch (err) {
        logger.warn('Redis invalidate press release detail failed', { message: String(err) });
    }
}

export async function invalidatePortalUserCache(userId: string): Promise<void> {
    const r = getClient();

    if (!r) {
        return;
    }

    const keys = ['profile', 'credits', 'submissions', 'bookmarks', 'dashboard'].map(
        (suffix) => `carib:api:portal:${userId}:${suffix}`,
    );

    try {
        await r.del(...keys);
    } catch (err) {
        logger.warn('Redis invalidate portal user cache failed', { message: String(err) });
    }
}

export async function getMediaSignupListCacheVersion(): Promise<number> {
    const r = getClient();

    if (!r) {
        return 0;
    }

    try {
        const v = await r.get(KEY_MS_LIST_VER);

        return v ? Number.parseInt(v, 10) || 0 : 0;
    } catch {
        return 0;
    }
}

export async function bumpMediaSignupListCache(): Promise<void> {
    const r = getClient();

    if (!r) {
        return;
    }

    try {
        await r.incr(KEY_MS_LIST_VER);
    } catch (err) {
        logger.warn('Redis bump media signup list version failed', { message: String(err) });
    }
}

type PublicDetailBody = {
    success?: boolean;
    data?: { status?: string; paymentStatus?: string; id?: string; slug?: string };
};

export async function readPublicPressReleaseDetailCache(lookupParam: string): Promise<PublicDetailBody | null> {
    const r = getClient();

    if (!r) {
        return null;
    }

    const keys: string[] = [];

    if (/^[a-fA-F0-9]{24}$/.test(lookupParam)) {
        keys.push(`carib:api:pr:pubdetail:id:${lookupParam}`);
    }

    keys.push(`carib:api:pr:pubdetail:slug:${lookupParam}`);

    try {
        for (const key of keys) {
            const hit = await r.get(key);

            if (hit) {
                return JSON.parse(hit) as PublicDetailBody;
            }
        }
    } catch (err) {
        logger.warn('Redis read press release detail cache failed', { message: String(err) });
    }

    return null;
}

export async function writePublicPressReleaseDetailCache(
    idHex: string,
    slug: string,
    body: unknown,
    ttlSeconds: number,
): Promise<void> {
    const r = getClient();

    if (!r) {
        return;
    }

    const payload = JSON.stringify(body);

    try {
        await r.set(`carib:api:pr:pubdetail:id:${idHex}`, payload, 'EX', ttlSeconds);
        await r.set(`carib:api:pr:pubdetail:slug:${slug}`, payload, 'EX', ttlSeconds);
    } catch (err) {
        logger.warn('Redis write press release detail cache failed', { message: String(err) });
    }
}

export function ttlPublicDetail(): number {
    return ENV.REDIS_CACHE_TTL_PUBLIC_DETAIL_SEC;
}

export function ttlAdminPressReleaseList(): number {
    return ENV.REDIS_CACHE_TTL_ADMIN_PR_LIST_SEC;
}

export function ttlPortal(): number {
    return ENV.REDIS_CACHE_TTL_PORTAL_SEC;
}

export function ttlMediaSignups(): number {
    return ENV.REDIS_CACHE_TTL_MEDIA_SIGNUPS_SEC;
}
