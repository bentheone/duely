import React from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, ChevronLeft } from 'lucide-react-native';
import { router } from 'expo-router';
import { FONTS, SPACE, useTheme } from '@/lib/theme';

// ---------- Text ----------

type Variant = 'display' | 'title' | 'heading' | 'item' | 'body' | 'meta' | 'small';
const VARIANTS: Record<Variant, TextStyle> = {
  display: { fontFamily: FONTS.display, fontSize: 40, lineHeight: 44, letterSpacing: -0.8 },
  title: { fontFamily: FONTS.display, fontSize: 32, lineHeight: 38, letterSpacing: -0.5 },
  heading: { fontFamily: FONTS.semibold, fontSize: 18, lineHeight: 24 },
  item: { fontFamily: FONTS.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 21 },
  meta: { fontFamily: FONTS.regular, fontSize: 14, lineHeight: 19 },
  small: { fontFamily: FONTS.medium, fontSize: 13, lineHeight: 17 },
};

export function T({
  v = 'body',
  color,
  tone,
  style,
  ...rest
}: TextProps & { v?: Variant; color?: string; tone?: 'muted' | 'faint' | 'danger' }) {
  const { c } = useTheme();
  const col = color ?? (tone === 'muted' ? c.muted : tone === 'faint' ? c.faint : tone === 'danger' ? c.danger : c.text);
  return <Text {...rest} style={[VARIANTS[v], { color: col }, style]} />;
}

// ---------- Layout ----------

export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  back,
  right,
  padTop = true,
  footer,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  back?: boolean;
  right?: React.ReactNode;
  padTop?: boolean;
  footer?: React.ReactNode;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const header =
    back || right ? (
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {back ? (
          <IconButton label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
            <ChevronLeft size={22} color={c.text} strokeWidth={2} />
          </IconButton>
        ) : (
          <View />
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>{right}</View>
      </View>
    ) : null;
  const top = header ? 12 : padTop ? insets.top + SPACE.screenTop - 16 : insets.top + 12;
  const content = (
    <View style={{ paddingHorizontal: SPACE.screenX, paddingTop: top, paddingBottom: 120 }}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {header}
      {scroll ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.muted} colors={[c.text]} progressBackgroundColor={c.surface} /> : undefined}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>{content}</View>
      )}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: c.bg }]}>{footer}</View> : null}
    </View>
  );
}

export function Gap({ h = SPACE.gap }: { h?: number }) {
  return <View style={{ height: h }} />;
}

export function RowView({ children, style, gap = 12 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

// ---------- Small pieces ----------

export function Dot({ color, size = 8 }: { color: string; size?: number }) {
  const { course } = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: course(color) }} />;
}

export function CourseLabel({ color, name, suffix, faint }: { color: string; name: string; suffix?: string; faint?: boolean }) {
  return (
    <RowView gap={6}>
      <Dot color={color} />
      <T v="meta" tone={faint ? 'faint' : 'muted'}>
        {name}
        {suffix ? ` · ${suffix}` : ''}
      </T>
    </RowView>
  );
}

