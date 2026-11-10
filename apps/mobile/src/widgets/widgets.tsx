import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { darkenForWhiteText } from '@duely/shared';
import { TOKENS } from '@/lib/theme';
import type { WidgetData } from './data';

type Hex = `#${string}`;
const hex = (s: string) => s as Hex;

function palette(scheme: 'light' | 'dark') {
  const t = TOKENS[scheme];
  return { bg: hex(t.bg), text: hex(t.text), muted: hex(t.muted), danger: hex(t.danger), btn: hex(t.primaryBg), btnText: hex(t.primaryText) };
}

/** Medium 4×2: next class/session (34) + "+" button, then next 2 due items. */
export function NextWidget({ data }: { data: WidgetData }) {
  const p = palette(data.scheme);
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 24, padding: 18, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ flexDirection: 'row', width: 'match_parent', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <FlexWidget style={{ flexDirection: 'column', flex: 1 }}>
          {data.next ? (
            <>
              <FlexWidget style={{ flexDirection: 'row', alignItems: 'center' }}>
                <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hex(data.next.color), marginRight: 6 }} />
                <TextWidget text={data.next.label} maxLines={1} style={{ fontSize: 14, color: p.muted, fontFamily: 'Inter' }} />
              </FlexWidget>
              <TextWidget text={data.next.time} style={{ fontSize: 34, color: p.text, fontWeight: '600' }} />
            </>
          ) : (
            <TextWidget text="Nothing next" style={{ fontSize: 20, color: p.muted }} />
          )}
        </FlexWidget>
        <FlexWidget
          clickAction="OPEN_URI"
          clickActionData={{ uri: 'duely://quick-add' }}
          accessibilityLabel="Add assignment"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: p.btn, justifyContent: 'center', alignItems: 'center' }}
        >
          <TextWidget text="+" style={{ fontSize: 24, color: p.btnText }} />
        </FlexWidget>
      </FlexWidget>
      <FlexWidget style={{ flexDirection: 'column', width: 'match_parent' }}>
        {data.due.map((d, i) => (
          <FlexWidget key={i} style={{ flexDirection: 'row', alignItems: 'center', width: 'match_parent', marginTop: 6 }}>
            <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: hex(d.color), marginRight: 8 }} />
            <FlexWidget style={{ flex: 1 }}>
              <TextWidget text={d.title} maxLines={1} style={{ fontSize: 14, color: p.text }} />
            </FlexWidget>
            <TextWidget text={d.when} style={{ fontSize: 13, color: d.overdue ? p.danger : p.muted }} />
          </FlexWidget>
        ))}
      </FlexWidget>
    </FlexWidget>
  );
}

/** Small 2×2: "3 / due this week". */
export function DueWidget({ data }: { data: WidgetData }) {
  const p = palette(data.scheme);
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'duely://assignments' }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: p.bg, borderRadius: 24, padding: 18, flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <TextWidget text={String(data.dueThisWeek)} style={{ fontSize: 48, color: p.text, fontWeight: '600' }} />
      <TextWidget text="due this week" style={{ fontSize: 14, color: p.muted }} />
    </FlexWidget>
  );
}

/** Small 2×2 exam: "6d / Networks exam" on course colour. */
export function ExamWidget({ data }: { data: WidgetData }) {
  const p = palette(data.scheme);
  const bg = data.exam ? hex(darkenForWhiteText(data.exam.color)) : p.bg;
  const fg = data.exam ? hex('#FFFFFF') : p.muted;
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: 'duely://exams' }}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: bg, borderRadius: 24, padding: 18, flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <TextWidget text={data.exam ? `${data.exam.days}d` : '—'} style={{ fontSize: 48, color: fg, fontWeight: '600' }} />
      <TextWidget text={data.exam ? data.exam.label : 'No exams'} maxLines={1} style={{ fontSize: 14, color: fg }} />
    </FlexWidget>
  );
}

export const WIDGETS = {
  DuelyNext: NextWidget,
  DuelyDue: DueWidget,
  DuelyExam: ExamWidget,
} as const;
export type WidgetName = keyof typeof WIDGETS;
