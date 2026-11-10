import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as schema from './schema';

let raw: SQLiteDatabase | null = null;
let orm: ReturnType<typeof makeOrm> | null = null;

function makeOrm(sqlite: SQLiteDatabase) {
  return drizzle(sqlite, { schema });
}

/** Opens (once) and migrates the local database. Safe to call from headless tasks (widgets). */
export function getDb() {
  if (!orm) {
    raw = openDatabaseSync('duely.db', { enableChangeListener: true });
    raw.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
    migrate(raw);
    orm = makeOrm(raw);
  }
  return orm;
}

export function getRawDb(): SQLiteDatabase {
  getDb();
  return raw!;
}

function migrate(db: SQLiteDatabase) {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < schema.MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      for (const stmt of schema.MIGRATIONS[v]!) db.execSync(stmt);
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

/** Wipes all local data (sign out). */
export function resetLocalData() {
  const db = getRawDb();
  db.withTransactionSync(() => {
    for (const t of [...Object.keys(schema.TABLES), 'outbox', 'sync_meta', 'file_cache']) {
      db.execSync(`DELETE FROM "${t}"`);
    }
  });
}

export type Db = ReturnType<typeof getDb>;
