// Config plugin for duely-alarm (§8.1). The library manifest already declares the receiver,
// service and activity; this plugin makes sure the app manifest carries every permission
// and lets the owner switch to USE_EXACT_ALARM (alarm-clock apps) for a Play release.
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

module.exports = function withDuelyAlarm(config, props = {}) {
  const exact = props.useExactAlarm
    ? 'android.permission.USE_EXACT_ALARM'
    : 'android.permission.SCHEDULE_EXACT_ALARM';
  return withAndroidManifest(config, (cfg) => {
    AndroidConfig.Permissions.ensurePermissions(cfg.modResults, [...BASE, exact]);
    return cfg;
  });
};
