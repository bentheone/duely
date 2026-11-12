import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Camera,
  ClipboardPlus,
  Flag,
  Heading1,
  Heading2,
  ImagePlus,
  List,
  ListChecks,
  ListOrdered,
  Mic,
  MoreHorizontal,
  Paperclip,
  Quote,
  Share2,
  X,
} from 'lucide-react-native';
import { MONTH_SHORT, WEEKDAY_SHORT, formatHHMM, zonedParts, type FileAttachment, type LectureBlock, type LectureBlockType } from '@duely/shared';
import { Card, CourseLabel, Gap, IconButton, OptionList, Screen, Sheet, SmallButton, T } from '@/components/ui';
import { pickDateTime } from '@/components/pickers';
import { BlockEditor, type Focus } from '@/features/lecture/BlockEditor';
import { block, insertAfter, isEmptyDoc, outline, toggleType } from '@/features/lecture/blocks';
import { addDocument, addPhoto, RecorderSheet } from '@/features/lecture/media';
import { ShareSheet } from '@/features/ShareSheet';
import { createLecture } from '@/features/actions';
import { snapshot, useCourses, useFiles, useLecture } from '@/lib/db/queries';
import { getRecord, remove, save } from '@/lib/db/repo';
import { useTz } from '@/lib/store';
import { FONTS, useTheme } from '@/lib/theme';

const SAVE_DELAY = 600;

/** Pick the course/time for a new lecture: the class just ended (or on now), else the given course. */
function startLecture(courseId?: string, classSessionId?: string): string | null {
  const snap = snapshot();
  const now = Date.now();
  const cs =
    (classSessionId ? snap.classSessions.find((x) => x.id === classSessionId) : undefined) ??
    (!courseId ? snap.classSessions.filter((x) => x.start <= now + 15 * 60_000 && x.end >= now - 3 * 3600_000).sort((a, b) => b.start - a.start)[0] : undefined);
  const course = courseId ?? cs?.courseId ?? snap.courses.find((c) => c.status === 'active' && !c.deletedAt)?.id;
  if (!course) return null;
  return createLecture({ courseId: course, classSessionId: cs && cs.courseId === course ? cs.id : null, at: cs && cs.courseId === course ? cs.start : now }).id;
}

