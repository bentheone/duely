import React from 'react';
import { AccessibilityInfo, Animated, Pressable, View } from 'react-native';
import { Tabs, type BottomTabBarProps } from 'expo-router/tabs';
import { Redirect, router, type ErrorBoundaryProps } from 'expo-router';
import { ErrorScreen } from '@/components/ErrorScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BookOpen, House, NotebookPen, Plus, Users } from 'lucide-react-native';
import { CountBadge } from '@/components/CountBadge';
import { useCommunities } from '@/lib/communityQueries';
import { useTheme } from '@/lib/theme';
import { useApp } from '@/lib/store';

const ICONS: Record<string, { Icon: typeof House; label: string }> = {
  today: { Icon: House, label: 'Today' },
  assignments: { Icon: BookOpen, label: 'Assignments' },
  lectures: { Icon: NotebookPen, label: 'Lectures' },
  communities: { Icon: Users, label: 'Communities' },
};

const TAB_BAR = { height: 64, gap: 12, side: 20 };
const SLOT_ORDER = ['today', 'assignments', '+', 'lectures', 'communities'] as const;
const PILL_W = 52;
const PILL_H = 44;

/**
 * Floating, icon-only bar: Today · Assignments (+ Exams) · (+) · Lectures · Communities. Calendar lives on Today.
 * Active tab: a soft pill slides behind the icon (ink) with the brand's small accent dot under it.
 */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const [width, setWidth] = React.useState(0);
  const active = state.routes[state.index];
  const communities = useCommunities();
  const unread = (communities.data ?? []).reduce((n, x) => n + (x.unread ?? 0), 0);
  const activeName = active?.name ?? 'today';
  const slot = Math.max(0, SLOT_ORDER.indexOf(activeName as (typeof SLOT_ORDER)[number]));
  const slotW = width / SLOT_ORDER.length;
  const x = React.useRef(new Animated.Value(0)).current;
  const placed = React.useRef(false);

  React.useEffect(() => {
    if (!width) return;
    const to = slot * slotW + (slotW - PILL_W) / 2;
    // First placement jumps; later moves spring — or jump when the system asks for reduced motion.
    if (!placed.current) {
      x.setValue(to);
      placed.current = true;
      return;
    }
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled) return;
      if (reduce) x.setValue(to);
      else Animated.spring(x, { toValue: to, damping: 18, stiffness: 220, mass: 0.8, useNativeDriver: true }).start();
    });
    return () => {
      cancelled = true;
    };
  }, [slot, slotW, width, x]);

  const pillStyle = { transform: [{ translateX: x }] };


  const dark = scheme === 'dark';
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: TAB_BAR.side, right: TAB_BAR.side, bottom: insets.bottom + TAB_BAR.gap }}
    >
      <View
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{
          height: TAB_BAR.height,
          borderRadius: TAB_BAR.height / 2,
          backgroundColor: dark ? c.surface : c.bg,
          borderWidth: 0.5,
          borderColor: c.border,
          flexDirection: 'row',
          alignItems: 'center',
          // Floating: one soft shadow, no gradients (§11).
          shadowColor: '#111317',
          shadowOpacity: dark ? 0.4 : 0.1,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 6 },
          elevation: 10,
        }}
      >
        {width ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                top: (TAB_BAR.height - PILL_H) / 2 - 0.5,
                width: PILL_W,
                height: PILL_H,
                borderRadius: PILL_H / 2,
                backgroundColor: dark ? c.surfaceButton : c.surface,
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingBottom: 5,
              },
              pillStyle,
            ]}
          >
            <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dark ? '#F97316' : '#EA580C' }} />
          </Animated.View>
        ) : null}
        {SLOT_ORDER.map((name) => {
          if (name === '+') {
            return (
              <View key="add" style={{ flex: 1, alignItems: 'center' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Quick add"
                  onPress={() => router.push('/quick-add')}
                  style={({ pressed }) => ({
                    width: 48,
                    height: 48,
                    borderRadius: 24,
                    backgroundColor: c.primaryBg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: [{ scale: pressed ? 0.94 : 1 }],
                  })}
                >
                  <Plus size={24} color={c.primaryText} strokeWidth={2.2} />
                </Pressable>
              </View>
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
              style={{ flex: 1, height: TAB_BAR.height, alignItems: 'center', justifyContent: 'center', paddingBottom: 3 }}
            >
              <Icon size={22} color={focused ? c.text : c.faintIcon} strokeWidth={focused ? 2.3 : 2} />
              {name === 'communities' && unread > 0 ? (
                <View pointerEvents="none" style={{ position: 'absolute', top: 12, left: '50%', marginLeft: 6 }}>
                  <CountBadge n={unread} small />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
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
      <Tabs.Screen name="lectures" />
      <Tabs.Screen name="communities" />
    </Tabs>
  );
}
