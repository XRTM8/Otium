package com.otium.reader

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.util.Base64
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        try {
          val webViewField = TauriActivity::class.java.getDeclaredField("mWebView")
          webViewField.isAccessible = true
          val webView = webViewField.get(this@MainActivity) as? android.webkit.WebView
          if (webView != null) {
            webView.post {
              webView.evaluateJavascript("(function(){ return window.__OTIUM_HANDLE_BACK__ ? window.__OTIUM_HANDLE_BACK__() : false; })()") { result ->
                if (result == "true" || result == "\"true\"") {
                  // Back was successfully handled inside the app
                } else {
                  // Already at root welcome screen, exit app naturally
                  isEnabled = false
                  onBackPressedDispatcher.onBackPressed()
                  isEnabled = true
                }
              }
            }
          } else {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
            isEnabled = true
          }
        } catch (e: Exception) {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
          isEnabled = true
        }
      }
    })

    handlePdfIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handlePdfIntent(intent)
  }

  private fun handlePdfIntent(intent: Intent?) {
    if (intent == null) return
    val action = intent.action
    val data: Uri? = intent.data
    if (Intent.ACTION_VIEW == action && data != null) {
      try {
        val inputStream = contentResolver.openInputStream(data)
        val bytes = inputStream?.readBytes()
        inputStream?.close()
        if (bytes != null && bytes.isNotEmpty()) {
          val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
          val cleanName = data.lastPathSegment?.substringAfterLast('/') ?: "document.pdf"
          val fileName = if (cleanName.endsWith(".pdf", ignoreCase = true)) cleanName else "$cleanName.pdf"

          incomingPdfBase64 = base64
          incomingPdfName = fileName

          try {
            val webViewField = TauriActivity::class.java.getDeclaredField("mWebView")
            webViewField.isAccessible = true
            val webView = webViewField.get(this) as? android.webkit.WebView
            webView?.post {
              webView.evaluateJavascript("window.__OTIUM_LOAD_PDF_BASE64__ && window.__OTIUM_LOAD_PDF_BASE64__('$base64', '$fileName');", null)
            }
          } catch (_: Exception) {}
        }
      } catch (e: Exception) {
        e.printStackTrace()
      }
    }
  }

  companion object {
    var incomingPdfBase64: String? = null
    var incomingPdfName: String? = null
  }
}