export function IconButton({
  children,
  label,
  onPress,
  size = 44,
  filled = true,
  style,
}: {
  children: React.ReactNode;
  label: string;
  onPress?: () => void;
  size?: number;
  filled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' },
        filled && { backgroundColor: c.surfaceButton },
        pressed && { opacity: 0.6 },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function PillButton({
  title,
  onPress,
  disabled,
  loading,
  kind = 'primary',
  icon,
  style,
}: {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
  loading?: boolean;
  kind?: 'primary' | 'secondary' | 'danger';
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  const bg = kind === 'primary' ? c.primaryBg : c.surfaceButton;
  const fg = kind === 'primary' ? c.primaryText : kind === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon}
      {!loading && <Text style={{ color: fg, fontFamily: FONTS.semibold, fontSize: 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function SmallButton({ title, onPress, tone }: { title: string; onPress?: () => void; tone?: 'primary' }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 18,
        borderRadius: SPACE.radiusButton,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: tone === 'primary' ? c.primaryBg : c.surfaceButton,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: FONTS.semibold, fontSize: 15, color: tone === 'primary' ? c.primaryText : c.text }}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 16,
        borderRadius: 20,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: selected ? c.primaryBg : c.surface,
      }}
    >
      {color ? <Dot color={color} /> : null}
      <Text style={{ fontFamily: FONTS.medium, fontSize: 14, color: selected ? c.primaryText : c.text }}>{label}</Text>
    </Pressable>
  );
}

export function Checkbox({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onToggle}
      hitSlop={10}
      style={{
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: checked ? 0 : 2,
        borderColor: c.faint,
        backgroundColor: checked ? c.text : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {checked ? <Check size={16} color={c.bg} strokeWidth={3} /> : null}
    </Pressable>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const { c, course } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={{ height: 6, borderRadius: 3, backgroundColor: c.surface, overflow: 'hidden', flex: 1 }}
    >
      <View style={{ width: `${value}%`, height: 6, borderRadius: 3, backgroundColor: color ? course(color) : c.text }} />
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const { c } = useTheme();
  const body = <View style={[{ backgroundColor: c.surface, borderRadius: SPACE.radiusCard, padding: 20 }, style]}>{children}</View>;
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Tappable "label · value" row used for parsed fields and settings. */
export function FieldRow({
  label,
  value,
  onPress,
  valueColor,
  right,
  ...rest
}: { label: string; value?: string; onPress?: () => void; valueColor?: string; right?: React.ReactNode } & Omit<PressableProps, 'children'>) {
  const { c } = useTheme();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}${value ? `, ${value}` : ''}`}
      onPress={onPress}
      style={({ pressed }) => [styles.fieldRow, { borderBottomColor: c.border, opacity: pressed ? 0.6 : 1 }]}
      {...rest}
    >
      <T v="body" tone="muted">
        {label}
      </T>
      {right ?? (
        <T v="body" color={valueColor} numberOfLines={1} style={{ flexShrink: 1, textAlign: 'right', marginLeft: 16, fontFamily: FONTS.medium }}>
          {value ?? '—'}
        </T>
      )}
    </Pressable>
  );
}

export function Input(props: TextInputProps & { big?: boolean }) {
  const { c } = useTheme();
  const { big, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={c.faint}
      {...rest}
      style={[
        {
          backgroundColor: c.surface,
          color: c.text,
          borderRadius: SPACE.radiusButton,
          paddingHorizontal: 16,
          paddingVertical: 12,
          minHeight: 48,
          fontFamily: big ? FONTS.display : FONTS.regular,
          fontSize: big ? 22 : 16,
        },
        style,
      ]}
    />
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderRadius: 22, padding: 4, alignSelf: 'flex-start' }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: sel }}
            onPress={() => onChange(o.value)}
            style={{ minHeight: 40, paddingHorizontal: 18, borderRadius: 18, justifyContent: 'center', backgroundColor: sel ? c.bg : 'transparent' }}
          >
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 14, color: sel ? c.text : c.muted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'flex-start', gap: 8 }}>
      <T v="heading">{title}</T>
      {hint ? <T tone="muted">{hint}</T> : null}
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}

// ---------- Bottom sheet (Modal) ----------

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: c.overlay }} onPress={onClose} />
      <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: SPACE.screenX, paddingTop: 12, paddingBottom: insets.bottom + 24, maxHeight: '85%' }}>
        <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 16 }} />
        {title ? (
          <T v="heading" style={{ marginBottom: 12 }}>
            {title}
          </T>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled">{children}</ScrollView>
      </View>
    </Modal>
  );
}

export function OptionList<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: { value: T; label: string; color?: string; hint?: string }[];
  value?: T | null;
  onSelect: (v: T) => void;
}) {
  const { c } = useTheme();
  return (
    <View>
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="button"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => onSelect(o.value)}
          style={({ pressed }) => [{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, opacity: pressed ? 0.6 : 1 }]}
        >
          {o.color ? <Dot color={o.color} size={10} /> : null}
          <View style={{ flex: 1 }}>
            <T v="item" style={{ fontSize: 16 }}>
              {o.label}
            </T>
            {o.hint ? <T v="small" tone="muted">{o.hint}</T> : null}
          </View>
          {o.value === value ? <Check size={20} color={c.text} /> : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: SPACE.screenX, paddingTop: 12 },
  pill: { minHeight: 56, borderRadius: SPACE.radiusPill, paddingHorizontal: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  fieldRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth },
});
