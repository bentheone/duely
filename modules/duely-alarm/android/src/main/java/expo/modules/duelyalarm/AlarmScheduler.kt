package expo.modules.duelyalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/** AlarmManager.setAlarmClock per alarm — shows in the system alarm UI and survives Doze. */
object AlarmScheduler {
  const val ACTION_FIRE = "expo.modules.duelyalarm.FIRE"
  const val EXTRA_ID = "alarmId"

  private fun requestCode(id: String) = id.hashCode()

  private fun firePendingIntent(ctx: Context, id: String, flags: Int): PendingIntent? {
    val intent = Intent(ctx, AlarmReceiver::class.java).setAction(ACTION_FIRE).putExtra(EXTRA_ID, id)
    return PendingIntent.getBroadcast(ctx, requestCode(id), intent, flags or PendingIntent.FLAG_IMMUTABLE)
  }

  private fun showPendingIntent(ctx: Context): PendingIntent? {
    val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName) ?: return null
    return PendingIntent.getActivity(ctx, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  }

  fun canScheduleExact(ctx: Context): Boolean {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms()
  }

  fun schedule(ctx: Context, alarm: AlarmSpec) {
    if (alarm.triggerAt <= System.currentTimeMillis()) return
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val op = firePendingIntent(ctx, alarm.id, PendingIntent.FLAG_UPDATE_CURRENT) ?: return
    if (canScheduleExact(ctx)) {
      am.setAlarmClock(AlarmManager.AlarmClockInfo(alarm.triggerAt, showPendingIntent(ctx)), op)
    } else {
      // Permission denied: best effort (may be deferred by Doze). The app surfaces a fix button.
      am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, alarm.triggerAt, op)
    }
  }

  fun cancel(ctx: Context, id: String) {
    val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    firePendingIntent(ctx, id, PendingIntent.FLAG_NO_CREATE)?.let {
      am.cancel(it)
      it.cancel()
    }
  }

  /** Replaces every alarm with [alarms]. */
  fun replaceAll(ctx: Context, alarms: List<AlarmSpec>) {
    val now = System.currentTimeMillis()
    // Test alarms ("Test alarm in 1 minute") survive the JS re-sync of class alarms.
    val tests = AlarmStore.all(ctx).filter { it.id.startsWith(TEST_PREFIX) && it.triggerAt > now }
    AlarmStore.all(ctx).filter { !it.id.startsWith(TEST_PREFIX) }.forEach { cancel(ctx, it.id) }
    val future = alarms.filter { it.triggerAt > now } + tests
    AlarmStore.saveAll(ctx, future)
    future.forEach { schedule(ctx, it) }
  }

  const val TEST_PREFIX = "test-"

  fun scheduleTest(ctx: Context, inSeconds: Int, title: String, subtitle: String, color: String) {
    val spec = AlarmSpec("$TEST_PREFIX${System.currentTimeMillis()}", System.currentTimeMillis() + inSeconds * 1000L, title, subtitle, color)
    AlarmStore.upsert(ctx, spec)
    schedule(ctx, spec)
  }

  /** Earliest pending alarm, for the "Next alarm" line in Settings. */
  fun next(ctx: Context): AlarmSpec? = AlarmStore.all(ctx).filter { it.triggerAt > System.currentTimeMillis() }.minByOrNull { it.triggerAt }

  fun cancelAll(ctx: Context) {
    AlarmStore.all(ctx).forEach { cancel(ctx, it.id) }
    AlarmStore.saveAll(ctx, emptyList())
  }

  /** After boot / time change / app update. */
  fun rescheduleFromStore(ctx: Context) {
    val now = System.currentTimeMillis()
    val keep = AlarmStore.all(ctx).filter { it.triggerAt > now }
    AlarmStore.saveAll(ctx, keep)
    keep.forEach { schedule(ctx, it) }
  }

  fun snooze(ctx: Context, id: String, auto: Boolean) {
    val current = AlarmStore.get(ctx, id) ?: return
    val minutes = AlarmStore.snoozeMinutes(ctx)
    val next = current.copy(
      triggerAt = System.currentTimeMillis() + minutes * 60_000L,
      autoSnoozed = auto || current.autoSnoozed,
    )
    AlarmStore.upsert(ctx, next)
    schedule(ctx, next)
  }
}
