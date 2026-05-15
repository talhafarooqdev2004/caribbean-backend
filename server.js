// Automatically loads environment variables from .env file into process.env
// Equivalent to: import dotenv from 'dotenv'; dotenv.config();
import 'dotenv/config';

// Import your Express app (usually created in app.js)
import app from './app.js';

// Import your custom logger (likely using winston or similar)
import logger from "./src/config/logger.js";


// Define the port your server will run on
// If PORT is not set in .env, fallback to 5000
const PORT = process.env.PORT || 5000;


// Start the server and store the instance in "server"
// IMPORTANT: we store this so we can later close it gracefully
const server = app.listen(PORT, () => {
    // Log a message when server starts
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});


// Handle unhandled promise rejections (very important in production)
// Example: a failed DB connection or rejected async function not caught
process.on('unhandledRejection', (err) => {
    logger.error(`Unhandled Rejection: ${err.message}`);

    // Gracefully shut down the server
    server.close(() => {
        process.exit(1); // Exit with failure
    });
});


// Handle system signal (like when server is stopping - e.g. deployment, docker stop)
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');

    // Close server properly (finish ongoing requests first)
    server.close(() => {
        logger.info('Process terminated');
    });
});