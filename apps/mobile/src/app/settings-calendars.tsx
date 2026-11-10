import { router } from 'expo-router';
import { CalendarPicker } from '@/features/CalendarPicker';

export default function SettingsCalendars() {
  return <CalendarPicker back onDone={() => router.back()} />;
}
