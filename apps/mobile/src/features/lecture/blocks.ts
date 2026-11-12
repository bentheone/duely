import { uuidv7, type LectureBlock, type LectureBlockType } from '@duely/shared';

export const TEXT_TYPES: LectureBlockType[] = ['p', 'h1', 'h2', 'bullet', 'number', 'check', 'quote', 'research'];
export const MEDIA_TYPES: LectureBlockType[] = ['image', 'file', 'audio'];
const LIST_TYPES: LectureBlockType[] = ['bullet', 'number', 'check', 'research'];

export const isText = (b: LectureBlock) => TEXT_TYPES.includes(b.type);

export function block(type: LectureBlockType = 'p', text = '', extra: Partial<LectureBlock> = {}): LectureBlock {
  return { id: uuidv7(), type, text, ...(type === 'check' || type === 'research' ? { done: false } : {}), ...extra };
}

/** Markdown-style auto formatting at the start of a paragraph: "# ", "## ", "- ", "1. ", "[] ", "> ", "?? ". */
const SHORTCUTS: [RegExp, LectureBlockType][] = [
  [/^##\s/, 'h2'],
  [/^#\s/, 'h1'],
  [/^[-*•]\s/, 'bullet'],
  [/^1[.)]\s/, 'number'],
  [/^\[\s?\]\s/, 'check'],
  [/^>\s/, 'quote'],
  [/^\?\?\s/, 'research'],
];
export function shortcut(text: string): { type: LectureBlockType; text: string } | null {
  for (const [re, type] of SHORTCUTS) {
    const m = re.exec(text);
    if (m) return { type, text: text.slice(m[0].length) };
  }
  return null;
}

/**
 * Applies a text change to block `index`. Handles auto formatting and Enter (a "\n" typed into the
 * input): split into a new block that continues lists, or leave the list on an empty item.
 * Returns the new blocks and which block should take focus (and where the cursor goes).
 */
export function changeText(blocks: LectureBlock[], index: number, raw: string): { blocks: LectureBlock[]; focus?: { id: string; at: 'start' | 'end' } } {
  const cur = blocks[index]!;
  const out = [...blocks];
  const nl = raw.indexOf('\n');
  if (nl === -1) {
    const sc = cur.type === 'p' ? shortcut(raw) : null;
    out[index] = sc ? { ...cur, type: sc.type, text: sc.text, ...(sc.type === 'check' || sc.type === 'research' ? { done: false } : {}) } : { ...cur, text: raw };
    return { blocks: out };
  }
  const before = raw.slice(0, nl);
  const after = raw.slice(nl + 1).replace(/\n/g, ' ');
  // Enter on an empty list item → end the list.
  if (!before && !after && LIST_TYPES.includes(cur.type)) {
    out[index] = { ...cur, type: 'p', text: '', done: null };
    return { blocks: out, focus: { id: cur.id, at: 'start' } };
  }
  const nextType: LectureBlockType = LIST_TYPES.includes(cur.type) ? cur.type : 'p';
  const next = block(nextType, after, cur.indent ? { indent: cur.indent } : {});
  out[index] = { ...cur, text: before };
  out.splice(index + 1, 0, next);
  return { blocks: out, focus: { id: next.id, at: 'start' } };
}

/**
 * Backspace at the very start of a block: a styled block becomes a paragraph; a paragraph merges
 * into the previous text block (or an empty one is removed).
 */
export function backspaceAtStart(blocks: LectureBlock[], index: number): { blocks: LectureBlock[]; focus?: { id: string; at: 'end' | number } } {
  const cur = blocks[index]!;
  if (cur.type !== 'p') {
    const out = [...blocks];
    out[index] = { ...cur, type: 'p', done: null };
    return { blocks: out, focus: { id: cur.id, at: 0 } };
  }
  const prevIndex = index - 1;
  const prev = blocks[prevIndex];
  if (!prev) return { blocks };
  if (!isText(prev)) {
    // Media above: just drop an empty paragraph; otherwise keep it.
    if (cur.text) return { blocks };
    return { blocks: blocks.filter((_, i) => i !== index) };
  }
  const out = blocks.filter((_, i) => i !== index);
  out[prevIndex] = { ...prev, text: prev.text + cur.text };
  return { blocks: out, focus: { id: prev.id, at: prev.text.length } };
}

/** Inserts blocks after `afterIndex` (or at the end). An empty paragraph at that spot is replaced. */
export function insertAfter(blocks: LectureBlock[], afterIndex: number | null, add: LectureBlock[]): LectureBlock[] {
  const out = [...blocks];
  if (afterIndex == null || afterIndex < 0 || afterIndex >= out.length) return [...out, ...add];
  const at = out[afterIndex]!;
  if (at.type === 'p' && !at.text) {
    out.splice(afterIndex, 1, ...add);
    return out;
  }
  out.splice(afterIndex + 1, 0, ...add);
  return out;
}

/** Toolbar: toggle a text block's style (same style again → paragraph). */
export function toggleType(blocks: LectureBlock[], index: number, type: LectureBlockType): LectureBlock[] {
  const cur = blocks[index];
  if (!cur || !isText(cur)) return blocks;
  const out = [...blocks];
  const next = cur.type === type ? 'p' : type;
  out[index] = { ...cur, type: next, done: next === 'check' || next === 'research' ? (cur.done ?? false) : null };
  return out;
}

/** 1-based number for numbered items (counts the run of consecutive number blocks). */
export function listNumber(blocks: LectureBlock[], index: number): number {
  let n = 1;
  for (let i = index - 1; i >= 0 && blocks[i]!.type === 'number'; i--) n++;
  return n;
}

/** Open "relook later" points across lectures. */
export function openResearch<L extends { id: string; blocks: LectureBlock[] }>(lectures: L[]): { lecture: L; block: LectureBlock }[] {
  return lectures.flatMap((l) => l.blocks.filter((b) => b.type === 'research' && !b.done && b.text.trim()).map((b) => ({ lecture: l, block: b })));
}

export const isEmptyDoc = (blocks: LectureBlock[]) => blocks.every((b) => isText(b) && !b.text.trim());

/** Headings (h1/h2) as an outline — used for the recap view. */
export const outline = (blocks: LectureBlock[]) => blocks.filter((b) => (b.type === 'h1' || b.type === 'h2') && b.text.trim());
