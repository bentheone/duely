import type { LectureBlock } from '@duely/shared';
import { backspaceAtStart, changeText, insertAfter, listNumber, openResearch, shortcut, toggleType } from './blocks';

const b = (type: LectureBlock['type'], text = '', extra: Partial<LectureBlock> = {}): LectureBlock => ({ id: `${type}-${text}-${Math.random()}`, type, text, ...extra });

test('auto formatting shortcuts', () => {
  expect(shortcut('# Intro')).toEqual({ type: 'h1', text: 'Intro' });
  expect(shortcut('## Sub')).toEqual({ type: 'h2', text: 'Sub' });
  expect(shortcut('- item')).toEqual({ type: 'bullet', text: 'item' });
  expect(shortcut('1. first')).toEqual({ type: 'number', text: 'first' });
  expect(shortcut('[] todo')).toEqual({ type: 'check', text: 'todo' });
  expect(shortcut('?? read more')).toEqual({ type: 'research', text: 'read more' });
  expect(shortcut('plain')).toBeNull();
  const r = changeText([b('p')], 0, '- ');
  expect(r.blocks[0]).toMatchObject({ type: 'bullet', text: '' });
});

test('enter splits and continues lists; enter on empty item ends the list', () => {
  const r = changeText([b('bullet', 'one')], 0, 'one\n');
  expect(r.blocks.map((x) => [x.type, x.text])).toEqual([['bullet', 'one'], ['bullet', '']]);
  expect(r.focus?.id).toBe(r.blocks[1]!.id);
  const end = changeText(r.blocks, 1, '\n');
  expect(end.blocks.map((x) => x.type)).toEqual(['bullet', 'p']);
  const h = changeText([b('h1', 'Title')], 0, 'Ti\ntle');
  expect(h.blocks.map((x) => [x.type, x.text])).toEqual([['h1', 'Ti'], ['p', 'tle']]);
});

test('backspace at start: style → paragraph, paragraph merges up', () => {
  const blocks = [b('p', 'Hello '), b('bullet', 'world')];
  const s1 = backspaceAtStart(blocks, 1);
  expect(s1.blocks[1]!.type).toBe('p');
  const s2 = backspaceAtStart(s1.blocks, 1);
  expect(s2.blocks).toHaveLength(1);
  expect(s2.blocks[0]!.text).toBe('Hello world');
  expect(s2.focus).toEqual({ id: blocks[0]!.id, at: 6 });
});

test('insert media replaces an empty paragraph; numbering; toggles; research', () => {
  const img = b('image', '', { fileId: 'f1' });
  expect(insertAfter([b('p', 'x'), b('p')], 1, [img]).map((x) => x.type)).toEqual(['p', 'image']);
  expect(insertAfter([b('p', 'x')], 0, [img]).map((x) => x.type)).toEqual(['p', 'image']);
  const nums = [b('number', 'a'), b('number', 'b'), b('p'), b('number', 'c')];
  expect([0, 1, 3].map((i) => listNumber(nums, i))).toEqual([1, 2, 1]);
  expect(toggleType([b('p', 'x')], 0, 'h2')[0]!.type).toBe('h2');
  expect(toggleType([b('h2', 'x')], 0, 'h2')[0]!.type).toBe('p');
  const lectures = [{ id: 'l1', blocks: [b('research', 'look up', { done: false }), b('research', 'done', { done: true })] }];
  expect(openResearch(lectures).map((r) => r.block.text)).toEqual(['look up']);
});
