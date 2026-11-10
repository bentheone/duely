import * as FS from 'expo-file-system/legacy';
import { File } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Crypto from 'expo-crypto';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Sharing from 'expo-sharing';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { PDFDocument } from 'pdf-lib';
import { Platform } from 'react-native';
import {
  ALLOWED_MIME,
  DAY,
  KEEP_OFFLINE_DAYS,
  MAX_FILE_BYTES,
  formatShortDate,
  type FileAttachment,
  type StorageInfo,
} from '@duely/shared';
import { api, ApiError } from './api';
import { getRawDb } from './db/client';
import { snapshot } from './db/queries';
import { getMeta, getMetaJson, getRecord, newId, save, setMeta, setMetaJson } from './db/repo';
import { currentTz, useApp } from './store';

export const ACCEPTED_TYPES = [...ALLOWED_MIME];
const FILES_DIR = `${FS.documentDirectory}files/`;

// ---------- local cache table ----------

export function cachedUri(attachmentId: string): string | null {
  return getRawDb().getFirstSync<{ localUri: string }>('SELECT localUri FROM file_cache WHERE attachmentId = ?', attachmentId)?.localUri ?? null;
}
function setCache(attachmentId: string, localUri: string, safUri?: string | null) {
  getRawDb().runSync(
    `INSERT INTO file_cache (attachmentId, localUri, safUri, downloadedAt) VALUES (?, ?, ?, ?)
     ON CONFLICT(attachmentId) DO UPDATE SET localUri = excluded.localUri, safUri = COALESCE(excluded.safUri, file_cache.safUri), downloadedAt = excluded.downloadedAt`,
    attachmentId,
    localUri,
    safUri ?? null,
    Date.now(),
  );
}

function safeName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 80) || 'file';
}

function guessMime(name: string, fallback?: string | null): string {
  if (fallback && fallback !== 'application/octet-stream') return fallback;
  const ext = name.split('.').pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    heic: 'image/heic',
  };
  return map[ext ?? ''] ?? 'application/octet-stream';
}

async function sha256(uri: string): Promise<string> {
  const buf = await new File(uri).arrayBuffer();
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(buf));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- storage provider ----------

export async function fetchStorageInfo(): Promise<StorageInfo> {
  const info = await api<StorageInfo>('/storage');
  setMetaJson('storageInfo', info);
  return info;
}
export function storageInfo(): StorageInfo | null {
  return getMetaJson<StorageInfo | null>('storageInfo', null);
}

// ---------- adding files (§9.1) ----------

/** Copies into app storage first (instantly offline), records the attachment, then queues upload. */
export async function addLocalFile(
  owner: { type: 'assignment' | 'exam'; id: string },
  src: { uri: string; name: string; mime?: string | null; size?: number | null },
): Promise<FileAttachment> {
  const mime = guessMime(src.name, src.mime);
  if (!(ALLOWED_MIME as readonly string[]).includes(mime)) throw new Error('That file type isn’t supported.');
  const id = newId();
  const dir = `${FILES_DIR}${id}/`;
  await FS.makeDirectoryAsync(dir, { intermediates: true });
  const dest = `${dir}${safeName(src.name)}`;
  await FS.copyAsync({ from: src.uri, to: dest });
  const info = await FS.getInfoAsync(dest);
  const size = info.exists ? (info.size ?? src.size ?? 0) : (src.size ?? 0);
  if (size > MAX_FILE_BYTES) {
    await FS.deleteAsync(dir, { idempotent: true });
    throw new Error('Files are limited to 25 MB.');
  }
  const provider = storageInfo()?.provider ?? 'cloudinary';
  setCache(id, dest);
  const rec = save('files', {
    id,
    ownerType: owner.type,
    ownerId: owner.id,
    name: safeName(src.name),
    mime,
    size,
    provider,
    remoteId: null,
    remoteUrl: null,
    checksum: await sha256(dest),
  });
  void mirrorToPhoneFolder(rec).catch(() => undefined);
  return rec;
}

