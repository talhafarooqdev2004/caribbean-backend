import type { PaymentRecord } from '../../../types/Payment.js';

export class PaymentResponseDTO {
    readonly id: string;
    readonly releaseId: string | null;
    readonly provider: string;
    readonly environment: string;
    readonly amountCents: number;
    readonly currency: string;
    readonly status: string;
    readonly orderNumber: string;
    readonly packageId: string;
    readonly creditsAdded: number;
    readonly squarePaymentLinkId: string | null;
    readonly squareOrderId: string | null;
    readonly squareCheckoutUrl: string | null;
    readonly squarePaymentId: string | null;
    readonly customerEmail: string | null;
    readonly featuredUpgrade: boolean;
    readonly createdAt: string;
    readonly updatedAt: string;

    constructor(record: PaymentRecord, release?: { featuredUpgrade?: boolean } | null) {
        this.id = record._id.toHexString();
        this.releaseId = record.releaseId?.toHexString() ?? null;
        this.provider = record.provider;
        this.environment = record.environment;
        this.amountCents = record.amountCents;
        this.currency = record.currency;
        this.status = record.status;
        this.orderNumber = record.orderNumber;
        this.packageId = record.packageId;
        this.creditsAdded = record.creditsAdded;
        this.squarePaymentLinkId = record.squarePaymentLinkId;
        this.squareOrderId = record.squareOrderId;
        this.squareCheckoutUrl = record.squareCheckoutUrl;
        this.squarePaymentId = record.squarePaymentId;
        this.customerEmail = record.customerEmail;
        this.featuredUpgrade = Boolean(release?.featuredUpgrade ?? record.metadata?.featuredAddon);
        this.createdAt = record.createdAt.toISOString();
        this.updatedAt = record.updatedAt.toISOString();
    }

    static fromModel(record: PaymentRecord, release?: { featuredUpgrade?: boolean } | null): PaymentResponseDTO {
        return new this(record, release);
    }
}
