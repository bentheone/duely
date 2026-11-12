import React, { useEffect, useMemo, useState } from 'react';
import { router } from 'expo-router';
import { TodayView } from '@/features/TodayView';
import { buildToday } from '@/features/today';
import { logMissed } from '@/features/actions';
import { useAllCourses, useAssignments, useClassSessions, useExams, useMissedChecks, useSessions } from '@/lib/db/queries';
import { useApp, useTz } from '@/lib/store';
import { syncNow } from '@/lib/sync/engine';

/** Home screen: Today. */
export default function Today() {
  const tz = useTz();
  const user = useApp((s) => s.user);
  const syncError = useApp((s) => s.syncError);
  const courses = useAllCourses();
  const classSessions = useClassSessions();
  const sessions = useSessions();
  const assignments = useAssignments();
  const exams = useExams();
  const missedChecks = useMissedChecks();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const { items, classEnded } = useMemo(
    () => buildToday({ now, tz, courses, classSessions, sessions, assignments, exams, missedChecks }),
    [now, tz, courses, classSessions, sessions, assignments, exams, missedChecks],
  );

  return (
    <TodayView
      now={now}
      tz={tz}
      items={items}
      classEnded={classEnded}
      avatarUrl={user?.avatarUrl}
      initial={user?.name?.slice(0, 1)}
      status={syncError === 'offline' ? 'Offline — changes are saved on this phone' : syncError ? 'Sync paused — pull to retry' : null}
      onRefresh={() => syncNow({ forceGoogle: true })}
      onOpen={(href) => router.push(href as never)}
      onAvatar={() => router.push('/courses')}
      onCalendar={() => router.push('/calendar')}
      onAdd={(courseId, classSessionId) => router.push({ pathname: '/quick-add', params: { courseId, classSessionId } })}
      onNo={(courseId, classSessionId) => logMissed(courseId, 'none', classSessionId)}
    />
  );
}
