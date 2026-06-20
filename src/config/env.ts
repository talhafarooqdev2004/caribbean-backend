import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local', override: true });

const parseInteger = (value: string | undefined, fallback: number): number => {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isNaN(parsed) ? fallback : parsed;
};

const parseOrigins = (value: string | undefined): string[] => {
    if (!value) {
        return [];
    }

    return value.split(',').map((origin) => origin.trim()).filter(Boolean);
};

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
    if (value === undefined) {
        return fallback;
    }

    const normalized = value.trim().replace(/^["']|["']$/g, '').toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
};

/** Trim and strip wrapping quotes — Square credentials often break after copy-paste from the dashboard. */
const trimEnv = (value: string | undefined): string | undefined => {
    if (value === undefined) {
        return undefined;
    }

    const t = value.trim().replace(/^["']|["']$/g, '');
    return t.length > 0 ? t : undefined;
};

/** Email and redirect links need an absolute URL with a protocol. */
const normalizeFrontendUrl = (raw: string | undefined): string => {
    let value = (raw || 'http://localhost:3000').trim().replace(/\/+$/, '');

    if (!value) {
        value = 'http://localhost:3000';
    }

    if (/^https?:\/\//i.test(value)) {
        return value;
    }

    const isLocal = /^localhost(?::\d+)?$/i.test(value) || /^127\.0\.0\.1(?::\d+)?$/i.test(value);

    return `${isLocal ? 'http' : 'https'}://${value}`;
};

export const ENV = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    PORT: parseInteger(process.env.PORT, 5000),
    FRONTEND_URL: normalizeFrontendUrl(process.env.FRONTEND_URL),
    /** Public API base for links in emails (digest unsubscribe, etc.). Defaults to local backend. */
    BACKEND_URL: (process.env.BACKEND_URL || process.env.API_URL || `http://localhost:${parseInteger(process.env.PORT, 5000)}`).replace(/\/$/, ''),
    CORS_ORIGINS: parseOrigins(process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS),
    SESSION_SECRET: process.env.SESSION_SECRET || 'caribnews-session-secret',
    JWT_SECRET: process.env.JWT_SECRET || process.env.ADMIN_AUTH_SECRET || 'caribnews-jwt-dev-secret',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
    MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/caribnews',
    MONGODB_DB_NAME: process.env.MONGODB_DB_NAME || process.env.MONGODB_DB || 'caribnews',
    RATE_LIMIT_WINDOW_MS: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 900000),
    RATE_LIMIT_MAX_REQUESTS: parseInteger(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
    MAX_FILE_SIZE: parseInteger(process.env.MAX_FILE_SIZE, 10 * 1024 * 1024),
    UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
    ADMIN_EMAIL: process.env.ADMIN_EMAIL || process.env.SMTP_USER || 'info@caribnewswire.com',
    ADMIN_USERNAME: trimEnv(process.env.ADMIN_USERNAME) || 'admin',
    ADMIN_PASSWORD: trimEnv(process.env.ADMIN_PASSWORD) || 'CaribNews@123',
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: parseInteger(process.env.SMTP_PORT, 587),
    SMTP_SECURE: process.env.SMTP_SECURE === 'true',
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SQUARE_SANDBOX_APP_ID: trimEnv(process.env.SQUARE_SANDBOX_APP_ID),
    SQUARE_SANDBOX_ACCESS_TOKEN: trimEnv(process.env.SQUARE_SANDBOX_ACCESS_TOKEN),
    /** Sandbox checkout only — never falls back to SQUARE_LOCATION_ID (that is for production). */
    SQUARE_SANDBOX_LOCATION_ID: trimEnv(process.env.SQUARE_SANDBOX_LOCATION_ID),
    SQUARE_PROD_APP_ID: trimEnv(process.env.SQUARE_PROD_APP_ID),
    SQUARE_PROD_ACCESS_TOKEN: trimEnv(process.env.SQUARE_PROD_ACCESS_TOKEN),
    /** Production location: optional SQUARE_PROD_LOCATION_ID, else SQUARE_LOCATION_ID. */
    SQUARE_PROD_LOCATION_ID: trimEnv(process.env.SQUARE_PROD_LOCATION_ID) || trimEnv(process.env.SQUARE_LOCATION_ID),
    SQUARE_LOCATION_ID: trimEnv(process.env.SQUARE_LOCATION_ID),
    SQUARE_WEBHOOK_SIGNATURE_KEY: trimEnv(process.env.SQUARE_WEBHOOK_SIGNATURE_KEY),
    SQUARE_BYPASS_FOR_TESTING: parseBoolean(process.env.SQUARE_BYPASS_FOR_TESTING, false),
    /** Optional `redis://` URL. When unset, API read caching is disabled (Mongo only). */
    REDIS_URL: trimEnv(process.env.REDIS_URL),
    REDIS_CACHE_TTL_PUBLIC_DETAIL_SEC: parseInteger(process.env.REDIS_CACHE_TTL_PUBLIC_DETAIL_SEC, 120),
    REDIS_CACHE_TTL_ADMIN_PR_LIST_SEC: parseInteger(process.env.REDIS_CACHE_TTL_ADMIN_PR_LIST_SEC, 30),
    REDIS_CACHE_TTL_PORTAL_SEC: parseInteger(process.env.REDIS_CACHE_TTL_PORTAL_SEC, 20),
    REDIS_CACHE_TTL_MEDIA_SIGNUPS_SEC: parseInteger(process.env.REDIS_CACHE_TTL_MEDIA_SIGNUPS_SEC, 30),
    /** Secret for emergency maintenance / IP-gate disable via POST /site-access/maintenance/off */
    SITE_ACCESS_CONTROL_SECRET: trimEnv(process.env.SITE_ACCESS_CONTROL_SECRET),
};
