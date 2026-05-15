import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ObjectId } from 'mongodb';
import { HTTP_STATUS } from '../../config/constants.js';
import { ENV } from '../../config/env.js';
import { PaymentResponseDTO } from '../../dtos/v1/Payments/PaymentResponseDTO.js';
import { PressReleaseResponseDTO } from '../../dtos/v1/PressReleases/PressReleaseResponseDTO.js';
import { PressReleaseStoreRequestDTO } from '../../dtos/v1/PressReleases/Store/PressReleaseStoreRequestDTO.js';
import { CreditCheckoutSessionRepository } from '../../repositories/creditCheckoutSession.repository.js';
import { ApiError } from '../../exceptions/ApiError.js';
import { PaymentRepository } from '../../repositories/payment.repository.js';
import { PressReleaseRepository } from '../../repositories/pressRelease.repository.js';
import { UserRepository } from '../../repositories/user.repository.js';
import type { SquareCheckoutInput, SquareProcessInput } from '../../schemas/payment.schema.js';
import { emailService, scheduleBackgroundEmail } from '../../services/email.service.js';
import { squareService } from '../../services/square.service.js';
import type { PaymentRecord } from '../../types/Payment.js';
import type { PressReleaseRecord } from '../../types/PressRelease.js';
import { successResponse } from '../../utils/response.util.js';
import { toObjectId } from '../../utils/mongo.util.js';

const paymentRepository = new PaymentRepository();
const pressReleaseRepository = new PressReleaseRepository();
const userRepository = new UserRepository();
const creditCheckoutSessionRepository = new CreditCheckoutSessionRepository();

const getCreditsForPackage = (packageId: PressReleaseRecord['packageId']) => {
    if (packageId === 'bundle') return 3;
    if (packageId === 'single') return 1;
    return 0;
};

const getPackageName = (release: PressReleaseRecord) => {
    const baseName = release.packageId === 'bundle'
        ? '3-Release Package'
        : release.packageId === 'custom'
            ? 'Professional Campaign'
            : 'Single Release';

    return release.featuredUpgrade ? `${baseName} + Featured Placement` : baseName;
};

const getCreditsExpiryDate = (packageId: PressReleaseRecord['packageId']) => {
    if (packageId !== 'bundle') {
        return null;
    }

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    return expiresAt;
};

/** Short unique order reference (8 chars, no ambiguous 0/O/1/I). Random from CSPRNG. */
const ORDER_NUMBER_LENGTH = 8;
const ORDER_NUMBER_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const generateOrderNumber = () => {
    const bytes = crypto.randomBytes(ORDER_NUMBER_LENGTH);
    let out = '';

    for (let i = 0; i < ORDER_NUMBER_LENGTH; i++) {
        out += ORDER_NUMBER_ALPHABET[bytes[i]! % ORDER_NUMBER_ALPHABET.length];
    }

    return out;
};

const customerSubmitUrl = () => `${ENV.FRONTEND_URL}/submit-your-press-release`;
const customerPortalUrl = () => `${ENV.FRONTEND_URL}/portal`;

/**
 * When `expectCreditsInBody` is true, the email body below will list wallet credits (bundle top-up, etc.).
 * When false (e.g. Single Release paid with this submission only), avoid implying extra credits are shown below.
 */
const emailPaymentConfirmationIntroHtml = (expectCreditsInBody: boolean) => {
    const submitHref = customerSubmitUrl();
    const portalHref = customerPortalUrl();

    if (!expectCreditsInBody) {
        return `<p style="margin:0 0 16px;line-height:1.55;color:#334155;">This email confirms your <strong>payment</strong> and that your release is <strong>with our editorial team</strong>. Track status anytime in <a href="${portalHref}">My portal</a>. When you are ready for another release, start from <a href="${submitHref}">Submit your press release</a>.</p>`;
    }

    return `<p style="margin:0 0 16px;line-height:1.55;color:#334155;">This email is your confirmation. It includes your <strong>release credits</strong> (see below) and <strong>submission instructions</strong>: use <a href="${submitHref}">Submit your press release</a> or <a href="${portalHref}">My portal</a> for next steps.</p>`;
};

