import React from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { QuickAdd, type StagedFile } from '@/features/QuickAdd';
import type { QuickAddValues } from '@/features/useQuickAdd';
import { createAssignment, createExam, logMissed } from '@/features/actions';
import { useCourses } from '@/lib/db/queries';
import { addLocalFile, pickFilesToStage, scanToPdfFile } from '@/lib/files';
import { useSettings, useTz } from '@/lib/store';

/** Full-screen modal from +, widget (duely://quick-add) and class-end notifications. Saves offline. */
export default function QuickAddScreen() {
  const { courseId, classSessionId } = useLocalSearchParams<{ courseId?: string; classSessionId?: string }>();
  const { active } = useCourses();
  const tz = useTz();
  const settings = useSettings();

  async function onSave(v: QuickAddValues, files: StagedFile[]) {
    if (!v.courseId) return;
    let owner: { type: 'assignment' | 'exam'; id: string };
    if (v.mode === 'exam') {
      const e = createExam({ courseId: v.courseId, type: v.examType, startsAt: v.dueAt!, room: v.room?.trim() || null, notes: v.title && v.title !== 'Exam' ? v.title : '' });
      owner = { type: 'exam', id: e.id };
    } else {
      const a = createAssignment({
        courseId: v.courseId,
        title: v.title.trim(),
        dueAt: v.dueAt ?? null,
        kind: v.kind,
        submission: v.submission,
        reminderOffsets: v.reminderOffsets,
        group: v.kind === 'group' ? { members: [], meetings: [], myPart: null, chatLink: null } : null,
      });
      owner = { type: 'assignment', id: a.id };
    }
    for (const f of files) await addLocalFile(owner, f);
    if (courseId) logMissed(v.courseId, 'added', classSessionId);
    if (router.canGoBack()) router.back();
    else router.replace('/today');
  }

  return (
    <QuickAdd
      courses={active}
      tz={tz}
      defaultOffsets={settings.reminders.dueOffsets}
      prefillCourseId={courseId || undefined}
      onSave={onSave}
      pickFiles={pickFilesToStage}
      scan={scanToPdfFile}
    />
  );
}
