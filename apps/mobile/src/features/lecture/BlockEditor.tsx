import React, { useEffect, useRef } from 'react';
import { Alert, Pressable, TextInput, View, type TextInputKeyPressEvent } from 'react-native';
import { Flag } from 'lucide-react-native';
import type { FileAttachment, LectureBlock } from '@duely/shared';
import { T } from '@/components/ui';
import { FONTS, useTheme } from '@/lib/theme';
import { backspaceAtStart, changeText, isText, listNumber } from './blocks';
import { AudioBlock, FileBlock, ImageBlock } from './media';

export type Focus = { id: string; at: 'start' | 'end' | number } | null;

/**
 * Block document editor (Word-like, but phone-simple): each paragraph / heading / list item is its own
 * input; Enter splits, Backspace at the start merges, "# ", "- ", "1. ", "[] ", "> ", "?? " auto-format.
 * Photos, files and voice notes sit between blocks exactly where they were inserted.
 */
export function BlockEditor({
  blocks,
  onChange,
  files,
  focus,
  onFocusBlock,
  onFocusHandled,
  requestFocus,
}: {
  blocks: LectureBlock[];
  onChange: (blocks: LectureBlock[]) => void;
  files: Map<string, FileAttachment>;
  /** Block to focus next (after Enter, merge, insert). */
  focus: Focus;
  onFocusBlock: (index: number) => void;
  onFocusHandled: () => void;
  /** Ask for a block to be focused (parent stores it in `focus`). */
  requestFocus: (f: NonNullable<Focus>) => void;
}) {
  const { c } = useTheme();
  const inputs = useRef(new Map<string, React.ComponentRef<typeof TextInput>>());
  const selection = useRef(new Map<string, number>());

  useEffect(() => {
    if (!focus) return;
    const el = inputs.current.get(focus.id);
    if (!el) return;
    const b = blocks.find((x) => x.id === focus.id);
    const pos = focus.at === 'start' ? 0 : focus.at === 'end' ? (b?.text.length ?? 0) : focus.at;
    // Wait a frame so the new input is mounted and laid out.
    const t = setTimeout(() => {
      el.focus();
      (el as unknown as { setSelection?: (a: number, b: number) => void }).setSelection?.(pos, pos);
      onFocusHandled();
    }, 30);
    return () => clearTimeout(t);
  }, [focus, blocks, onFocusHandled]);

  const update = (i: number, patch: Partial<LectureBlock>) => {
    const out = [...blocks];
    out[i] = { ...out[i]!, ...patch };
    onChange(out);
  };

  const mediaMenu = (i: number) =>
    Alert.alert('Attachment', undefined, [
      { text: 'Move up', onPress: () => i > 0 && onChange(swap(blocks, i, i - 1)) },
      { text: 'Move down', onPress: () => i < blocks.length - 1 && onChange(swap(blocks, i, i + 1)) },
      { text: 'Remove', style: 'destructive', onPress: () => onChange(blocks.filter((_, k) => k !== i)) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <View style={{ gap: 4 }}>
      {blocks.map((b, i) => {
        if (!isText(b)) {
          const f = b.fileId ? files.get(b.fileId) : undefined;
          return (
            <Pressable key={b.id} onLongPress={() => mediaMenu(i)} delayLongPress={350} style={{ marginVertical: 8, gap: 6 }}>
              {b.type === 'image' ? <ImageBlock file={f} /> : b.type === 'audio' ? <AudioBlock file={f} /> : <FileBlock file={f} />}
              <TextInput
                value={b.text}
                onChangeText={(t) => update(i, { text: t.replace(/\n/g, ' ') })}
                placeholder={b.type === 'audio' ? 'What is this recording?' : 'Caption'}
                placeholderTextColor={c.faint}
                style={{ fontFamily: FONTS.regular, fontSize: 13, color: c.muted, paddingVertical: 2 }}
                accessibilityLabel="Caption"
              />
            </Pressable>
          );
        }
        const style = textStyle(b.type, c);
        const marker =
          b.type === 'bullet' ? (
            <T style={{ width: 18, fontSize: 18, lineHeight: 26 }}>•</T>
          ) : b.type === 'number' ? (
            <T style={{ width: 24, lineHeight: 26 }} tone="muted">
              {listNumber(blocks, i)}.
            </T>
          ) : b.type === 'check' || b.type === 'research' ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!b.done }}
              accessibilityLabel={b.type === 'research' ? 'Relook done' : 'Done'}
              hitSlop={10}
              onPress={() => update(i, { done: !b.done })}
              style={{
                width: 20,
                height: 20,
                borderRadius: b.type === 'research' ? 10 : 6,
                borderWidth: 1.5,
                borderColor: b.type === 'research' ? c.suggestion : c.muted,
                backgroundColor: b.done ? (b.type === 'research' ? c.suggestion : c.text) : 'transparent',
                marginTop: 4,
                marginRight: 10,
              }}
            />
          ) : null;
        return (
          <View
            key={b.id}
            style={[
              { flexDirection: 'row', alignItems: 'flex-start', paddingLeft: (b.indent ?? 0) * 18 },
              b.type === 'quote' && { borderLeftWidth: 3, borderLeftColor: c.border, paddingLeft: 12 },
              b.type === 'research' && { backgroundColor: c.suggestionBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginVertical: 2 },
              (b.type === 'h1' || b.type === 'h2') && { marginTop: i ? 10 : 0 },
            ]}
          >
            {marker}
            <TextInput
              ref={(el) => {
                if (el) inputs.current.set(b.id, el);
                else inputs.current.delete(b.id);
              }}
              multiline
              scrollEnabled={false}
              value={b.text}
              placeholder={i === 0 && blocks.length === 1 ? 'Notes… type # for a heading, - for a list, ?? to relook later' : placeholderFor(b.type)}
              placeholderTextColor={c.faint}
              onFocus={() => onFocusBlock(i)}
              onSelectionChange={(e) => selection.current.set(b.id, e.nativeEvent.selection.start)}
              onChangeText={(t) => {
                const r = changeText(blocks, i, t);
                onChange(r.blocks);
                if (r.focus) requestFocus(r.focus);
              }}
              onKeyPress={(e: TextInputKeyPressEvent) => {
                if (e.nativeEvent.key !== 'Backspace') return;
                if ((selection.current.get(b.id) ?? 0) !== 0 && b.text) return;
                const r = backspaceAtStart(blocks, i);
                if (r.blocks !== blocks) {
                  onChange(r.blocks);
                  if (r.focus) requestFocus(r.focus);
                  else if (i > 0) requestFocus({ id: blocks[i - 1]!.id, at: 'end' });
                }
              }}
              style={[{ flex: 1, color: c.text, paddingVertical: 4, textAlignVertical: 'top' }, style, b.done && { color: c.faint, textDecorationLine: b.type === 'check' ? 'line-through' : 'none' }]}
              accessibilityLabel={labelFor(b.type)}
            />
            {b.type === 'research' ? <Flag size={14} color={c.suggestion} style={{ marginTop: 8, marginLeft: 6 }} /> : null}
          </View>
        );
      })}
    </View>
  );

}

