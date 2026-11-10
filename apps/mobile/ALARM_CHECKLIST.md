# Manual alarm checklist (owner's phone) — §15

Run on the EAS `preview` APK. Use a timetable event ~35 min ahead (or set lead time so the alarm is 2 min away).

| # | Scenario | Expected | ✓ |
|---|----------|----------|---|
| 1 | Settings → Class alarm → all three permission rows show ✓ | Notifications, Exact alarms, Full-screen alarm allowed | |
| 2 | Phone **locked**, ringer **normal** | Full-screen alarm (course colour, time, short name, "in 30 min · room"), sound + vibration | |
| 3 | Phone locked, **silent/vibrate**, Ring on silent = on | Still rings on the alarm stream | |
| 4 | Ring on silent = off, phone silent | Vibrates only | |
| 5 | **DND** on (alarms allowed — Android default) | Rings | |
| 6 | Tap **Snooze 5 min** | Stops; rings again 5 min later | |
| 7 | Leave it ringing 10 min | Auto-snoozes once, then stops after the next 10 min | |
| 8 | Tap **Stop** | Silent, notification gone; no repeat | |
| 9 | **Reboot** with an alarm pending | Alarm still fires (BOOT_COMPLETED reschedule) | |
| 10 | Change **time zone** / set time manually | Alarm still at the right wall-clock time | |
| 11 | Revoke "Alarms & reminders" | Settings shows **Allow** button → opens system screen; alarm falls back to inexact | |
| 12 | Revoke full-screen intent (Android 14+) | **Allow** button deep-links to the full-screen settings page | |
| 13 | Finish the course | Its alarms disappear after the next app open/sync | |
| 14 | App force-stopped / killed | Alarm still fires (native, no JS needed) | |
