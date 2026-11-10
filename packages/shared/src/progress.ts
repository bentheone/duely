import type { Assignment, Subtask } from './types';

type ProgressInput = Pick<Assignment, 'status' | 'progressMode' | 'progressManual'>;
type SubtaskInput = Pick<Subtask, 'done' | 'deletedAt'>;

/**
 * Progress % (§5.1): manual override if set, else done/total subtasks,
 * else status-based (submitted/graded/done = 100, in_progress = 0..).
 */
export function computeProgress(a: ProgressInput, subtasks: SubtaskInput[]): number {
  if (a.status === 'submitted' || a.status === 'graded') return 100;
  if (a.progressMode === 'manual' && a.progressManual != null) {
    return clamp(Math.round(a.progressManual));
  }
  const live = subtasks.filter((s) => !s.deletedAt);
  if (live.length === 0) return a.status === 'done' ? 100 : 0;
  const done = live.filter((s) => s.done).length;
  return clamp(Math.round((done / live.length) * 100));
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

export function isAssignmentOpen(a: Pick<Assignment, 'status'>): boolean {
  return a.status === 'not_started' || a.status === 'in_progress';
}
