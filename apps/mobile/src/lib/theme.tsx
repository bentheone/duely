import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { courseColorFor } from '@duely/shared';

/** Design tokens (§11.2). */
export const TOKENS = {
  light: {
    bg: '#FFFFFF',
    surface: '#F6F6F3',
    surfaceButton: '#F2F2EF',
    text: '#111317',
    muted: '#6B7079',
    faint: '#9CA0A8',
    faintIcon: '#A3A7AF',
    primaryBg: '#111317',
    primaryText: '#FFFFFF',
    danger: '#B93A0C',
    border: '#ECECE8',
    suggestion: '#2563EB',
    suggestionBg: '#EFF4FF',
    overlay: 'rgba(17,19,23,0.35)',
  },
  dark: {
    bg: '#0E0F12',
    surface: '#17191E',
    surfaceButton: '#1C1E24',
    text: '#F3F4F6',
    muted: '#9CA1AB',
    faint: '#6B7079',
    faintIcon: '#6B7079',
    primaryBg: '#F3F4F6',
    primaryText: '#0E0F12',
    danger: '#FB923C',
    border: '#22252C',
    suggestion: '#60A5FA',
    suggestionBg: '#13213A',
    overlay: 'rgba(0,0,0,0.55)',
  },
} as const;

export type Scheme = 'light' | 'dark';
export type Colors = { [K in keyof (typeof TOKENS)['light']]: string };

export const FONTS = {
  display: 'SpaceGrotesk_600SemiBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

export const SPACE = {
  screenX: 28,
  screenTop: 56,
  gap: 24,
  radiusCard: 20,
  radiusButton: 14,
  radiusPill: 28,
  touch: 44,
};

interface ThemeValue {
  scheme: Scheme;
  c: Colors;
  course: (hex: string) => string;
}

const ThemeContext = createContext<ThemeValue>({
  scheme: 'light',
  c: TOKENS.light,
  course: (h) => h,
});

export function ThemeProvider({
  preference,
  children,
}: {
  preference: 'system' | 'light' | 'dark';
  children: React.ReactNode;
}) {
  const system = useColorScheme();
  const scheme: Scheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const value = useMemo<ThemeValue>(
    () => ({ scheme, c: TOKENS[scheme], course: (hex: string) => courseColorFor(hex, scheme) }),
    [scheme],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