function swap<T>(arr: T[], a: number, b: number): T[] {
  const out = [...arr];
  [out[a], out[b]] = [out[b]!, out[a]!];
  return out;
}

function textStyle(type: LectureBlock['type'], c: ReturnType<typeof useTheme>['c']) {
  switch (type) {
    case 'h1':
      return { fontFamily: FONTS.display, fontSize: 26, lineHeight: 32 };
    case 'h2':
      return { fontFamily: FONTS.semibold, fontSize: 19, lineHeight: 26 };
    case 'quote':
      return { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 24, color: c.muted, fontStyle: 'italic' as const };
    default:
      return { fontFamily: FONTS.regular, fontSize: 16, lineHeight: 24 };
  }
}

const placeholderFor = (t: LectureBlock['type']) =>
  t === 'h1' ? 'Heading' : t === 'h2' ? 'Subtopic' : t === 'research' ? 'Something to look up later' : t === 'check' ? 'To do' : t === 'bullet' || t === 'number' ? 'List item' : t === 'quote' ? 'Quote or definition' : '';
const labelFor = (t: LectureBlock['type']) =>
  ({ p: 'Paragraph', h1: 'Heading', h2: 'Subtopic', bullet: 'Bullet', number: 'Numbered item', check: 'Checklist item', quote: 'Quote', research: 'Relook later' })[t as string] ?? 'Text';
