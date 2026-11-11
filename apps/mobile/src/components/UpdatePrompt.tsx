import React, { useEffect } from 'react';
import { Linking, View } from 'react-native';
import { Gap, PillButton, Sheet, SmallButton, T } from './ui';
import { checkForUpdate, dismissUpdate, useUpdates } from '@/lib/updates';
import { useApp } from '@/lib/store';

/** Once per new GitHub build: a quiet sheet offering the APK. */
export function UpdatePrompt() {
  const online = useApp((s) => s.online);
  const available = useUpdates((s) => s.available);
  const dismissed = useUpdates((s) => s.dismissedBuild);

  useEffect(() => {
    if (online) void checkForUpdate();
  }, [online]);

  const show = !!available && available.build > dismissed;
  if (!available) return null;
  return (
    <Sheet visible={show} onClose={() => dismissUpdate(available.build)} title="Update available">
      <View>
        <T tone="muted">
          {available.name}. Download the APK, open it and tap Update — your data stays.
        </T>
        {available.notes ? (
          <T v="small" tone="faint" style={{ marginTop: 10 }} numberOfLines={6}>
            {available.notes}
          </T>
        ) : null}
        <Gap h={20} />
        <PillButton
          title="Download update"
          onPress={() => {
            void Linking.openURL(available.apkUrl);
            dismissUpdate(available.build);
          }}
        />
        <Gap h={10} />
        <SmallButton title="Later" onPress={() => dismissUpdate(available.build)} />
      </View>
    </Sheet>
  );
}
