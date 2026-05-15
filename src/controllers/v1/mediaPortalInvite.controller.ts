import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../config/constants.js';
import { ApiError } from '../../exceptions/ApiError.js';
import type { MediaPortalInviteEnqueueInput } from '../../schemas/mediaPortalInvite.schema.js';
import {
    enqueueMediaPortalInviteJob,
    getMediaPortalInviteJobById,
    jobToPublicJson,
} from '../../services/mediaPortalInvite.service.js';
import { successResponse } from '../../utils/response.util.js';
import { toObjectId } from '../../utils/mongo.util.js';

export const createMediaPortalInviteJob = async (
    req: Request<{}, unknown, MediaPortalInviteEnqueueInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { signupIds } = req.body;
        const { job, skippedReasons } = await enqueueMediaPortalInviteJob(signupIds);

        if (!job) {
            throw new ApiError(
                HTTP_STATUS.UNPROCESSABLE_ENTITY,
                'No eligible media signups to invite. Check that emails are valid, signups are not rejected, and no portal account already exists.',
            );
        }

        res.status(202).json(successResponse(
            'Portal invite job queued. Accounts are created one at a time in the background.',
            jobToPublicJson(job),
            { skipped: skippedReasons },
        ));
    } catch (error) {
        next(error);
    }
};

export const getMediaPortalInviteJob = async (
    req: Request<{ jobId: string }>,
    res: Response,
    next: NextFunction,
) => {
    try {
        if (!toObjectId(req.params.jobId)) {
            throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid job id');
        }

        const job = await getMediaPortalInviteJobById(req.params.jobId);

        if (!job) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Job not found');
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Job retrieved', jobToPublicJson(job)));
    } catch (error) {
        next(error);
    }
};
