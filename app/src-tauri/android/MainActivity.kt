// Echo's Android activity. `tauri android init` generates src-tauri/gen/android (not committed);
// scripts/android-shell.mjs then replaces the generated MainActivity with this file.
//
// Tauri draws the app edge to edge, under the status bar and the navigation bar, but the
// Android WebView reports 0 for env(safe-area-inset-*). This activity measures the system bars
// and passes them to the web app through a JavaScript bridge (see src/platform/insets.ts).
// The same bridge downloads and installs app updates from GitHub Releases (src/platform/update.ts).
package {{package}}

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  @Volatile private var insetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(Bridge(), "EchoAndroid")
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val density = view.resources.displayMetrics.density
      insetsJson = "{\"top\":${bars.top / density},\"right\":${bars.right / density}," +
        "\"bottom\":${bars.bottom / density},\"left\":${bars.left / density}}"
      notify(view as WebView)
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  // The page may still be loading when the insets arrive, so the event is repeated a few times;
  // the page also reads the bridge itself on startup.
  private fun notify(webView: WebView) {
    for (delay in longArrayOf(0, 500, 1500, 4000)) {
      webView.postDelayed({ webView.evaluateJavascript("window.dispatchEvent(new Event('echo-insets'))", null) }, delay)
    }
  }

  inner class Bridge {
    @JavascriptInterface
    fun insets(): String = insetsJson

    @JavascriptInterface
    fun setDarkBars(dark: Boolean) {
      runOnUiThread {
        val controller = WindowCompat.getInsetsController(window, window.decorView)
        controller.isAppearanceLightStatusBars = !dark
        controller.isAppearanceLightNavigationBars = !dark
      }
    }

    // Self-update. Only APKs from this repository's GitHub releases are accepted; Android
    // installs them over the running app only when they carry the same signing key.

    /** Starts downloading the APK into the app's own files; returns the download id, or "" on refusal. */
    @JavascriptInterface
    fun downloadUpdate(url: String, name: String): String {
      if (!url.startsWith(UPDATE_PREFIX) || !name.endsWith(".apk")) return ""
      cleanupUpdates()
      val file = name.replace(Regex("[^A-Za-z0-9._-]"), "_")
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle("Echo")
        .setDescription(file)
        .setMimeType(APK_TYPE)
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
        .setDestinationInExternalFilesDir(this@MainActivity, Environment.DIRECTORY_DOWNLOADS, file)
      val id = downloads().enqueue(request)
      prefs().edit().putLong(LAST_DOWNLOAD, id).apply()
      return id.toString()
    }

    /** {"state":"running"|"done"|"failed","done":bytes,"total":bytes} */
    @JavascriptInterface
    fun updateStatus(id: String): String {
      val n = id.toLongOrNull() ?: return "{\"state\":\"failed\"}"
      downloads().query(DownloadManager.Query().setFilterById(n)).use { c ->
        if (!c.moveToFirst()) return "{\"state\":\"failed\"}"
        val status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
        val done = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR))
        val total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES))
        val state = when (status) {
          DownloadManager.STATUS_SUCCESSFUL -> "done"
          DownloadManager.STATUS_FAILED -> "failed"
          else -> "running"
        }
        return "{\"state\":\"$state\",\"done\":$done,\"total\":$total}"
      }
    }

    /** Opens the system installer: "started", "permission" (settings opened first) or "failed". */
    @JavascriptInterface
    fun installUpdate(id: String): String {
      val n = id.toLongOrNull() ?: return "failed"
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !packageManager.canRequestPackageInstalls()) {
        runOnUiThread {
          startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
        }
        return "permission"
      }
      val uri = downloads().getUriForDownloadedFile(n) ?: return "failed"
      val intent = Intent(Intent.ACTION_VIEW)
        .setDataAndType(uri, APK_TYPE)
        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
      // No resolveActivity() check: Android 11+ hides other apps from it without a <queries> entry.
      runOnUiThread {
        try {
          startActivity(intent)
        } catch (e: Exception) {
          webView?.evaluateJavascript("window.dispatchEvent(new Event('echo-update-failed'))", null)
        }
      }
      return "started"
    }

    /** Deletes the last downloaded APK (called once the app is up to date). */
    @JavascriptInterface
    fun cleanupUpdates() {
      val last = prefs().getLong(LAST_DOWNLOAD, -1L)
      if (last >= 0) downloads().remove(last)
      prefs().edit().remove(LAST_DOWNLOAD).apply()
      getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)?.listFiles()?.filter { it.name.endsWith(".apk") }?.forEach { it.delete() }
    }
  }

  private fun downloads() = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  private fun prefs() = getSharedPreferences("echo-update", Context.MODE_PRIVATE)

  companion object {
    private const val UPDATE_PREFIX = "https://github.com/jakubprill/echo/releases/download/"
    private const val APK_TYPE = "application/vnd.android.package-archive"
    private const val LAST_DOWNLOAD = "lastDownload"
  }
}
