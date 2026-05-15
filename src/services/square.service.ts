import crypto from 'crypto';
import { ApiError } from '../exceptions/ApiError.js';
import { ENV } from '../config/env.js';
import { isSquareTestModeEnabled } from './appConfig.service.js';
import type { PressReleaseRecord } from '../types/PressRelease.js';
import { logger } from '../utils/logger.util.js';

const SQUARE_API_VERSION = '2026-01-22';

type SquareEnvironment = 'sandbox' | 'production';

type SquarePaymentLinkResult = {
    environment: SquareEnvironment;
    paymentLinkId: string | null;
    orderId: string | null;
    checkoutUrl: string;
    raw: Record<string, unknown>;
};

type SquarePaymentResult = {
    environment: SquareEnvironment;
    paymentId: string | null;
    orderId: string | null;
    status: 'paid' | 'failed' | 'created';
    /** When `status` is `failed`, a buyer-facing reason derived from Square’s payload. */
    failureMessage?: string;
    raw: Record<string, unknown>;
};

const SQUARE_PAYMENT_CODE_HINTS: Record<string, string> = {
    CARD_DECLINED: 'Your card was declined. Try another card or contact your bank.',
    INSUFFICIENT_FUNDS: 'This card has insufficient funds.',
    CVV_FAILURE: 'The security code (CVV) is incorrect.',
    EXPIRATION_FAILURE: 'The expiry date is incorrect or the card has expired.',
    INVALID_EXPIRATION: 'Please check your card expiry date.',
    PAN_FAILURE: 'The card number does not look valid.',
    INVALID_CARD: 'This card could not be verified.',
    INVALID_CARD_DATA: 'Your card details could not be verified.',
    GENERIC_DECLINE: 'Your bank declined this payment. Try another card or contact your bank.',
    PAYMENT_LIMIT_EXCEEDED: 'This payment amount cannot be processed on this card.',
    TRANSACTION_LIMIT: 'This payment exceeds a limit set by the card issuer.',
    TEMPORARY_ERROR: 'The payment service is temporarily unavailable. Please try again in a moment.',
    CARD_TOKEN_EXPIRED: 'Your card session expired. Refresh the page and try again.',
    PAYMENT_AMOUNT_MISMATCH: 'The payment amount no longer matches your order. Refresh and try again.',
    ADDRESS_VERIFICATION_FAILURE: 'The billing address or postal code could not be verified.',
    BAD_EXPIRATION: 'The expiry date is incorrect or the card has expired.',
    DUPLICATE_PAYMENT: 'This payment was already submitted. Refresh the page and check your order history.',
    CARD_NOT_SUPPORTED: 'This card type is not accepted. Try another card.',
    CURRENCY_MISMATCH: 'This card cannot be charged in the requested currency.',
    AMOUNT_TOO_HIGH: 'The payment amount is too high for this card or account.',
    AMOUNT_TOO_LOW: 'The payment amount is too low to process.',
    BUYER_REFUSED_PAYMENT: 'The payment could not be completed. Try again or use another payment method.',
    ACCOUNT_UNUSABLE: 'This account cannot be used for this payment.',
    MANUALLY_ENTERED_PAYMENT_NOT_SUPPORTED: 'This card must be entered differently or another card is required.',
    PAYMENT_METHOD_NOT_SUPPORTED: 'This payment method is not supported. Try another card.',
    GIFT_CARD_AVAILABLE_AMOUNT: 'The gift card balance is too low for this amount.',
    INVALID_ACCOUNT: 'The account details could not be verified.',
    INSUFFICIENT_PERMISSIONS: 'This payment could not be authorized.',
    INVALID_LOCATION: 'Checkout is misconfigured for payments. Please contact support.',
    INVALID_PHONE_NUMBER: 'The phone number on file could not be verified.',
    INVALID_EMAIL_ADDRESS: 'The email address could not be verified.',
    INVALID_REQUEST: 'The payment request could not be processed. Refresh and try again.',
    CARD_DECLINED_VERIFICATION_REQUIRED: 'Your bank requires extra verification. Try again or use another card.',
};

const DEFAULT_SQUARE_PAYMENT_ERROR = 'We could not process your payment. Please try again.';

