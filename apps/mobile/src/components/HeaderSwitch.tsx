import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, View } from 'react-native';
import { T } from './ui';
import { FONTS, useTheme } from '@/lib/theme';

/**
 * Two-way header switch (Assignments | Exams, Communities | Colleagues): a soft track with an ink pill
 * that slides behind the active title — the same language as the floating tab bar.
 */
export function HeaderSwitch<V extends string>({ options, value, onChange }: { options: [{ value: V; label: string }, { value: V; label: string }]; value: V; onChange: (v: V) => void }) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const index = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useRef(new Animated.Value(0)).current;
  const placed = useRef(false);

  useEffect(() => {
    if (!w) return;
    const to = index * (w / 2);
    if (!placed.current) {
      placed.current = true;
      x.setValue(to);
      return;
    }
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) =>
      reduce ? x.setValue(to) : Animated.spring(x, { toValue: to, damping: 18, stiffness: 220, mass: 0.8, useNativeDriver: true }).start(),
    );
  }, [index, w, x]);

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={{ flexDirection: 'row', height: 48, borderRadius: 24, backgroundColor: c.surface, padding: 4 }}
    >
      {w ? (
        <Animated.View
          pointerEvents="none"
          style={{ position: 'absolute', top: 4, left: 4, width: w / 2 - 4, height: 40, borderRadius: 20, backgroundColor: c.primaryBg, transform: [{ translateX: x }] }}
        />
      ) : null}
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={o.label}
            onPress={() => !active && onChange(o.value)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            <T style={{ fontFamily: FONTS.display, fontSize: 18 }} color={active ? c.primaryText : c.muted} numberOfLines={1}>
              {o.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}
