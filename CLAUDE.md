# Duely

Read `SPEC.md` first — it is the source of truth. Build steps are §14; keep UI faithful to §11.

## Layout
- `packages/shared` — types, zod schemas, smart-text parser, planner/alarms/reminder helpers (pure, tested)
- `apps/api` — NestJS on Vercel (`api/index.ts` entry), Mongoose
- `apps/mobile` — Expo (SDK 58) + expo-router, expo-sqlite/Drizzle offline store
- `modules/duely-alarm` — Expo native module (Kotlin) for full-screen class alarms + config plugin

## Commands
```bash
pnpm install
pnpm typecheck          # builds shared, then tsc in every workspace
pnpm test               # jest in every workspace (API uses mongodb-memory-server)
pnpm lint
pnpm --filter @duely/api dev                  # local API on :3000 (needs apps/api/.env)
pnpm --filter @duely/mobile start             # Metro for the dev client
cd apps/mobile && npx eas-cli build -p android --profile preview   # APK in the cloud
cd apps/api && vercel --prod                  # deploy API
```

## Rules
- Mobile: use `npx expo install <pkg>` for native deps. Never edit `android/` by hand — use config plugins.
- `@duely/shared` must be rebuilt (`pnpm build:shared`) before API typecheck/tests; Metro reads its `src` directly.
- Entity CRUD only goes through `/sync` (one write path). Every server query is scoped by `userId` from the JWT.
- Ask the owner before changing a §2 locked decision, adding a paid service, or new Google scopes.
