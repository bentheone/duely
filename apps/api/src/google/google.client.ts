import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { calendar as calendarApi } from '@googleapis/calendar';
import { tasks as tasksApi } from '@googleapis/tasks';
import { drive as driveApi } from '@googleapis/drive';
import type { Interval } from '@duely/shared';
import { config } from '../config';
import { decrypt } from '../common/crypto';
import type { IntegrationAccountDoc } from '../db/models';

export interface GEvent {
  id: string;
  status?: string; // 'confirmed' | 'cancelled'
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: number | null;
  end?: number | null;
  recurringEventId?: string | null;
  colorId?: string | null;
  duelySessionId?: string | null;
}

export interface GTask {
  id: string;
  title?: string | null;
  notes?: string | null;
  status?: 'needsAction' | 'completed' | string | null;
  due?: string | null;
  parent?: string | null;
  deleted?: boolean | null;
  updated?: string | null;
}

/** The slice of Google APIs Duely uses — mocked in tests. */
export interface GoogleApi {
  listCalendars(): Promise<{ id: string; summary: string; primary: boolean; backgroundColor?: string }[]>;
  createCalendar(summary: string, timeZone: string): Promise<string>;
  listEvents(calendarId: string, timeMin: number, timeMax: number): Promise<GEvent[]>;
  syncEvents(
    calendarId: string,
    syncToken: string | null,
    timeMin: number,
  ): Promise<{ events: GEvent[]; nextSyncToken: string | null; tokenExpired?: boolean }>;
  insertEvent(calendarId: string, ev: Omit<GEvent, 'id'>, tz: string): Promise<GEvent>;
  patchEvent(calendarId: string, eventId: string, ev: Partial<GEvent>, tz: string): Promise<GEvent>;
  deleteEvent(calendarId: string, eventId: string): Promise<void>;
  freeBusy(calendarIds: string[], timeMin: number, timeMax: number, tz: string): Promise<Interval[]>;
  listTaskLists(): Promise<{ id: string; title: string }[]>;
  createTaskList(title: string): Promise<string>;
  listTasks(listId: string, updatedMin: number | null): Promise<GTask[]>;
  insertTask(listId: string, task: Omit<GTask, 'id'>, parent?: string): Promise<GTask>;
  patchTask(listId: string, taskId: string, patch: Partial<GTask>): Promise<GTask>;
  deleteTask(listId: string, taskId: string): Promise<void>;
  createDriveFolder(name: string): Promise<string>;
  createResumableUpload(folderId: string, name: string, mime: string, size: number): Promise<string>;
  accessToken(): Promise<string>;
}

export const GOOGLE_API_FACTORY = Symbol('GOOGLE_API_FACTORY');
export interface GoogleApiFactory {
  forAccount(acc: IntegrationAccountDoc): GoogleApi;
}

const toMs = (d?: { dateTime?: string | null; date?: string | null } | null): number | null => {
  if (!d) return null;
  if (d.dateTime) return Date.parse(d.dateTime);
  if (d.date) return Date.parse(`${d.date}T00:00:00Z`);
  return null;
};

function eventFromApi(e: {
  id?: string | null;
  status?: string | null;
  summary?: string | null;
  description?: string | null;
  location?: string | null;
  start?: { dateTime?: string | null; date?: string | null } | null;
  end?: { dateTime?: string | null; date?: string | null } | null;
  recurringEventId?: string | null;
  colorId?: string | null;
  extendedProperties?: { private?: Record<string, string> | null } | null;
}): GEvent {
  return {
    id: e.id ?? '',
    status: e.status ?? undefined,
    summary: e.summary,
    description: e.description,
    location: e.location,
    start: toMs(e.start),
    end: toMs(e.end),
    recurringEventId: e.recurringEventId,
    colorId: e.colorId,
    duelySessionId: e.extendedProperties?.private?.duelySessionId ?? null,
  };
}

function eventToApi(ev: Partial<GEvent>, tz: string) {
  return {
    summary: ev.summary ?? undefined,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    colorId: ev.colorId ?? undefined,
    start: ev.start != null ? { dateTime: new Date(ev.start).toISOString(), timeZone: tz } : undefined,
    end: ev.end != null ? { dateTime: new Date(ev.end).toISOString(), timeZone: tz } : undefined,
    extendedProperties: ev.duelySessionId ? { private: { duelySessionId: ev.duelySessionId } } : undefined,
  };
}

export function oauthClient(): OAuth2Client {
  const c = config();
  return new OAuth2Client({ clientId: c.googleClientId, clientSecret: c.googleClientSecret });
}

class RealGoogleApi implements GoogleApi {
  private readonly cal;
  private readonly tasks;
  private readonly drive;
  constructor(private readonly auth: OAuth2Client) {
    // googleapis-common may resolve a different google-auth-library copy; the runtime contract is identical.
    const a = auth as never;
    this.cal = calendarApi({ version: 'v3', auth: a });
    this.tasks = tasksApi({ version: 'v1', auth: a });
    this.drive = driveApi({ version: 'v3', auth: a });
  }

  async accessToken(): Promise<string> {
    const t = await this.auth.getAccessToken();
    if (!t.token) throw new Error('No Google access token');
    return t.token;
  }

