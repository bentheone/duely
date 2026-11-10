import { router } from 'expo-router';
import { StorageSetup } from '@/features/StorageSetup';

export default function OnboardingStorage() {
  return <StorageSetup onDone={() => router.replace('/onboarding/permissions')} />;
}