const emailOrderNumberHtml = (orderNumber: string) => `<p style="margin:0 0 10px;font-size:14px;line-height:1.45;color:#1e293b;"><strong>Order number:</strong> <span style="font-size:13px;font-weight:600;word-break:break-all;">#${orderNumber}</span></p>`;

/** Card checkout drafts that never reached `paid` are removed so unpaid rows do not accumulate. */
const removeCheckoutReleaseIfNeverPaid = async (releaseId: ObjectId) => {
    const release = await pressReleaseRepository.findById(releaseId);

    if (!release) {
        return;
    }

    if (release.paymentStatus === 'paid') {
        return;
    }

    if (release.status === 'approved') {
        return;
    }

    await paymentRepository.deleteManyByReleaseId(releaseId);
    await pressReleaseRepository.delete(releaseId);
};

const verifySquareWebhookSignature = (req: Request) => {
    if (!ENV.SQUARE_WEBHOOK_SIGNATURE_KEY) {
        return true;
    }

    const signature = req.header('x-square-hmacsha256-signature') || '';
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const notificationUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const hmac = crypto
        .createHmac('sha256', ENV.SQUARE_WEBHOOK_SIGNATURE_KEY)
        .update(notificationUrl + rawBody)
        .digest('base64');

    return Boolean(signature)
        && Buffer.byteLength(signature) === Buffer.byteLength(hmac)
        && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac));
};

