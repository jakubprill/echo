// Echo's Android activity. `tauri android init` generates src-tauri/gen/android (not committed);
// scripts/android-shell.mjs then replaces the generated MainActivity with this file.
//
// Tauri draws the app edge to edge, under the status bar and the navigation bar, but the
// Android WebView reports 0 for env(safe-area-inset-*). This activity measures the system bars
// and passes them to the web app through a JavaScript bridge (see src/platform/insets.ts).
package {{package}}

import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  @Volatile private var insetsJson = "{\"top\":0,\"right\":0,\"bottom\":0,\"left\":0}"

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
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
  }
}
