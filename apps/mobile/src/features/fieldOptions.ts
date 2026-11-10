import { SUBMISSION_LABELS, EXAM_TYPE_LABELS } from '@duely/shared';

export const SUBMISSION_OPTIONS = (Object.keys(SUBMISSION_LABELS) as (keyof typeof SUBMISSION_LABELS)[]).map((k) => ({
  value: k,
  label: SUBMISSION_LABELS[k],
}));

export const EXAM_TYPE_OPTIONS = (Object.keys(EXAM_TYPE_LABELS) as (keyof typeof EXAM_TYPE_LABELS)[]).map((k) => ({
  value: k,
  label: EXAM_TYPE_LABELS[k],
}));

export const REMINDER_CHOICES = [
  { value: 'P7D', label: '1 week before' },
  { value: 'P3D', label: '3 days before' },
  { value: 'P1D', label: '1 day before' },
  { value: 'MORNING_OF', label: 'Morning of' },
  { value: 'PT2H', label: '2 hours before' },
];

export function remindersLabel(offsets: string[] | null | undefined): string {
  if (!offsets) return 'Default';
  if (offsets.length === 0) return 'None';
  return offsets
    .map((o) => REMINDER_CHOICES.find((r) => r.value === o)?.label.replace(' before', '') ?? o)
    .join(', ');
}
