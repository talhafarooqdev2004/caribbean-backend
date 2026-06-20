import nodemailer from 'nodemailer';
import { ENV } from '../config/env.js';
import { htmlToPlainTextEmail, wrapEmailHtml } from '../utils/email-html.util.js';
import { logger } from '../utils/logger.util.js';

class EmailService {
    private transporter: nodemailer.Transporter | null = null;

    constructor() {
        this.initializeTransporter();
    }

    private initializeTransporter() {
        if (!ENV.SMTP_USER || !ENV.SMTP_PASSWORD) {
            logger.warn('SMTP credentials not configured. Email delivery is disabled until SMTP_USER and SMTP_PASSWORD are set.');
            return;
        }

        this.transporter = nodemailer.createTransport({
            host: ENV.SMTP_HOST,
            port: ENV.SMTP_PORT,
            secure: ENV.SMTP_SECURE,
            auth: {
                user: ENV.SMTP_USER,
                pass: ENV.SMTP_PASSWORD.replace(/\s+/g, ''),
            },
        });
    }

    async sendMail(options: {
        to: string;
        subject: string;
        html: string;
        text?: string;
        /**
         * When true, log recipient and SMTP `accepted` / `messageId` after send.
         * Use for low-volume ops mail (admin alerts); avoid on bulk sends (digest).
         */
        logDeliveryDetail?: boolean;
    }) {
        if (!this.transporter) {
            logger.warn(`Email skipped because SMTP is not configured. Subject: ${options.subject}`);
            return false;
        }

        try {
            const html = wrapEmailHtml(options.html);

            if (ENV.NODE_ENV === 'production' && /href=["']https?:\/\/localhost/i.test(html)) {
                logger.warn(
                    `Email "${options.subject}" contains localhost links — set FRONTEND_URL to your public site (e.g. https://caribnewswire.com).`,
                );
            }

            const info = await this.transporter.sendMail({
                from: `"Carib Newswire" <${ENV.SMTP_USER || ENV.ADMIN_EMAIL}>`,
                to: options.to,
                subject: options.subject,
                html,
                text: options.text ?? htmlToPlainTextEmail(html),
            });

            if (options.logDeliveryDetail) {
                logger.info(
                    `SMTP accepted: subject="${options.subject}" to=${options.to} messageId=${info.messageId} accepted=${JSON.stringify(info.accepted)}`,
                );
            }
        } catch (error) {
            logger.error(`Email delivery failed for subject: ${options.subject}`, error);
            return false;
        }

        return true;
    }

    async notifyAdmin(subject: string, html: string) {
        return this.sendMail({
            to: ENV.ADMIN_EMAIL,
            subject,
            html,
            logDeliveryDetail: true,
        });
    }
}

export const emailService = new EmailService();

/**
 * Runs after the current HTTP tick so SMTP never blocks the request handler.
 * Always awaits the task result (including when the task returns a Promise).
 */
export const scheduleBackgroundEmail = (label: string, task: () => void | Promise<unknown>) => {
    logger.info(`Email queued: ${label}`);

    const run = async () => {
        try {
            const out = await Promise.resolve(task());

            if (out === false) {
                logger.warn(`Email task returned false (SMTP disabled or send failed): ${label}`);
            } else {
                logger.info(`Email task completed: ${label}`);
            }
        } catch (error) {
            logger.error(`Background email task failed: ${label}`, error);
        }
    };

    process.nextTick(() => {
        void run();
    });
};
