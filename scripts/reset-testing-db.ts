/**
 * Wipes portal testing data: keeps only users with role "admin".
 * Also clears press releases, payments, bookmarks, and contact messages.
 * Does NOT delete: media_signups, app_configs.
 *
 * Usage (from carib-backend):
 *   npx tsx scripts/reset-testing-db.ts --i-understand
 */
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../.env.local'), override: true });

const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/caribnews';
const dbName = process.env.MONGODB_DB_NAME || process.env.MONGODB_DB || 'caribnews';

async function main() {
    if (!process.argv.includes('--i-understand')) {
        console.error('Refusing to run. Re-run with: npx tsx scripts/reset-testing-db.ts --i-understand');
        process.exit(1);
    }

    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10_000 });
    await client.connect();
    const db = client.db(dbName);

    const adminCount = await db.collection('users').countDocuments({ role: 'admin' });
    if (adminCount === 0) {
        console.error('No admin user found (role: "admin"). Aborting so you are not locked out.');
        await client.close();
        process.exit(1);
    }

    const [releases, payments, bookmarks, contacts, users] = await Promise.all([
        db.collection('press_releases').deleteMany({}),
        db.collection('payments').deleteMany({}),
        db.collection('journalist_bookmarks').deleteMany({}),
        db.collection('contact_messages').deleteMany({}),
        db.collection('users').deleteMany({ role: { $ne: 'admin' } }),
    ]);

    console.log('Reset complete:', {
        dbName,
        adminsKept: adminCount,
        deletedUsers: users.deletedCount,
        deletedPressReleases: releases.deletedCount,
        deletedPayments: payments.deletedCount,
        deletedBookmarks: bookmarks.deletedCount,
        deletedContactMessages: contacts.deletedCount,
    });

    await client.close();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
