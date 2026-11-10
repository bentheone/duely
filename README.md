# Duely

Personal school-assignment manager for AUCA students — Android first. Spec: [`SPEC.md`](SPEC.md).

```
apps/mobile        Expo SDK 58 app (expo-router, expo-sqlite + Drizzle, offline-first)
apps/api           NestJS 11 API for Vercel (Mongoose / MongoDB Atlas)
packages/shared    types, zod schemas, smart-text parser, planner/alarm/reminder helpers
modules/duely-alarm  Kotlin Expo module: full-screen class alarms + config plugin
```

## Develop

```bash
pnpm install
pnpm typecheck && pnpm lint && pnpm test
```

API locally: copy `apps/api/.env.example` → `apps/api/.env`, fill it in, then `pnpm --filter @duely/api dev`.

## One-time setup (owner)

### 1. Google Cloud console
1. Create a project, enable **Google Calendar API**, **Google Tasks API**, **Google Drive API**.
2. OAuth consent screen → External, *Testing*; add scopes `calendar`, `tasks`, `drive.file`; add yourself (and up to 100 classmates) as **test users**.
3. Credentials:
   - **Web application** client → this is `GOOGLE_WEB_CLIENT_ID` / `GOOGLE_WEB_CLIENT_SECRET` (API + app).
   - **Android** client → package `app.duely`, SHA-1 of the EAS keystore (`npx eas-cli credentials -p android`). Also add the SHA-1 of the dev-client keystore if you use one.

### 2. MongoDB Atlas
Free cluster, database user with a strong password, Network Access `0.0.0.0/0` (Vercel has no fixed IPs). Copy the SRV string → `MONGODB_URI`.

### 3. Deploy the API (Vercel)
```bash
cd apps/api
vercel link                     # project root = apps/api
vercel env add MONGODB_URI      # repeat for every var in .env.example
vercel --prod
```
Generate secrets with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
(`ENCRYPTION_KEY` must be exactly 32 bytes base64). `OWNER_EMAIL` + `OWNER_CLOUDINARY_*` give the owner's
account Cloudinary storage by default. Check `https://<deployment>/health`.

### 4. Cloudinary
Settings → Security → enable **“Allow delivery of PDF and ZIP files”** (new accounts block PDFs).

### 5. Build the Android app (EAS, in the cloud)
```bash
cd apps/mobile
npx eas-cli login
npx eas-cli init                                   # sets EAS_PROJECT_ID
npx eas-cli env:create --name API_URL --value https://<your-api>.vercel.app --environment preview
npx eas-cli env:create --name GOOGLE_WEB_CLIENT_ID --value <web client id> --environment preview
npx eas-cli build -p android --profile preview     # APK → install on the phone
```
For day-to-day development: `--profile development` once, then `pnpm --filter @duely/mobile start`.

### 6. On the phone
Sign in → pick the timetable calendar → confirm courses → storage → allow notifications, **Alarms & reminders**
and **full-screen alarm**. Then work through [`apps/mobile/ALARM_CHECKLIST.md`](apps/mobile/ALARM_CHECKLIST.md).

## Tests
- `packages/shared`: parser (40+ cases), progress, alarm times, slot finder, reminders.
- `apps/api`: mongodb-memory-server — auth + refresh rotation, sync LWW/conflicts/scoping, Google sync with mocked googleapis, planner, storage signing, v2 export.
- `apps/mobile`: Quick add & Today component tests (`jest-expo`), Maestro flows in `apps/mobile/.maestro/` (`maestro test apps/mobile/.maestro`).
