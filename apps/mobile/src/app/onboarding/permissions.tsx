import React from 'react';
import { router } from 'expo-router';
import { Gap, PillButton, Screen, T } from '@/components/ui';
import { PermissionRows } from '@/features/Permissions';
import { useApp } from '@/lib/store';
import { refreshDerived } from '@/lib/derived';

export default function OnboardingPermissions() {
  return (
    <Screen
      footer={
        <PillButton
          title="Done"
          onPress={() => {
            useApp.getState().setOnboarded(true);
            refreshDerived(0);
            router.replace('/today');
          }}
        />
      }
    >
      <T v="display">Alarms</T>
      <Gap h={8} />
      <T tone="muted">A full-screen alarm 30 min before every class — even on silent.</T>
      <Gap h={28} />
      <PermissionRows />
    </Screen>
  );
}
