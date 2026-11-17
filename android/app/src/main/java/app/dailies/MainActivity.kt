package app.dailies

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.glance.appwidget.updateAll
import androidx.webkit.WebViewAssetLoader
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class MainActivity : Activity() {
    private lateinit var web: WebView
    private val scope = MainScope()

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        web = WebView(this)
        root.addView(web)
        setContentView(root)

        // Draw edge to edge, but keep the page clear of the status and navigation bars.
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web.setBackgroundColor(getColor(R.color.app_bg))
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == WebViewAssetLoader.DEFAULT_DOMAIN) return false
                openExternal(request.url)
                return true
            }

            override fun onPageFinished(view: WebView, url: String) = applyAccent()
        }
        web.addJavascriptInterface(Bridge(), "DailiesAndroid")
        web.loadUrl("https://${WebViewAssetLoader.DEFAULT_DOMAIN}/assets/index.html")
    }

    override fun onResume() {
        super.onResume()
        // pick up anything ticked in a widget while we were away
        web.evaluateJavascript("window.dailiesRefresh && window.dailiesRefresh()", null)
    }

    override fun onDestroy() {
        scope.cancel()
        web.destroy()
        super.onDestroy()
    }

    // Use the phone's Material You accent for the page's green (Android 12+).
    private fun applyAccent() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val night = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val c = getColor(if (night) android.R.color.system_accent1_200 else android.R.color.system_accent1_600)
        val hex = String.format("#%06X", c and 0xFFFFFF)
        web.evaluateJavascript("document.documentElement.style.setProperty('--done','$hex')", null)
    }

    private fun openExternal(uri: Uri) {
        if (uri.scheme != "https" && uri.scheme != "http") return
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: Exception) {
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun load(): String = Store.raw(applicationContext)

        @JavascriptInterface
        fun save(value: String) {
            Store.setRaw(applicationContext, value)
            scope.launch { DailiesWidget().updateAll(applicationContext) }
        }

        @JavascriptInterface
        fun loadGames(): String = Games.raw(applicationContext)

        @JavascriptInterface
        fun saveGames(value: String) {
            Games.setRaw(applicationContext, value)
            scope.launch { DailiesWidget().updateAll(applicationContext) }
        }

        @JavascriptInterface
        fun open(url: String) {
            runOnUiThread { openExternal(Uri.parse(url)) }
        }
    }
}
