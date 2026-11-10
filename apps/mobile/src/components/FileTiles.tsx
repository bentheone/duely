import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Camera, Paperclip } from 'lucide-react-native';
import type { FileAttachment } from '@duely/shared';
import { IconButton, T } from './ui';
import { useFiles } from '@/lib/db/queries';
import { FileUnavailableError, openWith, pickFiles, scanToPdf } from '@/lib/files';
import { remove } from '@/lib/db/repo';
import { useApp } from '@/lib/store';
import { useTheme } from '@/lib/theme';

function ext(name: string) {
  return (name.split('.').pop() ?? '').slice(0, 4).toUpperCase();
}

/** File tiles (ext label + name; tap = Open with…) with a subtle upload-state dot (§9.2). */
export function FileTiles({ ownerType, ownerId }: { ownerType: 'assignment' | 'exam'; ownerId: string }) {
  const { c } = useTheme();
  const files = useFiles(ownerType, ownerId);
  const uploads = useApp((s) => s.uploads);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Couldn’t add file', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const open = async (f: FileAttachment) => {
    try {
      await openWith(f);
    } catch (e) {
      Alert.alert('Can’t open file', e instanceof FileUnavailableError ? e.message : `${(e as Error).message || 'Something went wrong'}. Try again.`);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {files.map((f) => {
          const up = uploads[f.id];
          const pending = !f.remoteId;
          const dotColor = up?.status === 'error' ? c.danger : pending ? c.faint : null;
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${f.name}${pending ? ', not uploaded yet' : ''}`}
              onPress={() => void open(f)}
              onLongPress={() =>
                Alert.alert(f.name, undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Remove', style: 'destructive', onPress: () => remove('files', f.id) },
                ])
              }
              style={({ pressed }) => ({ width: 104, height: 112, borderRadius: 16, backgroundColor: c.surface, padding: 12, justifyContent: 'space-between', opacity: pressed ? 0.7 : 1 })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T v="small" style={{ letterSpacing: 0.5 }}>
                  {ext(f.name)}
                </T>
                {dotColor ? <View accessibilityLabel={up?.status === 'error' ? 'Upload failed, retrying' : 'Waiting to upload'} style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor }} /> : null}
              </View>
              <T v="small" tone="muted" numberOfLines={3}>
                {f.name}
              </T>
              {up?.status === 'uploading' ? <View style={{ height: 2, width: `${Math.round((up.progress ?? 0) * 100)}%`, backgroundColor: c.text }} /> : null}
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginTop: 14 }}>
        <IconButton label="Attach file" onPress={() => void run(() => pickFiles({ type: ownerType, id: ownerId }))}>
          <Paperclip size={20} color={busy ? c.faint : c.text} />
        </IconButton>
        <IconButton label="Scan to PDF" onPress={() => void run(() => scanToPdf({ type: ownerType, id: ownerId }))}>
          <Camera size={20} color={busy ? c.faint : c.text} />
        </IconButton>
      </View>
    </View>
  );
}
