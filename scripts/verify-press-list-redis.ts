/**
 * Hit the public press-release list and print X-API-Press-List-Cache + wall time.
 *
 *   npm run verify:redis-press-list
 *   npm run verify:redis-press-list -- --fresh
 *
 * `--fresh` deletes Redis keys `carib:newsroom:list:*` (public newsroom list cache), so the
 * first HTTP request should be MISS (Mongo) and the next ones HIT (Redis) — only for local dev.
 *
 * If #1 is already HIT without --fresh, Redis is working; the key was just warm from the site or a prior run.
 */
import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/** Must match `NEWSROOM_PUBLIC_LIST_CACHE_PREFIX` in `src/services/apiCache.service.ts`. */
const NEWSROOM_LIST_KEY_PREFIX = "carib:newsroom:list:";

const port = Number.parseInt(process.env.PORT ?? "5000", 10) || 5000;
const base = (process.env.BACKEND_URL || process.env.API_URL || `http://127.0.0.1:${port}`).replace(/\/$/, "");
const path =
    "/api/v1/press-releases?category=Business&sort=newest&limit=10&page=1&dateRange=allTime";

const wantFresh = process.argv.includes("--fresh");

async function clearNewsroomListKeys(): Promise<void> {
    const redisUrl = process.env.REDIS_URL?.trim();

    if (!redisUrl) {
        console.error("REDIS_URL is not set; cannot use --fresh.");
        process.exit(1);
    }

    const { default: Redis } = await import("ioredis");
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });

    try {
        const keys = await redis.keys(`${NEWSROOM_LIST_KEY_PREFIX}*`);

        if (keys.length) {
            await redis.del(...keys);
        }

        console.log(`Deleted ${keys.length} Redis key(s) matching ${NEWSROOM_LIST_KEY_PREFIX}*`);
        console.log("Expect request #1 → MISS (Mongo), #2+ → HIT (Redis).\n");
    } finally {
        redis.disconnect();
    }
}

async function main() {
    const url = `${base}${path}`;

    if (wantFresh) {
        await clearNewsroomListKeys();
    }

    console.log(`GET ${url}\n`);

    for (let i = 1; i <= 3; i += 1) {
        const t0 = Date.now();
        const res = await fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" });
        const wall = Date.now() - t0;
        const cache = res.headers.get("x-api-press-list-cache") ?? "(no header — old server build?)";
        const len = (await res.text()).length;
        console.log(`#${i}  ${cache.padEnd(4)}  wall=${wall}ms  status=${res.status}  bodyBytes≈${len}`);
    }

    console.log("\nInterpretation:");
    console.log("  HIT  = Redis returned the cached JSON for this filter (no Mongo list read).");
    console.log("  MISS = Redis had no entry for this filter; API read Mongo and wrote Redis (EX 3600).");
    console.log("  OFF  = REDIS_URL not set on this API process.");
    if (!wantFresh) {
        console.log("\nTip: If #1 is already HIT, cache was warm. Run with --fresh to force MISS then HIT.\n");
    } else {
        console.log("");
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
