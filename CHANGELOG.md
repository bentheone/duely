# Changelog

Versions follow `major.minor.patch`: **minor** for new features, **patch** for fixes. Keep
`apps/mobile/app.config.ts` (`version`), every `package.json`, and `API_VERSION` in
`apps/api/src/app.module.ts` on the same number. Android build numbers (versionCode) increase
automatically with every EAS build.

## 1.2.0
- Exams live under Assignments behind a header switch (Assignments | Exams)
- Communities tab (replaces Exams) with a Communities | Colleagues switch; Colleagues lists people
  you share a community with
- Usernames (Settings → Profile), shown to colleagues and community members
- Notifications and an unread badge for new community posts (checked after syncs and in the
  background); Settings → Communities to turn notifications off
- Community auto-save: members opt in, creators mark posts "Save for members"

## 1.1.0
- Lectures tab with a block editor (headings, lists, checklists, quotes, relook-later points),
  photos, files and voice notes; log / recap reminders
- Course communities (QR / link invites, shared feed, save to my Duely)
- Course class times (in Duely or Google Calendar too), semester dates, delete empty semesters
- Swipeable calendar weeks and month picker; share an assignment/exam/lecture with a friend
- In-app update check against GitHub builds

## 1.0.0
- First release (SPEC §14)
