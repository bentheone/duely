package expo.modules.duelyalarm

import android.content.Context
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Writes uncaught native (Java/Kotlin) crashes to a file so the next app launch can show them
 * on screen — release/preview builds have no Metro log. Chains to the previous handler.
 */
object CrashRecorder {
  private const val FILE = "duely-native-crash.txt"
  @Volatile private var installed = false

  fun install(ctx: Context) {
    if (installed) return
    installed = true
    val app = ctx.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, error ->
      try {
        val sw = StringWriter()
        error.printStackTrace(PrintWriter(sw))
        val text = "time=${System.currentTimeMillis()}\nthread=${thread.name}\n${sw.toString().lines().take(40).joinToString("\n")}"
        File(app.filesDir, FILE).writeText(text)
      } catch (_: Throwable) {
      }
      previous?.uncaughtException(thread, error)
    }
  }

  fun record(ctx: Context, where: String, error: Throwable) {
    try {
      val sw = StringWriter()
      error.printStackTrace(PrintWriter(sw))
      File(ctx.applicationContext.filesDir, FILE)
        .writeText("time=${System.currentTimeMillis()}\nwhere=$where\n${sw.toString().lines().take(40).joinToString("\n")}")
    } catch (_: Throwable) {
    }
  }

  /** Returns and deletes the last recorded crash. */
  fun consume(ctx: Context): String? {
    val f = File(ctx.applicationContext.filesDir, FILE)
    if (!f.exists()) return null
    return try {
      f.readText().also { f.delete() }
    } catch (_: Throwable) {
      null
    }
  }
}
