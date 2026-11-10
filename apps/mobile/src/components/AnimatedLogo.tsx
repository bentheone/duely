import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

/**
 * Duely "Dot" logo, built from assets/brand/svg/duely-logo.svg (viewBox 212×61):
 * the mark (big ink dot + small accent dot) and the outlined "duely" glyphs.
 */
const VB_W = 212;
const VB_H = 61;
// Mark circles after the logo's `translate(-11.64 -3.30) scale(0.62)`.
const BIG = { cx: 44 * 0.62 - 11.64, cy: 56 * 0.62 - 3.3, r: 22 * 0.62 };
const SMALL = { cx: 72 * 0.62 - 11.64, cy: 30 * 0.62 - 3.3, r: 9 * 0.62 };

const GLYPHS = [
  { key: 'd', d: 'M71.5 46.84Q67.9 46.84 64.78 45.07Q61.66 43.3 59.8 39.88Q57.94 36.46 57.94 31.66V30.7Q57.94 25.9 59.8 22.48Q61.66 19.06 64.75 17.29Q67.84 15.52 71.5 15.52Q74.26 15.52 76.18 16.18Q78.1 16.84 79.27 17.86Q80.44 18.88 81.1 20.08H82.12V4H88.96V46H82.24V42.1H81.22Q80.14 43.9 77.92 45.37Q75.7 46.84 71.5 46.84ZM73.54 40.84Q77.26 40.84 79.72 38.41Q82.18 35.98 82.18 31.48V30.88Q82.18 26.32 79.75 23.92Q77.32 21.52 73.54 21.52Q69.82 21.52 67.33 23.92Q64.84 26.32 64.84 30.88V31.48Q64.84 35.98 67.33 38.41Q69.82 40.84 73.54 40.84Z' },
  { key: 'u', d: 'M106.66 46.48Q103.24 46.48 100.6 44.95Q97.96 43.42 96.52 40.63Q95.08 37.84 95.08 34.12V16.36H101.92V33.58Q101.92 37.18 103.69 38.92Q105.46 40.66 108.7 40.66Q112.36 40.66 114.49 38.26Q116.62 35.86 116.62 31.36V16.36H123.46V46H116.74V41.86H115.72Q114.94 43.48 112.87 44.98Q110.8 46.48 106.66 46.48Z' },
  { key: 'e', d: 'M143.38 46.84Q138.94 46.84 135.55 44.95Q132.16 43.06 130.27 39.61Q128.38 36.16 128.38 31.54V30.82Q128.38 26.14 130.24 22.72Q132.1 19.3 135.46 17.41Q138.82 15.52 143.2 15.52Q147.52 15.52 150.76 17.41Q154 19.3 155.8 22.72Q157.6 26.14 157.6 30.7V33.16H135.34Q135.46 36.64 137.8 38.74Q140.14 40.84 143.56 40.84Q146.92 40.84 148.54 39.37Q150.16 37.9 151 36.04L156.7 38.98Q155.86 40.6 154.27 42.43Q152.68 44.26 150.04 45.55Q147.4 46.84 143.38 46.84ZM135.4 27.94H150.58Q150.34 25 148.33 23.26Q146.32 21.52 143.14 21.52Q139.84 21.52 137.86 23.26Q135.88 25 135.4 27.94Z' },
  { key: 'l', d: 'M162.28 46V4H169.18V46Z' },
  { key: 'y', d: 'M178.84 58V52H195.22Q196.9 52 196.9 50.2V41.92H195.88Q195.4 43 194.32 44.05Q193.24 45.1 191.44 45.79Q189.64 46.48 186.88 46.48Q183.46 46.48 180.82 44.95Q178.18 43.42 176.74 40.63Q175.3 37.84 175.3 34.12V16.36H182.14V33.58Q182.14 37.18 183.91 38.92Q185.68 40.66 188.92 40.66Q192.58 40.66 194.71 38.26Q196.84 35.86 196.84 31.36V16.36H203.68V51.64Q203.68 54.58 202 56.29Q200.32 58 197.44 58Z' },
];