export async function pickFiles(owner: { type: 'assignment' | 'exam'; id: string }): Promise<FileAttachment[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: ACCEPTED_TYPES, multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  const out: FileAttachment[] = [];
  for (const a of res.assets) out.push(await addLocalFile(owner, { uri: a.uri, name: a.name, mime: a.mimeType, size: a.size }));
  return out;
}

/** Camera scan → images → one PDF with pdf-lib (§9.1). Returns a temp file to stage or attach. */
export async function scanToPdfFile(): Promise<{ uri: string; name: string; mime: string } | null> {
  const r = await DocumentScanner.scanDocument({ croppedImageQuality: 80 });
  const images = r.scannedImages ?? [];
  if (images.length === 0) return null;
  const pdf = await PDFDocument.create();
  for (const uri of images) {
    const b64 = await FS.readAsStringAsync(uri.startsWith('file://') ? uri : `file://${uri}`, { encoding: FS.EncodingType.Base64 });
    const img = uri.toLowerCase().endsWith('.png') ? await pdf.embedPng(b64) : await pdf.embedJpg(b64);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }
  const out = await pdf.saveAsBase64();
  const tmp = `${FS.cacheDirectory}scan-${Date.now()}.pdf`;
  await FS.writeAsStringAsync(tmp, out, { encoding: FS.EncodingType.Base64 });
  return { uri: tmp, name: `Scan ${formatShortDate(Date.now(), currentTz())}.pdf`, mime: 'application/pdf' };
}

export async function scanToPdf(owner: { type: 'assignment' | 'exam'; id: string }): Promise<FileAttachment | null> {
  const f = await scanToPdfFile();
  if (!f) return null;
  const rec = await addLocalFile(owner, f);
  await FS.deleteAsync(f.uri, { idempotent: true });
  return rec;
}

/** Document picker without an owner yet (Quick add stages files until Save). */
export async function pickFilesToStage(): Promise<{ uri: string; name: string; mime?: string | null; size?: number | null }[]> {
  const res = await DocumentPicker.getDocumentAsync({ type: ACCEPTED_TYPES, multiple: true, copyToCacheDirectory: true });
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, name: a.name, mime: a.mimeType, size: a.size }));
}

// ---------- upload queue (§9.2) ----------

const backoff = new Map<string, { attempts: number; nextAt: number }>();
let uploading = false;