const sendPaymentEmails = async (payment: PaymentRecord, release: PressReleaseRecord, creditsAdded: number) => {
    const amount = (payment.amountCents / 100).toFixed(2);
    const packageName = getPackageName(release);
    const portalUrl = customerPortalUrl();
    const adminUrl = `${ENV.FRONTEND_URL}/admin`;
    const walletBonusCredits = Math.max(0, creditsAdded - 1);

    await emailService.sendMail({
        to: release.email,
        subject: 'Order Confirmed - Carib Newswire ✅',
        html: `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <h1>Carib Newswire</h1>
                <h2>Payment Successful!</h2>
                ${emailPaymentConfirmationIntroHtml(walletBonusCredits > 0)}
                ${emailOrderNumberHtml(payment.orderNumber)}
                <p><strong>Package:</strong> ${packageName}</p>
                <p><strong>Amount Paid:</strong> $${amount}</p>
                ${walletBonusCredits > 0
        ? `<p><strong>Release credits added to your account:</strong> ${walletBonusCredits} credit${walletBonusCredits === 1 ? '' : 's'}</p>`
        : creditsAdded > 0
            ? `<p><strong>Submission:</strong> This purchase covers this press release (no additional wallet credits).</p>`
            : ''}
                ${release.packageId === 'bundle' ? `<p><strong>Expiry:</strong> ${new Date(Date.now() + 183 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>` : ''}
                <p>We typically review within 48 hours. You can track status in <a href="${portalUrl}">My portal</a>.</p>
            </div>
        `,
    });

    await emailService.notifyAdmin(
        'New Paid Submission Received 🛒',
        `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <h1>New Paid Submission Received</h1>
                <p><strong>Submitter:</strong> ${release.fullName} (${release.email})</p>
                <p><strong>Organization:</strong> ${release.organization}</p>
                <p><strong>Package:</strong> ${packageName}</p>
                <p><strong>Amount paid:</strong> $${amount}</p>
                <p><strong>Press release:</strong> ${release.title}</p>
                <p><a href="${adminUrl}">Open admin dashboard</a></p>
            </div>
        `,
    );
};

const sendFeaturedCreditSubmissionEmails = async (payment: PaymentRecord, release: PressReleaseRecord, creditsRemaining: number) => {
    const amount = (payment.amountCents / 100).toFixed(2);
    const portalUrl = customerPortalUrl();
    const adminUrl = `${ENV.FRONTEND_URL}/admin`;

    await emailService.sendMail({
        to: release.email,
        subject: 'Order Confirmed - Featured Placement + Submission ✅',
        html: `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <h1>Carib Newswire</h1>
                <h2>Payment Successful!</h2>
                ${emailPaymentConfirmationIntroHtml(false)}
                ${emailOrderNumberHtml(payment.orderNumber)}
                <p><strong>Featured add-on:</strong> $${amount}</p>
                <p><strong>Release credits:</strong> 1 credit used for this submission (remaining: ${creditsRemaining})</p>
                <p>Your press release <strong>${release.title}</strong> is submitted for editorial review. Track it in <a href="${portalUrl}">My portal</a>.</p>
            </div>
        `,
    });

    await emailService.notifyAdmin(
        'Featured fee paid — credit submission',
        `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <p><strong>Submitter:</strong> ${release.fullName} (${release.email})</p>
                <p><strong>Press release:</strong> ${release.title}</p>
                <p><strong>Featured fee:</strong> $${amount}</p>
                <p><strong>Order:</strong> #${payment.orderNumber}</p>
                <p><a href="${adminUrl}">Open admin</a></p>
            </div>
        `,
    );
};

const finalizePaidSubmission = async (payment: PaymentRecord) => {
    if (payment.status !== 'paid' || !payment.releaseId) {
        return;
    }

    if (payment.confirmationEmailSentAt) {
        return;
    }

    const release = await pressReleaseRepository.findById(payment.releaseId);

    if (!release) {
        return;
    }

    if (release.pendingCreditWithFeaturedCheckout && release.submitterId) {
        const updatedUser = await userRepository.consumeCredit(release.submitterId.toString());

        if (!updatedUser) {
            return;
        }

        const creditsRemaining = typeof updatedUser.credits === 'number' ? updatedUser.credits : 0;

        await pressReleaseRepository.update(release._id, {
            paymentId: payment._id,
            paymentStatus: 'paid',
            status: 'pending',
            featured: true,
            pendingCreditWithFeaturedCheckout: false,
        });

        const paymentId = payment._id;
        scheduleBackgroundEmail('featured-credit-paid-emails', async () => {
            const latest = await paymentRepository.findById(paymentId);

            if (!latest || latest.confirmationEmailSentAt) {
                return;
            }

            const rel = latest.releaseId ? await pressReleaseRepository.findById(latest.releaseId) : null;

            if (!rel) {
                return;
            }

            await sendFeaturedCreditSubmissionEmails(latest, rel, creditsRemaining);
            await paymentRepository.update(latest._id, { confirmationEmailSentAt: new Date() });
        });

        return;
    }

    const creditsAdded = payment.creditsAdded || getCreditsForPackage(release.packageId);
    const walletCreditsToAdd = Math.max(0, creditsAdded - 1);

    if (release.submitterId && walletCreditsToAdd > 0) {
        await userRepository.addCredits(
            release.submitterId,
            walletCreditsToAdd,
            release.packageId === 'bundle' ? 'bundle' : 'single',
            getCreditsExpiryDate(release.packageId),
        );
    }

    await pressReleaseRepository.update(release._id, {
        paymentId: payment._id,
        paymentStatus: 'paid',
        status: 'pending',
        featured: release.featuredUpgrade ? true : release.featured,
    });

    const paymentId = payment._id;

    scheduleBackgroundEmail('paid-submission-confirmation-emails', async () => {
        const latest = await paymentRepository.findById(paymentId);

        if (!latest || latest.confirmationEmailSentAt) {
            return;
        }

        const rel = latest.releaseId ? await pressReleaseRepository.findById(latest.releaseId) : null;

        if (!rel) {
            return;
        }

        const added = latest.creditsAdded || getCreditsForPackage(rel.packageId);
        await sendPaymentEmails(latest, rel, added);
        await paymentRepository.update(latest._id, { confirmationEmailSentAt: new Date() });
    });
};

const finalizeSessionAfterCreditPurchase = async (
    payment: PaymentRecord,
    sessionId: ObjectId,
    submitterId: string,
    customerEmail: string,
    creditsAdded: number,
    quantity: number,
) => {
    const session = await creditCheckoutSessionRepository.findById(sessionId);

    if (!session) {
        if (creditsAdded > 0) {
            await userRepository.addCredits(
                submitterId,
                creditsAdded,
                payment.packageId === 'bundle' ? 'bundle' : 'single',
                getCreditsExpiryDate(payment.packageId),
            );
        }

        return;
    }

    if (session.submitterId.toString() !== submitterId) {
        throw new ApiError(HTTP_STATUS.FORBIDDEN, 'This checkout session does not belong to your account.');
    }

    const packageCreditsPerUnit = getCreditsForPackage(payment.packageId);
    const totalPackageCredits = packageCreditsPerUnit * quantity;
    const walletCreditsToAdd = Math.max(0, totalPackageCredits - 1);

    if (walletCreditsToAdd > 0) {
        await userRepository.addCredits(
            submitterId,
            walletCreditsToAdd,
            payment.packageId === 'bundle' ? 'bundle' : 'single',
            getCreditsExpiryDate(payment.packageId),
        );
    }

    const storeDto = new PressReleaseStoreRequestDTO({
        fullName: session.payload.fullName,
        email: session.payload.email,
        phoneNumber: session.payload.phoneNumber,
        organization: session.payload.organization,
        releaseTitle: session.payload.title,
        category: session.payload.category,
        island: session.payload.island,
        preferredDistributionDate: session.payload.preferredDistributionDate,
        pressReleaseContent: session.payload.content,
        targetRegions: session.payload.targetRegions,
        specialInstructions: session.payload.specialInstructions,
        outboundLink: session.payload.outboundLink ?? '',
        packageId: session.packageId,
        featuredUpgrade: session.featuredUpgrade,
        coverImagePath: session.payload.coverImagePath,
        documentPath: session.payload.documentPath,
    });

    const base = storeDto.toPersistence(payment.amountCents);

    const persistence: any = {
        ...base,
        submitterId: session.submitterId,
        paymentStatus: 'paid',
        status: 'pending',
        paymentId: payment._id,
        featured: Boolean(session.featuredUpgrade),
        amountCents: payment.amountCents,
    };

    await pressReleaseRepository.assertCanonicalSlugAvailable(session.payload.title);

    const release = await pressReleaseRepository.create(persistence);

    await creditCheckoutSessionRepository.delete(sessionId);

    const paymentId = payment._id;
    const orderNumber = payment.orderNumber;
    const walletCreditsLine = walletCreditsToAdd;

    scheduleBackgroundEmail('credit-session-paid-emails', async () => {
        const latest = await paymentRepository.findById(paymentId);

        if (!latest || latest.confirmationEmailSentAt) {
            return;
        }

        await emailService.notifyAdmin(
            'New paid press release submission',
            `<p>${release.fullName} paid and submitted: <strong>${release.title}</strong>.</p><p>Order #${orderNumber}</p>`,
        );

        const amount = (payment.amountCents / 100).toFixed(2);

        await emailService.sendMail({
            to: customerEmail,
            subject: 'Payment received — your release is in review',
            html: `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <h1>Carib Newswire</h1>
                <h2>Thank you!</h2>
                ${emailPaymentConfirmationIntroHtml(walletCreditsLine > 0)}
                ${emailOrderNumberHtml(orderNumber)}
                <p>We received your payment of <strong>$${amount}</strong>.</p>
                <p>Your press release <strong>${release.title}</strong> is now in the editorial queue.</p>
                ${walletCreditsLine > 0 ? `<p><strong>Release credits added to your account:</strong> ${walletCreditsLine}</p>` : ''}
            </div>
        `,
        });

        await paymentRepository.update(paymentId, { confirmationEmailSentAt: new Date() });
    });
};

const finalizeCreditOnlyPurchase = async (payment: PaymentRecord, submitterId: string, customerEmail: string) => {
    if (payment.status !== 'paid' || payment.releaseId) {
        return;
    }

    if (payment.confirmationEmailSentAt) {
        return;
    }

    const sessionIdRaw = payment.metadata?.pendingCreditCheckoutSessionId;
    const sessionOid = typeof sessionIdRaw === 'string' ? toObjectId(sessionIdRaw) : null;

    const creditsAdded = payment.creditsAdded || getCreditsForPackage(payment.packageId);
    const quantity = typeof payment.metadata?.quantity === 'number' ? payment.metadata.quantity : 1;

    if (sessionOid) {
        await finalizeSessionAfterCreditPurchase(
            payment,
            sessionOid,
            submitterId,
            customerEmail,
            creditsAdded,
            quantity,
        );

        return;
    }

    if (creditsAdded > 0) {
        await userRepository.addCredits(
            submitterId,
            creditsAdded,
            payment.packageId === 'bundle' ? 'bundle' : 'single',
            getCreditsExpiryDate(payment.packageId),
        );
    }

    const dashboardUrl = customerPortalUrl();
    const submitUrl = customerSubmitUrl();
    const amount = (payment.amountCents / 100).toFixed(2);
    const paymentId = payment._id;
    const orderNumber = payment.orderNumber;
    const bundleExpiryHtml = payment.packageId === 'bundle'
        ? `<p><strong>Expiry:</strong> ${new Date(Date.now() + 183 * 24 * 60 * 60 * 1000).toLocaleDateString()}</p>`
        : '';

    scheduleBackgroundEmail('credit-only-purchase-confirmation', async () => {
        const latest = await paymentRepository.findById(paymentId);

        if (!latest || latest.confirmationEmailSentAt) {
            return;
        }

        await emailService.sendMail({
            to: customerEmail,
            subject: 'Order Confirmed - Carib Newswire ✅',
            html: `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <h1>Carib Newswire</h1>
                <h2>Payment Successful!</h2>
                ${emailPaymentConfirmationIntroHtml(true)}
                ${emailOrderNumberHtml(orderNumber)}
                <p><strong>Release credits added:</strong> ${creditsAdded} credit${creditsAdded === 1 ? '' : 's'}</p>
                <p><strong>Amount Paid:</strong> $${amount}</p>
                ${bundleExpiryHtml}
                <p>Each submission uses one credit. Start here: <a href="${submitUrl}">Submit your press release</a>.</p>
                <p><a href="${dashboardUrl}">My portal</a></p>
            </div>
        `,
        });

        await paymentRepository.update(paymentId, { confirmationEmailSentAt: new Date() });
    });
};

const sendPaymentFailedEmail = async (release: PressReleaseRecord | null, email: string) => {
    const checkoutHref = release
        ? `${ENV.FRONTEND_URL}/checkout?releaseId=${release._id.toHexString()}`
        : `${ENV.FRONTEND_URL}/checkout`;

    await emailService.sendMail({
        to: email,
        subject: 'Payment Failed - Carib Newswire',
        html: `
            <div style="font-family: Arial, sans-serif; color: #274060;">
                <p>Your payment could not be processed.</p>
                <p>Please try again.</p>
                <p><a href="${checkoutHref}">Go to Checkout</a></p>
                <p>If the problem persists, contact <a href="mailto:info@caribnewswire.com">info@caribnewswire.com</a>.</p>
            </div>
        `,
    });
};

export const createSquareCheckout = async (
    req: Request<{}, unknown, SquareCheckoutInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const release = await pressReleaseRepository.findById(req.body.releaseId);

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        if (release.pendingCreditWithFeaturedCheckout) {
            if (!req.user || release.submitterId?.toString() !== req.user.id) {
                throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication required to complete checkout for this submission');
            }
        }

        const paymentLink = await squareService.createPaymentLink(release, req.body.email || release.email);
        const isMock = paymentLink.raw.mode === 'mock';
        const creditsAdded = release.pendingCreditWithFeaturedCheckout
            ? 0
            : getCreditsForPackage(release.packageId);
        const payment = await paymentRepository.create({
            releaseId: release._id,
            provider: 'square',
            environment: paymentLink.environment,
            amountCents: release.amountCents,
            currency: 'USD',
            status: isMock ? 'paid' : 'created',
            orderNumber: generateOrderNumber(),
            packageId: release.packageId,
            creditsAdded,
            confirmationEmailSentAt: null,
            squarePaymentLinkId: paymentLink.paymentLinkId,
            squareOrderId: paymentLink.orderId,
            squareCheckoutUrl: paymentLink.checkoutUrl,
            squarePaymentId: null,
            customerEmail: req.body.email || release.email,
            metadata: paymentLink.raw,
        });

        await pressReleaseRepository.update(release._id, {
            paymentId: payment._id,
            paymentStatus: isMock ? 'paid' : 'created',
            status: isMock ? 'pending' : release.status,
        });

        if (isMock) {
            await finalizePaidSubmission(payment);
        }

        res.status(HTTP_STATUS.CREATED).json(successResponse('Square checkout created successfully', {
            payment: PaymentResponseDTO.fromModel(payment),
            checkoutUrl: paymentLink.checkoutUrl,
        }));
    } catch (error) {
        next(error);
    }
};

export const processSquarePayment = async (
    req: Request<{}, unknown, SquareProcessInput>,
    res: Response,
    next: NextFunction,
) => {
    try {
        if (req.body.creditPackage) {
            if (!req.user || (req.user.role !== 'submitter' && req.user.role !== 'journalist')) {
                throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Authentication required to purchase credits');
            }

            const quantity = req.body.quantity ?? 1;
            const unitCents = req.body.creditPackage === 'bundle' ? 39900 : 14900;
            const featuredAddon = Boolean(req.body.featuredAddon);
            const featuredCents = featuredAddon ? 9900 : 0;
            const expectedCents = unitCents * quantity + featuredCents;
            const amountCents = Math.round(req.body.amount * 100);

            if (amountCents !== expectedCents) {
                throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Payment amount does not match the selected credit package, quantity, and optional featured placement');
            }

            const customerEmail = (req.body.email?.trim().toLowerCase() || req.user.email || '').trim();

            if (!customerEmail) {
                throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Email is required for checkout');
            }

            let pendingCheckoutSessionOid: ObjectId | null = null;

            if (req.body.creditCheckoutSessionId) {
                pendingCheckoutSessionOid = toObjectId(req.body.creditCheckoutSessionId);

                if (!pendingCheckoutSessionOid) {
                    throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Invalid checkout session id.');
                }

                const checkoutSession = await creditCheckoutSessionRepository.findById(pendingCheckoutSessionOid);

                if (!checkoutSession || checkoutSession.submitterId.toString() !== req.user.id) {
                    throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Checkout session not found.');
                }

                if (checkoutSession.packageId !== req.body.creditPackage) {
                    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Package selection does not match your saved checkout.');
                }

                if (Boolean(checkoutSession.featuredUpgrade) !== featuredAddon) {
                    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Featured placement selection does not match your saved checkout.');
                }

                const sessionOneLineCents = unitCents + featuredCents;
                if (checkoutSession.amountCents !== sessionOneLineCents) {
                    throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Payment amount does not match your saved checkout.');
                }
            }

            let squarePayment;

            try {
                squarePayment = await squareService.processPayment(
                    req.body.sourceId,
                    amountCents,
                    `Carib Newswire credits:${req.body.creditPackage}×${quantity}`,
                );
            } catch (error) {
                scheduleBackgroundEmail('square-credit-payment-failed', () => sendPaymentFailedEmail(null, customerEmail));
                throw error;
            }

            const creditsAdded = getCreditsForPackage(req.body.creditPackage) * quantity;
            const payment = await paymentRepository.create({
                releaseId: null,
                provider: 'square',
                environment: squarePayment.environment,
                amountCents,
                currency: 'USD',
                status: squarePayment.status,
                orderNumber: generateOrderNumber(),
                packageId: req.body.creditPackage,
                creditsAdded,
                confirmationEmailSentAt: null,
                squarePaymentLinkId: null,
                squareOrderId: squarePayment.orderId,
                squareCheckoutUrl: null,
                squarePaymentId: squarePayment.paymentId,
                customerEmail,
                metadata: {
                    ...squarePayment.raw,
                    creditPurchase: true,
                    quantity,
                    submitterId: req.user.id,
                    cardholderName: req.body.cardholderName,
                    ...(pendingCheckoutSessionOid ? { pendingCreditCheckoutSessionId: pendingCheckoutSessionOid.toHexString() } : {}),
                },
            });

            if (squarePayment.status === 'paid') {
                await finalizeCreditOnlyPurchase(payment, req.user.id, customerEmail);
            }

            if (squarePayment.status === 'failed') {
                scheduleBackgroundEmail('square-credit-payment-failed', () => sendPaymentFailedEmail(null, customerEmail));
                throw new ApiError(
                    HTTP_STATUS.UNPROCESSABLE_ENTITY,
                    squarePayment.failureMessage ?? 'Payment was not completed.',
                );
            }

            res.status(HTTP_STATUS.OK).json(successResponse('Payment processed successfully', {
                payment: PaymentResponseDTO.fromModel(payment),
                orderId: payment.orderNumber,
            }));

            return;
        }

        const release = await pressReleaseRepository.findById(req.body.releaseId ?? '');

        if (!release) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Press release not found');
        }

        if (release.pendingCreditWithFeaturedCheckout) {
            if (!req.user || release.submitterId?.toString() !== req.user.id) {
                throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Sign in to complete payment for this submission.');
            }
        }

        const amountCents = Math.round(req.body.amount * 100);

        if (amountCents !== release.amountCents) {
            throw new ApiError(HTTP_STATUS.UNPROCESSABLE_ENTITY, 'Payment amount does not match the saved order');
        }

        let squarePayment;

        try {
            squarePayment = await squareService.processPayment(
                req.body.sourceId,
                amountCents,
                `Carib Newswire release:${release._id.toHexString()}`,
            );
        } catch (error) {
            scheduleBackgroundEmail('square-release-payment-failed', () => sendPaymentFailedEmail(release, release.email));
            await removeCheckoutReleaseIfNeverPaid(release._id);
            throw error;
        }

        const creditsAdded = getCreditsForPackage(release.packageId);
        const payment = await paymentRepository.create({
            releaseId: release._id,
            provider: 'square',
            environment: squarePayment.environment,
            amountCents,
            currency: 'USD',
            status: squarePayment.status,
            orderNumber: generateOrderNumber(),
            packageId: release.packageId,
            creditsAdded,
            confirmationEmailSentAt: null,
            squarePaymentLinkId: null,
            squareOrderId: squarePayment.orderId,
            squareCheckoutUrl: null,
            squarePaymentId: squarePayment.paymentId,
            customerEmail: req.body.email || release.email,
            metadata: {
                ...squarePayment.raw,
                featuredAddon: release.featuredUpgrade,
                cardholderName: req.body.cardholderName,
            },
        });

        await pressReleaseRepository.update(release._id, {
            paymentId: payment._id,
            paymentStatus: squarePayment.status,
            status: squarePayment.status === 'paid' ? 'pending' : release.status,
        });

        if (squarePayment.status === 'paid') {
            await finalizePaidSubmission(payment);
        }

        if (squarePayment.status === 'failed') {
            scheduleBackgroundEmail('square-release-payment-failed', () => sendPaymentFailedEmail(release, release.email));
            await removeCheckoutReleaseIfNeverPaid(release._id);
            throw new ApiError(
                HTTP_STATUS.UNPROCESSABLE_ENTITY,
                squarePayment.failureMessage ?? 'Payment was not completed.',
            );
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Payment processed successfully', {
            payment: PaymentResponseDTO.fromModel(payment),
            orderId: payment.orderNumber,
        }));
    } catch (error) {
        next(error);
    }
};

