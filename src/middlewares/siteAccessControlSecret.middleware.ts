import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../config/constants.js';
import { ENV } from '../config/env.js';
import { ApiError } from '../exceptions/ApiError.js';

function readProvidedSecret(req: Request): string {
    const headerSecret = req.headers['x-site-access-control-secret'];

    if (typeof headerSecret === 'string' && headerSecret.trim()) {
        return headerSecret.trim();
    }

    const authorization = req.headers.authorization;

    if (typeof authorization === 'string') {
        const bearer = authorization.replace(/^Bearer\s+/i, '').trim();

        if (bearer) {
            return bearer;
        }
    }

    const queryToken = req.query.token;

    if (typeof queryToken === 'string' && queryToken.trim()) {
        return queryToken.trim();
    }

    return '';
}

export function siteAccessControlSecretMiddleware(req: Request, _res: Response, next: NextFunction) {
    const expected = ENV.SITE_ACCESS_CONTROL_SECRET?.trim();

    if (!expected) {
        next(new ApiError(HTTP_STATUS.SERVICE_UNAVAILABLE, 'Site access control secret is not configured.'));
        return;
    }

    const provided = readProvidedSecret(req);

    if (!provided || provided !== expected) {
        next(new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid site access control secret.'));
        return;
    }

    next();
}
