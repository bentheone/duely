import React, { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import Constants from 'expo-constants';
import * as DuelyAlarm from 'duely-alarm';
import { clearCrash, lastCrash } from '@/lib/crash';
import { Gap, PillButton, Sheet, SmallButton, T } from './ui';

/**
 * After a crash (JS or native), the next launch shows what happened so the owner can
 * screenshot or share it — preview builds have no Metro log.
 */
export function CrashNotice() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    void (async () => {
      const parts: string[] = [];
      const js = lastCrash();
      if (js) parts.push(`JS (${js.where}) ${new Date(js.at).toISOString()}\n${js.message}\n${js.stack ?? ''}`);
      try {
        const native = await DuelyAlarm.consumeNativeCrash();
        if (native) parts.push(`Native\n${native}`);
      } catch {
        // module unavailable
      }
      if (parts.length) setText(`Duely ${Constants.expoConfig?.version ?? ''}\n\n${parts.join('\n\n')}`);
    })();
  }, []);
  const close = () => {
    clearCrash();
    setText(null);
  };
  return (
    <Sheet visible={!!text} onClose={close} title="Duely closed last time">
      <T tone="muted">Screenshot this or tap Share and send it to the developer.</T>
      <Gap h={12} />
      <View>
        <T v="small" selectable>
          {text}
        </T>
      </View>
      <Gap h={16} />
      <PillButton title="Share" onPress={() => void Share.share({ message: text ?? '' })} />
      <Gap h={8} />
      <SmallButton title="Dismiss" onPress={close} />
    </Sheet>
  );
}
