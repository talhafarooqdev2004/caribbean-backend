/**
 * Wipes ALL documents from EVERY non-system collection in the configured MongoDB database.
 * Indexes are kept. After running, start the API once so `connectDB` + `ensureDefaultAdminUser`
 * + `ensureDefaultAppConfig` recreate the default admin user and app config rows.
 *
 * Usage (from carib-backend directory):
 *   npx tsx scripts/reset-db-full.ts --i-understand-this-deletes-all-data
 *
 *   npm run db:reset-full -- --i-understand-this-deletes-all-data
 *
 * Production safety: if NODE_ENV is "production", also set:
 *   ALLOW_FULL_DB_RESET=yes
 */
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

const REQUIRED_FLAG = '--i-understand-this-deletes-all-data';

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/caribnews';
const dbName = process.env.MONGODB_DB_NAME || process.env.MONGODB_DB || 'caribnews';

const shouldSkipCollection = (name: string, type?: string) => {
    if (name.startsWith('system.')) {
        return true;
    }

    if (type && type !== 'collection') {
        return true;
    }

    return false;
};

async function main() {
    if (!process.argv.includes(REQUIRED_FLAG)) {
        console.error(`Refusing to run. You must pass the confirmation flag:\n  ${REQUIRED_FLAG}`);
        console.error(`Example:\n  npx tsx scripts/reset-db-full.ts ${REQUIRED_FLAG}`);
        process.exit(1);
    }

    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_FULL_DB_RESET !== 'yes') {
        console.error(
            'Refusing to run with NODE_ENV=production. If you really intend this, set ALLOW_FULL_DB_RESET=yes in the environment.',
        );
        process.exit(1);
    }

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
    await client.connect();
    const db = client.db(dbName);

    const listed = await db.listCollections().toArray();
    const targets = listed.filter((c) => !shouldSkipCollection(c.name, c.type));

    if (targets.length === 0) {
        console.log(`No user collections found in database "${dbName}". Nothing to delete.`);
        await client.close();
        return;
    }

    console.log(`Database: ${dbName}`);
    console.log(`Collections to empty (${targets.length}): ${targets.map((c) => c.name).join(', ')}`);

    const summary: Record<string, number> = {};

    for (const { name } of targets) {
        const result = await db.collection(name).deleteMany({});
        summary[name] = result.deletedCount;
    }

    console.log('Full reset complete. Deleted document counts:', summary);
    console.log(
        'Next step: start the backend (e.g. npm run dev) so default admin user and app config are recreated.',
    );

    await client.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
