package expo.modules.duelyalarm

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import java.lang.ref.WeakReference

class AlarmRecord : Record {
  @Field var id: String = ""
  @Field var triggerAt: Double = 0.0
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var color: String = "#C2410C"
}

class OptionsRecord : Record {
  @Field var snoozeMinutes: Int = 5
  @Field var ringOnSilent: Boolean = true
}

/** JS API (§8.1). */
class DuelyAlarmModule : Module() {
  companion object {
    private var instance: WeakReference<DuelyAlarmModule>? = null

    /** Called from the service when the user stops/snoozes; delivered live if JS is running. */
    fun emit(id: String, action: String) {
      instance?.get()?.sendEvent("alarmAction", mapOf("id" to id, "action" to action))
    }
  }

  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  override fun definition() = ModuleDefinition {
    Name("DuelyAlarm")
    Events("alarmAction")

    OnCreate {
      instance = WeakReference(this@DuelyAlarmModule)
      appContext.reactContext?.let { CrashRecorder.install(it) }
    }
    OnDestroy { if (instance?.get() == this@DuelyAlarmModule) instance = null }

    AsyncFunction("scheduleAlarms") { alarms: List<AlarmRecord> ->
      AlarmScheduler.replaceAll(
        context,
        alarms.map { AlarmSpec(it.id, it.triggerAt.toLong(), it.title, it.subtitle, it.color) },
      )
    }

    AsyncFunction("cancelAll") { AlarmScheduler.cancelAll(context) }

    AsyncFunction("setOptions") { opts: OptionsRecord ->
      AlarmStore.setOptions(context, opts.snoozeMinutes, opts.ringOnSilent)
    }

    AsyncFunction("canUseFullScreenIntent") {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (Build.VERSION.SDK_INT >= 34) nm.canUseFullScreenIntent() else true
    }

    Function("openFullScreenIntentSettings") {
      if (Build.VERSION.SDK_INT >= 34) {
        openSettings(Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}")))
      } else {
        openSettings(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName))
      }
    }

    AsyncFunction("canScheduleExact") { AlarmScheduler.canScheduleExact(context) }

    Function("openExactAlarmSettings") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        openSettings(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}")))
      } else {
        openSettings(null)
      }
    }

    AsyncFunction("isIgnoringBatteryOptimizations") {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("openBatterySettings") {
      // Shows the list where the user can set Duely to "Unrestricted"/"Don't optimise".
      openSettings(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }

    AsyncFunction("testAlarm") { inSeconds: Int ->
      AlarmScheduler.scheduleTest(context, inSeconds, "Test alarm", "Duely class alarm check", "#EA580C")
    }

    AsyncFunction("nextAlarm") {
      AlarmScheduler.next(context)?.let { mapOf("id" to it.id, "triggerAt" to it.triggerAt.toDouble(), "title" to it.title) }
    }

    AsyncFunction("consumeNativeCrash") { CrashRecorder.consume(context) }

    AsyncFunction("consumePendingActions") { AlarmStore.consumePendingActions(context) }
  }

  /**
   * Opens a settings screen without ever throwing: some OEM builds (Samsung, Xiaomi, Tecno…) lack
   * the specific page, which used to crash the app. Falls back to the app's own settings page.
   */
  private fun openSettings(intent: Intent?) {
    val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${context.packageName}"))
    for (i in listOfNotNull(intent, fallback)) {
      try {
        context.startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return
      } catch (_: Exception) {
      }
    }
  }
}
