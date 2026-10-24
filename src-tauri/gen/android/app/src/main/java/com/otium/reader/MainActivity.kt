package com.otium.reader

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  private var pendingPdfBase64: String? = null
  private var pendingPdfName: String? = null
  private var deliveryGeneration = 0
  private var intentGeneration = 0

  override fun onCreate(savedInstanceState: Bundle?) {
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
    schedulePdfDelivery()
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handlePdfIntent(intent)
  }

  override fun onResume() {
    super.onResume()
    schedulePdfDelivery()
  }

  override fun onDestroy() {
    deliveryGeneration += 1
    mainHandler.removeCallbacksAndMessages(null)
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
  }
}
