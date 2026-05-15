import { ObjectId } from 'mongodb';
import { getDb } from '../lib/mongodb.js';
import type { AppConfigRecord } from '../types/AppConfig.js';

const collection = () => getDb().collection<AppConfigRecord>('app_configs');

export class AppConfigRepository {
    async findByKey(key: string) {
        return collection().findOne({ key });
    }

    async updateOrCreate(key: string, value: unknown = null, description: string | null = null) {
        const now = new Date();
        const config = await collection().findOneAndUpdate(
            { key },
            {
                $setOnInsert: {
                    _id: new ObjectId(),
                    key,
                    createdAt: now,
                },
                $set: {
                    value,
                    description,
                    updatedAt: now,
                },
            },
            { upsert: true, returnDocument: 'after' },
        );

        if (!config) {
            throw new Error('Unable to update app config');
        }

        return config;
    }

    async findAll() {
        return collection().find({}).sort({ key: 1 }).toArray();
    }
}