function folderFor(f: FileAttachment): string {
  const snap = snapshot();
  const owner = f.ownerType === 'assignment' ? snap.assignments.find((a) => a.id === f.ownerId) : snap.exams.find((e) => e.id === f.ownerId);
  const course = owner ? snap.courses.find((c) => c.id === owner.courseId) : undefined;
  const sem = course ? snap.semesters.find((s) => s.id === course.semesterId) : undefined;
  return [sem?.name, course?.shortName].filter(Boolean).map((s) => safeName(String(s)).replace(/\//g, '-')).join('/');
}

async function uploadOne(f: FileAttachment, localUri: string): Promise<void> {
  const setUpload = useApp.getState().setUpload;
  setUpload(f.id, { status: 'uploading', progress: 0 });
  if (f.provider === 'gdrive') {
    const { uploadUrl } = await api<{ uploadUrl: string }>('/files/drive-session', { body: { attachmentId: f.id, name: f.name, mime: f.mime, size: f.size } });
    const res = await FS.uploadAsync(uploadUrl, localUri, {
      httpMethod: 'PUT',
      uploadType: FS.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Type': f.mime },
    });
    if (res.status >= 300) throw new Error(`Drive upload failed (${res.status})`);
    const body = JSON.parse(res.body) as { id: string };
    save('files', { id: f.id, remoteId: body.id, remoteUrl: null });
  } else {
    const resourceType = f.mime.startsWith('image/') ? 'image' : 'raw';
    const sig = await api<{ uploadUrl: string; apiKey: string; timestamp: number; signature: string; folder: string; publicId: string }>('/files/sign', {
      body: { attachmentId: f.id, resourceType, folder: folderFor(f), mime: f.mime, size: f.size },
    });
    const task = FS.createUploadTask(
      sig.uploadUrl,
      localUri,
      {
        httpMethod: 'POST',
        uploadType: FS.FileSystemUploadType.MULTIPART,
        fieldName: 'file',
        mimeType: f.mime,
        parameters: {
          api_key: sig.apiKey,
          timestamp: String(sig.timestamp),
          signature: sig.signature,
          folder: sig.folder,
          public_id: sig.publicId,
        },
      },
      (p) => setUpload(f.id, { status: 'uploading', progress: p.totalBytesExpectedToSend ? p.totalBytesSent / p.totalBytesExpectedToSend : 0 }),
    );
    const res = await task.uploadAsync();
    if (!res || res.status >= 300) throw new Error(`Upload failed (${res?.status ?? 'network'})`);
    const body = JSON.parse(res.body) as { public_id: string; secure_url: string };
    save('files', { id: f.id, remoteId: body.public_id, remoteUrl: body.secure_url });
  }
  setUpload(f.id, { status: 'done' });
  setTimeout(() => setUpload(f.id, null), 1500);
}

/** Uploads pending files with exponential backoff (5 s · 2^n, max 10 min). */
export async function processUploadQueue(): Promise<void> {
  if (uploading || !useApp.getState().online) return;
  uploading = true;
  try {
    const pending = snapshot().files.filter((f) => !f.remoteId);
    for (const f of pending) {
      const b = backoff.get(f.id);
      if (b && b.nextAt > Date.now()) continue;
      const local = cachedUri(f.id);
      if (!local) continue;
      try {
        await uploadOne(f, local);
        backoff.delete(f.id);
      } catch (e) {
        const attempts = (b?.attempts ?? 0) + 1;
        const delay = Math.min(5000 * 2 ** attempts, 10 * 60 * 1000);
        backoff.set(f.id, { attempts, nextAt: Date.now() + delay });
        useApp.getState().setUpload(f.id, { status: 'error', error: (e as Error).message });
        setTimeout(() => void processUploadQueue(), delay + 100);
      }
    }
  } finally {
    uploading = false;
  }
}

// ---------- download / offline (§9.2) ----------

/** A user-facing reason a file can't be opened right now. */
export class FileUnavailableError extends Error {}

export async function ensureLocal(f: FileAttachment): Promise<string> {
  const cached = cachedUri(f.id);
  if (cached && (await FS.getInfoAsync(cached)).exists) return cached;
  if (!f.remoteId) {
    throw new FileUnavailableError('It hasn’t finished uploading from the phone that added it. Open Duely there while online.');
  }
  if (!useApp.getState().online) throw new FileUnavailableError('You’re offline and this file isn’t saved on this phone yet.');
  let target: { url: string; headers: Record<string, string>; fallbackUrl?: string | null };
  try {
    target = await api<{ url: string; headers: Record<string, string>; fallbackUrl?: string | null }>(`/files/${f.id}/url`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) {
      throw new FileUnavailableError('The server doesn’t have this file yet. Pull to sync on the phone that added it.');
    }
    throw e;
  }
  const dir = `${FILES_DIR}${f.id}/`;
  await FS.makeDirectoryAsync(dir, { intermediates: true });
  const dest = `${dir}${safeName(f.name)}`;
  let status = 0;
  for (const url of [target.url, target.fallbackUrl].filter((u): u is string => !!u)) {
    const r = await FS.downloadAsync(url, dest, { headers: url === target.url ? target.headers : {} });
    status = r.status;
    if (r.status < 300) {
      setCache(f.id, dest);
      return dest;
    }
  }
  // downloadAsync writes the error body to dest — don't leave it behind as a fake file.
  await FS.deleteAsync(dest, { idempotent: true });
  throw new FileUnavailableError(
    status === 401 || status === 403
      ? `Storage refused the download (${status}). In Cloudinary → Settings → Security, enable “Allow delivery of PDF and ZIP files”.`
      : `Download failed (${status || 'network'}). Try again.`,
  );
}

/** Keep offline: default on for assignments due within 14 days. */
export async function prefetchOfflineFiles(): Promise<void> {
  if (!useApp.getState().online) return;
  const snap = snapshot();
  const horizon = Date.now() + KEEP_OFFLINE_DAYS * DAY;
  const keep = new Set(
    snap.assignments
      .filter((a) => a.keepOffline === true || (a.keepOffline !== false && a.dueAt && a.dueAt < horizon && a.dueAt > Date.now() - DAY))
      .map((a) => a.id),
  );
  for (const f of snap.files) {
    if (f.ownerType !== 'assignment' || !keep.has(f.ownerId) || !f.remoteId || cachedUri(f.id)) continue;
    try {
      await ensureLocal(f);
    } catch {
      // try again next time
    }
  }
}

// ---------- open with… (§9.3) ----------

export async function openWith(f: FileAttachment): Promise<void> {
  const local = await ensureLocal(f);
  if (Platform.OS === 'android') {
    try {
      const contentUri = await FS.getContentUriAsync(local);
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: f.mime,
      });
      return;
    } catch {
      // no app for this type → share sheet
    }
  }
  await Sharing.shareAsync(local, { mimeType: f.mime, dialogTitle: f.name });
}

