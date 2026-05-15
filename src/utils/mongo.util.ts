import { ObjectId } from 'mongodb';

export const toObjectId = (id: string | ObjectId | null | undefined): ObjectId | null => {
    if (!id) {
        return null;
    }

    if (id instanceof ObjectId) {
        return id;
    }

    if (!ObjectId.isValid(id)) {
        return null;
    }

    return new ObjectId(id);
};

export const serializeMongo = <T extends { _id?: ObjectId } | null>(record: T): (Omit<NonNullable<T>, '_id'> & { id: string }) | null => {
    if (!record) {
        return null;
    }

    const { _id, ...rest } = record;

    return {
        ...rest,
        id: _id?.toHexString() ?? '',
    } as Omit<NonNullable<T>, '_id'> & { id: string };
};

export const serializeMongoArray = <T extends { _id?: ObjectId }>(records: T[]) => {
    return records.map((record) => serializeMongo(record));
};

export const serializeDate = (value: Date | null | undefined): string | null => {
    if (!value) {
        return null;
    }

    return value.toISOString();
};

export const slugify = (value: string): string => {
    return value
        .toLowerCase()
        .trim()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90) || 'press-release';
};