export const getLatestPaymentByReleaseId = async (
    req: Request<{ releaseId: string }>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const payment = await paymentRepository.findLatestByReleaseId(req.params.releaseId);

        if (!payment) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment not found');
        }

        const release = payment.releaseId ? await pressReleaseRepository.findById(payment.releaseId) : null;

        res.status(HTTP_STATUS.OK).json(successResponse('Payment retrieved successfully', {
            payment: PaymentResponseDTO.fromModel(payment),
            release: release ? PressReleaseResponseDTO.fromModel(release) : null,
        }));
    } catch (error) {
        next(error);
    }
};

export const getPaymentByOrderNumber = async (
    req: Request<{ orderId: string }>,
    res: Response,
    next: NextFunction,
) => {
    try {
        const payment = await paymentRepository.findByOrderNumber(req.params.orderId);

        if (!payment) {
            throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Payment not found');
        }

        const release = payment.releaseId ? await pressReleaseRepository.findById(payment.releaseId) : null;

        res.status(HTTP_STATUS.OK).json(successResponse('Payment retrieved successfully', {
            payment: PaymentResponseDTO.fromModel(payment),
            release: release ? PressReleaseResponseDTO.fromModel(release) : null,
        }));
    } catch (error) {
        next(error);
    }
};

/** Minimal fields for Square Web Payments SDK in the browser (rate-limited, no auth). */
export const getSquareWebClientConfig = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const config = await squareService.getWebPaymentsClientConfig();
        res.status(HTTP_STATUS.OK).json(successResponse('Square client config retrieved successfully', config));
    } catch (error) {
        next(error);
    }
};

