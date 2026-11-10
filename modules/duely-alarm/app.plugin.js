// Config plugin for duely-alarm (§8.1). The library manifest already declares the receiver,
// service and activity; this plugin makes sure the app manifest carries every permission.
//
// Exact alarms: with `useExactAlarm: true` (default) the app declares USE_EXACT_ALARM, which
// Android 13+ grants automatically to alarm/calendar apps — class alarms work out of the box.
// SCHEDULE_EXACT_ALARM is kept for Android 12 / 12L (maxSdkVersion 32), where it is auto-granted.
// With `useExactAlarm: false` only SCHEDULE_EXACT_ALARM is declared; on Android 14+ that is
// denied by default and the user must enable "Alarms & reminders" in Settings.
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

const BASE = [
  'android.permission.USE_FULL_SCREEN_INTENT',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.RECEIVE_BOOT_COMPLETED',
  'android.permission.WAKE_LOCK',
  'android.permission.VIBRATE',
];

const SCHEDULE = 'android.permission.SCHEDULE_EXACT_ALARM';
const USE = 'android.permission.USE_EXACT_ALARM';

module.exports = function withDuelyAlarm(config, props = {}) {
  const useExact = props.useExactAlarm !== false;
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    AndroidConfig.Permissions.ensurePermissions(manifest, BASE);
    const perms = (manifest.manifest['uses-permission'] = manifest.manifest['uses-permission'] || []);
    const set = (name, extra) => {
      const i = perms.findIndex((p) => p.$['android:name'] === name);
      const entry = { $: { 'android:name': name, ...extra } };
      if (i >= 0) perms[i] = entry;
      else perms.push(entry);
    };
    if (useExact) {
      set(USE, {});
      set(SCHEDULE, { 'android:maxSdkVersion': '32' });
    } else {
      set(SCHEDULE, {});
    }
    return cfg;
  });
};
