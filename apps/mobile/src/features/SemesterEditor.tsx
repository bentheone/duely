import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { MONTH_SHORT, zonedParts, type Semester } from '@duely/shared';
import { FieldRow, Gap, Input, PillButton, Sheet, SmallButton, T } from '@/components/ui';
import { pickDateTime } from '@/components/pickers';
import { createSemester, defaultSemesterName } from './actions';
import { snapshot } from '@/lib/db/queries';
import { remove, save } from '@/lib/db/repo';
import { useApp, useTz } from '@/lib/store';

const iso = (t: number, tz: string) => {
  const p = zonedParts(t, tz);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
};
const label = (d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${+d.slice(8, 10)} ${MONTH_SHORT[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : 'Pick');
const noon = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), 12);

/** Create or edit a semester: name, start and end dates; delete when it has no courses. */
export function SemesterEditor({ visible, onClose, semester }: { visible: boolean; onClose: () => void; semester: Semester | null }) {
  const tz = useTz();
  const [name, setName] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');

  useEffect(() => {
    if (!visible) return;
    const y = new Date().getFullYear();
    setName(semester?.name ?? defaultSemesterName());
    setStartsOn(semester?.startsOn ?? `${y}-09-01`);
    setEndsOn(semester?.endsOn ?? `${y}-12-20`);
  }, [visible, semester]);

  const empty = semester ? !snapshot().courses.some((c) => c.semesterId === semester.id) : false;
  const valid = name.trim() && startsOn && endsOn && startsOn <= endsOn;

  const pick = async (which: 'start' | 'end') => {
    const cur = which === 'start' ? startsOn : endsOn;
    const t = await pickDateTime(/^\d{4}/.test(cur) ? noon(cur) : Date.now(), tz, { withTime: false });
    if (!t) return;
    (which === 'start' ? setStartsOn : setEndsOn)(iso(t, tz));
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={semester ? 'Edit semester' : 'New semester'}>
      <View style={{ gap: 4 }}>
        <Input value={name} onChangeText={setName} accessibilityLabel="Semester name" maxLength={80} />
        <Gap h={4} />
        <FieldRow label="Starts" value={label(startsOn)} onPress={() => void pick('start')} />
        <FieldRow label="Ends" value={label(endsOn)} onPress={() => void pick('end')} />
        {startsOn > endsOn ? (
          <T v="small" tone="danger">
            The end is before the start.
          </T>
        ) : null}
      </View>
      <Gap h={20} />
      <PillButton
        title={semester ? 'Save' : 'Create'}
        disabled={!valid}
        onPress={() => {
          if (semester) save('semesters', { id: semester.id, name: name.trim(), startsOn, endsOn });
          else createSemester(name.trim(), startsOn, endsOn, true);
          onClose();
        }}
      />
      {semester && empty ? (
        <>
          <Gap h={12} />
          <SmallButton
            title="Delete semester"
            onPress={() =>
              Alert.alert(`Delete ${semester.name}?`, 'It has no courses.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => {
                    remove('semesters', semester.id);
                    const next = snapshot().semesters.filter((s) => s.id !== semester.id && s.status === 'active').pop();
                    useApp.getState().setActiveSemester(next?.id ?? null, true);
                    onClose();
                  },
                },
              ])
            }
          />
        </>
      ) : semester ? (
        <T v="small" tone="faint" style={{ marginTop: 12 }}>
          Only empty semesters can be deleted — finish or move its courses first.
        </T>
      ) : null}
    </Sheet>
  );
}
