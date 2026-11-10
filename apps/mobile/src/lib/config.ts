import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

export const API_URL = (extra.API_URL ?? 'http://10.0.2.2:3000').replace(/\/$/, '');
export const GOOGLE_WEB_CLIENT_ID = extra.GOOGLE_WEB_CLIENT_ID ?? '';

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks',
];
/** Requested incrementally, only if the user picks Drive storage (§7.1). */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
