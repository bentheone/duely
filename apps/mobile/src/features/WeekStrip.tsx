import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { DAY, MONTH_LONG, WEEKDAY_SHORT, dayKey, zonedDayAt, zonedParts } from '@duely/shared';
import { Gap, IconButton, Sheet, SmallButton, T } from '@/components/ui';
import { FONTS, useTheme } from '@/lib/theme';

const WEEKS_BACK = 52;
const WEEKS_AHEAD = 104;
const WEEKS = WEEKS_BACK + 1 + WEEKS_AHEAD;

/** Midnight `n` days after `t`'s day in `tz` (DST-safe). */
export const addDays = (t: number, n: number, tz: string) => zonedDayAt(t, tz, n, '00:00');
/** Monday of `t`'s week. */
export const mondayOf = (t: number, tz: string) => addDays(t, -((zonedParts(t, tz).weekday + 6) % 7), tz);

/** Day markers: a colour per day key ("2026-11-12") for days with deadlines, exams or suggestions. */
export type DayMarks = Map<string, string>;

/**
 * Swipeable week strip (§11.3 #7): one page per week, Monday first. Swiping keeps the same weekday
 * selected; selecting a day elsewhere (month sheet, planner) scrolls the strip to its week.
 */
export function WeekStrip({ selected, onSelect, tz, today, marks }: { selected: number; onSelect: (d: number) => void; tz: string; today: number; marks: DayMarks }) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const list = useRef<FlatList<number>>(null);
  const base = useMemo(() => mondayOf(today, tz), [today, tz]);
  const weekStart = useCallback((i: number) => addDays(base, (i - WEEKS_BACK) * 7, tz), [base, tz]);
  const indexOf = useCallback((t: number) => WEEKS_BACK + Math.round((mondayOf(t, tz) - base) / (7 * DAY)), [base, tz]);
  const current = useRef(indexOf(selected));
  const data = useMemo(() => Array.from({ length: WEEKS }, (_, i) => i), []);

  // Follow selections made outside the strip.
  useEffect(() => {
    const i = indexOf(selected);
    if (width && i !== current.current && i >= 0 && i < WEEKS) {
      current.current = i;
      list.current?.scrollToIndex({ index: i, animated: true });
    }
  }, [selected, indexOf, width]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: { index?: number | null }[] }) => {
    const v = viewableItems[0];
    if (v?.index == null || v.index === current.current) return;
    current.current = v.index;
    changed.current(v.index);
  });
  // Latest closure for the (stable) viewability callback.
  const changed = useRef<(i: number) => void>(() => undefined);
  changed.current = (i: number) => {
    const weekday = (zonedParts(selected, tz).weekday + 6) % 7;
    onSelect(addDays(weekStart(i), weekday, tz));
  };

  return (
    <View onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))} style={{ height: 70 }}>
      {width ? (
        <FlatList
          ref={list}
          data={data}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => String(i)}
          initialScrollIndex={current.current}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          windowSize={3}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          onViewableItemsChanged={onViewable.current}
          renderItem={({ item }) => {
            const start = weekStart(item);
            return (
              <View style={{ width, flexDirection: 'row', justifyContent: 'space-between' }}>
                {Array.from({ length: 7 }, (_, k) => {
                  const d = addDays(start, k, tz);
                  const p = zonedParts(d, tz);
                  const key = dayKey(d, tz);
                  const isSel = key === dayKey(selected, tz);
                  const isToday = key === dayKey(today, tz);
                  const mark = marks.get(key);
                  return (
                    <Pressable
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSel }}
                      accessibilityLabel={`${WEEKDAY_SHORT[p.weekday]} ${p.day} ${MONTH_LONG[p.month - 1]}`}
                      onPress={() => onSelect(d)}
                      style={{ width: 44, height: 66, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? c.primaryBg : 'transparent' }}
                    >
                      <T v="small" color={isSel ? c.primaryText : isToday ? c.text : c.muted}>
                        {WEEKDAY_SHORT[p.weekday]!.slice(0, 1)}
                      </T>
                      <T style={{ fontFamily: FONTS.display, fontSize: 18 }} color={isSel ? c.primaryText : c.text}>
                        {p.day}
                      </T>
                      <View style={{ width: 4, height: 4, borderRadius: 2, marginTop: 2, backgroundColor: mark ? (isSel ? c.primaryText : mark) : 'transparent' }} />
                    </Pressable>
                  );
                })}
              </View>
            );
          }}
        />
      ) : null}
    </View>
  );
}

/** Month grid in a sheet: ‹ › between months, tap a day to jump the calendar there. */
export function MonthSheet({
  visible,
  onClose,
  selected,
  onSelect,
  tz,
  today,
  marks,
}: {
  visible: boolean;
  onClose: () => void;
  selected: number;
  onSelect: (d: number) => void;
  tz: string;
  today: number;
  marks: DayMarks;
}) {
  const { c } = useTheme();
  const [anchor, setAnchor] = useState(selected);
  useEffect(() => {
    if (visible) setAnchor(selected);
  }, [visible, selected]);

  const ap = zonedParts(anchor, tz);
  const first = addDays(anchor, 1 - ap.day, tz);
  const gridStart = mondayOf(first, tz);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i, tz));
  const rows = Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7)).filter((row) => row.some((d) => zonedParts(d, tz).month === ap.month));
  const shiftMonth = (n: number) => {
    const target = Date.UTC(ap.year, ap.month - 1 + n, 1, 12);
    setAnchor(addDays(target, 0, tz));
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <IconButton label="Previous month" onPress={() => shiftMonth(-1)}>
          <ChevronLeft size={20} color={c.text} />
        </IconButton>
        <T v="heading">
          {MONTH_LONG[ap.month - 1]} {ap.year}
        </T>
        <IconButton label="Next month" onPress={() => shiftMonth(1)}>
          <ChevronRight size={20} color={c.text} />
        </IconButton>
      </View>
      <Gap h={12} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {[1, 2, 3, 4, 5, 6, 0].map((w) => (
          <T key={w} v="small" tone="faint" style={{ width: 40, textAlign: 'center' }}>
            {WEEKDAY_SHORT[w]!.slice(0, 1)}
          </T>
        ))}
      </View>
      <Gap h={4} />
      {rows.map((row) => (
        <View key={row[0]} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {row.map((d) => {
            const p = zonedParts(d, tz);
            const key = dayKey(d, tz);
            const inMonth = p.month === ap.month;
            const isSel = key === dayKey(selected, tz);
            const isToday = key === dayKey(today, tz);
            const mark = marks.get(key);
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${p.day} ${MONTH_LONG[p.month - 1]}`}
                onPress={() => {
                  onSelect(d);
                  onClose();
                }}
                style={{
                  width: 40,
                  height: 44,
                  borderRadius: 20,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isSel ? c.primaryBg : 'transparent',
                  borderWidth: isToday && !isSel ? 1 : 0,
                  borderColor: c.border,
                }}
              >
                <T v="body" color={isSel ? c.primaryText : inMonth ? c.text : c.faint}>
                  {p.day}
                </T>
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: mark && inMonth ? (isSel ? c.primaryText : mark) : 'transparent' }} />
              </Pressable>
            );
          })}
        </View>
      ))}
      <Gap h={16} />
      <SmallButton
        title="Today"
        onPress={() => {
          onSelect(today);
          onClose();
        }}
      />
    </Sheet>
  );
}
