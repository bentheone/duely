import { router } from 'expo-router';
import { CalendarPicker } from '@/features/CalendarPicker';

export default function OnboardingCalendars() {
  return <CalendarPicker onDone={() => router.replace('/onboarding/courses')} />;
}
