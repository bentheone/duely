import React from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { useApp } from '@/lib/store';
import { IconButton, T } from './ui';

/** Avatar in the top-right of the main tabs → profile (courses, feedback, settings). Same as Today's. */
export function ProfileButton() {
  const avatarUrl = useApp((s) => s.user?.avatarUrl);
  const initial = useApp((s) => s.user?.name?.slice(0, 1));
  return (
    <IconButton label="Courses and settings" onPress={() => router.push('/courses')}>
      {avatarUrl ? <Image source={{ uri: avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} /> : <T v="item">{initial ?? '·'}</T>}
    </IconButton>
  );
}

/** Screen title with the profile button aligned to the right (Assignments, Calendar, Exams). */
export function TitleRow({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
      <View style={{ flex: 1 }}>{children}</View>
      <ProfileButton />
    </View>
  );
}
