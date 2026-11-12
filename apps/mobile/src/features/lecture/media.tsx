import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { FileText, Mic, Pause, Play, Square } from 'lucide-react-native';
import type { FileAttachment } from '@duely/shared';
import { Gap, IconButton, PillButton, Sheet, SmallButton, T } from '@/components/ui';
import { ACCEPTED_TYPES, addLocalFile, cachedUri, ensureLocal, FileUnavailableError, openWith } from '@/lib/files';
import { useFileCache } from '@/lib/db/queries';
import { useTheme } from '@/lib/theme';

type Owner = { type: 'lecture'; id: string };

// ---------- adding ----------

export async function addPhoto(owner: Owner, from: 'camera' | 'library'): Promise<FileAttachment | null> {
  const perm = from === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(from === 'camera' ? 'Camera is off' : 'Photos are off', 'Allow access in Settings to add photos.');
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, exif: false };
  const res = from === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const name = a.fileName ?? `photo-${Date.now()}.jpg`;
  return addLocalFile(owner, { uri: a.uri, name, mime: a.mimeType ?? 'image/jpeg', size: a.fileSize });
}

export async function addDocument(owner: Owner): Promise<FileAttachment | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: ACCEPTED_TYPES, copyToCacheDirectory: true });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return addLocalFile(owner, { uri: a.uri, name: a.name, mime: a.mimeType, size: a.size });
}

// ---------- local copy of an attachment (downloads once if needed) ----------

export function useLocalUri(f: FileAttachment | undefined): { uri: string | null; error: string | null } {
  const cache = useFileCache();
  const cached = f ? (cache.get(f.id)?.localUri ?? null) : null;
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!f || cached) return;
    let alive = true;
    ensureLocal(f).catch((e: Error) => alive && setError(e instanceof FileUnavailableError ? e.message : 'Couldn’t load'));
    return () => {
      alive = false;
    };
  }, [f, cached]);
  return { uri: cached ?? (f ? cachedUri(f.id) : null), error };
}

// ---------- blocks ----------

export function ImageBlock({ file }: { file: FileAttachment | undefined }) {
  const { c } = useTheme();
  const { uri, error } = useLocalUri(file);
  const [ratio, setRatio] = useState(4 / 3);
  if (!file) return <Missing />;
  return (
    <Pressable accessibilityRole="imagebutton" accessibilityLabel={file.name} onPress={() => void openWith(file).catch(() => undefined)}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: '100%', aspectRatio: ratio, borderRadius: 14, backgroundColor: c.surface }}
          contentFit="cover"
          onLoad={(e) => e.source.width && e.source.height && setRatio(Math.max(0.5, Math.min(2, e.source.width / e.source.height)))}
        />
      ) : (
        <View style={{ width: '100%', aspectRatio: ratio, borderRadius: 14, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
          {error ? (
            <T v="small" tone="muted">
              {error}
            </T>
          ) : (
            <ActivityIndicator color={c.muted} />
          )}
        </View>
      )}
    </Pressable>
  );
}

export function FileBlock({ file }: { file: FileAttachment | undefined }) {
  const { c } = useTheme();
  if (!file) return <Missing />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${file.name}`}
      onPress={() => void openWith(file).catch((e: Error) => Alert.alert('Can’t open file', e.message))}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, backgroundColor: c.surface }}
    >
      <FileText size={20} color={c.muted} />
      <T v="body" numberOfLines={1} style={{ flex: 1 }}>
        {file.name}
      </T>
      {!file.remoteId ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.faint }} /> : null}
    </Pressable>
  );
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export function AudioBlock({ file }: { file: FileAttachment | undefined }) {
  const { uri, error } = useLocalUri(file);
  if (!file) return <Missing />;
  return uri ? <AudioPlayerRow uri={uri} /> : <AudioShell label={error ?? 'Loading voice note…'} />;
}

function AudioShell({ label }: { label: string }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: c.surface }}>
      <Mic size={18} color={c.muted} />
      <T v="small" tone="muted">
        {label}
      </T>
    </View>
  );
}

function AudioPlayerRow({ uri }: { uri: string }) {
  const { c } = useTheme();
  const player = useAudioPlayer({ uri });
  const st = useAudioPlayerStatus(player);
  useEffect(() => {
    if (st.didJustFinish) void player.seekTo(0);
  }, [st.didJustFinish, player]);
  const progress = st.duration ? Math.min(1, st.currentTime / st.duration) : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 16, borderRadius: 26, backgroundColor: c.surface }}>
      <IconButton label={st.playing ? 'Pause voice note' : 'Play voice note'} size={40} onPress={() => (st.playing ? player.pause() : player.play())} style={{ backgroundColor: c.primaryBg }}>
        {st.playing ? <Pause size={16} color={c.primaryText} /> : <Play size={16} color={c.primaryText} />}
      </IconButton>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border }}>
        <View style={{ width: `${progress * 100}%`, height: 4, borderRadius: 2, backgroundColor: c.text }} />
      </View>
      <T v="small" tone="muted" style={{ minWidth: 36, textAlign: 'right' }}>
        {clock(st.playing || st.currentTime ? st.currentTime : st.duration)}
      </T>
    </View>
  );
}

function Missing() {
  return (
    <T v="small" tone="faint">
      Attachment unavailable
    </T>
  );
}

// ---------- recording ----------

/** Sheet with a big timer: record → stop → saved as a voice-note block. */
export function RecorderSheet({ visible, onClose, onSaved, owner }: { visible: boolean; onClose: () => void; onSaved: (f: FileAttachment) => void; owner: Owner }) {
  const { c } = useTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);

  async function start() {
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Microphone is off', 'Allow the microphone in Settings to record voice notes.');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }

  async function stop(save: boolean) {
    setBusy(true);
    try {
      if (state.isRecording) await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (save && recorder.uri) {
        const f = await addLocalFile(owner, { uri: recorder.uri, name: `voice-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.m4a`, mime: 'audio/mp4' });
        onSaved(f);
      }
      onClose();
    } catch (e) {
      Alert.alert('Couldn’t save the recording', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={() => void stop(false)} title="Voice note">
      <View style={{ alignItems: 'center' }}>
        <T style={{ fontSize: 56, lineHeight: 64 }} v="display" color={state.isRecording ? c.danger : c.text}>
          {clock(state.durationMillis / 1000)}
        </T>
        <T v="small" tone="muted">
          {state.isRecording ? 'Recording… keep the phone near the speaker' : 'Tap record when the lecturer starts'}
        </T>
        <Gap h={24} />
        {state.isRecording ? (
          <PillButton title="Stop and add" loading={busy} onPress={() => void stop(true)} style={{ alignSelf: 'stretch' }} />
        ) : (
          <IconButton label="Start recording" size={72} onPress={() => void start().catch((e: Error) => Alert.alert('Can’t record', e.message))} style={{ backgroundColor: c.danger }}>
            {busy ? <Square size={24} color="#FFFFFF" /> : <Mic size={28} color="#FFFFFF" />}
          </IconButton>
        )}
        <Gap h={12} />
        <SmallButton title="Cancel" onPress={() => void stop(false)} />
      </View>
    </Sheet>
  );
}
