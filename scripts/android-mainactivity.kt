package app.linkvault.desktop

import android.content.Intent
import android.os.Bundle
import android.util.Log
import androidx.activity.enableEdgeToEdge
import java.io.File

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // Intercept SEND intents BEFORE the Tauri WebView starts. If we let
    // TauriActivity see a non-MAIN intent, some plugin chain can panic on
    // missing data. We persist the share payload then swap in a vanilla
    // launcher intent so the runtime initializes normally.
    val original = intent
    if (original?.action == Intent.ACTION_SEND) {
      runCatching { handleShareIntent(original) }
        .onFailure { Log.e("LinkVault", "share onCreate failed", it) }
      setIntent(makeLauncherIntent())
    }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onNewIntent(intent: Intent?) {
    if (intent?.action == Intent.ACTION_SEND) {
      runCatching { handleShareIntent(intent) }
        .onFailure { Log.e("LinkVault", "share onNewIntent failed", it) }
      val cleaned = makeLauncherIntent()
      setIntent(cleaned)
      super.onNewIntent(cleaned)
    } else {
      super.onNewIntent(intent)
    }
  }

  private fun makeLauncherIntent(): Intent =
    Intent(Intent.ACTION_MAIN).apply {
      addCategory(Intent.CATEGORY_LAUNCHER)
      setClass(applicationContext, MainActivity::class.java)
    }

  /**
   * Persists incoming SEND payloads to `pending_share.json` inside the app's
   * private filesDir. Rust reads + clears it on app focus.
   */
  private fun handleShareIntent(intent: Intent?) {
    if (intent == null) return
    if (intent.action != Intent.ACTION_SEND) return
    val mime = intent.type ?: return
    val dir = filesDir
    if (!dir.exists()) dir.mkdirs()
    val payloadFile = File(dir, "pending_share.json")
    when {
      mime.startsWith("text/") -> {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
        payloadFile.writeText("""{"kind":"text","data":${jsonString(text)}}""")
      }
      mime.startsWith("audio/") -> {
        @Suppress("DEPRECATION")
        val uri = intent.getParcelableExtra<android.net.Uri>(Intent.EXTRA_STREAM) ?: return
        payloadFile.writeText("""{"kind":"audio","data":${jsonString(uri.toString())}}""")
      }
    }
  }

  private fun jsonString(s: String): String {
    val sb = StringBuilder("\"")
    for (c in s) {
      when (c) {
        '\\' -> sb.append("\\\\")
        '"' -> sb.append("\\\"")
        '\n' -> sb.append("\\n")
        '\r' -> sb.append("\\r")
        '\t' -> sb.append("\\t")
        '\b' -> sb.append("\\b")
        else -> if (c.code < 0x20) sb.append(String.format("\\u%04x", c.code)) else sb.append(c)
      }
    }
    sb.append("\"")
    return sb.toString()
  }
}
