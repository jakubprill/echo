// Echo's Android activity. `tauri android init` generates src-tauri/gen/android (not committed);
// scripts/android-shell.mjs then replaces the generated MainActivity with this file.
//
// Tauri draws the app edge to edge, under the status bar and the navigation bar, but the
// Android WebView reports 0 for env(safe-area-inset-*). This activity measures the system bars
// and passes them to the web app through a JavaScript bridge (see src/platform/insets.ts).
// The same bridge downloads and installs app updates from GitHub Releases (src/platform/update.ts)
// and runs the system speech recogniser for the voice mode (src/platform/listen.ts), because the
// Android WebView has no Web Speech API.
package {{package}}

import android.Manifest
import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null
  @Volatile private var insetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"

  // Voice mode: one recogniser at a time; events carry the id of the listen() call they answer.
  private var recognizer: SpeechRecognizer? = null
  private var listenId = ""
  private var pendingListen: Pair<String, String>? = null
  private val micPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
    val pending = pendingListen
    pendingListen = null
    if (pending != null) {
      if (granted) startListening(pending.first, pending.second)
      else speechEvent(pending.second, "error", error = "permission")
    }
  }

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

  override fun onPause() {
    // The recogniser must not keep the microphone while Echo is in the background. The microphone
    // permission dialog also pauses the activity; that listen() has to survive it.
    if (pendingListen == null) stopRecognizer()
    super.onPause()
  }

  override fun onDestroy() {
    recognizer?.destroy()
    recognizer = null
    super.onDestroy()
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

    // Voice mode. Results come back as "echo-speech" window events:
    // {"id":…,"type":"ready"|"partial"|"result"|"error","texts":[…],"error":"silence"|"permission"|…}

    @JavascriptInterface
    fun speechAvailable(): Boolean = SpeechRecognizer.isRecognitionAvailable(this@MainActivity)

    /** Starts listening in `lang` (e.g. "pl-PL"): "started", "permission" (Android is asking first) or "unavailable". */
    @JavascriptInterface
    fun listen(lang: String, id: String): String {
      if (!SpeechRecognizer.isRecognitionAvailable(this@MainActivity)) return "unavailable"
      val granted = ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
      runOnUiThread {
        listenId = id
        if (granted) startListening(lang, id)
        else {
          pendingListen = lang to id
          micPermission.launch(Manifest.permission.RECORD_AUDIO)
        }
      }
      return if (granted) "started" else "permission"
    }

    @JavascriptInterface
    fun stopListening() {
      runOnUiThread { stopRecognizer() }
    }

    /** Keeps the screen on during a voice session; a locked phone stops speaking and listening. */
    @JavascriptInterface
    fun keepScreenOn(on: Boolean) {
      runOnUiThread {
        if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
      }
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

  private fun startListening(lang: String, id: String) {
    if (id != listenId) return
    // A fresh recogniser per answer: reusing one leaves some devices stuck in ERROR_RECOGNIZER_BUSY.
    recognizer?.destroy()
    val r = SpeechRecognizer.createSpeechRecognizer(this)
    recognizer = r
    r.setRecognitionListener(object : RecognitionListener {
      override fun onReadyForSpeech(params: Bundle?) = speechEvent(id, "ready")
      override fun onBeginningOfSpeech() {}
      override fun onRmsChanged(rmsdB: Float) {}
      override fun onBufferReceived(buffer: ByteArray?) {}
      override fun onEndOfSpeech() {}
      override fun onError(error: Int) = speechEvent(id, "error", error = errorName(error))
      override fun onResults(results: Bundle?) = speechEvent(id, "result", texts(results))
      override fun onPartialResults(partialResults: Bundle?) = speechEvent(id, "partial", texts(partialResults))
      override fun onEvent(eventType: Int, params: Bundle?) {}
    })
    val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
      .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
      .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      .putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, packageName)
    try {
      r.startListening(intent)
    } catch (e: Exception) {
      speechEvent(id, "error", error = "busy")
    }
  }

  private fun stopRecognizer() {
    listenId = ""
    pendingListen = null
    recognizer?.cancel()
  }

  private fun texts(bundle: Bundle?): List<String> =
    bundle?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.filter { it.isNotBlank() } ?: emptyList()

  private fun errorName(code: Int): String = when (code) {
    SpeechRecognizer.ERROR_SPEECH_TIMEOUT, SpeechRecognizer.ERROR_NO_MATCH -> "silence"
    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> "network"
    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
    // ERROR_LANGUAGE_NOT_SUPPORTED and ERROR_LANGUAGE_UNAVAILABLE (Android 12+).
    12, 13 -> "language"
    else -> "other"
  }

  /** Sends a recogniser event to the page. Events of a cancelled listen() are dropped. */
  private fun speechEvent(id: String, type: String, texts: List<String> = emptyList(), error: String? = null) {
    if (id != listenId) return
    if (type == "result" || type == "error") listenId = ""
    val json = JSONObject().put("id", id).put("type", type).put("texts", JSONArray(texts))
    if (error != null) json.put("error", error)
    val detail = JSONObject.quote(json.toString())
    webView?.post { webView?.evaluateJavascript("window.dispatchEvent(new CustomEvent('echo-speech',{detail:$detail}))", null) }
  }

  private fun downloads() = getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  private fun prefs() = getSharedPreferences("echo-update", Context.MODE_PRIVATE)

  companion object {
    private const val UPDATE_PREFIX = "https://github.com/jakubprill/echo/releases/download/"
    private const val APK_TYPE = "application/vnd.android.package-archive"
    private const val LAST_DOWNLOAD = "lastDownload"
  }
}
