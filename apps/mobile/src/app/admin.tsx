import React, { useState } from 'react';
import { Alert, Linking, Pressable, Share, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatShortDate, type AccessRequest, type FeedbackItem } from '@duely/shared';
import { Gap, OptionList, Screen, Segmented, Sheet, SmallButton, T } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useApp, useTz } from '@/lib/store';
import { useTheme } from '@/lib/theme';

const TEST_USERS_URL = 'https://console.cloud.google.com/auth/audience';

interface Summary {
  pendingRequests: number;
  unreadFeedback: number;
  emailConfigured: boolean;
}

/** Admin dashboard (owner / ADMIN_EMAILS): tester access requests + feedback. Same quiet style as Settings. */
export default function Admin() {
  const isAdmin = useApp((s) => !!s.user?.isAdmin);
  const [tab, setTab] = useState<'requests' | 'feedback'>('requests');
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['admin', 'summary'], queryFn: () => api<Summary>('/admin/summary'), enabled: isAdmin });
  const requests = useQuery({ queryKey: ['admin', 'requests'], queryFn: () => api<AccessRequest[]>('/admin/access-requests'), enabled: isAdmin });
  const feedback = useQuery({ queryKey: ['admin', 'feedback'], queryFn: () => api<FeedbackItem[]>('/admin/feedback'), enabled: isAdmin });

  if (!isAdmin) return <Redirect href="/courses" />;

  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });
  const refreshing = summary.isFetching || requests.isFetching || feedback.isFetching;
  const s = summary.data;

  return (
    <Screen back onRefresh={refresh} refreshing={refreshing}>
      <T v="display">Admin</T>
      <Gap h={8} />
      <T tone="muted">{s ? `${s.pendingRequests} waiting · ${s.unreadFeedback} unread` : ' '}</T>
      {s && !s.emailConfigured ? (
        <T v="small" tone="danger" style={{ marginTop: 8 }}>
          Email isn’t set up — add SMTP_HOST, SMTP_USER and SMTP_PASS on the server to notify testers.
        </T>
      ) : null}
      <Gap h={24} />
      <Segmented
        options={[
          { value: 'requests', label: 'Testers' },
          { value: 'feedback', label: 'Feedback' },
        ]}
        value={tab}
        onChange={setTab}
      />
      <Gap h={20} />
      {tab === 'requests' ? (
        <Requests items={requests.data} loading={requests.isLoading} error={requests.error} />
      ) : (
        <Feedback items={feedback.data} loading={feedback.isLoading} error={feedback.error} />
      )}
    </Screen>
  );
}

const STATUS_LABEL: Record<AccessRequest['status'], string> = {
  pending: 'Waiting',
  added: 'Added',
  notified: 'Notified',
  dismissed: 'Dismissed',
};

