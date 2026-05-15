import type { ObjectId } from 'mongodb';
import type { PaymentStatus } from './PressRelease.js';

export type PaymentRecord = {
    _id: ObjectId;
    releaseId: ObjectId | null;
    provider: 'square';
    environment: 'sandbox' | 'production';
    amountCents: number;
    currency: 'USD';
    status: PaymentStatus;
    orderNumber: string;
    packageId: 'single' | 'bundle' | 'custom';
    creditsAdded: number;
    confirmationEmailSentAt: Date | null;
    squarePaymentLinkId: string | null;
    squareOrderId: string | null;
    squareCheckoutUrl: string | null;
    squarePaymentId: string | null;
    customerEmail: string | null;
    metadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
};