export const BRAND = { ink: '#111317', inkDark: '#FFFFFF', accent: '#EA580C', accentDark: '#F97316' };

function Glyph({ d, color, progress, k }: { d: string; color: string; progress: SharedValue<number>; k: number }) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 10 * k }],
  }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: VB_W * k, height: VB_H * k }, style]} pointerEvents="none">
      <Svg width={VB_W * k} height={VB_H * k} viewBox={`0 0 ${VB_W} ${VB_H}`}>
        <Path d={d} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/**
 * Animated brand intro for the sign-in screen:
 * 1. the ink dot springs in, 2. the accent dot drops onto it (a "due" ping),
 * 3. "duely" writes in letter by letter, 4. the accent dot keeps a soft ping ripple.
 * Respects the system "reduce motion" setting (shows the final logo).
 */
export function AnimatedLogo({ width, dark, onDone }: { width: number; dark?: boolean; onDone?: () => void }) {
  const k = width / VB_W;
  const ink = dark ? BRAND.inkDark : BRAND.ink;
  const accent = dark ? BRAND.accentDark : BRAND.accent;
  const reduced = useReducedMotion();

  const big = useSharedValue(reduced ? 1 : 0);
  const small = useSharedValue(reduced ? 1 : 0);
  const ripple = useSharedValue(0);
  const g0 = useSharedValue(reduced ? 1 : 0);
  const g1 = useSharedValue(reduced ? 1 : 0);
  const g2 = useSharedValue(reduced ? 1 : 0);
  const g3 = useSharedValue(reduced ? 1 : 0);
  const g4 = useSharedValue(reduced ? 1 : 0);
  const glyphs = [g0, g1, g2, g3, g4];

  useEffect(() => {
    if (reduced) {
      onDone?.();
      return;
    }
    const ease = Easing.out(Easing.cubic);
    big.value = withSpring(1, { damping: 11, stiffness: 140, mass: 0.9 });
    small.value = withDelay(380, withSpring(1, { damping: 9, stiffness: 180 }));
    glyphs.forEach((g, i) => {
      g.value = withDelay(720 + i * 70, withTiming(1, { duration: 360, easing: ease }));
    });
    ripple.value = withDelay(
      1500,
      withRepeat(withSequence(withTiming(1, { duration: 1400, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 0 }), withTiming(0, { duration: 900 })), -1, false, undefined, ReduceMotion.System),
    );
    const t = setTimeout(() => onDone?.(), 1300);
    return () => clearTimeout(t);
    // Run once on mount.
  }, []);

  const bigStyle = useAnimatedStyle(() => ({ transform: [{ scale: big.value }] }));
  const smallStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, small.value * 2),
    transform: [{ translateY: (1 - small.value) * -28 * k }, { translateX: (1 - small.value) * 10 * k }, { scale: 0.4 + 0.6 * small.value }],
  }));
  const rippleStyle = useAnimatedStyle(() => ({
    opacity: (1 - ripple.value) * 0.45 * (ripple.value > 0 ? 1 : 0),
    transform: [{ scale: 1 + ripple.value * 1.8 }],
  }));

  const dot = (c: { cx: number; cy: number; r: number }) => ({
    position: 'absolute' as const,
    left: (c.cx - c.r) * k,
    top: (c.cy - c.r) * k,
    width: c.r * 2 * k,
    height: c.r * 2 * k,
    borderRadius: c.r * k,
  });

  return (
    <View style={{ width: VB_W * k, height: VB_H * k }} accessible accessibilityRole="image" accessibilityLabel="Duely">
      <Animated.View style={[dot(BIG), { backgroundColor: ink }, bigStyle]} />
      <Animated.View style={[dot(SMALL), { backgroundColor: accent }, rippleStyle]} />
      <Animated.View style={[dot(SMALL), { backgroundColor: accent }, smallStyle]} />
      {GLYPHS.map((g, i) => (
        <Glyph key={g.key} d={g.d} color={ink} progress={glyphs[i]!} k={k} />
      ))}
    </View>
  );
}
