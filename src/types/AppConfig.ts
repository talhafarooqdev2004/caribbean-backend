import type { ObjectId } from 'mongodb';

export type AppConfigRecord = {
    _id: ObjectId;
    key: string;
    value: unknown;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
};
