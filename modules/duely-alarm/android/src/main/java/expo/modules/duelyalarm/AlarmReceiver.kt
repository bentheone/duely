package expo.modules.duelyalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/** AlarmManager fires here → start the foreground ringing service. */
class AlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != AlarmScheduler.ACTION_FIRE) return
    val id = intent.getStringExtra(AlarmScheduler.EXTRA_ID) ?: return
    val svc = Intent(context, AlarmService::class.java)
      .setAction(AlarmService.ACTION_RING)
      .putExtra(AlarmScheduler.EXTRA_ID, id)
    try {
      ContextCompat.startForegroundService(context, svc)
    } catch (e: Exception) {
      // Android 12+ refuses background foreground-service starts unless the alarm came from
      // setAlarmClock (exact-alarm permission). Fall back to a full-screen notification that
      // rings on the alarm stream, so the class alarm still goes off.
      CrashRecorder.record(context, "alarm service start", e)
      postFallback(context, id)
    }
  }

  private fun postFallback(ctx: Context, id: String) {
    val alarm = AlarmStore.get(ctx, id) ?: return
    val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(FALLBACK_CHANNEL) == null) {
      val sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      nm.createNotificationChannel(
        NotificationChannel(FALLBACK_CHANNEL, "Class alarms (backup)", NotificationManager.IMPORTANCE_HIGH).apply {
          setSound(sound, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
          enableVibration(true)
          setBypassDnd(true)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        },
      )
    }
    val open = Intent(ctx, AlarmActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      .putExtra(AlarmScheduler.EXTRA_ID, id)
    val pi = PendingIntent.getActivity(ctx, id.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    val n = NotificationCompat.Builder(ctx, FALLBACK_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(alarm.title)
      .setContentText(alarm.subtitle)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setFullScreenIntent(pi, true)
      .setContentIntent(pi)
      .setAutoCancel(true)
      .build()
    n.flags = n.flags or Notification.FLAG_INSISTENT
    try {
      nm.notify(id.hashCode(), n)
    } catch (_: SecurityException) {
      // Notifications denied — nothing more we can do; the app shows the fix button.
    }
  }

  companion object {
    const val FALLBACK_CHANNEL = "duely_class_alarm_backup"
  }
}

/** Re-arms alarms after reboot, clock/timezone changes and app updates. */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    AlarmScheduler.rescheduleFromStore(context)
  }
}
