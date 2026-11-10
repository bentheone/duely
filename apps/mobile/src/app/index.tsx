import { Redirect } from 'expo-router';
import { useApp } from '@/lib/store';

/** Gate: sign-in → onboarding → Today. */
export default function Index() {
  const signedIn = useApp((s) => s.signedIn);
  const onboarded = useApp((s) => s.onboarded);
  if (!signedIn) return <Redirect href="/onboarding" />;
  if (!onboarded) return <Redirect href="/onboarding/calendars" />;
  return <Redirect href="/today" />;
}