function Requests({ items, loading, error }: { items?: AccessRequest[]; loading: boolean; error: unknown }) {
  const tz = useTz();
  const { c } = useTheme();
  const qc = useQueryClient();
  const [open, setOpen] = useState<AccessRequest | null>(null);
  const done = () => {
    setOpen(null);
    void qc.invalidateQueries({ queryKey: ['admin'] });
  };
  const notify = useMutation({
    mutationFn: (id: string) => api<AccessRequest>(`/admin/access-requests/${id}/notify`, { method: 'POST' }),
    onSuccess: done,
    onError: (e) => Alert.alert('Couldn’t send', e instanceof ApiError ? e.message : 'Check your connection.'),
  });
  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AccessRequest['status'] }) =>
      api<AccessRequest>(`/admin/access-requests/${id}`, { method: 'PATCH', body: { status } }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/access-requests/${id}`, { method: 'DELETE' }),
    onSuccess: done,
  });

  if (loading) return <T tone="muted">Loading…</T>;
  if (error) return <T tone="danger">{(error as Error).message}</T>;
  const waiting = (items ?? []).filter((r) => r.status === 'pending' || r.status === 'added');
  const rest = (items ?? []).filter((r) => r.status === 'notified' || r.status === 'dismissed');
  if (!waiting.length && !rest.length) return <T tone="muted">No requests yet.</T>;

  const row = (r: AccessRequest) => (
    <Pressable
      key={r.id}
      accessibilityRole="button"
      accessibilityLabel={`${r.email}, ${STATUS_LABEL[r.status]}`}
      onPress={() => setOpen(r)}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingVertical: 10, gap: 12, opacity: pressed ? 0.6 : 1 })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <T v="item" numberOfLines={1} tone={r.status === 'dismissed' ? 'faint' : undefined}>
          {r.email}
        </T>
        <T v="meta" tone="muted" numberOfLines={1}>
          {[r.name, formatShortDate(r.updatedAt, tz), r.requests > 1 ? `asked ${r.requests}×` : null].filter(Boolean).join(' · ')}
        </T>
      </View>
      <T v="small" color={r.status === 'pending' ? c.danger : c.muted}>
        {STATUS_LABEL[r.status]}
      </T>
    </Pressable>
  );

  return (
    <View>
      {waiting.map(row)}
      {rest.length ? (
        <>
          <Gap h={20} />
          <T v="small" tone="muted">
            Done
          </T>
          {rest.map(row)}
        </>
      ) : null}

      <Sheet visible={!!open} onClose={() => setOpen(null)} title={open?.email}>
        {open ? (
          <View>
            <T tone="muted">
              1. Add this email in Google Cloud → Audience → Test users.{'\n'}2. Tap Notify — they get a “You’re in” email.
            </T>
            <Gap h={16} />
            <OptionList
              options={[
                { value: 'copy', label: 'Share / copy email' },
                { value: 'console', label: 'Open Google Cloud test users' },
                { value: 'notify', label: open.notifiedAt ? 'Notify again' : 'Notify — they’re added', hint: open.notifiedAt ? `Sent ${formatShortDate(open.notifiedAt, tz)}` : undefined },
                ...(open.status !== 'added' && open.status !== 'notified' ? [{ value: 'added', label: 'Mark added (no email)' }] : []),
                ...(open.status !== 'dismissed' ? [{ value: 'dismiss', label: 'Dismiss' }] : []),
                { value: 'delete', label: 'Delete' },
              ]}
              onSelect={(v) => {
                if (v === 'copy') void Share.share({ message: open.email });
                else if (v === 'console') void Linking.openURL(TEST_USERS_URL);
                else if (v === 'notify')
                  Alert.alert('Send “You’re in” email?', `Only if ${open.email} is already a test user in Google Cloud.`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Send', onPress: () => notify.mutate(open.id) },
                  ]);
                else if (v === 'added') setStatus.mutate({ id: open.id, status: 'added' });
                else if (v === 'dismiss') setStatus.mutate({ id: open.id, status: 'dismissed' });
                else if (v === 'delete') remove.mutate(open.id);
              }}
            />
            {notify.isPending ? (
              <T v="small" tone="muted" style={{ marginTop: 8 }}>
                Sending…
              </T>
            ) : null}
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const KIND_LABEL: Record<FeedbackItem['kind'], string> = { bug: 'Bug', idea: 'Idea', other: 'Other' };

function Feedback({ items, loading, error }: { items?: FeedbackItem[]; loading: boolean; error: unknown }) {
  const tz = useTz();
  const { c } = useTheme();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState<string | null>(null);
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/admin/feedback/${id}`, { method: 'PATCH', body: { read: true } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
  });

  if (loading) return <T tone="muted">Loading…</T>;
  if (error) return <T tone="danger">{(error as Error).message}</T>;
  if (!items?.length) return <T tone="muted">No feedback yet.</T>;

  return (
    <View>
      {items.map((f) => {
        const isOpen = expanded === f.id;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            onPress={() => {
              setExpanded(isOpen ? null : f.id);
              if (!f.read) markRead.mutate(f.id);
            }}
            style={({ pressed }) => ({ paddingVertical: 14, gap: 6, opacity: pressed ? 0.7 : 1, borderBottomWidth: 0.5, borderBottomColor: c.border })}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {!f.read ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger }} /> : null}
              <T v="small" tone={f.kind === 'bug' ? 'danger' : 'muted'}>
                {KIND_LABEL[f.kind]}
              </T>
              <T v="small" tone="faint" style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
                {formatShortDate(f.createdAt, tz)}
              </T>
            </View>
            <T v="body" numberOfLines={isOpen ? undefined : 3} selectable={isOpen}>
              {f.message}
            </T>
            <T v="meta" tone="muted" numberOfLines={1} selectable={isOpen}>
              {[f.name || f.email, isOpen ? f.email : null, f.appVersion ? `v${f.appVersion}` : null, isOpen ? f.device : null].filter(Boolean).join(' · ')}
            </T>
            {isOpen && f.email ? (
              <View style={{ flexDirection: 'row', marginTop: 6 }}>
                <SmallButton title="Reply by email" onPress={() => void Linking.openURL(`mailto:${f.email}?subject=${encodeURIComponent('Your Duely feedback')}`)} />
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