  async listCalendars() {
    const out: { id: string; summary: string; primary: boolean; backgroundColor?: string }[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.cal.calendarList.list({ pageToken, maxResults: 250 });
      for (const c of r.data.items ?? [])
        out.push({
          id: c.id!,
          summary: c.summaryOverride ?? c.summary ?? c.id!,
          primary: !!c.primary,
          backgroundColor: c.backgroundColor ?? undefined,
        });
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  async createCalendar(summary: string, timeZone: string) {
    const r = await this.cal.calendars.insert({ requestBody: { summary, timeZone } });
    return r.data.id!;
  }

  async listEvents(calendarId: string, timeMin: number, timeMax: number) {
    const out: GEvent[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.cal.events.list({
        calendarId,
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
        pageToken,
      });
      out.push(...(r.data.items ?? []).map(eventFromApi));
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  async syncEvents(calendarId: string, syncToken: string | null, timeMin: number) {
    const out: GEvent[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;
    try {
      do {
        const r = await this.cal.events.list({
          calendarId,
          syncToken: syncToken ?? undefined,
          timeMin: syncToken ? undefined : new Date(timeMin).toISOString(),
          showDeleted: true,
          singleEvents: true,
          maxResults: 2500,
          pageToken,
        });
        out.push(...(r.data.items ?? []).map(eventFromApi));
        pageToken = r.data.nextPageToken ?? undefined;
        nextSyncToken = r.data.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
    } catch (e) {
      if ((e as { code?: number }).code === 410) return { events: [], nextSyncToken: null, tokenExpired: true };
      throw e;
    }
    return { events: out, nextSyncToken };
  }

  async insertEvent(calendarId: string, ev: Omit<GEvent, 'id'>, tz: string) {
    const r = await this.cal.events.insert({ calendarId, requestBody: eventToApi(ev, tz) });
    return eventFromApi(r.data);
  }

  async patchEvent(calendarId: string, eventId: string, ev: Partial<GEvent>, tz: string) {
    const r = await this.cal.events.patch({ calendarId, eventId, requestBody: eventToApi(ev, tz) });
    return eventFromApi(r.data);
  }

  async deleteEvent(calendarId: string, eventId: string) {
    try {
      await this.cal.events.delete({ calendarId, eventId });
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code !== 404 && code !== 410) throw e;
    }
  }

  async freeBusy(calendarIds: string[], timeMin: number, timeMax: number, tz: string) {
    if (calendarIds.length === 0) return [];
    const r = await this.cal.freebusy.query({
      requestBody: {
        timeMin: new Date(timeMin).toISOString(),
        timeMax: new Date(timeMax).toISOString(),
        timeZone: tz,
        items: calendarIds.map((id) => ({ id })),
      },
    });
    const out: Interval[] = [];
    for (const c of Object.values(r.data.calendars ?? {}))
      for (const b of c.busy ?? []) out.push({ start: Date.parse(b.start!), end: Date.parse(b.end!) });
    return out;
  }

  async listTaskLists() {
    const r = await this.tasks.tasklists.list({ maxResults: 100 });
    return (r.data.items ?? []).map((l) => ({ id: l.id!, title: l.title ?? '' }));
  }

  async createTaskList(title: string) {
    const r = await this.tasks.tasklists.insert({ requestBody: { title } });
    return r.data.id!;
  }

  async listTasks(listId: string, updatedMin: number | null) {
    const out: GTask[] = [];
    let pageToken: string | undefined;
    do {
      const r = await this.tasks.tasks.list({
        tasklist: listId,
        updatedMin: updatedMin ? new Date(updatedMin).toISOString() : undefined,
        showCompleted: true,
        showHidden: true,
        showDeleted: true,
        maxResults: 100,
        pageToken,
      });
      for (const t of r.data.items ?? [])
        out.push({
          id: t.id!,
          title: t.title,
          notes: t.notes,
          status: t.status,
          due: t.due,
          parent: t.parent,
          deleted: t.deleted,
          updated: t.updated,
        });
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  }

  async insertTask(listId: string, task: Omit<GTask, 'id'>, parent?: string) {
    const r = await this.tasks.tasks.insert({
      tasklist: listId,
      parent,
      requestBody: { title: task.title, notes: task.notes, due: task.due, status: task.status ?? 'needsAction' },
    });
    return { id: r.data.id!, updated: r.data.updated, status: r.data.status };
  }

  async patchTask(listId: string, taskId: string, patch: Partial<GTask>) {
    const body: Record<string, unknown> = {};
    for (const k of ['title', 'notes', 'due', 'status'] as const) if (k in patch) body[k] = patch[k];
    if (patch.status === 'needsAction') body.completed = null;
    const r = await this.tasks.tasks.patch({ tasklist: listId, task: taskId, requestBody: body });
    return { id: r.data.id!, updated: r.data.updated, status: r.data.status };
  }

  async deleteTask(listId: string, taskId: string) {
    try {
      await this.tasks.tasks.delete({ tasklist: listId, task: taskId });
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e;
    }
  }

  async createDriveFolder(name: string) {
    const r = await this.drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    return r.data.id!;
  }

  /** Resumable upload session (§9.2); the device PUTs the bytes straight to the returned URL. */
  async createResumableUpload(folderId: string, name: string, mime: string, size: number) {
    const token = await this.accessToken();
    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,size', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': mime,
        'X-Upload-Content-Length': String(size),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    });
    const url = res.headers.get('location');
    if (!res.ok || !url) throw new Error(`Drive session failed (${res.status})`);
    return url;
  }
}

@Injectable()
export class RealGoogleApiFactory implements GoogleApiFactory {
  forAccount(acc: IntegrationAccountDoc): GoogleApi {
    if (!acc.refreshTokenEnc) throw new Error('Google account not connected (no refresh token)');
    const client = oauthClient();
    client.setCredentials({ refresh_token: decrypt(acc.refreshTokenEnc) });
    return new RealGoogleApi(client);
  }
}
