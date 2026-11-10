import React from 'react';
import { Pressable, View } from 'react-native';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { Redirect, router, type ErrorBoundaryProps } from 'expo-router';
import { ErrorScreen } from '@/components/ErrorScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, CalendarDays, GraduationCap, House, Plus } from 'lucide-react-native';
import { useTheme } from '@/lib/theme';
import { useApp } from '@/lib/store';

const ICONS: Record<string, { Icon: typeof House; label: string }> = {
  today: { Icon: House, label: 'Today' },
  assignments: { Icon: BookOpen, label: 'Assignments' },
  calendar: { Icon: CalendarDays, label: 'Calendar' },
  exams: { Icon: GraduationCap, label: 'Exams' },
};

/** Icon-only bottom bar: Today · Assignments · (+) · Calendar · Exams (§11.3). */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const order = ['today', 'assignments', '+', 'calendar', 'exams'];
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingTop: 10,
        paddingBottom: insets.bottom + 10,
        backgroundColor: c.bg,
        borderTopWidth: 0.5,
        borderTopColor: c.border,
      }}
    >
      {order.map((name) => {
        if (name === '+') {
          return (
            <Pressable
              key="add"
              accessibilityRole="button"
              accessibilityLabel="Quick add"
              onPress={() => router.push('/quick-add')}
              style={({ pressed }) => ({
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: c.primaryBg,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Plus size={26} color={c.primaryText} strokeWidth={2.2} />
            </Pressable>
          );
        }
        const idx = state.routes.findIndex((r) => r.name === name);
        const route = state.routes[idx];
        const focused = state.index === idx;
        const { Icon, label } = ICONS[name]!;
        return (
          <Pressable
            key={name}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: focused }}
            onPress={() => route && !focused && navigateToTab(route.key)}
            style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon size={24} color={focused ? c.text : c.faintIcon} strokeWidth={2} />
          </Pressable>
        );
      })}
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <ErrorScreen error={error} retry={retry} where="tabs" />;
}

export default function TabsLayout() {
  const signedIn = useApp((s) => s.signedIn);
  if (!signedIn) return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="today" />
      <Tabs.Screen name="assignments" />
      <Tabs.Screen name="calendar" />
      <Tabs.Screen name="exams" />
    </Tabs>
  );
}
