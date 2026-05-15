import type { AppConfigRecord } from '../../../types/AppConfig.js';

export class AppConfigResponseDTO {
    readonly id: string;
    readonly key: string;
    readonly value: unknown;
    readonly description: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;

    constructor(record: AppConfigRecord) {
        this.id = record._id.toHexString();
        this.key = record.key;
        this.value = record.value;
        this.description = record.description;
        this.createdAt = record.createdAt.toISOString();
        this.updatedAt = record.updatedAt.toISOString();
    }

    static fromModel(record: AppConfigRecord): AppConfigResponseDTO {
        return new this(record);
    }
}
