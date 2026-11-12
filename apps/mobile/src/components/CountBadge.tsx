import React from 'react';
import { View } from 'react-native';
import { T } from './ui';
import { FONTS } from '@/lib/theme';

/** Small accent count (unread community posts). Uses the logo's orange. */
export function CountBadge({ n, small }: { n: number; small?: boolean }) {
  const size = small ? 16 : 20;
  return (
    <View
      accessibilityLabel={`${n} new`}
      style={{ minWidth: size, height: size, borderRadius: size / 2, paddingHorizontal: n > 9 ? 5 : 0, backgroundColor: '#EA580C', alignItems: 'center', justifyContent: 'center' }}
    >
      <T style={{ fontFamily: FONTS.semibold, fontSize: small ? 10 : 12, lineHeight: small ? 14 : 16 }} color="#FFFFFF">
        {n > 99 ? '99+' : n}
      </T>
    </View>
  );
}
