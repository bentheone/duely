import { useQuery } from '@tanstack/react-query';
import type { Community } from '@duely/shared';
import { api } from './api';
import { useApp } from './store';

/** My communities (with unread counts); refreshed after syncs and when a community is opened. */
export function useCommunities(enabled = true) {
  const online = useApp((s) => s.online);
  return useQuery({ queryKey: ['communities'], queryFn: () => api<Community[]>('/communities'), enabled: enabled && online, staleTime: 60_000 });
}
