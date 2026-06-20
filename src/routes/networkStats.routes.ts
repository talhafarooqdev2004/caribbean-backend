import express from 'express';
import { getPublicNetworkStatsHandler } from '../controllers/v1/networkStats.controller.js';
import { readLimiter } from '../middlewares/rateLimiter.middleware.js';

const router = express.Router();

router.get('/', readLimiter, getPublicNetworkStatsHandler);

export default router;
