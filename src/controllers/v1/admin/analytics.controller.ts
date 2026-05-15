import type { NextFunction, Request, Response } from 'express';
import { HTTP_STATUS } from '../../../config/constants.js';
import { PaymentRepository } from '../../../repositories/payment.repository.js';
import { PressReleaseRepository } from '../../../repositories/pressRelease.repository.js';
import { UserRepository } from '../../../repositories/user.repository.js';
import { successResponse } from '../../../utils/response.util.js';
import { PressReleaseResponseDTO } from '../../../dtos/v1/PressReleases/PressReleaseResponseDTO.js';

const payments = new PaymentRepository();
const pressReleases = new PressReleaseRepository();
const users = new UserRepository();

export const getAnalytics = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const monthStart = new Date();
        monthStart.setDate(1);
        monthStart.setHours(0, 0, 0, 0);

        const [monthPayments, totalSubmissions, totalApproved, journalistCount, submitterCount, topViewed] = await Promise.all([
            payments.findPaidSince(monthStart),
            pressReleases.countPaidSince(monthStart),
            pressReleases.countApprovedPaidSince(monthStart),
            users.count('journalist'),
            users.count('submitter'),
            pressReleases.findAll({ status: 'approved', paymentStatus: 'paid', sort: 'mostViewed', limit: 5 }),
        ]);

        const portalMembersSignedUp = journalistCount + submitterCount;

        const revenueByPackage = {
            single: { sales: 0, revenue: 0 },
            bundle: { sales: 0, revenue: 0 },
            featuredAddon: { sales: 0, revenue: 0 },
        };

        for (const payment of monthPayments) {
            const amount = payment.amountCents / 100;

            if (payment.packageId === 'bundle') {
                revenueByPackage.bundle.sales += 1;
                revenueByPackage.bundle.revenue += amount;
            } else {
                revenueByPackage.single.sales += 1;
                revenueByPackage.single.revenue += amount;
            }

            if (amount === 248 || amount === 498 || payment.metadata?.featuredAddon === true) {
                revenueByPackage.featuredAddon.sales += 1;
                revenueByPackage.featuredAddon.revenue += 99;
            }
        }

        res.status(HTTP_STATUS.OK).json(successResponse('Analytics retrieved successfully', {
            totalSubmissionsThisMonth: totalSubmissions,
            totalRevenueThisMonth: monthPayments.reduce((sum, payment) => sum + payment.amountCents, 0) / 100,
            totalApprovedThisMonth: totalApproved,
            totalPortalMembersSignedUp: portalMembersSignedUp,
            topViewedReleases: topViewed.map((release) => PressReleaseResponseDTO.fromModel(release)),
            revenueByPackage,
        }));
    } catch (error) {
        next(error);
    }
};
