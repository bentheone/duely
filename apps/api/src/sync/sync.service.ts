import { Injectable } from '@nestjs/common';
import {
  CLIENT_WRITABLE_TABLES,
  SYNC_TABLES,
  pushSchemaFor,
  type AnyRecord,
  type PullResponse,
  type PushResponse,
  type SyncTable,
} from '@duely/shared';
import { SERVER_MANAGED_FIELDS, TABLE_MODELS, currentRev, reserveRevs, toRecord } from '../db/models';
import { rebuildScheduledClasses } from './schedule';

const PULL_PAGE = 500;
/** Tables app versions before `?tables=` existed can store (they crash on unknown ones). */
const LEGACY_TABLES: SyncTable[] = ['semesters', 'courses', 'classSessions', 'assignments', 'subtasks', 'exams', 'sessions', 'files', 'missedChecks'];

/** §6 offline-first sync: last-write-wins on updatedAt, per-user monotonically increasing rev. */
@Injectable()
export class SyncService {
  async push(userId: string, changes: { table: string; record: Record<string, unknown> }[]): Promise<PushResponse> {
    const res: PushResponse = { accepted: [], conflicts: [], rejected: [] };
    const touchedCourses = new Set<string>();
    const touchedSemesters = new Set<string>();
    for (const ch of changes) {
      const id = typeof ch.record.id === 'string' ? ch.record.id : '?';
      if (!(SYNC_TABLES as readonly string[]).includes(ch.table)) {
        res.rejected.push({ id, reason: `unknown table ${ch.table}` });
        continue;
      }
      const table = ch.table as SyncTable;
      if (!CLIENT_WRITABLE_TABLES.includes(table)) {
        res.rejected.push({ id, reason: `${table} is server-managed` });
        continue;
      }
      const parsed = pushSchemaFor(table).safeParse(ch.record);
      if (!parsed.success) {
        res.rejected.push({ id, reason: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
        continue;
      }
      const incoming = parsed.data as Record<string, unknown> & { id: string; updatedAt: number };
      const Model = TABLE_MODELS[table];
      const existing = (await Model.findById(incoming.id).lean()) as Record<string, unknown> | null;

      if (existing && existing.userId !== userId) {
        res.rejected.push({ id, reason: 'id belongs to another user' });
        continue;
      }
      if (existing && (existing.updatedAt as number) > incoming.updatedAt) {
        res.conflicts.push({ table, record: toRecord<AnyRecord>(existing)! });
        continue;
      }

      const { id: _id, userId: _u, rev: _r, ...fields } = incoming;
      // Keep server-managed Google link ids if the client doesn't know them yet.
      for (const f of SERVER_MANAGED_FIELDS[table] ?? []) {
        if (existing && existing[f] && (fields[f] === undefined || fields[f] === null)) fields[f] = existing[f];
      }
      const rev = await reserveRevs(userId, 1);
      try {
        await Model.replaceOne(
          { _id: incoming.id, userId },
          { ...fields, _id: incoming.id, userId, rev },
          { upsert: true },
        );
        res.accepted.push(incoming.id);
        if (table === 'courses') touchedCourses.add(incoming.id);
        if (table === 'semesters') touchedSemesters.add(incoming.id);
      } catch (e) {
        // Duplicate key → the id exists for another user (race) — never overwrite.
        res.rejected.push({ id, reason: (e as { code?: number }).code === 11000 ? 'id conflict' : 'write failed' });
      }
    }
    if (touchedCourses.size || touchedSemesters.size) await rebuildScheduledClasses(userId, [...touchedCourses], [...touchedSemesters]);
    return res;
  }

  async pull(userId: string, since: number, known?: string[]): Promise<PullResponse> {
    const tables = known?.length ? SYNC_TABLES.filter((t) => known.includes(t)) : LEGACY_TABLES;
    const batches = await Promise.all(
      tables.map(async (table) => {
        const rows = await TABLE_MODELS[table]
          .find({ userId, rev: { $gt: since } })
          .sort({ rev: 1 })
          .limit(PULL_PAGE + 1)
          .lean();
        return rows.map((r) => ({ table, record: toRecord<AnyRecord>(r as Record<string, unknown>)! }));
      }),
    );
    const all = batches.flat().sort((a, b) => a.record.rev - b.record.rev);
    const hasMore = all.length > PULL_PAGE;
    const changes = all.slice(0, PULL_PAGE);
    const maxRev = hasMore ? changes[changes.length - 1]!.record.rev : Math.max(since, await currentRev(userId));
    return { changes, maxRev, hasMore };
  }
}
