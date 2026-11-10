package expo.modules.duelyalarm

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

/**
 * Foreground service that rings (USAGE_ALARM → audible on silent/vibrate when ringOnSilent),
 * vibrates and posts the full-screen alarm notification (§8.1).
 */
class AlarmService : Service() {
  companion object {
    const val ACTION_RING = "expo.modules.duelyalarm.RING"
    const val ACTION_STOP = "expo.modules.duelyalarm.STOP"
    const val ACTION_SNOOZE = "expo.modules.duelyalarm.SNOOZE"
    const val CHANNEL_ID = "duely_class_alarm"
    private const val NOTIFICATION_ID = 0x0D0E
    private const val AUTO_STOP_MS = 10 * 60 * 1000L

    @Volatile var currentId: String? = null
  }

  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private var wakeLock: PowerManager.WakeLock? = null
  private val handler = Handler(Looper.getMainLooper())
  private val autoStop = Runnable { currentId?.let { finish(it, "snooze", auto = true) } }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val id = intent?.getStringExtra(AlarmScheduler.EXTRA_ID)
    when (intent?.action) {
      ACTION_RING -> if (id != null) ring(id) else stopSelf()
      ACTION_STOP -> finish(id ?: currentId ?: "", "stop", auto = false)
      ACTION_SNOOZE -> finish(id ?: currentId ?: "", "snooze", auto = false)
      else -> stopSelf()
    }
    return START_NOT_STICKY
  }

  private fun ring(id: String) {
    val alarm = AlarmStore.get(this, id)
    if (alarm == null) {
      stopSelf()
      return
    }
    if (currentId != null && currentId != id) stopRinging()
    currentId = id
    ensureChannel()
    val notification = buildNotification(alarm)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
    acquireWakeLock()
    startSound()
    startVibration()
    handler.removeCallbacks(autoStop)
    handler.postDelayed(autoStop, AUTO_STOP_MS)
    // Also try launching the activity directly (works when the screen is on / app allowed).
    try {
      startActivity(activityIntent(alarm))
    } catch (_: Exception) {
    }
  }

  private fun activityIntent(alarm: AlarmSpec) = Intent(this, AlarmActivity::class.java)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION)
    .putExtra(AlarmScheduler.EXTRA_ID, alarm.id)

  private fun buildNotification(alarm: AlarmSpec): Notification {
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val fullScreen = PendingIntent.getActivity(this, alarm.id.hashCode(), activityIntent(alarm), flags)
    val stop = PendingIntent.getService(
      this, 1, Intent(this, AlarmService::class.java).setAction(ACTION_STOP).putExtra(AlarmScheduler.EXTRA_ID, alarm.id), flags,
    )
    val snooze = PendingIntent.getService(
      this, 2, Intent(this, AlarmService::class.java).setAction(ACTION_SNOOZE).putExtra(AlarmScheduler.EXTRA_ID, alarm.id), flags,
    )
    val minutes = AlarmStore.snoozeMinutes(this)
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setContentTitle(alarm.title)
      .setContentText(alarm.subtitle)
      .setColor(safeColor(alarm.color))
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setOngoing(true)
      .setAutoCancel(false)
      .setFullScreenIntent(fullScreen, true)
      .setContentIntent(fullScreen)
      .addAction(0, "Stop", stop)
      .addAction(0, "Snooze $minutes min", snooze)
      .build()
  }

  private fun ensureChannel() {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(CHANNEL_ID) != null) return
    val ch = NotificationChannel(CHANNEL_ID, "Class alarms", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Full-screen alarm before each class"
      setSound(null, null) // the service plays the sound itself on the alarm stream
      enableVibration(false)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
    }
    nm.createNotificationChannel(ch)
  }

  private fun startSound() {
    val audio = getSystemService(Context.AUDIO_SERVICE) as AudioManager
    val silent = audio.ringerMode != AudioManager.RINGER_MODE_NORMAL
    if (silent && !AlarmStore.ringOnSilent(this)) return
    val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
      ?: return
    try {
      player = MediaPlayer().apply {
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        setDataSource(this@AlarmService, uri)
        isLooping = true
        prepare()
        start()
      }
    } catch (_: Exception) {
      player = null
    }
  }

  private fun startVibration() {
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    val pattern = longArrayOf(0, 800, 600)
    vibrator?.vibrate(
      VibrationEffect.createWaveform(pattern, 0),
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build(),
    )
  }

  private fun acquireWakeLock() {
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "duely:alarm").apply { acquire(AUTO_STOP_MS + 60_000) }
  }

  private fun stopRinging() {
    handler.removeCallbacks(autoStop)
    try {
      player?.stop()
    } catch (_: Exception) {
    }
    player?.release()
    player = null
    vibrator?.cancel()
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }

  /**
   * Stop or snooze. An unanswered alarm auto-snoozes once after 10 min of ringing,
   * then stops for good on the next timeout.
   */
  private fun finish(id: String, action: String, auto: Boolean) {
    stopRinging()
    // Silence the backup notification too (posted when the service couldn't start in time).
    (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(id.hashCode())
    val alarm = AlarmStore.get(this, id)
    var effective = action
    if (auto && alarm?.autoSnoozed == true) effective = "stop"
    if (effective == "snooze" && alarm != null) {
      AlarmScheduler.snooze(this, id, auto)
    } else {
      AlarmStore.remove(this, id)
    }
    AlarmStore.addPendingAction(this, id, effective)
    DuelyAlarmModule.emit(id, effective)
    AlarmActivity.closeIfShowing()
    currentId = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    stopRinging()
    super.onDestroy()
  }
}

internal fun safeColor(hex: String): Int = try {
  Color.parseColor(hex)
} catch (_: Exception) {
  Color.parseColor("#C2410C")
}