/** Lecture log: main topic, topic chips and a block document with photos, files and voice notes. */
export default function LectureScreen() {
  const params = useLocalSearchParams<{ id: string; courseId?: string; classSessionId?: string; recap?: string }>();
  const { c } = useTheme();
  const tz = useTz();
  const { active, byId } = useCourses();

  // "new" → create once, then work on the real id.
  const created = useRef(false);
  const [id, setId] = useState<string | null>(params.id === 'new' ? null : params.id);
  useEffect(() => {
    if (params.id !== 'new' || created.current) return;
    created.current = true;
    const newId = startLecture(params.courseId, params.classSessionId);
    if (!newId) {
      Alert.alert('Add a course first', 'Lectures belong to a course.');
      router.back();
      return;
    }
    setId(newId);
    router.setParams({ id: newId });
  }, [params.id, params.courseId, params.classSessionId]);

  const lec = useLecture(id ?? undefined);
  const fileList = useFiles('lecture', id ?? undefined);
  const files = useMemo(() => new Map(fileList.map((f) => [f.id, f])), [fileList]);

  // Local editing state, loaded once per lecture (live DB updates would fight the cursor).
  const [loaded, setLoaded] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [topics, setTopics] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<LectureBlock[]>([block()]);
  const [topicDraft, setTopicDraft] = useState('');
  const [focused, setFocused] = useState<number | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const [sheet, setSheet] = useState<null | 'course' | 'more' | 'share' | 'record' | 'photo'>(null);
  const [recap, setRecap] = useState(params.recap === '1');

  useEffect(() => {
    if (!lec || loaded === lec.id) return;
    setTitle(lec.title);
    setTopics(lec.topics);
    setBlocks(lec.blocks.length ? lec.blocks : [block()]);
    setLoaded(lec.id);
  }, [lec, loaded]);

  // Debounced save; flushed on leave. Empty new lectures are dropped on leave.
  const latest = useRef({ title, topics, blocks });
  latest.current = { title, topics, blocks };
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!id || loaded !== id) return;
    const cur = getRecord('lectures', id);
    if (!cur || cur.deletedAt) return;
    const v = latest.current;
    if (cur.title === v.title && JSON.stringify(cur.topics) === JSON.stringify(v.topics) && JSON.stringify(cur.blocks) === JSON.stringify(v.blocks)) return;
    save('lectures', { id, title: v.title, topics: v.topics, blocks: v.blocks });
  }, [id, loaded]);
  useEffect(() => {
    if (!loaded) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY);
  }, [title, topics, blocks, loaded, flush]);
  const flushRef = useRef(flush);
  flushRef.current = flush;
  // Only on leaving (or switching lecture): flush, and drop a lecture nothing was written in.
  useEffect(
    () => () => {
      flushRef.current();
      if (!id) return;
      const cur = getRecord('lectures', id);
      const empty = cur && !cur.deletedAt && !cur.title.trim() && !cur.topics.length && isEmptyDoc(cur.blocks) && !snapshot().files.some((f) => f.ownerType === 'lecture' && f.ownerId === id);
      if (empty) remove('lectures', id);
    },
    [id],
  );

  const requestFocus = useCallback((f: NonNullable<Focus>) => setFocus(f), []);
  const clearFocus = useCallback(() => setFocus(null), []);

  if (!id || !lec) {
    return (
      <Screen back>
        <T tone="muted">Opening…</T>
      </Screen>
    );
  }

  const course = byId.get(lec.courseId);
  const when = zonedParts(lec.at, tz);
  const owner = { type: 'lecture' as const, id };

  const insertMedia = (type: LectureBlockType, f: FileAttachment | null) => {
    if (!f) return;
    const media = block(type, '', { fileId: f.id });
    const after = block('p');
    setBlocks((bs) => insertAfter(bs, focused ?? bs.length - 1, [media, after]));
    setFocus({ id: after.id, at: 'start' });
  };
  const runMedia = (fn: () => Promise<FileAttachment | null>, type: LectureBlockType) =>
    void fn()
      .then((f) => insertMedia(type, f))
      .catch((e: Error) => Alert.alert('Couldn’t add it', e.message));
  const setType = (t: LectureBlockType) => {
    const i = focused ?? blocks.length - 1;
    const cur = blocks[i];
    if (cur && ['image', 'file', 'audio'].includes(cur.type)) {
      const nb = block(t);
      setBlocks((bs) => insertAfter(bs, i, [nb]));
      setFocus({ id: nb.id, at: 'start' });
      return;
    }
    setBlocks((bs) => toggleType(bs, i, t));
    if (cur) setFocus({ id: cur.id, at: 'end' });
  };
  const addTopic = () => {
    const t = topicDraft.trim();
    if (t && !topics.includes(t)) setTopics([...topics, t]);
    setTopicDraft('');
  };

  const tool = (label: string, icon: React.ReactNode, onPress: () => void, active?: boolean) => (
    <IconButton key={label} label={label} size={40} filled={!!active} onPress={onPress}>
      {icon}
    </IconButton>
  );
  const fb = focused != null ? blocks[focused] : undefined;
  const ic = (on?: boolean) => (on ? c.text : c.muted);
  const toolbar = (
    <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 4, alignItems: 'center' }}>
      {tool('Heading', <Heading1 size={20} color={ic(fb?.type === 'h1')} />, () => setType('h1'), fb?.type === 'h1')}
      {tool('Subtopic', <Heading2 size={20} color={ic(fb?.type === 'h2')} />, () => setType('h2'), fb?.type === 'h2')}
      {tool('Bullet list', <List size={20} color={ic(fb?.type === 'bullet')} />, () => setType('bullet'), fb?.type === 'bullet')}
      {tool('Numbered list', <ListOrdered size={20} color={ic(fb?.type === 'number')} />, () => setType('number'), fb?.type === 'number')}
      {tool('Checklist', <ListChecks size={20} color={ic(fb?.type === 'check')} />, () => setType('check'), fb?.type === 'check')}
      {tool('Quote', <Quote size={20} color={ic(fb?.type === 'quote')} />, () => setType('quote'), fb?.type === 'quote')}
      {tool('Relook later', <Flag size={20} color={c.suggestion} />, () => setType('research'), fb?.type === 'research')}
      <View style={{ width: 1, height: 24, backgroundColor: c.border, marginHorizontal: 4 }} />
      {tool('Add photo', <ImagePlus size={20} color={c.muted} />, () => setSheet('photo'))}
      {tool('Take photo', <Camera size={20} color={c.muted} />, () => runMedia(() => addPhoto(owner, 'camera'), 'image'))}
      {tool('Attach file', <Paperclip size={20} color={c.muted} />, () => runMedia(() => addDocument(owner), 'file'))}
      {tool('Record voice note', <Mic size={20} color={c.danger} />, () => setSheet('record'))}
      {tool('New assignment', <ClipboardPlus size={20} color={c.muted} />, () => router.push({ pathname: '/quick-add', params: { courseId: lec.courseId } }))}
    </ScrollView>
  );

  const heads = outline(blocks);
  return (
    <Screen
      back
      right={
        <>
          <IconButton label="Share lecture" onPress={() => setSheet('share')}>
            <Share2 size={20} color={c.text} />
          </IconButton>
          <IconButton label="More" onPress={() => setSheet('more')}>
            <MoreHorizontal size={20} color={c.text} />
          </IconButton>
        </>
      }
      footer={toolbar}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Change course" onPress={() => setSheet('course')}>
          {course ? <CourseLabel color={course.color} name={course.shortName} /> : <T tone="muted">Course</T>}
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change date"
          onPress={async () => {
            const t = await pickDateTime(lec.at, tz);
            if (t) save('lectures', { id, at: t });
          }}
        >
          <T v="meta" tone="muted">
            {WEEKDAY_SHORT[when.weekday]} {when.day} {MONTH_SHORT[when.month - 1]} · {formatHHMM(lec.at, tz)}
          </T>
        </Pressable>
      </View>

      {recap ? (
        <>
          <Gap h={16} />
          <Card>
            <T v="item">Recap before class</T>
            <Gap h={8} />
            {[...topics, ...heads.map((h) => h.text)].slice(0, 8).map((t, i) => (
              <T key={`${t}-${i}`} tone="muted">
                • {t}
              </T>
            ))}
            {!topics.length && !heads.length ? <T tone="muted">Skim your notes below.</T> : null}
            <Gap h={12} />
            <SmallButton
              title="Done recapping"
              onPress={() => {
                save('lectures', { id, recappedAt: Date.now() });
                setRecap(false);
              }}
            />
          </Card>
        </>
      ) : null}

      <Gap h={14} />
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Main topic"
        placeholderTextColor={c.faint}
        multiline
        scrollEnabled={false}
        style={{ fontFamily: FONTS.display, fontSize: 30, lineHeight: 36, color: c.text, padding: 0 }}
        accessibilityLabel="Main topic"
      />
      <Gap h={12} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        {topics.map((t) => (
          <Pressable
            key={t}
            accessibilityRole="button"
            accessibilityLabel={`Remove topic ${t}`}
            onPress={() => setTopics(topics.filter((x) => x !== t))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12, paddingRight: 8, height: 32, borderRadius: 16, backgroundColor: c.surface }}
          >
            <T v="small">{t}</T>
            <X size={12} color={c.muted} />
          </Pressable>
        ))}
        <TextInput
          value={topicDraft}
          onChangeText={(t) => (t.endsWith(',') ? (setTopicDraft(t.slice(0, -1)), setTimeout(addTopic, 0)) : setTopicDraft(t))}
          onSubmitEditing={addTopic}
          onBlur={addTopic}
          submitBehavior="submit"
          placeholder={topics.length ? '+ topic' : '+ Add the main topics covered'}
          placeholderTextColor={c.faint}
          style={{ minWidth: 120, height: 32, fontFamily: FONTS.regular, fontSize: 14, color: c.text, paddingVertical: 0 }}
          accessibilityLabel="Add topic"
        />
      </View>
      <View style={{ height: 0.5, backgroundColor: c.border, marginVertical: 18 }} />

      <BlockEditor
        blocks={blocks}
        onChange={setBlocks}
        files={files}
        focus={focus}
        onFocusBlock={setFocused}
        onFocusHandled={clearFocus}
        requestFocus={requestFocus}
      />
      <Pressable accessibilityLabel="Continue writing" onPress={() => {
        const last = blocks[blocks.length - 1];
        if (last && last.type === 'p' && !last.text) setFocus({ id: last.id, at: 'start' });
        else {
          const nb = block('p');
          setBlocks((bs) => [...bs, nb]);
          setFocus({ id: nb.id, at: 'start' });
        }
      }} style={{ minHeight: 120 }} />

      <Sheet visible={sheet === 'course'} onClose={() => setSheet(null)} title="Course">
        <OptionList
          options={active.map((co) => ({ value: co.id, label: co.shortName, color: co.color }))}
          value={lec.courseId}
          onSelect={(v) => {
            save('lectures', { id, courseId: v, semesterId: byId.get(v)?.semesterId ?? lec.semesterId, classSessionId: v === lec.courseId ? lec.classSessionId : null });
            setSheet(null);
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'photo'} onClose={() => setSheet(null)} title="Photo">
        <OptionList
          options={[
            { value: 'camera', label: 'Take a photo' },
            { value: 'library', label: 'Choose from gallery' },
          ]}
          onSelect={(v) => {
            setSheet(null);
            runMedia(() => addPhoto(owner, v as 'camera' | 'library'), 'image');
          }}
        />
      </Sheet>
      <Sheet visible={sheet === 'more'} onClose={() => setSheet(null)}>
        <OptionList
          options={[{ value: 'delete', label: 'Delete lecture' }]}
          onSelect={() => {
            setSheet(null);
            Alert.alert('Delete this lecture?', 'Notes, photos and voice notes in it go too.', [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  for (const f of fileList) remove('files', f.id);
                  remove('lectures', id);
                  router.back();
                },
              },
            ]);
          }}
        />
      </Sheet>
      <RecorderSheet visible={sheet === 'record'} onClose={() => setSheet(null)} owner={owner} onSaved={(f) => insertMedia('audio', f)} />
      <ShareSheet
        visible={sheet === 'share'}
        onClose={() => setSheet(null)}
        kind="lecture"
        id={id}
        title={`${course?.shortName ?? 'Lecture'} · ${title || topics[0] || 'Lecture notes'}`}
        courseCode={course?.code}
      />
    </Screen>
  );
}
