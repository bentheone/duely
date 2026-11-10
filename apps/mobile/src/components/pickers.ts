import { Platform } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { zonedParts, zonedTime } from '@duely/shared';

/**
 * Native Android date → time dialogs, returning epoch ms interpreted in the user's timezone.
 * Resolves null if cancelled.
 */
export function pickDateTime(initial: number, tz: string, opts: { withTime?: boolean; defaultTime?: string } = {}): Promise<number | null> {
  const withTime = opts.withTime ?? true;
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') {
      resolve(initial);
      return;
    }
    const p = zonedParts(initial, tz);
    // The dialog works in device-local time; feed it a Date showing the same wall clock.
    const shown = new Date(p.year, p.month - 1, p.day, p.hour, p.minute);
    DateTimePickerAndroid.open({
      value: shown,
      mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return resolve(null);
        const y = d.getFullYear();
        const mo = d.getMonth() + 1;
        const day = d.getDate();
        if (!withTime) {
          const [h, m] = (opts.defaultTime ?? '23:59').split(':').map(Number);
          return resolve(zonedTime(tz, y, mo, day, h ?? 23, m ?? 59));
        }
        DateTimePickerAndroid.open({
          value: shown,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, t) => {
            if (e2.type !== 'set' || !t) return resolve(zonedTime(tz, y, mo, day, p.hour, p.minute));
            resolve(zonedTime(tz, y, mo, day, t.getHours(), t.getMinutes()));
          },
        });
      },
    });
  });
}

export function pickTime(initial: number, tz: string): Promise<number | null> {
  return new Promise((resolve) => {
    if (Platform.OS !== 'android') return resolve(initial);
    const p = zonedParts(initial, tz);
    DateTimePickerAndroid.open({
      value: new Date(p.year, p.month - 1, p.day, p.hour, p.minute),
      mode: 'time',
      is24Hour: true,
      onChange: (e, t) => {
        if (e.type !== 'set' || !t) return resolve(null);
        resolve(zonedTime(tz, p.year, p.month, p.day, t.getHours(), t.getMinutes()));
      },
    });
  });
}
