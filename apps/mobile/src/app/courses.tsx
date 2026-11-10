import React, { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Swipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { ChevronDown, ChevronRight, MessageSquare, Plus, Settings as Gear, ShieldCheck } from 'lucide-react-native';
import { WEEKDAY_SHORT, zonedParts } from '@duely/shared';
import { Card, Dot, Gap, IconButton, Input, OptionList, PillButton, Screen, Sheet, SmallButton, T } from '@/components/ui';
import { useActiveSemester, useClassSessions, useCourses, useSemesters } from '@/lib/db/queries';
import { archiveSemester, createSemester, defaultSemesterName, finishCourse } from '@/features/actions';
import { useApp, useTz } from '@/lib/store';
import { FONTS, useTheme } from '@/lib/theme';

/** §11.3 #6 Courses: semester dropdown, active courses (swipe → Finish / Edit), finished archive card. */
export default function Courses() {
  const { c } = useTheme();
  const tz = useTz();
  const semester = useActiveSemester();
  const semesters = useSemesters();
  const { active, finished } = useCourses();
  const classes = useClassSessions();
  const [semSheet, setSemSheet] = useState(false);
  const isAdmin = useApp((st) => !!st.user?.isAdmin);
  const [newSem, setNewSem] = useState<string | null>(null);

  const daysByCourse = useMemo(() => {
    const m = new Map<string, Set<number>>();
    for (const s of classes) {
      const set = m.get(s.courseId) ?? new Set<number>();
      set.add(zonedParts(s.start, tz).weekday);
      m.set(s.courseId, set);
    }
    return m;
  }, [classes, tz]);

  const meta = (id: string, code: string) => {
    const days = [...(daysByCourse.get(id) ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => WEEKDAY_SHORT[d]);
    return [code, days.join(', ')].filter(Boolean).join(' · ');
  };

  return (
    <Screen
      back
      right={
        <>
          {isAdmin ? (
            <IconButton label="Admin" onPress={() => router.push('/admin')}>
              <ShieldCheck size={20} color={c.text} />
            </IconButton>
          ) : null}
          <IconButton label="Send feedback" onPress={() => router.push('/feedback')}>
            <MessageSquare size={20} color={c.text} />
          </IconButton>
          <IconButton label="Settings" onPress={() => router.push('/settings')}>
            <Gear size={20} color={c.text} />
          </IconButton>
        </>
      }
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Switch semester" onPress={() => setSemSheet(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
        <T v="display">{semester?.name ?? 'Courses'}</T>
        <ChevronDown size={26} color={c.muted} />
      </Pressable>
      <Gap h={28} />

      {active.map((course) => (
        <Swipeable
          key={course.id}
          friction={2}
          rightThreshold={40}
          renderRightActions={(_p, _t, methods) => (
            <View style={{ flexDirection: 'row' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${course.shortName}`}
                onPress={() => {
                  methods.close();
                  router.push(`/course/${course.id}`);
                }}
                style={{ width: 84, justifyContent: 'center', alignItems: 'center', backgroundColor: c.surfaceButton }}
              >
                <T v="small">Edit</T>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Finish ${course.shortName}`}
                onPress={() => {
                  methods.close();
                  finishCourse(course.id);
                }}
                style={{ width: 84, justifyContent: 'center', alignItems: 'center', backgroundColor: c.primaryBg }}
              >
                <T v="small" color={c.primaryText}>
                  Finish
                </T>
              </Pressable>
            </View>
          )}
        >
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/course/${course.id}`)}
            style={{ backgroundColor: c.bg, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 64 }}
          >
            <Dot color={course.color} size={10} />
            <View style={{ flex: 1 }}>
              <T style={{ fontFamily: FONTS.semibold, fontSize: 18 }}>{course.shortName}</T>
              <T v="meta" tone="muted">
                {meta(course.id, course.code)}
              </T>
            </View>
          </Pressable>
        </Swipeable>
      ))}

      <Pressable accessibilityRole="button" onPress={() => router.push('/course/new')} style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Plus size={18} color={c.muted} />
        <T tone="muted">Course</T>
      </Pressable>

      {finished.length > 0 ? (
        <>
          <Gap h={20} />
          <Card onPress={() => router.push('/courses-finished')} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <T>Finished · {finished.length} {finished.length === 1 ? 'course' : 'courses'}</T>
            <ChevronRight size={18} color={c.muted} />
          </Card>
        </>
      ) : null}

      <Sheet visible={semSheet} onClose={() => setSemSheet(false)} title="Semester">
        <OptionList
          options={semesters.map((s) => ({ value: s.id, label: s.name, hint: s.status === 'archived' ? 'Archived' : undefined }))}
          value={semester?.id}
          onSelect={(id) => {
            useApp.getState().setActiveSemester(id);
            setSemSheet(false);
          }}
        />
        <Gap h={16} />
        {newSem === null ? (
          <View style={{ gap: 10 }}>
            <SmallButton title="New semester" onPress={() => setNewSem(defaultSemesterName())} />
            {semester && semester.status === 'active' ? (
              <SmallButton
                title={`Archive ${semester.name}`}
                onPress={() =>
                  Alert.alert(`Archive ${semester.name}?`, 'Its courses will be finished: no more alarms or prompts.', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Archive',
                      style: 'destructive',
                      onPress: () => {
                        archiveSemester(semester.id);
                        setSemSheet(false);
                      },
                    },
                  ])
                }
              />
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Input value={newSem} onChangeText={setNewSem} autoFocus accessibilityLabel="Semester name" />
            <PillButton
              title="Create"
              disabled={!newSem.trim()}
              onPress={() => {
                const y = new Date().getFullYear();
                createSemester(newSem.trim(), `${y}-01-01`, `${y}-12-31`);
                setNewSem(null);
                setSemSheet(false);
              }}
            />
          </View>
        )}
      </Sheet>
    </Screen>
  );
}