function isLikelyUserFacingSquareDetail(detail: string): boolean {
    if (detail.length > 240) {
        return false;
    }
    if (/^[\[{]/.test(detail)) {
        return false;
    }
    return true;
}

function userMessageFromSingleSquareErrorRow(row: Record<string, unknown>): string | null {
    const code = typeof row.code === 'string' ? row.code.trim() : '';
    if (code && SQUARE_PAYMENT_CODE_HINTS[code]) {
        return SQUARE_PAYMENT_CODE_HINTS[code];
    }

    const detail = typeof row.detail === 'string' ? row.detail.trim() : '';
    if (detail.length > 0) {
        if (/not authorized/i.test(detail) && /location_id/i.test(detail)) {
            return 'Square does not allow this access token to charge the configured location. In Square Developer, open the same application as your checkout Application ID, then copy that application’s access token and a location from that app’s Sandbox (or Production) list. Tokens and locations from two different Square applications will always fail, even if both are sandbox.';
        }

        const lower = detail.toLowerCase();
        if (/\binsufficient funds\b/i.test(detail)) {
            return SQUARE_PAYMENT_CODE_HINTS.INSUFFICIENT_FUNDS;
        }
        if (/\bcvv\b|\bsecurity code\b/i.test(detail)) {
            return SQUARE_PAYMENT_CODE_HINTS.CVV_FAILURE;
        }
        if (/\bexpir|\bexpiration\b/i.test(detail)) {
            return SQUARE_PAYMENT_CODE_HINTS.EXPIRATION_FAILURE;
        }
        if (/\bpostal\b|\bzip\b|\baddress verification\b|\bavs\b/i.test(detail)) {
            return SQUARE_PAYMENT_CODE_HINTS.ADDRESS_VERIFICATION_FAILURE;
        }
        if (/\bdeclin/i.test(detail) || /\bcard not\b/i.test(lower)) {
            return SQUARE_PAYMENT_CODE_HINTS.CARD_DECLINED;
        }

        if (isLikelyUserFacingSquareDetail(detail)) {
            return detail;
        }
    }

    if (code) {
        const readable = code.replace(/_/g, ' ').toLowerCase();
        if (readable.includes('decline')) {
            return SQUARE_PAYMENT_CODE_HINTS.GENERIC_DECLINE;
        }
        return `We could not complete your payment (${code.replace(/_/g, ' ')}). Try another card or contact your bank.`;
    }

    return null;
}

function userMessageFromSquarePaymentsPayload(payload: unknown): string {
    if (!payload || typeof payload !== 'object') {
        return DEFAULT_SQUARE_PAYMENT_ERROR;
    }

    const body = payload as Record<string, unknown>;
    const errors = body.errors;

    if (!Array.isArray(errors) || errors.length === 0) {
        return DEFAULT_SQUARE_PAYMENT_ERROR;
    }

    for (const err of errors) {
        if (!err || typeof err !== 'object') {
            continue;
        }
        const msg = userMessageFromSingleSquareErrorRow(err as Record<string, unknown>);
        if (msg) {
            return msg;
        }
    }

    return 'We could not complete your payment. Please check your card details and try again.';
}

const DEFAULT_FAILED_PAYMENT_MESSAGE = 'Payment was not completed. Try another card or contact your bank.';

function userMessageFromFailedPaymentPayload(payload: Record<string, unknown>): string {
    const payment = payload.payment;
    if (!payment || typeof payment !== 'object') {
        return DEFAULT_FAILED_PAYMENT_MESSAGE;
    }

    const p = payment as Record<string, unknown>;
    const status = typeof p.status === 'string' ? p.status : '';
    if (status !== 'FAILED' && status !== 'CANCELED') {
        return DEFAULT_FAILED_PAYMENT_MESSAGE;
    }

    const cardDetails = p.card_details;
    if (cardDetails && typeof cardDetails === 'object') {
        const cd = cardDetails as Record<string, unknown>;

        const nested = cd.errors;
        if (Array.isArray(nested) && nested.length > 0) {
            for (const err of nested) {
                if (!err || typeof err !== 'object') {
                    continue;
                }
                const msg = userMessageFromSingleSquareErrorRow(err as Record<string, unknown>);
                if (msg) {
                    return msg;
                }
            }
        }

        if (cd.cvv_status === 'CVV_REJECTED') {
            return SQUARE_PAYMENT_CODE_HINTS.CVV_FAILURE;
        }
        if (cd.avs_status === 'AVS_REJECTED') {
            return 'The postal code could not be verified. Check your billing ZIP and try again.';
        }
    }

    return DEFAULT_FAILED_PAYMENT_MESSAGE;
}

const getSquareEnvironment = async (): Promise<SquareEnvironment> => {
    return await isSquareTestModeEnabled() ? 'sandbox' : 'production';
};

const getSquareBaseUrl = (environment: SquareEnvironment) => {
    return environment === 'sandbox'
        ? 'https://connect.squareupsandbox.com'
        : 'https://connect.squareup.com';
};

const getSquareToken = (environment: SquareEnvironment) => {
    return environment === 'sandbox'
        ? ENV.SQUARE_SANDBOX_ACCESS_TOKEN
        : ENV.SQUARE_PROD_ACCESS_TOKEN;
};

const getSquareApplicationId = (environment: SquareEnvironment) => {
    return environment === 'sandbox'
        ? ENV.SQUARE_SANDBOX_APP_ID
        : ENV.SQUARE_PROD_APP_ID;
};

const getSquareLocationId = (environment: SquareEnvironment) => {
    return environment === 'sandbox'
        ? ENV.SQUARE_SANDBOX_LOCATION_ID
        : ENV.SQUARE_PROD_LOCATION_ID;
};

const getSquareSdkUrl = (environment: SquareEnvironment) => {
    return environment === 'sandbox'
        ? 'https://sandbox.web.squarecdn.com/v1/square.js'
        : 'https://web.squarecdn.com/v1/square.js';
};

const getSuccessUrl = (release: PressReleaseRecord, paymentId?: string) => {
    const url = new URL('/payment-successful', ENV.FRONTEND_URL);
    url.searchParams.set('releaseId', release._id.toHexString());

    if (paymentId) {
        url.searchParams.set('paymentId', paymentId);
    }

    return url.toString();
};

const createMockPaymentLink = (environment: SquareEnvironment, release: PressReleaseRecord): SquarePaymentLinkResult => {
    const url = new URL('/payment-successful', ENV.FRONTEND_URL);
    url.searchParams.set('releaseId', release._id.toHexString());
    url.searchParams.set('mockSquare', '1');

    return {
        environment,
        paymentLinkId: `mock_${crypto.randomUUID()}`,
        orderId: null,
        checkoutUrl: url.toString(),
        raw: { mode: 'mock' },
    };
};

const getSquareEnvironmentSyncFallback = (): SquareEnvironment => {
    return ENV.NODE_ENV === 'production' ? 'production' : 'sandbox';
};

const getWebPaymentsClientConfigFromEnv = (environment: SquareEnvironment) => ({
    appId: getSquareApplicationId(environment) || null,
    locationId: getSquareLocationId(environment) || null,
    sdkUrl: getSquareSdkUrl(environment),
});

export const squareService = {
    async getWebPaymentsConfig() {
        const environment = await getSquareEnvironment();

        return {
            environment,
            testMode: environment === 'sandbox',
            appId: getSquareApplicationId(environment) || null,
            locationId: getSquareLocationId(environment) || null,
            sdkUrl: getSquareSdkUrl(environment),
            bypassForTesting: false,
        };
    },

    /** Public client bootstrap only — no environment flags or internal toggles. */
    async getWebPaymentsClientConfig() {
        try {
            const environment = await getSquareEnvironment();
            return getWebPaymentsClientConfigFromEnv(environment);
        } catch (err) {
            logger.warn('getWebPaymentsClientConfig: falling back to env (app config unavailable)', err);
            return getWebPaymentsClientConfigFromEnv(getSquareEnvironmentSyncFallback());
        }
    },

    async createPaymentLink(release: PressReleaseRecord, customerEmail?: string): Promise<SquarePaymentLinkResult> {
        const environment = await getSquareEnvironment();
        const token = getSquareToken(environment);
        const applicationId = getSquareApplicationId(environment);
        const locationId = getSquareLocationId(environment);

        if (!locationId || !token) {
            if (ENV.NODE_ENV !== 'production') {
                return createMockPaymentLink(environment, release);
            }

            throw new ApiError(422, 'Square payment credentials are not configured');
        }

        const body = {
            idempotency_key: crypto.randomUUID(),
            description: `Carib Newswire press release: ${release.title}`,
            quick_pay: {
                name: release.packageId === 'bundle'
                    ? 'Carib Newswire 3-Release Package'
                    : release.featuredUpgrade
                        ? 'Carib Newswire Single Release + Featured Placement'
                        : 'Carib Newswire Single Release',
                price_money: {
                    amount: release.pendingCreditWithFeaturedCheckout
                        ? (release.amountCents > 0 ? release.amountCents : 9900)
                        : release.amountCents,
                    currency: 'USD',
                },
                location_id: locationId,
            },
            checkout_options: {
                redirect_url: getSuccessUrl(release),
            },
            pre_populated_data: customerEmail ? {
                buyer_email: customerEmail,
            } : undefined,
            payment_note: `release:${release._id.toHexString()}`,
        };

        const response = await fetch(`${getSquareBaseUrl(environment)}/v2/online-checkout/payment-links`, {
            method: 'POST',
            headers: {
                'Square-Version': SQUARE_API_VERSION,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new ApiError(response.status, 'Square checkout link could not be created', payload);
        }

        const paymentLink = payload.payment_link;

        if (!paymentLink?.url) {
            throw new ApiError(502, 'Square did not return a checkout URL');
        }

        return {
            environment,
            paymentLinkId: paymentLink.id ?? null,
            orderId: paymentLink.order_id ?? null,
            checkoutUrl: paymentLink.long_url || paymentLink.url,
            raw: { ...payload, squareApplicationId: applicationId, squareLocationId: locationId },
        };
    },

    async processPayment(sourceId: string, amountCents: number, note: string): Promise<SquarePaymentResult> {
        const environment = await getSquareEnvironment();
        const token = getSquareToken(environment);
        const locationId = getSquareLocationId(environment);

        if (!locationId || !token) {
            throw new ApiError(422, 'Square payment credentials are not configured');
        }

        const response = await fetch(`${getSquareBaseUrl(environment)}/v2/payments`, {
            method: 'POST',
            headers: {
                'Square-Version': SQUARE_API_VERSION,
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_id: sourceId,
                idempotency_key: crypto.randomUUID(),
                amount_money: {
                    amount: amountCents,
                    currency: 'USD',
                },
                location_id: locationId,
                note,
            }),
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
            const friendly = userMessageFromSquarePaymentsPayload(payload);
            throw new ApiError(response.status, friendly, payload);
        }

        const payment = payload.payment;
        const status = payment?.status === 'COMPLETED'
            ? 'paid'
            : payment?.status === 'FAILED' || payment?.status === 'CANCELED'
                ? 'failed'
                : 'created';

        const typedPayload = payload as Record<string, unknown>;
        const failureMessage = status === 'failed' ? userMessageFromFailedPaymentPayload(typedPayload) : undefined;

        return {
            environment,
            paymentId: payment?.id ?? null,
            orderId: payment?.order_id ?? null,
            status,
            failureMessage,
            raw: payload,
        };
    },
};

/**
 * After app config is loaded: lists locations for the token that matches admin sandbox/production mode.
 * Logs a clear warning when SQUARE_*_LOCATION_ID is not in that list (common cause of CreatePayment 400).
 */
export async function verifySquareLocationForActiveCredentials(): Promise<void> {
    try {
        const environment = await getSquareEnvironment();
        const token = getSquareToken(environment);
        const locationId = getSquareLocationId(environment);

        if (!token || !locationId) {
            return;
        }

        const response = await fetch(`${getSquareBaseUrl(environment)}/v2/locations`, {
            method: 'GET',
            headers: {
                'Square-Version': SQUARE_API_VERSION,
                Authorization: `Bearer ${token}`,
            },
        });

        const payload = (await response.json().catch(() => ({}))) as { locations?: Array<{ id?: string }> };

        if (!response.ok) {
            const tokenVar = environment === 'sandbox' ? 'SQUARE_SANDBOX_ACCESS_TOKEN' : 'SQUARE_PROD_ACCESS_TOKEN';
            logger.warn(
                `Square (${environment}): List Locations returned ${response.status}. Regenerate the ${tokenVar} in Square Developer for the application that owns your checkout.`,
            );
            return;
        }

        const ids = Array.isArray(payload.locations)
            ? payload.locations.map((l) => l.id).filter((id): id is string => typeof id === 'string')
            : [];

        if (!ids.includes(locationId)) {
            logger.warn(
                `Square (${environment}): location_id "${locationId}" is not in this access token's location list (${ids.length ? ids.join(', ') : 'none'}). ` +
                    'Use the Sandbox access token and a location from the same Square Developer application as your Sandbox Application ID.',
            );
        }
    } catch (error) {
        logger.warn('Square location verification failed (ignored)', error);
    }
}
