import { getMeta, setMeta } from './db/repo';

export interface CrashRecord {
  at: number;
  where: string;
  message: string;
  stack?: string;
}

const KEY = 'lastCrash';

/** Persist the error (no tokens or user data — message + stack only) and log it with a greppable tag. */
export function recordCrash(where: string, err: unknown): CrashRecord {
  const e = err instanceof Error ? err : new Error(String(err));
  const rec: CrashRecord = { at: Date.now(), where, message: e.message, stack: e.stack?.split('\n').slice(0, 12).join('\n') };
  console.error(`[duely-crash] ${where}: ${e.message}\n${rec.stack ?? ''}`);
  try {
    setMeta(KEY, JSON.stringify(rec));
  } catch {
    // DB not ready — the console line is still there.
  }
  return rec;
}

export function lastCrash(): CrashRecord | null {
  try {
    const v = getMeta(KEY);
    return v ? (JSON.parse(v) as CrashRecord) : null;
  } catch {
    return null;
  }
}

export function clearCrash() {
  try {
    setMeta(KEY, null);
  } catch {
    // ignore
  }
}

interface ErrorUtilsShape {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(fn: (error: unknown, isFatal?: boolean) => void): void;
}

let installed = false;
/** Records uncaught JS errors and unhandled promise rejections before RN's default handler runs. */
export function installCrashLogging() {
  if (installed) return;
  installed = true;
  const EU = (globalThis as unknown as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (EU) {
    const prev = EU.getGlobalHandler();
    EU.setGlobalHandler((error, isFatal) => {
      recordCrash(isFatal ? 'fatal' : 'uncaught', error);
      prev(error, isFatal);
    });
  }
  const g = globalThis as unknown as { HermesInternal?: { enablePromiseRejectionTracker?: (o: object) => void } };
  g.HermesInternal?.enablePromiseRejectionTracker?.({
    allRejections: true,
    onUnhandled: (_id: number, rejection: unknown) => recordCrash('unhandled promise', rejection),
  });
}

/** Fire-and-forget wrapper for background work: failures are logged, never thrown. */
export function safely(where: string, fn: () => unknown): void {
  try {
    const r = fn();
    if (r && typeof (r as Promise<unknown>).catch === 'function') (r as Promise<unknown>).catch((e) => recordCrash(where, e));
  } catch (e) {
    recordCrash(where, e);
  }
}
