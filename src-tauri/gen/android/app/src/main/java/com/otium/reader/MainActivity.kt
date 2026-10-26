package com.otium.reader

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  private var ttsBridge: AndroidTtsBridge? = null
  private var immersive = false
  private val mainHandler = Handler(Looper.getMainLooper())

  private var pendingPdfBase64: String? = null
  private var pendingPdfName: String? = null
  private var pendingExportContent: String? = null
  private var pendingExportMime: String? = null
  private var deliveryGeneration = 0
  private var intentGeneration = 0

  /**
   * Otium 1.0 registered a cache-first service worker. WebView storage
   * survives app updates, so that worker would keep serving the old
   * index.html and the new frontend would never start. Remove the worker and
   * its cache storage before the WebView is created. localStorage, IndexedDB
   * and reading progress are stored elsewhere and are preserved.
   */
  private fun clearLegacyServiceWorker() {
    val defaultDir = File(dataDir, "app_webview/Default")
    for (name in arrayOf("Service Worker", "CacheStorage")) {
      val path = File(defaultDir, name)
      if (path.exists()) path.deleteRecursively()
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    clearLegacyServiceWorker()
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        val webView = appWebView
        if (webView == null) {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
          return
        }

        webView.post {
          webView.evaluateJavascript(
            "(function(){ try { return window.__OTIUM_HANDLE_BACK__ ? window.__OTIUM_HANDLE_BACK__() : false; } catch (e) { return false; } })()"
          ) { result ->
            val handled = result?.trim() == "true" || result?.trim() == "\"true\""
            if (!handled) {
              isEnabled = false
              onBackPressedDispatcher.onBackPressed()
              isEnabled = true
            }
          }
        }
      }
    })

    handlePdfIntent(intent)
  }

  override fun onWebViewCreate(webView: WebView) {
    appWebView = webView
    webView.addJavascriptInterface(AndroidUpdateBridge(this, webView), "OtiumAndroid")
    webView.addJavascriptInterface(ThemeBridge(), "OtiumTheme")
    webView.addJavascriptInterface(UiBridge(), "OtiumUi")
    webView.addJavascriptInterface(FileBridge(), "OtiumFile")
    ttsBridge = AndroidTtsBridge(this, webView).also { bridge ->
      webView.addJavascriptInterface(bridge, "OtiumTts")
    }
    schedulePdfDelivery()
  }

  /** Receives the active theme from the shared web UI. */
  private inner class ThemeBridge {
    @JavascriptInterface
    fun setTheme(mode: String, background: String, lightTheme: Boolean) {
      runOnUiThread {
        applySystemBars(background, lightTheme)
      }
    }
  }

  /** Lets the reader hide the Android status and navigation bars on a page tap. */
  private inner class UiBridge {
    @JavascriptInterface
    fun setImmersive(enabled: Boolean) {
      runOnUiThread {
        applyImmersive(enabled)
      }
    }

    @JavascriptInterface
    fun openOtiumScan(): Boolean {
      return try {
        val launchIntent = packageManager.getLaunchIntentForPackage("com.otium.scan")
        if (launchIntent != null) {
          launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          startActivity(launchIntent)
          true
        } else {
          false
        }
      } catch (_: Exception) {
        false
      }
    }

    @JavascriptInterface
    fun isOtiumScanInstalled(): Boolean {
      return try {
        packageManager.getPackageInfo("com.otium.scan", 0)
        true
      } catch (_: Exception) {
        false
      }
    }
  }

  /**
   * Writes backups and Markdown exports through the Storage Access Framework.
   * The web layer hands over the full text; Android shows its own folder picker
   * so the reader chooses where the file lands.
   */
  private inner class FileBridge {
    @JavascriptInterface
    fun saveTextFile(content: String, fileName: String, mimeType: String): Boolean {
      runOnUiThread {
        val safeName = fileName
          .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_")
          .trim()
          .take(120)
          .ifBlank { "otium-export.txt" }

        pendingExportContent = content
        pendingExportMime = mimeType.ifBlank { "text/plain" }

        try {
          val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = pendingExportMime
            putExtra(Intent.EXTRA_TITLE, safeName)
          }
          startActivityForResult(intent, REQUEST_SAVE_TEXT)
        } catch (_: Exception) {
          pendingExportContent = null
          pendingExportMime = null
          Toast.makeText(
            this@MainActivity,
            "No file manager is available to save this file.",
            Toast.LENGTH_LONG
          ).show()
        }
      }
      return true
    }
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    if (requestCode == REQUEST_SAVE_TEXT) {
      val content = pendingExportContent
      pendingExportContent = null
      pendingExportMime = null

      if (resultCode == RESULT_OK && content != null) {
        val uri = data?.data
        if (uri != null) {
          Thread {
            val saved = try {
              contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(content.toByteArray(StandardCharsets.UTF_8))
                stream.flush()
              }
              true
            } catch (_: Exception) {
              false
            }

            runOnUiThread {
              Toast.makeText(
                this@MainActivity,
                if (saved) "File saved" else "Could not save the file",
                Toast.LENGTH_SHORT
              ).show()
            }
          }.start()
        }
      }
      return
    }

    super.onActivityResult(requestCode, resultCode, data)
  }

  private fun applyImmersive(enabled: Boolean) {
    if (isFinishing || isDestroyed) return
    immersive = enabled

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.systemBarsBehavior =
      WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE

    if (enabled) {
      controller.hide(WindowInsetsCompat.Type.systemBars())
    } else {
      controller.show(WindowInsetsCompat.Type.systemBars())
    }
  }

  private fun applySystemBars(background: String, lightTheme: Boolean) {
    if (isFinishing || isDestroyed) return

    val color = try {
      Color.parseColor(background)
    } catch (_: Exception) {
      if (lightTheme) Color.WHITE else Color.BLACK
    }

    // Android 15 draws edge-to-edge and ignores the legacy bar colours; older
    // versions get the page colour so the safe-area bands never flash black.
    if (Build.VERSION.SDK_INT < 35) {
      window.statusBarColor = color
      window.navigationBarColor = color
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isNavigationBarContrastEnforced = false
    }

    WindowInsetsControllerCompat(window, window.decorView).apply {
      isAppearanceLightStatusBars = lightTheme
      isAppearanceLightNavigationBars = lightTheme
    }

    window.decorView.setBackgroundColor(color)
    appWebView?.setBackgroundColor(color)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handlePdfIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    if (immersive) applyImmersive(true)
    schedulePdfDelivery()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // Some OEM skins restore the bars when the window regains focus.
    if (hasFocus && immersive) applyImmersive(true)
  }

  override fun onDestroy() {
    deliveryGeneration += 1
    mainHandler.removeCallbacksAndMessages(null)
    ttsBridge?.shutdown()
    ttsBridge = null
    appWebView = null
    super.onDestroy()
  }

  private fun handlePdfIntent(intent: Intent?) {
    if (intent == null) return

    val uris = extractPdfUris(intent)
    if (uris.isEmpty()) return

    val generation = ++intentGeneration
    val uri = uris.first()

    Thread {
      val bytes = try {
        contentResolver.openInputStream(uri)?.use { it.readBytes() }
      } catch (e: Exception) {
        e.printStackTrace()
        null
      }

      if (bytes == null || bytes.isEmpty()) return@Thread

      val fileName = resolveDisplayName(uri)
      val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)

      runOnUiThread {
        if (generation != intentGeneration || isDestroyed) return@runOnUiThread

        pendingPdfBase64 = base64
        pendingPdfName = fileName
        schedulePdfDelivery()
      }
    }.start()
  }

  private fun extractPdfUris(intent: Intent): List<Uri> {
    val candidates = mutableListOf<Uri>()

    if (intent.action == Intent.ACTION_SEND || intent.action == Intent.ACTION_SEND_MULTIPLE) {
      intent.clipData?.let { clip ->
        for (index in 0 until clip.itemCount) {
          clip.getItemAt(index)?.uri?.let(candidates::add)
        }
      }

      if (intent.action == Intent.ACTION_SEND) {
        getStreamExtra(intent)?.let(candidates::add)
      } else {
        getStreamListExtra(intent)?.let(candidates::addAll)
      }
    }

    intent.data?.let(candidates::add)

    return candidates
      .distinct()
      .filter { uri -> isPdfUri(intent, uri) }
  }

  @Suppress("DEPRECATION")
  private fun getStreamExtra(intent: Intent): Uri? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    }
  }

  @Suppress("DEPRECATION")
  private fun getStreamListExtra(intent: Intent): List<Uri>? {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
    }
  }

  private fun isPdfUri(intent: Intent, uri: Uri): Boolean {
    val mimeType = try {
      contentResolver.getType(uri)
    } catch (_: Exception) {
      null
    }

    if (mimeType == "application/pdf") return true
    if (intent.type == "application/pdf") return true

    return rawDisplayName(uri)?.endsWith(".pdf", ignoreCase = true) == true
  }

  private fun rawDisplayName(uri: Uri): String? {
    val queriedName = try {
      contentResolver.query(
        uri,
        arrayOf(OpenableColumns.DISPLAY_NAME),
        null,
        null,
        null
      )?.use { cursor ->
        val index = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
        if (index >= 0 && cursor.moveToFirst()) cursor.getString(index) else null
      }
    } catch (_: Exception) {
      null
    }

    return (queriedName ?: uri.lastPathSegment?.substringAfterLast('/'))
      ?.trim()
      ?.replace(Regex("[\\u0000-\\u001f]"), "")
      ?.substringAfterLast('/')
      ?.takeIf { it.isNotBlank() }
  }

  private fun resolveDisplayName(uri: Uri): String {
    val rawName = rawDisplayName(uri) ?: "document.pdf"
    return if (rawName.endsWith(".pdf", ignoreCase = true)) rawName else "$rawName.pdf"
  }

  private fun schedulePdfDelivery() {
    if (pendingPdfBase64 == null) return

    deliveryGeneration += 1
    val generation = deliveryGeneration
    mainHandler.removeCallbacksAndMessages(null)
    attemptPdfDelivery(generation, 0)
  }

  private fun attemptPdfDelivery(generation: Int, attempt: Int) {
    if (generation != deliveryGeneration) return

    val base64 = pendingPdfBase64 ?: return
    val fileName = pendingPdfName ?: "document.pdf"
    val webView = appWebView

    if (webView == null) {
      schedulePdfRetry(generation, attempt)
      return
    }

    webView.post {
      if (generation != deliveryGeneration) return@post

      try {
        // Probe before building the (potentially very large) payload script.
        // Retrying must not allocate a full copy of the PDF every 200 ms.
        webView.evaluateJavascript("typeof window.__OTIUM_LOAD_PDF_BASE64__") { bridgeType ->
          if (generation != deliveryGeneration) return@evaluateJavascript

          if (bridgeType?.trim() != "\"function\"") {
            schedulePdfRetry(generation, attempt + 1)
            return@evaluateJavascript
          }

          val script = "(function(){try{var load=window.__OTIUM_LOAD_PDF_BASE64__;if(typeof load!=='function'){return false;}load(${JSONObject.quote(base64)},${JSONObject.quote(fileName)});return true;}catch(e){return false;}})()"

          webView.post {
            if (generation != deliveryGeneration) return@post

            try {
              webView.evaluateJavascript(script) { result ->
                if (generation != deliveryGeneration) return@evaluateJavascript

                if (result?.trim() == "true") {
                  pendingPdfBase64 = null
                  pendingPdfName = null
                } else {
                  schedulePdfRetry(generation, attempt + 1)
                }
              }
            } catch (_: Exception) {
              schedulePdfRetry(generation, attempt + 1)
            }
          }
        }
      } catch (_: Exception) {
        schedulePdfRetry(generation, attempt + 1)
      }
    }
  }

  private fun schedulePdfRetry(generation: Int, attempt: Int) {
    if (generation != deliveryGeneration || attempt >= MAX_DELIVERY_ATTEMPTS) return
    mainHandler.postDelayed({ attemptPdfDelivery(generation, attempt + 1) }, DELIVERY_RETRY_MS)
  }

  companion object {
    private const val DELIVERY_RETRY_MS = 200L
    private const val MAX_DELIVERY_ATTEMPTS = 150
    private const val REQUEST_SAVE_TEXT = 0x0751
  }
}
