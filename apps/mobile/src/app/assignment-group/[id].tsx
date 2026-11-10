import React, { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { MessageCircle, Phone, X } from 'lucide-react-native';
import { formatDue, formatHHMM, type GroupInfo } from '@duely/shared';
import { Gap, IconButton, Input, PillButton, Screen, SmallButton, T } from '@/components/ui';
import { pickDateTime } from '@/components/pickers';
import { getRecord, save } from '@/lib/db/repo';
import { useTz } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const digits = (s: string) => s.replace(/[^\d+]/g, '');

/** Group records (v1, records only): members + WhatsApp/phone, my part, meetings, chat link. */
export default function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const tz = useTz();
  const a = getRecord('assignments', id);
  const [g, setG] = useState<GroupInfo>(a?.group ?? { members: [], meetings: [], myPart: '', chatLink: '' });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [place, setPlace] = useState('');
  const now = Date.now();
  if (!a) return <Screen back>{null}</Screen>;

  return (
    <Screen
      back
      footer={
        <PillButton
          title="Save"
          onPress={() => {
            save('assignments', { id: a.id, group: g, kind: 'group' });
            router.back();
          }}
        />
      }
    >
      <T v="display">Group</T>
      <Gap h={24} />
      {g.members.map((m, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 }}>
          <View style={{ flex: 1 }}>
            <T v="item">
              {m.name}
              {m.isMe ? ' (me)' : ''}
            </T>
            {m.phone ? <T v="small" tone="muted">{m.phone}</T> : null}
          </View>
          {m.whatsapp || m.phone ? (
            <IconButton label={`WhatsApp ${m.name}`} onPress={() => void Linking.openURL(`https://wa.me/${digits(m.whatsapp || m.phone || '').replace('+', '')}`)}>
              <MessageCircle size={18} color={c.text} />
            </IconButton>
          ) : null}
          {m.phone ? (
            <IconButton label={`Call ${m.name}`} onPress={() => void Linking.openURL(`tel:${digits(m.phone!)}`)}>
              <Phone size={18} color={c.text} />
            </IconButton>
          ) : null}
          <Pressable accessibilityLabel={`Remove ${m.name}`} hitSlop={10} onPress={() => setG({ ...g, members: g.members.filter((_, j) => j !== i) })}>
            <X size={18} color={c.muted} />
          </Pressable>
        </View>
      ))}
      <View style={{ gap: 8, marginTop: 8 }}>
        <Input placeholder="Name" value={name} onChangeText={setName} accessibilityLabel="Member name" />
        <Input placeholder="Phone / WhatsApp" value={phone} onChangeText={setPhone} keyboardType="phone-pad" accessibilityLabel="Member phone" />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <SmallButton
            title="Add member"
            onPress={() => {
              if (!name.trim()) return;
              setG({ ...g, members: [...g.members, { name: name.trim(), phone: phone.trim() || null, whatsapp: phone.trim() || null, isMe: false }] });
              setName('');
              setPhone('');
            }}
          />
          {!g.members.some((m) => m.isMe) ? (
            <SmallButton title="Add me" onPress={() => setG({ ...g, members: [{ name: 'Me', isMe: true, phone: null, whatsapp: null }, ...g.members] })} />
          ) : null}
        </View>
      </View>

      <Gap h={28} />
      <T v="heading">My part</T>
      <Gap h={8} />
      <Input value={g.myPart ?? ''} onChangeText={(t) => setG({ ...g, myPart: t })} multiline placeholder="What I’m doing" accessibilityLabel="My part" />

      <Gap h={28} />
      <T v="heading">Meetings</T>
      <Gap h={8} />
      {g.meetings
        .slice()
        .sort((x, y) => x.at - y.at)
        .map((m, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 48, gap: 10 }}>
            <T style={{ flex: 1 }} tone={m.at < now ? 'faint' : undefined}>
              {formatDue(m.at, now, tz)} {formatHHMM(m.at, tz)}
              {m.place ? ` · ${m.place}` : ''}
            </T>
            <Pressable accessibilityLabel="Remove meeting" hitSlop={10} onPress={() => setG({ ...g, meetings: g.meetings.filter((x) => x !== m) })}>
              <X size={18} color={c.muted} />
            </Pressable>
          </View>
        ))}
      <Input placeholder="Place (optional)" value={place} onChangeText={setPlace} accessibilityLabel="Meeting place" />
      <Gap h={8} />
      <SmallButton
        title="Add meeting"
        onPress={async () => {
          const t = await pickDateTime(now + 24 * 3600_000, tz);
          if (!t) return;
          setG({ ...g, meetings: [...g.meetings, { at: t, place: place.trim() || null }] });
          setPlace('');
        }}
      />

      <Gap h={28} />
      <T v="heading">Chat link</T>
      <Gap h={8} />
      <Input value={g.chatLink ?? ''} onChangeText={(t) => setG({ ...g, chatLink: t })} placeholder="https://chat.whatsapp.com/…" autoCapitalize="none" accessibilityLabel="Group chat link" />
      {g.chatLink ? (
        <Pressable onPress={() => void Linking.openURL(g.chatLink!)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T color={c.suggestion}>Open group chat</T>
        </Pressable>
      ) : null}
    </Screen>
  );
}
