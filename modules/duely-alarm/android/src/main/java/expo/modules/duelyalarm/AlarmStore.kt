package expo.modules.duelyalarm

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class AlarmSpec(
  val id: String,
  val triggerAt: Long,
  val title: String,
  val subtitle: String,
  val color: String,
  /** True once the alarm already auto-snoozed after ringing unanswered for 10 min. */
  val autoSnoozed: Boolean = false,
) {
  fun toJson(): JSONObject = JSONObject()
    .put("id", id).put("triggerAt", triggerAt).put("title", title)
    .put("subtitle", subtitle).put("color", color).put("autoSnoozed", autoSnoozed)

  companion object {
    fun fromJson(o: JSONObject) = AlarmSpec(
      id = o.getString("id"),
      triggerAt = o.getLong("triggerAt"),
      title = o.optString("title"),
      subtitle = o.optString("subtitle"),
      color = o.optString("color", "#C2410C"),
      autoSnoozed = o.optBoolean("autoSnoozed", false),
    )
  }
}

/** Scheduled alarms + options persisted in SharedPreferences so they survive reboots (§8.1). */
object AlarmStore {
  private const val PREFS = "duely_alarm"
  private const val KEY_ALARMS = "alarms"
  private const val KEY_PENDING = "pending_actions"
  private const val KEY_SNOOZE = "snooze_minutes"
  private const val KEY_RING_SILENT = "ring_on_silent"

  private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun all(ctx: Context): List<AlarmSpec> {
    val raw = prefs(ctx).getString(KEY_ALARMS, "[]") ?: "[]"
    val arr = JSONArray(raw)
    return (0 until arr.length()).map { AlarmSpec.fromJson(arr.getJSONObject(it)) }
  }

  fun saveAll(ctx: Context, alarms: List<AlarmSpec>) {
    val arr = JSONArray()
    alarms.forEach { arr.put(it.toJson()) }
    prefs(ctx).edit().putString(KEY_ALARMS, arr.toString()).apply()
  }

  fun get(ctx: Context, id: String): AlarmSpec? = all(ctx).firstOrNull { it.id == id }

  fun upsert(ctx: Context, alarm: AlarmSpec) {
    saveAll(ctx, all(ctx).filter { it.id != alarm.id } + alarm)
  }

  fun remove(ctx: Context, id: String) {
    saveAll(ctx, all(ctx).filter { it.id != id })
  }

  fun snoozeMinutes(ctx: Context): Int = prefs(ctx).getInt(KEY_SNOOZE, 5)
  fun ringOnSilent(ctx: Context): Boolean = prefs(ctx).getBoolean(KEY_RING_SILENT, true)

  fun setOptions(ctx: Context, snooze: Int, ringOnSilent: Boolean) {
    prefs(ctx).edit().putInt(KEY_SNOOZE, snooze).putBoolean(KEY_RING_SILENT, ringOnSilent).apply()
  }

  fun addPendingAction(ctx: Context, id: String, action: String) {
    val arr = JSONArray(prefs(ctx).getString(KEY_PENDING, "[]"))
    arr.put(JSONObject().put("id", id).put("action", action))
    prefs(ctx).edit().putString(KEY_PENDING, arr.toString()).apply()
  }

  fun consumePendingActions(ctx: Context): List<Map<String, String>> {
    val arr = JSONArray(prefs(ctx).getString(KEY_PENDING, "[]"))
    prefs(ctx).edit().putString(KEY_PENDING, "[]").apply()
    return (0 until arr.length()).map {
      val o = arr.getJSONObject(it)
      mapOf("id" to o.getString("id"), "action" to o.getString("action"))
    }
  }
}
