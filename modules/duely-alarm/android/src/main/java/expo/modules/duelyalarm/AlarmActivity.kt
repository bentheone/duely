package expo.modules.duelyalarm

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import java.lang.ref.WeakReference
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Native full-screen alarm (§11.3 #9): time 96, course short name 34, "in 30 min · GB6",
 * 132dp round white Stop, translucent "Snooze 5 min" pill, background = darkened course colour.
 * Native views so it works when the JS app is dead.
 */
class AlarmActivity : Activity() {
  companion object {
    private var current: WeakReference<AlarmActivity>? = null
    fun closeIfShowing() {
      current?.get()?.let { a -> a.runOnUiThread { a.finish() } }
    }
  }

  private var alarmId: String? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    current = WeakReference(this)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
      (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    render(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    render(intent)
  }

  override fun onDestroy() {
    if (current?.get() == this) current = null
    super.onDestroy()
  }

  @Deprecated("Back does nothing — the user must choose Stop or Snooze")
  override fun onBackPressed() {
    // Intentionally ignored.
  }

  private fun dp(v: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, resources.displayMetrics)

  private fun render(intent: Intent) {
    alarmId = intent.getStringExtra(AlarmScheduler.EXTRA_ID)
    val alarm = alarmId?.let { AlarmStore.get(this, it) }
    val bg = safeColor(alarm?.color ?: "#C2410C")
    window.statusBarColor = bg
    window.navigationBarColor = bg

    val root = FrameLayout(this).apply { setBackgroundColor(bg) }
    val column = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setPadding(dp(28f).toInt(), dp(96f).toInt(), dp(28f).toInt(), dp(56f).toInt())
    }

    val time = TextView(this).apply {
      text = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date())
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 96f)
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      letterSpacing = -0.03f
      gravity = Gravity.CENTER
    }
    val title = TextView(this).apply {
      text = alarm?.title ?: "Class"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 34f)
      typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
      gravity = Gravity.CENTER
      setPadding(0, dp(8f).toInt(), 0, 0)
    }
    val subtitle = TextView(this).apply {
      text = alarm?.subtitle ?: ""
      setTextColor(Color.argb(220, 255, 255, 255))
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
      gravity = Gravity.CENTER
      setPadding(0, dp(6f).toInt(), 0, 0)
    }
    val spacer = View(this)

    val stop = TextView(this).apply {
      text = "Stop"
      contentDescription = "Stop alarm"
      setTextColor(bg)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 22f)
      typeface = Typeface.create("sans-serif-medium", Typeface.BOLD)
      gravity = Gravity.CENTER
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.WHITE)
      }
      setOnClickListener { send(AlarmService.ACTION_STOP) }
    }
    val minutes = AlarmStore.snoozeMinutes(this)
    val snooze = TextView(this).apply {
      text = "Snooze $minutes min"
      contentDescription = "Snooze $minutes minutes"
      setTextColor(Color.WHITE)
      setTextSize(TypedValue.COMPLEX_UNIT_SP, 17f)
      gravity = Gravity.CENTER
      setPadding(dp(28f).toInt(), 0, dp(28f).toInt(), 0)
      background = GradientDrawable().apply {
        cornerRadius = dp(28f)
        setColor(Color.argb(56, 255, 255, 255))
      }
      setOnClickListener { send(AlarmService.ACTION_SNOOZE) }
    }

    column.addView(time, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT))
    column.addView(title)
    column.addView(subtitle)
    column.addView(spacer, LinearLayout.LayoutParams(1, 0, 1f))
    column.addView(stop, LinearLayout.LayoutParams(dp(132f).toInt(), dp(132f).toInt()).apply { bottomMargin = dp(28f).toInt() })
    column.addView(snooze, LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, dp(56f).toInt()))
    root.addView(column, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
    setContentView(root)
  }

  private fun send(action: String) {
    val i = Intent(this, AlarmService::class.java).setAction(action).putExtra(AlarmScheduler.EXTRA_ID, alarmId)
    startService(i)
    finish()
  }
}
