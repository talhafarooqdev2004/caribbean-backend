export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    NO_CONTENT: 204,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500,
};

export const ERROR_MESSAGES = {
    INTERNAL_SERVER_ERROR: 'Internal server error',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Forbidden access',
    NOT_FOUND: 'Resource not found',
    VALIDATION_ERROR: 'Validation error',
    ALREADY_EXISTS: 'Resource already exists',
    INVALID_CREDENTIALS: 'Invalid credentials',
};

export const SUCCESS_MESSAGES = {
    CREATED: 'Resource created successfully',
    UPDATED: 'Resource updated successfully',
    DELETED: 'Resource deleted successfully',
    PUBLISHED: 'Resource published successfully',
    UNPUBLISHED: 'Resource unpublished successfully',
};

export const PAGINATION = {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
};

export const APP_CONFIG_KEYS = {
    SQUARE_TEST_MODE: 'square_test_mode',
    EMAIL_DIGEST_FREQUENCY: 'email_digest_frequency',
    EMAIL_DIGEST_LAST_SENT_AT: 'email_digest_last_sent_at',
    SITE_IP_ALLOWLIST: 'site_ip_allowlist',
};
