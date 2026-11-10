import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { StorageSetup } from '@/features/StorageSetup';

export default function SettingsStorage() {
  const qc = useQueryClient();
  return (
    <StorageSetup
      back
      onDone={() => {
        void qc.invalidateQueries({ queryKey: ['storage'] });
        router.back();
      }}
    />
  );
}
