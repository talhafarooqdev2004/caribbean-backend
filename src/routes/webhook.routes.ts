import express from 'express';
import { squareWebhook } from '../controllers/v1/payments.controller.js';

const router = express.Router();

router.post('/square', squareWebhook);

export default router;