// ---------- phone folder mirror via SAF (§9.3) ----------

const SAF = FS.StorageAccessFramework;

export async function choosePhoneFolder(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const initial = SAF.getUriForDirectoryInRoot('Documents');
  const perm = await SAF.requestDirectoryPermissionsAsync(initial);
  if (!perm.granted) return null;
  setMeta('phoneFolderUri', perm.directoryUri);
  setMetaJson('phoneFolderDirs', {});
  return perm.directoryUri;
}

export function phoneFolderUri(): string | null {
  return getMeta('phoneFolderUri');
}

async function ensureSafDir(root: string, segments: string[]): Promise<string> {
  const cache = getMetaJson<Record<string, string>>('phoneFolderDirs', {});
  let parent = root;
  let key = '';
  for (const seg of segments) {
    key += `/${seg}`;
    if (cache[key]) {
      parent = cache[key]!;
      continue;
    }
    const children = await SAF.readDirectoryAsync(parent);
    const found = children.find((u) => decodeURIComponent(u).split('/').pop() === seg || decodeURIComponent(u).endsWith(`/${seg}`));
    parent = found ?? (await SAF.makeDirectoryAsync(parent, seg));
    cache[key] = parent;
  }
  setMetaJson('phoneFolderDirs', cache);
  return parent;
}

/** Mirrors to {Semester}/{Course shortName}/{Assignment title}/{file}. */
export async function mirrorToPhoneFolder(f: FileAttachment): Promise<void> {
  const root = phoneFolderUri();
  const local = cachedUri(f.id);
  if (!root || !local) return;
  const existing = getRawDb().getFirstSync<{ safUri: string | null }>('SELECT safUri FROM file_cache WHERE attachmentId = ?', f.id);
  if (existing?.safUri) return;
  const snap = snapshot();
  const owner = f.ownerType === 'assignment' ? getRecord('assignments', f.ownerId) : getRecord('exams', f.ownerId);
  const course = owner ? snap.courses.find((c) => c.id === owner.courseId) : undefined;
  const sem = course ? snap.semesters.find((s) => s.id === course.semesterId) : undefined;
  const title = owner && 'title' in owner ? owner.title : 'Exam';
  const segs = [sem?.name ?? 'Semester', course?.shortName ?? 'Course', title].map((s) => safeName(s).replace(/\//g, '-'));
  const dir = await ensureSafDir(root, segs);
  const target = await SAF.createFileAsync(dir, f.name.replace(/\.[^.]+$/, ''), f.mime);
  const b64 = await FS.readAsStringAsync(local, { encoding: FS.EncodingType.Base64 });
  await SAF.writeAsStringAsync(target, b64, { encoding: FS.EncodingType.Base64 });
  setCache(f.id, local, target);
}

export async function mirrorAll(): Promise<number> {
  let n = 0;
  for (const f of snapshot().files) {
    try {
      if (!cachedUri(f.id) && f.remoteId) await ensureLocal(f);
      await mirrorToPhoneFolder(f);
      n++;
    } catch {
      // skip
    }
  }
  return n;
}
