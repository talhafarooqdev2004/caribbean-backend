import { MongoClient, type Db } from 'mongodb';
import { ENV } from '../config/env.js';
import { logger } from '../utils/logger.util.js';

let client: MongoClient | null = null;
let db: Db | null = null;

export const connectDB = async (): Promise<Db> => {
    if (db) {
        return db;
    }

    client = new MongoClient(ENV.MONGODB_URI, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
    });

    await client.connect();
    db = client.db(ENV.MONGODB_DB_NAME);

    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('media_signups').createIndex({ requestId: 1 }, { unique: true });
    await db.collection('press_releases').createIndex({ slug: 1 }, { unique: true, sparse: true });
    await db.collection('app_configs').createIndex({ key: 1 }, { unique: true });
    await db.collection('payments').createIndex({ releaseId: 1 });

    logger.info(`MongoDB connected: ${ENV.MONGODB_DB_NAME}`);

    return db;
};

export const getDb = (): Db => {
    if (!db) {
        throw new Error('MongoDB is not connected. Call connectDB first.');
    }

    return db;
};

export const closeDB = async (): Promise<void> => {
    if (client) {
        await client.close();
        client = null;
        db = null;
    }
};