export const squareWebhook = async (req: Request, res: Response, next: NextFunction) => {
    try {
        if (!verifySquareWebhookSignature(req)) {
            throw new ApiError(HTTP_STATUS.UNAUTHORIZED, 'Invalid Square webhook signature');
        }

        const event = req.body;
        const payment = event?.data?.object?.payment;

        if (payment?.id) {
            const status = payment.status === 'COMPLETED' ? 'paid' : payment.status === 'FAILED' ? 'failed' : 'created';
            let storedPayment = await paymentRepository.updateStatusBySquarePaymentId(payment.id, status);

            if (!storedPayment && payment.order_id) {
                const existingPayment = await paymentRepository.findBySquareOrderId(payment.order_id);
                if (existingPayment) {
                    storedPayment = await paymentRepository.update(existingPayment._id, {
                        status,
                        squarePaymentId: payment.id,
                        metadata: {
                            ...existingPayment.metadata,
                            squareWebhookPayment: payment,
                        },
                    });
                }
            }

            if (storedPayment?.releaseId) {
                const releaseBefore = await pressReleaseRepository.findById(storedPayment.releaseId);

                if (status === 'paid') {
                    await pressReleaseRepository.update(storedPayment.releaseId, {
                        paymentStatus: status,
                        status: 'pending',
                    });
                    await finalizePaidSubmission(storedPayment);
                } else if (status === 'failed') {
                    if (releaseBefore?.paymentStatus === 'paid') {
                        if (releaseBefore) {
                            scheduleBackgroundEmail('square-webhook-payment-failed', () => sendPaymentFailedEmail(releaseBefore, releaseBefore.email));
                        }
                    } else {
                        await pressReleaseRepository.update(storedPayment.releaseId, { paymentStatus: status });
                        if (releaseBefore) {
                            scheduleBackgroundEmail('square-webhook-payment-failed', () => sendPaymentFailedEmail(releaseBefore, releaseBefore.email));
                        }
                        await removeCheckoutReleaseIfNeverPaid(storedPayment.releaseId);
                    }
                } else {
                    await pressReleaseRepository.update(storedPayment.releaseId, { paymentStatus: status });
                }
            } else if (storedPayment?.metadata && storedPayment.metadata.creditPurchase === true) {
                const submitterId = typeof storedPayment.metadata.submitterId === 'string' ? storedPayment.metadata.submitterId : '';

                if (status === 'paid' && submitterId) {
                    await finalizeCreditOnlyPurchase(
                        storedPayment,
                        submitterId,
                        storedPayment.customerEmail || '',
                    );
                } else if (status === 'failed' && storedPayment.customerEmail) {
                    const failEmail = storedPayment.customerEmail;
                    scheduleBackgroundEmail('square-webhook-credit-failed', () => sendPaymentFailedEmail(null, failEmail));
                }
            }
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Webhook received'));
    } catch (error) {
        next(error);
    }
};
