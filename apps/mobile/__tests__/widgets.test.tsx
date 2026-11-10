/**
 * Widgets are rendered by react-native-android-widget's buildWidgetTree, which calls components
 * as plain functions. First-build bug: widgets were blank (React Compiler hooks + a fragment).
 */
import React from 'react';
// Not exported from the package root; same function the library's renderWidget uses.
import { buildWidgetTree } from 'react-native-android-widget/src/api/build-widget-tree';
import { FallbackWidget, WIDGETS } from '@/widgets/widgets';
import type { WidgetData } from '@/widgets/data';

const full: WidgetData = {
  scheme: 'light',
  next: { label: 'PL/SQL', time: '09:30', color: '#EA580C' },
  due: [
    { title: 'Lab on cursors', when: 'Fri 17:00', color: '#EA580C', overdue: false },
    { title: 'Report', when: 'Yesterday', color: '#2563EB', overdue: true },
  ],
  dueThisWeek: 3,
  exam: { days: 6, label: 'Networks midterm', color: '#2563EB' },
};
const empty: WidgetData = { scheme: 'dark', next: null, due: [], dueThisWeek: 0, exam: null };

type Tree = { type: string; props: unknown; children?: Tree[] };
const texts = (t: Tree): string[] => [
  ...(t.type === 'TextWidget' ? [String((t.props as { text: string }).text)] : []),
  ...(t.children ?? []).flatMap(texts),
];

describe('home-screen widgets build a valid widget tree', () => {
  for (const [name, Comp] of Object.entries(WIDGETS)) {
    test(`${name} with data`, () => {
      const tree = buildWidgetTree(<Comp data={full} />) as Tree;
      expect(tree.type).toBeTruthy();
      expect(texts(tree).length).toBeGreaterThan(0);
    });
    test(`${name} empty`, () => {
      expect(() => buildWidgetTree(<Comp data={empty} />)).not.toThrow();
    });
  }
  test('Next up shows class, time and due items', () => {
    const t = texts(buildWidgetTree(<WIDGETS.DuelyNext data={full} />) as Tree);
    expect(t).toEqual(expect.arrayContaining(['PL/SQL', '09:30', 'Lab on cursors', 'Fri 17:00']));
  });
  test('fallback', () => {
    expect(texts(buildWidgetTree(<FallbackWidget />) as Tree)).toEqual(['Open Duely']);
  });
});
