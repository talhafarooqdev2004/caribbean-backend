import { APP_CONFIG_KEYS } from '../config/constants.js';
import { AppConfigRepository } from '../repositories/appConfig.repository.js';
import { DEFAULT_SITE_IP_ALLOWLIST_DB } from './siteIpAllowlist.service.js';

const repository = new AppConfigRepository();

export const ensureDefaultAppConfig = async () => {
    const squareConfig = await repository.findByKey(APP_CONFIG_KEYS.SQUARE_TEST_MODE);

    if (!squareConfig) {
        await repository.updateOrCreate(
            APP_CONFIG_KEYS.SQUARE_TEST_MODE,
            true,
            'When true, Square payments use sandbox credentials. When false, production credentials are used. Toggle in Admin → Payments only; not controlled by .env.',
        );
    }

    const digestConfig = await repository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_FREQUENCY);

    if (!digestConfig) {
        await repository.updateOrCreate(
            APP_CONFIG_KEYS.EMAIL_DIGEST_FREQUENCY,
            'daily',
            'Email digest cadence for opted-in journalists. Supported values: daily, three_times_weekly.',
        );
    }

    const siteIpConfig = await repository.findByKey(APP_CONFIG_KEYS.SITE_IP_ALLOWLIST);

    if (!siteIpConfig) {
        await repository.updateOrCreate(
            APP_CONFIG_KEYS.SITE_IP_ALLOWLIST,
            DEFAULT_SITE_IP_ALLOWLIST_DB,
            'Public site IP restriction toggle for Next.js middleware. Allowed IPv4s are defined in code (STATIC_SITE_IP_ALLOWLIST_ENTRIES). Admin → Site access.',
        );
    }
};

export const isSquareTestModeEnabled = async () => {
    const config = await repository.findByKey(APP_CONFIG_KEYS.SQUARE_TEST_MODE);

    if (!config) {
        // Safe default until ensureDefaultAppConfig runs or Admin sets mode; never read SQUARE_ENVIRONMENT.
        return true;
    }

    return config.value === true || config.value === 'true';
};

export const getEmailDigestFrequency = async (): Promise<'daily' | '3x-weekly'> => {
    const config = await repository.findByKey(APP_CONFIG_KEYS.EMAIL_DIGEST_FREQUENCY);
    return config?.value === '3x-weekly' ? '3x-weekly' : 'daily';
};
