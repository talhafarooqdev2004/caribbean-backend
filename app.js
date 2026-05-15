import 'express-async-errors';

// MUST be required before express and your routes
// It monkey-patches Express so that if any async route throws,
// it automatically calls next(error) instead of crashing

import express from "express";
import helmet from "helmet";
import cors from "cors";
import morgan from "morgan";
import routes from "./src/routes";
import { errorHandler, notFoundHandler } from "./src/middlewares/error.middleware.js";

const app = express();

// ─── Security Middlewares ─────────────────────────────────────
app.use(helmet());
// helmet() sets 11 HTTP headers that protect against common attacks
// Example: X-Frame-Options: DENY — prevents your site from being put in an iframe (clickjacking)

app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Only allow requests from your frontend domain
// In production: origin: 'https://myapp.com'
// In development: '*' (allow all)

app.use(express.json({ limit: '10mb' }));
// Parse JSON request bodies (req.body)
// limit: '10mb' — don't let anyone send a 1GB JSON and crash your RAM

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
// Parse form data (like HTML forms that POST)
// extended: true means we can parse nested objects

if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined'));
    // 'combined' is Apache standard log format
    // Logs: IP, date, method, URL, status, response size, referrer, user-agent
    // We skip it in tests so test output is clean
}

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(), // seconds since server started
        timestamp: new Date().toISOString(),
    });
});
// Every enterprise app needs a /health endpoint
// Load balancers (AWS ALB, Nginx) ping this to know if your app is alive
// Kubernetes probes hit this to decide if it should restart your pod

app.use('/api/v1', routes);
// All your routes are prefixed with /api/v1
// Why version your API? If you change your API structure,
// old clients using /api/v1 keep working, new clients use /api/v2

// ─── Error Handlers (MUST be last) ────────────────────────────
app.use(notFoundHandler); // catches 404s
app.use(errorHandler);    // catches everything else

export { app };