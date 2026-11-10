import { eq } from 'drizzle-orm';
import { uuidv7, type SyncTable, type TableRecordMap } from '@duely/shared';
import { getDb, getRawDb } from './client';
import { TABLES } from './schema';

// ---------- sync_meta ----------

export function getMeta(key: string): string | null {
  const r = getRawDb().getFirstSync<{ value: string }>('SELECT value FROM sync_meta WHERE key = ?', key);
  return r?.value ?? null;
}
export function setMeta(key: string, value: string | null): void {
  if (value === null) getRawDb().runSync('DELETE FROM sync_meta WHERE key = ?', key);
  else getRawDb().runSync('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', key, value);
}
export function getMetaJson<T>(key: string, fallback: T): T {
  const v = getMeta(key);
  if (!v) return fallback;
  try {
    return JSON.parse(v) as T;
  } catch {
    return fallback;
  }
}
export function setMetaJson(key: string, value: unknown): void {
  setMeta(key, JSON.stringify(value));
}

// ---------- change notifications ----------

type Listener = (source: 'local' | 'remote') => void;
const listeners = new Set<Listener>();
export function onDataChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function emitChange(source: 'local' | 'remote') {
  for (const l of listeners) l(source);
}

// ---------- reads ----------

export function getRecord<T extends SyncTable>(table: T, id: string): TableRecordMap[T] | null {
  const t = TABLES[table];
  const row = getDb().select().from(t).where(eq(t.id, id)).get();
  return (row as unknown as TableRecordMap[T]) ?? null;
}

// ---------- writes ----------

type Patch<T extends SyncTable> = Partial<TableRecordMap[T]> & { id?: string };

function upsertRow(table: SyncTable, row: Record<string, unknown>) {
  const t = TABLES[table];
  getDb()
    .insert(t)
    .values(row as never)
    .onConflictDoUpdate({ target: t.id, set: row as never })
    .run();
}

/**
 * Every local write (§6): update SQLite (updatedAt = now) and append/replace the record's outbox entry.
 * Returns the full stored record.
 */
export function save<T extends SyncTable>(table: T, patch: Patch<T>): TableRecordMap[T] {
  const now = Date.now();
  const id = patch.id ?? uuidv7(now);
  const existing = getRecord(table, id) as Record<string, unknown> | null;
  const userId = getMeta('userId') ?? '';
  const record = {
    ...(existing ?? {}),
    ...patch,
    id,
    userId,
    createdAt: (existing?.createdAt as number) ?? now,
    updatedAt: Math.max(now, ((existing?.updatedAt as number) ?? 0) + 1),
    deletedAt: patch.deletedAt !== undefined ? patch.deletedAt : ((existing?.deletedAt as number | null) ?? null),
    rev: (existing?.rev as number) ?? 0,
  } as Record<string, unknown>;
  const db = getRawDb();
  db.withTransactionSync(() => {
    upsertRow(table, record);
    db.runSync(
      `INSERT INTO outbox ("table", recordId, op, payload, createdAt, attempts) VALUES (?, ?, 'upsert', ?, ?, 0)
       ON CONFLICT("table", recordId) DO UPDATE SET payload = excluded.payload, createdAt = excluded.createdAt, attempts = 0`,
      table,
      id,
      JSON.stringify(record),
      now,
    );
  });
  emitChange('local');
  return record as unknown as TableRecordMap[T];
}

/** Soft delete (hard deletes never happen in v1). */
export function remove(table: SyncTable, id: string) {
  save(table, { id, deletedAt: Date.now() } as Patch<typeof table>);
}

/** Applies a server record locally unless a newer local edit is still pending in the outbox. */
export function applyRemote(table: SyncTable, record: Record<string, unknown> & { id: string; updatedAt: number }) {
  const pending = getRawDb().getFirstSync<{ payload: string }>(
    'SELECT payload FROM outbox WHERE "table" = ? AND recordId = ?',
    table,
    record.id,
  );
  if (pending) {
    const local = JSON.parse(pending.payload) as { updatedAt: number };
    if (local.updatedAt > record.updatedAt) return;
  }
  upsertRow(table, record);
}

export function newId(): string {
  return uuidv7();
}
