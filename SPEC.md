# Duely — Build Spec v1

> Personal school-assignment manager for AUCA students. Android first (owner's phone), store release later.
> Owner: Mpano Benjamin. Approved design: https://claude.ai/artifact/Arekyw8w9jsZaxyd2ASNY9 (12 screens, described in §11 so this spec is self-contained).
> Target: **full v1** built in one go, installed on the owner's Android phone.

---

## 1. What Duely does

1. Add assignments fast (smart text → editable form), with course, due date/time, individual/group, submission method, marks, notes & links, files.
2. Track long assignments with **subtasks/milestones** (own deadlines) and **progress %** (auto from subtasks, or manual override).
3. Group assignments: **records only** in v1 (members, WhatsApp/phone, "my part", meeting times). Invites/shared editing is v2.
4. Exams: course, type (quiz / CAT / midterm / final), date/time, room, duration, topics checklist. Study sessions are **added manually**.
5. Scheduling: the app **suggests free slots** from Google Calendar (around classes and busy events); user confirms; confirmed sessions are written to a dedicated **"Duely"** Google calendar.
6. Sync: Google Calendar (read timetable + busy times, write sessions), Google Tasks (one task per assignment in a "School" list, subtasks as child tasks, two-way completion).
7. Alarms: **full-screen alarm 30 min before every class** (from the timetable in Google Calendar), Stop / Snooze (5 min), rings even on silent.
8. Missed-assignment detection: (a) notification when each class ends — "New assignment from PL/SQL?" [Add] [No]; (b) weekly review listing active courses with nothing logged recently.
9. Files: attach PDF/Word/PPT/images, **camera scan → PDF**, offline copies, mirror into a real phone folder, open in other apps ("Open with…").
10. Semester-based: courses belong to a semester; a course can be **finished** (archived) — finished courses drop out of filters, alarms and missed checks.
11. Courses have a **user-defined short name** (e.g. "PL/SQL", "C", "Soft Eng") and colour — the short name is what the UI shows everywhere; the code (INSY 8311) only appears on the Courses screen.
12. Android home-screen widgets.
13. Light + dark theme following the system.

### Out of scope for v1 (design for it, don't build it)
- macOS helper that syncs to Apple Reminders (v2 — see §9.4).
- Group invite links / shared assignments (v2).
- iOS build, Apple Reminders via EventKit, iOS AlarmKit (later).
- Automatic exam study-plan generation (owner chose manual).
- Time-tracking timer (not chosen).

---

## 2. Decisions (locked)

| Area | Decision |
|---|---|
| Mobile | React Native with **Expo** (SDK latest stable), **dev client** + **EAS Build in the cloud** (owner's 2018 MacBook is low on disk — do not require local Android Studio builds; local `expo run:android` optional) |
| Language | TypeScript everywhere, strict mode |
| Backend | **NestJS** deployed on **Vercel** (serverless) |
| DB | **MongoDB Atlas** with **Mongoose** |
| Offline | **Offline-first**: on-device SQLite is the source of truth for the UI; background sync with the API |
| Auth | Google Sign-In only |
| Storage | Owner: his Cloudinary. Other users: **choose** Cloudinary (own credentials) **or** Google Drive |
| Reminders app | v1 Google Tasks only; Apple Reminders via Mac helper in v2 |
| Name | **Duely** |
| Home screen | Today |
| Theme | Light + dark, follow system, colour per course |
| Quick add | Smart text + form + Android widget |

---

## 3. Platform constraints Claude Code must respect

1. **Apple Reminders cannot be reached from Android or the server.** Upgraded iCloud Reminders are not exposed over CalDAV; only EventKit on an Apple device can read/write them. Hence the v2 Mac helper.
2. **Google Tasks has no due *time*** (date only). Put the time in the task notes; time-blocks live in Google Calendar.
3. **Full-screen alarms on Android 14+:** `USE_FULL_SCREEN_INTENT` is auto-granted only to alarm/calling apps on Play. Check `NotificationManager.canUseFullScreenIntent()` at runtime and deep-link to the settings screen if denied. Exact alarms need `SCHEDULE_EXACT_ALARM` (or `USE_EXACT_ALARM` for an alarm-clock app); check `AlarmManager.canScheduleExactAlarms()`.
4. **Vercel limits:** request body ~4.5 MB → files never pass through the API; devices upload directly to Cloudinary/Drive. Functions are stateless → cache the Mongoose connection on `globalThis`. Hobby-plan cron is coarse (daily) → Google sync is **triggered by the app** (on foreground / pull-to-refresh / after push), not by server cron.
5. **Google OAuth:** Calendar/Tasks/Drive scopes are sensitive. While unverified the app works for up to 100 test users added in the Cloud console — fine for v1.
6. **Cloudinary:** new accounts block PDF/ZIP delivery until "Allow delivery of PDF and ZIP files" is enabled in Security settings — the storage-setup screen must tell the user. Use `resource_type: "raw"` for Office docs, `"image"` for images, `"image"` or `"raw"` for PDFs (pick one and be consistent; `raw` is safest for opening in other apps). **Never** put an API secret on the device: the API signs uploads.

---

## 4. Repository layout

Monorepo, pnpm workspaces:

```
duely/
  apps/
    mobile/          # Expo app
    api/             # NestJS app (Vercel)
  packages/
    shared/          # types, zod schemas, smart-text parser, constants (course colours, defaults)
  modules/
    duely-alarm/     # Expo native module (Kotlin) for full-screen alarms — see §8
  SPEC.md
  CLAUDE.md          # short pointer: "read SPEC.md; follow its build steps"
```

---

## 5. Data model

All documents use **client-generated UUID v7** `id` (so records can be created offline), plus:
`userId`, `createdAt`, `updatedAt` (ms epoch, set by the writer), `deletedAt` (soft delete, null if live), `rev` (int, incremented by server on each accepted write).

### 5.1 Mongo collections (Mongoose)

```ts
User { id, googleSub, email, name, avatarUrl, timezone ("Africa/Kigali"),
  settings: {
    theme: "system",
    alarm: { enabled: true, leadMinutes: 30, everyClass: true, snoozeMinutes: 5, ringOnSilent: true },
    reminders: { dueOffsets: ["P3D","P1D","MORNING_OF"], morningTime: "07:00" },
    missedCheck: { afterClass: true, weekly: true, weeklyDay: 0 /*Sun*/, weeklyTime: "19:00", quietDays: 7 },
    workHours: { start: "07:00", end: "22:00" },      // planner bounds
    sessionDefaultMinutes: 90
  },
  activeSemesterId }

IntegrationAccount { id, userId, provider: "google",
  refreshTokenEnc, scopes[], timetableCalendarIds[], busyCalendarIds[],
  duelyCalendarId, tasksListId, driveFolderId, lastSyncAt }

StorageConfig { id, userId, provider: "cloudinary" | "gdrive",
  cloudinary?: { cloudName, apiKey, apiSecretEnc, folder: "duely" },
  pdfDeliveryConfirmed: boolean }

Semester { id, userId, name ("Fall 2026"), startsOn, endsOn, status: "active" | "archived" }

Course { id, userId, semesterId, code ("INSY 8311"), title, shortName ("PL/SQL"),
  color (hex from palette), lecturer?, room?, group? ("F"),
  status: "active" | "finished", finishedAt?,
  matchRules: string[]   // lowercased tokens used to map calendar events + smart text → this course
}

ClassSession { id, userId, courseId, googleEventId, start, end, room?, sourceCalendarId }
  // cached occurrences for next 21 days; regenerated on each calendar sync

Assignment { id, userId, courseId, semesterId, title, notes (markdown), links: {title,url}[],
  dueAt, kind: "individual" | "group", submission: "moodle"|"email"|"printed"|"in_class"|"other",
  marks?, status: "not_started"|"in_progress"|"done"|"submitted"|"graded", grade?,
  progressMode: "auto"|"manual", progressManual?,
  group?: { members: { name, phone?, whatsapp?, isMe }[], myPart?, meetings: { at, place? }[], chatLink? },
  reminderOffsets?: string[]  // overrides user default
  googleTaskId? }

Subtask { id, userId, assignmentId, title, dueAt?, done, order, googleTaskId? }

Exam { id, userId, courseId, semesterId, type: "quiz"|"cat"|"midterm"|"final"|"other",
  startsAt, durationMin?, room?, topics: { id, title, done }[], notes }

Session { id, userId, kind: "work"|"study", assignmentId?, examId?, title,
  start, end, status: "suggested"|"confirmed"|"done"|"skipped", googleEventId? }

FileAttachment { id, userId, ownerType: "assignment"|"exam", ownerId, name, mime, size,
  provider: "cloudinary"|"gdrive", remoteId (public_id or drive fileId), remoteUrl?,
  checksum (sha256) }

MissedCheckLog { id, userId, courseId, classSessionId?, answer: "added"|"none"|"later", at }
```

Progress (auto) = done subtasks / total subtasks (0 if none → show status-based: submitted/graded = 100).

### 5.2 Device SQLite
Same tables (flattened JSON columns where nested) via **expo-sqlite + Drizzle ORM**, plus:
- `outbox(id, table, recordId, op, payload, createdAt, attempts)` — pending mutations.
- `sync_meta(key, value)` — `lastPulledRev`, etc.
- `file_cache(attachmentId, localUri, safUri?, downloadedAt)` — offline copies & phone-folder mirror.

---

## 6. Sync protocol (offline-first)

- Every local write: update SQLite row (`updatedAt = now`) and append to `outbox`. UI reads only SQLite (reactive queries).
- **Push** `POST /sync/push { changes: [{table, record}] }` → server applies **last-write-wins on `updatedAt`** per record, bumps `rev`, returns `{ accepted: ids, conflicts: [{record}] }`; conflicts overwrite local.
- **Pull** `GET /sync/pull?since=<rev>` → all records of the user with `rev > since` (incl. soft-deleted), plus `maxRev`.
- Triggers: app start, app foreground, connectivity regained, after any write (debounced 2 s), pull-to-refresh. Use `@react-native-community/netinfo`.
- After a successful push/pull the device calls `POST /integrations/google/sync` (debounced, at most every 5 min unless forced) — see §7.
- Hard deletes never happen in v1; finished courses/semesters are archived.

---

## 7. Google integration (server-side, using stored refresh token)

### 7.1 Sign-in
- Device: `@react-native-google-signin/google-signin` with `webClientId` + `offlineAccess: true`, scopes:
  `openid email profile`, `https://www.googleapis.com/auth/calendar`, `https://www.googleapis.com/auth/tasks`, and **only if Drive storage is chosen** `https://www.googleapis.com/auth/drive.file` (request incrementally).
- Device sends `serverAuthCode` + `idToken` to `POST /auth/google`. API verifies the ID token, exchanges the code (googleapis), stores the **refresh token encrypted** (AES-256-GCM, key `ENCRYPTION_KEY`), issues Duely **JWT access (15 min) + refresh (30 days, rotated)**. Store tokens on device in `expo-secure-store`.

### 7.2 Calendar
- Onboarding: list user calendars → user picks **timetable calendar(s)** (classes) and **busy calendars** (work etc.). Default busy = primary.
- Course matching: for each event in timetable calendars, match title/description/location against each active course's `matchRules` (code without spaces, shortName, title words). Unmatched recurring events → onboarding screen "Which course is this?" which appends a rule.
- Cache `ClassSession`s for the next 21 days (expand recurring events with `singleEvents=true`). Device pulls these and schedules alarms + class-end prompts.
- Create a secondary calendar **"Duely"** once; confirmed `Session`s are inserted there (title `"{shortName} · {title}"`, colour id closest to course colour, private extended property `duelySessionId`). Edits/deletes propagate both ways (poll with `syncToken`).
- **Free-slot planner** (`POST /planner/suggest { assignmentId | examId, totalMinutes, before }`): freebusy query over timetable + busy + Duely calendars, within `workHours`, exclude <45-min gaps, prefer slots ≥ `sessionDefaultMinutes`, spread over days, never after the due time. Returns `suggested` sessions; user accepts one, all, or picks manually.

### 7.3 Tasks
- Create task list **"School"** once. One task per assignment: title `"{shortName} — {title}"`, `due` = due date (RFC3339 midnight), notes = `Due {HH:mm} · {kind} · {submission}` + deep link `duely://assignment/{id}`. Subtasks → child tasks (`parent`).
- Two-way: poll `tasks.list` with `updatedMin = lastSyncAt`, `showCompleted/showHidden`. Completed in Google → assignment status `done` (or subtask done). Done in Duely → task `completed`. Deleted in Google → just unlink (don't delete the assignment).
- Only assignments of **active** courses are pushed.

---

## 8. Alarms & notifications (Android)

### 8.1 Class alarm — native module `modules/duely-alarm` (Expo Modules API, Kotlin)
JS API:
```ts
scheduleAlarms(alarms: { id: string; triggerAt: number; title: string; subtitle: string; color: string }[]): Promise<void> // replaces all
cancelAll(): Promise<void>
canUseFullScreenIntent(): Promise<boolean>; openFullScreenIntentSettings(): void
canScheduleExact(): Promise<boolean>; openExactAlarmSettings(): void
addListener("alarmAction", (e: { id: string; action: "stop" | "snooze" }) => void)
```
Native behaviour:
- `AlarmManager.setAlarmClock()` per alarm (shows in system alarm UI, survives Doze).
- `BroadcastReceiver` → starts a **foreground service** that plays the alarm sound with `AudioAttributes.USAGE_ALARM` (rings in silent/vibrate mode when `ringOnSilent`), vibrates, and posts a high-priority notification in an **alarm channel** with a `fullScreenIntent` launching `AlarmActivity` (`showWhenLocked`, `turnScreenOn`).
- `AlarmActivity` renders the approved full-screen UI natively (time, course shortName, "in 30 min · room", big **Stop** button, **Snooze 5 min**), background = course colour (darkened to pass 4.5:1 with white text). Native UI, not RN, so it works when the JS app is dead.
- Snooze reschedules +`snoozeMinutes`; auto-stop after 10 min ringing → treated as snooze once, then stop.
- Persist scheduled alarms in SharedPreferences; reschedule on `BOOT_COMPLETED`, `TIME_SET`, `TIMEZONE_CHANGED`, app update.
- Manifest: `USE_FULL_SCREEN_INTENT`, `SCHEDULE_EXACT_ALARM` (or `USE_EXACT_ALARM`), `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (or appropriate type), `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`. Ship as a config plugin.
- JS side: after every class-session pull, compute alarms = each `ClassSession` of active courses in next 7 days at `start - leadMinutes` (if `everyClass`, else first class per day) and call `scheduleAlarms`.

### 8.2 Other notifications — `expo-notifications` (local)
- **Due reminders**: per assignment, at each offset (3 days, 1 day before at `morningTime`, morning of due day at `morningTime`); exams: 1 day before and morning of. Reschedule all on any change (cap: next 30 days to stay under OS limits).
- **Class-end prompt**: at each `ClassSession.end` → "New assignment from {shortName}?" with category actions **Add** (opens Quick add pre-filled with the course) / **No** (logs `MissedCheckLog none`) / Later (+2 h).
- **Weekly review**: `weeklyDay` at `weeklyTime` → opens the Weekly check screen listing active courses with no assignment added and no "none" answer in `quietDays`.
- Session start reminders: 5 min before confirmed sessions.

---

## 9. Files

### 9.1 Adding
- Pick: `expo-document-picker` (any of pdf, doc/docx, ppt/pptx, xls/xlsx, images).
- Scan: `react-native-document-scanner-plugin` (ML Kit on Android) → images → combine into one PDF with `pdf-lib` → save.
- Every file is first copied to app storage (`FileSystem.documentDirectory/files/{attachmentId}/{name}`) → instantly available offline → then queued for upload.

### 9.2 Upload / download
- **Cloudinary**: device asks `POST /files/sign { attachmentId, resourceType }` → API signs with the user's (or owner's) secret → device uploads directly to `https://api.cloudinary.com/v1_1/{cloud}/{resource_type}/upload` with progress. Folder `duely/{semester}/{courseShort}/`.
- **Google Drive**: device asks `POST /files/drive-session` → API creates a **resumable upload session** in the user's "Duely" folder (scope `drive.file`) and returns the session URL → device uploads directly.
- Download for offline when opened, or when "Keep offline" is on for the assignment (default on for assignments due in the next 14 days).
- Background retries with exponential backoff; upload state shown subtly (dot on the file tile).

### 9.3 Phone folder & open-with
- Settings → "Phone folder": user grants a directory once via Storage Access Framework (`FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync`) — suggest `Documents/Duely`. Mirror files to `{Semester}/{Course shortName}/{Assignment title}/{file}`.
- "Open with…": get a `content://` URI (`FileSystem.getContentUriAsync`) and launch `ACTION_VIEW` via `expo-intent-launcher` with the MIME type and `FLAG_GRANT_READ_URI_PERMISSION`; fallback `expo-sharing`.

### 9.4 v2 hook: Mac Reminders helper
Keep the API ready: `GET /export/reminders?since=` (assignments+subtasks of active courses with stable ids) and `POST /export/reminders/ack`. Personal API tokens (`/auth/tokens`) for non-interactive clients. The helper itself (Swift menu-bar app using EventKit, list "School") is v2.

---

## 10. Smart quick-add parser (`packages/shared/parse.ts`, runs offline)

Input: `"PL/SQL lab on cursors fri 5pm group"`. Output: `{ courseId?, title, dueAt?, kind?, submission?, isExam?, examType?, confidence spans[] }`.
- Dates/times: `chrono-node` with reference = now, timezone Africa/Kigali, forward-dating ("fri" = next Friday; "tomorrow"; "23 nov"; "in 3 days"). Date without time → `23:59`.
- Course: longest match against active courses' `shortName`, `code` (with/without space), `matchRules` (case-insensitive).
- Keywords: `group|team|grp` → group; `individual|solo` → individual; `moodle|email|printed|print|in class` → submission; `quiz|cat|midterm|mid|final|exam` → switch to Exam with type.
- Title = remaining text, trimmed, first letter capitalised. Return spans so the UI can colour recognised parts (course = orange, date = blue, kind = teal — as in the design).
- Unit-test with ≥30 cases.

---

## 11. Design system & screens (from the approved canvas)

### 11.1 Principles
**Minimal words, lots of white space.** No section headers unless needed, no stat tiles, no tag pills. One item = time · title · course dot + short name. Icon-only bottom bar.

### 11.2 Tokens
| Token | Light | Dark |
|---|---|---|
| bg | `#FFFFFF` | `#0E0F12` |
| surface (cards, inputs) | `#F6F6F3` / `#F2F2EF` (buttons) | `#17191E` / `#1C1E24` |
| text | `#111317` | `#F3F4F6` |
| text-muted | `#6B7079` | `#9CA1AB` |
| text-faint (done items, inactive icons) | `#9CA0A8` / `#A3A7AF` | `#6B7079` |
| primary button | bg `#111317`, text white | bg `#F3F4F6`, text `#0E0F12` |
| danger/overdue text | `#B93A0C` | `#FB923C` |

Course palette (dots/chips; dark-mode variants in brackets): orange `#EA580C` (`#F97316`), violet `#7C3AED` (`#A855F7`), teal `#0D9488` (`#14B8A6`), blue `#2563EB` (`#3B82F6`), green `#16A34A` (`#22C55E`), pink `#DB2777` (`#EC4899`), plus amber `#D97706`, slate `#475569` for extra courses. Alarm background uses a darkened course colour (e.g. orange → `#C2410C`).

Typography: **Space Grotesk** (600) for big headings & numbers (40 px screen titles, 96 px countdown/alarm time), **Inter** for everything else (17/600 item titles, 14–16 body, 13–14 meta). Load with `expo-font` / `@expo-google-fonts/*`.
Spacing: screen padding 28 px horizontal, 56–64 px top; list gaps 22–28 px; radii: cards 20, buttons 14 (small) / 28 (pill CTA), avatars/icon buttons 22 (44 px circles). Min touch target 44 px.
Icons: `lucide-react-native` (stroke 2).

### 11.3 Screens (navigation: expo-router)
Bottom bar (icons only): **Today · Assignments · (+) · Calendar · Exams**. Avatar (top-right of Today) → Courses → Settings.

1. **Today** — big date ("Tuesday / 10 Nov"); chronological list of today's classes, sessions, meetings, due items (time column 44 px, title, course dot + short name; overdue/due-today in danger colour); contextual card after a class ends: "New assignment from **PL/SQL**?" [Add] [No]. Pull to refresh.
2. **Today (dark)** — same, dark tokens.
3. **Quick add** (full-screen modal from +, widget, notification) — segmented Assignment | Exam; large smart-text field (Space Grotesk 28 px) with recognised parts coloured live; below it the parsed fields as tappable rows (course, due, kind, reminders) each opening a picker; round icon buttons Attach & Scan; pill **Save**.
4. **Assignment** — course dot + "Soft Eng · Group", title (32 px), due line (danger colour if ≤24 h); progress bar + %; subtask checklist (done = faint), date on the right; group avatars + next meeting; file tiles (ext label + name, tap = open-with); pill CTA **Plan a session**; overflow menu: edit, status, notes & links, grade, delete.
5. **Assignments** — title; horizontally scrolling chips: All + active courses by short name; groups Overdue / This week / Later; row = dot, title, course (+ "· Group"), due on the right.
6. **Courses** — semester title as a dropdown ("Fall 2026 ▾", switch/create semester, archive semester); active courses: dot, short name (18/600), meta "INSY 8311 · Tue"; swipe left → **Finish** (also Edit: short name, colour, code, match rules); "+ Course"; "Finished · 3 courses ›" card at the bottom; gear → Settings.
7. **Calendar / Plan sessions** — "November"; 7-day strip (selected day = black pill); day timeline: classes (course-tinted), busy blocks (grey "Busy"), suggested sessions (dashed blue outline with ✓ accept button), meetings; footer: "3 free slots before Thu" + **Add all**. Week view toggle optional (v1 can be day view only).
8. **Exam** — course dot + "Networks · Midterm"; huge countdown "6 days"; date/time; topics checklist; study sessions as soft blue rows (day, topic, time); pill **Add study time** (manual picker; still shows free-slot hints).
9. **Class alarm** — native full-screen (see §8.1): time 96 px, course short name 34 px, "in 30 min · GB6", 132 px round white **Stop**, translucent pill **Snooze 5 min**.
10. **Weekly check** — "Anything missed?" / "Nothing logged lately for:"; rows: dot, short name, "12 days", ✓ (nothing new) and + (add) circular buttons; "All caught up".
11. **Settings** — groups: Google (Calendar, Tasks, Class timetable calendar picker, busy calendars), Files (Storage provider + Cloudinary credentials form with PDF-delivery checklist, Phone folder), Class alarm (lead time, every class/first class, snooze, ring on silent, permission status with fix buttons), Reminders defaults, Weekly check day/time, Theme, Sign out.
12. **Widgets** (Android, `react-native-android-widget`): **Medium 4×2** — next class/session (course + time 34 px) with + button, then next 2 due items; **Small 2×2** — "3 / due this week"; **Small 2×2 exam** — "6d / Networks exam" on course colour. Update on data change and every 30 min.

Onboarding (not drawn; keep the same style, one question per screen): Sign in with Google → pick timetable calendar → confirm detected courses (short name + colour per course, prefilled) → storage choice → permissions (notifications, exact alarm, full-screen) → Today.

Owner seed (offer on first run, editable): Fall 2026 — Networks (INSY 8211, Mon), PL/SQL (INSY 8311, Tue, GB6), C (INSY 8212, Wed), Soft Eng (SENG 8215, Wed), Health (HELT 8213, Thu), Philosophy (RELT 8221, Fri).

---

## 12. API (NestJS) — modules & endpoints

Global: `ValidationPipe` (class-validator / zod via shared), JWT guard, rate limit (`@nestjs/throttler`), request logging, `/health`.

| Module | Endpoints |
|---|---|
| auth | `POST /auth/google`, `POST /auth/refresh`, `POST /auth/logout`, (v2) `POST/GET/DELETE /auth/tokens` |
| me | `GET /me`, `PATCH /me/settings` |
| sync | `POST /sync/push`, `GET /sync/pull?since=` |
| integrations | `GET /integrations/google/calendars`, `PUT /integrations/google/calendars` (timetable/busy ids), `POST /integrations/google/sync` (calendar + tasks two-way, returns summary) |
| planner | `POST /planner/suggest` |
| storage | `GET /storage`, `PUT /storage` (validates Cloudinary creds with a ping/signed test), `POST /files/sign`, `POST /files/drive-session`, `GET /files/:id/url` (signed delivery URL if needed) |
| export (v2-ready) | `GET /export/reminders`, `POST /export/reminders/ack` |

CRUD for entities goes **only through sync** (keeps one write path). Server-side side effects after accepted pushes (Google Tasks/Calendar writes) run inside `/integrations/google/sync`, not in the push request.

Vercel: entry `api/index.ts` bootstraps Nest once (cached across invocations) on the Express adapter and exports the handler; or use Vercel's native NestJS support if the current platform offers it — verify at build time. Mongoose: cached connection, `bufferCommands: false`, Atlas IP access 0.0.0.0/0 + strong user.

### Env vars
API: `MONGODB_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` (32-byte base64), `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_WEB_CLIENT_SECRET`, `OWNER_CLOUDINARY_CLOUD_NAME`, `OWNER_CLOUDINARY_API_KEY`, `OWNER_CLOUDINARY_API_SECRET`, `OWNER_EMAIL` (gets the owner Cloudinary by default).
Mobile (`app.config.ts` extra / EAS secrets): `API_URL`, `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID` (SHA-1 of the EAS keystore registered in Google Cloud).

---

## 13. Mobile libraries (suggested)
expo-router · expo-sqlite + drizzle-orm · @tanstack/react-query (API calls) + Drizzle live queries (UI) · zustand (UI state) · @react-native-google-signin/google-signin · expo-secure-store · expo-notifications · expo-document-picker · react-native-document-scanner-plugin · pdf-lib · expo-file-system · expo-intent-launcher · expo-sharing · @react-native-community/netinfo · react-native-android-widget · lucide-react-native · react-native-reanimated + react-native-gesture-handler (swipe to finish, sheets) · chrono-node (in shared).

---

## 14. Build steps (one continuous build — implement all, in this order)

1. **Repo setup** — pnpm monorepo (`apps/mobile`, `apps/api`, `packages/shared`, `modules/duely-alarm`), TypeScript strict, ESLint/Prettier, Jest, CI running typecheck + tests.
2. **Shared package** — types, zod schemas for every entity (§5), constants (course palette, defaults), pure helpers: progress calc, alarm-time computation, free-slot finder, smart-text parser (§10) with its tests.
3. **API core** — NestJS app with Vercel entry, cached Mongoose connection, all Mongoose models (§5.1), encryption util, `/health`.
4. **Auth** — `POST /auth/google` (ID token verify + code exchange + encrypted refresh token), JWT access/refresh with rotation, guard, `/me` + settings.
5. **Sync** — `/sync/push` (LWW on `updatedAt`, `rev` bump, conflicts) and `/sync/pull?since=`, with tests.
6. **Mobile shell** — Expo app with dev client + EAS config, expo-router tabs (Today · Assignments · + · Calendar · Exams), theme tokens + fonts (light/dark/system), icon set.
7. **Local data layer** — expo-sqlite + Drizzle schema mirroring §5, outbox, sync engine (§6) with NetInfo triggers, secure token storage.
8. **Sign-in & onboarding** — Google sign-in, timetable/busy calendar pickers (wired in step 13), course confirmation with short name + colour (owner seed offered), storage choice, permissions screens.
9. **Semesters & courses** — Courses screen: semester switcher/create/archive, add/edit course (short name, colour, code, match rules), swipe → Finish, Finished archive. Finished courses excluded from filters, alarms, prompts and Tasks sync.
10. **Assignments** — Assignments list (course chips by short name, Overdue/This week/Later) and Assignment screen: all fields, subtasks with dates, auto/manual progress, group records, notes & links, status flow, grade.
11. **Quick add** — smart-text field with live coloured spans, parsed rows editable, Assignment | Exam toggle, attach/scan buttons (wired in step 18), save offline.
12. **Exams** — Exam screen: countdown, topics checklist, manual study sessions; exam creation from Quick add.
13. **Google Calendar** — calendar list/pick endpoints, course matching + "which course is this?" flow, ClassSession cache (21 days), "Duely" calendar creation, session write/update/delete both ways, `/integrations/google/sync`.
14. **Planner** — `/planner/suggest` (freebusy, work hours, spread, before due) + Plan sessions screen (day strip, timeline, dashed suggestions, accept one / Add all / pick myself).
15. **Google Tasks** — "School" list, assignment ↔ task and subtask ↔ child task, two-way completion, time in notes, active courses only.
16. **Today screen** — merged timeline (classes, sessions, meetings, due items) + class-ended card; dark variant via tokens.
17. **Notifications** — due reminders, exam reminders, session-start, class-end prompt with Add/No/Later actions, weekly review + Weekly check screen.
18. **Class alarm native module** — `duely-alarm` (§8.1) with config plugin, permission checks/fix buttons, scheduling from ClassSessions (every class, 30 min, snooze 5, ring on silent), boot/time-change rescheduling.
19. **Files** — pick, scan → PDF, local copy first, Cloudinary signed direct upload (owner + user credentials, PDF-delivery checklist), Google Drive resumable upload (`drive.file`, incremental scope), download/offline cache, phone-folder mirror via SAF, Open with…
20. **Settings** — all groups in §11.3 #11, sign out.
21. **Widgets** — medium (next class/session + 2 due + add), small (due count), small exam countdown; refresh on data change and every 30 min.
22. **v2 hooks** — `/export/reminders` + ack and personal API tokens (no Mac helper yet).
23. **Polish & hardening** — empty states, error/retry UI, upload indicators, accessibility (labels, 44 px targets, contrast), performance (cold start < 2 s, 60 fps lists), security checks (§16).
24. **Test & ship** — full test suite (§15), Maestro flows, manual alarm checklist on the owner's phone, EAS `preview` build (APK) installed on the phone, deploy API to Vercel production.

**Done when all of these pass on the owner's phone:**
- Sign in, confirm courses, and a course created offline appears in Atlas after reconnecting.
- "PL/SQL lab on cursors fri 5pm group" creates the right group assignment offline.
- Finishing a course hides it from lists, filters, alarms and prompts.
- Locked + silent phone: full-screen alarm 30 min before each class; Snooze rings again 5 min later.
- Accepting suggested slots creates events in the "Duely" Google calendar; completing a task in Google Tasks marks the assignment done in Duely.
- A handout scanned offline opens from the phone folder in another app and uploads once online.
- Widgets show the next class and due items.

---

## 15. Testing
- `packages/shared`: Jest — parser (≥30 cases), progress calc, alarm-time computation, slot finder (pure function over busy intervals).
- API: Jest + mongodb-memory-server — sync LWW, conflicts, auth refresh rotation, Google sync with mocked googleapis.
- Mobile: component tests for Quick add & Today; **Maestro** flows for: onboarding, quick add, finish course, plan session.
- Manual device checklist for alarms (locked, silent, DND, reboot, timezone change) and permissions denied paths.

## 16. Security & privacy
Encrypt Google refresh tokens and Cloudinary secrets at rest; never return secrets to the client; JWT rotation; per-user scoping on every query (`userId` from token, never from body); validate file MIME/size (max 25 MB per file in v1); signed Cloudinary delivery for raw files if the account requires it; log no tokens or file contents.

---

## 17. How Claude Code should work on this
1. Read this file fully; create `CLAUDE.md` pointing to it with build/test commands.
2. Implement all build steps in §14 in order without stopping between them; run typecheck + tests as you go, and at the end report against the "Done when" list.
3. Ask the owner before: changing a locked decision (§2), adding a paid service, or requesting new Google scopes.
4. Keep UI faithful to §11 — minimal words, white space, short course names.
