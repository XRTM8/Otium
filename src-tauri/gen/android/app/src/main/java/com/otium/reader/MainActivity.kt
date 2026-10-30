package com.otium.reader

import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.content.FileProvider
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import org.json.JSONObject
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.StandardCharsets

class MainActivity : TauriActivity() {
  private var appWebView: WebView? = null
  private var ttsBridge: AndroidTtsBridge? = null
  private var immersive = true
  private val mainHandler = Handler(Looper.getMainLooper())

  private var pendingPdfBase64: String? = null
  private var pendingPdfName: String? = null
  private var incomingPdfFile: File? = null
  private var incomingPdfName: String? = null
  private var pendingExportContent: String? = null
  private var pendingExportMime: String? = null
  private var pendingBinaryBytes: ByteArray? = null
  private var pendingBinaryMime: String = "application/octet-stream"
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
    applyImmersive(true)

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
    // The document scanner renders a live camera stream into a <video> element.
    // Without this the WebView can refuse to start playback until another tap.
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.addJavascriptInterface(AndroidUpdateBridge(this, webView), "OtiumAndroid")
    // Scanner share/save/print/HTTP bridge. Kept separate from OtiumAndroid,
    // which owns the signed update flow.
    webView.addJavascriptInterface(ScannerBridge(), "OtiumNative")
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
    fun getPendingDocumentInfo(): String {
      val file = incomingPdfFile ?: return "{\"hasDocument\":false}"
      if (!file.exists() || file.length() == 0L) {
        return "{\"hasDocument\":false}"
      }
      val name = incomingPdfName ?: "document.pdf"
      val size = file.length()
      return JSONObject().apply {
        put("hasDocument", true)
        put("name", name)
        put("size", size)
      }.toString()
    }

    @JavascriptInterface
    fun readPendingDocumentChunk(offset: Int, chunkSize: Int): String {
      val file = incomingPdfFile ?: return ""
      if (!file.exists()) return ""
      val fileSize = file.length()
      if (offset < 0 || offset >= fileSize) return ""

      val toRead = Math.min(chunkSize.toLong(), fileSize - offset).toInt()
      if (toRead <= 0) return ""

      return try {
        RandomAccessFile(file, "r").use { raf ->
          raf.seek(offset.toLong())
          val buffer = ByteArray(toRead)
          raf.readFully(buffer)
          Base64.encodeToString(buffer, Base64.NO_WRAP)
        }
      } catch (t: Throwable) {
        t.printStackTrace()
        ""
      }
    }

    @JavascriptInterface
    fun clearPendingDocument(): Boolean {
      try {
        incomingPdfFile?.delete()
      } catch (_: Throwable) {}
      incomingPdfFile = null
      incomingPdfName = null
      return true
    }

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

  /**
   * Native half of the document scanner: Android share sheet, saving to
   * Downloads, real PDF printing, external links and a GitHub-only HTTP helper.
   *
   * Deliberately does NOT expose an "open in Otium Reader" method: the scanner
   * already lives inside the reader, so the web layer hands the generated File
   * straight to the reader controller.
   */
  private inner class ScannerBridge {
    private fun sanitizeFilename(filename: String, fallback: String): String {
      val rawName = File(filename).name
      val cleaned = rawName
        .replace(Regex("[\\\\/:*?\"<>|\\u0000-\\u001f]"), "_")
        .trim()
        .take(120)
      return cleaned.ifBlank { fallback }
    }

    private fun decodeBase64(base64Data: String): ByteArray {
      val clean = if (base64Data.contains(",")) base64Data.substringAfter(",") else base64Data
      return Base64.decode(clean, Base64.DEFAULT)
    }

    private fun resolveMime(filename: String, fallback: String): String = when {
      filename.endsWith(".jpg", true) || filename.endsWith(".jpeg", true) -> "image/jpeg"
      filename.endsWith(".png", true) -> "image/png"
      filename.endsWith(".pdf", true) -> "application/pdf"
      fallback.isNotBlank() -> fallback
      else -> "application/octet-stream"
    }

    @JavascriptInterface
    fun sharePdf(base64Data: String, filename: String) {
      shareFile(base64Data, filename, "application/pdf")
    }

    @JavascriptInterface
    fun shareFile(base64Data: String, filename: String, mimeType: String) {
      runOnUiThread {
        try {
          val safeName = sanitizeFilename(filename, "scan.pdf")
          val file = File(cacheDir, safeName)
          file.writeBytes(decodeBase64(base64Data))

          val uri = FileProvider.getUriForFile(
            this@MainActivity,
            "${packageName}.fileprovider",
            file
          )
          val intent = Intent(Intent.ACTION_SEND).apply {
            type = resolveMime(safeName, mimeType)
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra(Intent.EXTRA_SUBJECT, safeName)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
          }
          startActivity(Intent.createChooser(intent, "Share document"))
        } catch (error: Exception) {
          Toast.makeText(
            this@MainActivity,
            "Could not share the file: ${error.message}",
            Toast.LENGTH_LONG
          ).show()
        }
      }
    }

    @JavascriptInterface
    fun savePdfToDownloads(base64Data: String, filename: String): Boolean {
      return saveFileToDownloads(base64Data, filename, "application/pdf")
    }

    /**
     * Android 10+ writes straight into public Downloads/Pictures through
     * MediaStore. Older devices cannot write there without a storage
     * permission, so they get the system "save as" picker instead.
     */
    @JavascriptInterface
    fun saveFileToDownloads(base64Data: String, filename: String, mimeType: String): Boolean {
      val isImage = filename.endsWith(".jpg", true) ||
        filename.endsWith(".jpeg", true) ||
        filename.endsWith(".png", true)
      val safeName = sanitizeFilename(filename, if (isImage) "scan.jpg" else "scan.pdf")
      val bytes = try {
        decodeBase64(base64Data)
      } catch (error: Exception) {
        runOnUiThread {
          Toast.makeText(this@MainActivity, "Could not read the file data.", Toast.LENGTH_LONG).show()
        }
        return false
      }
      val resolvedMime = resolveMime(safeName, mimeType)

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        return try {
          val collection = if (isImage) {
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
          } else {
            MediaStore.Downloads.EXTERNAL_CONTENT_URI
          }
          val relativePath = if (isImage) {
            Environment.DIRECTORY_PICTURES + "/Otium"
          } else {
            Environment.DIRECTORY_DOWNLOADS
          }
          val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, safeName)
            put(MediaStore.MediaColumns.MIME_TYPE, resolvedMime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, relativePath)
          }
          val uri = contentResolver.insert(collection, values)
          if (uri == null) {
            false
          } else {
            contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
            val location = if (isImage) "Pictures/Otium" else "Downloads"
            runOnUiThread {
              Toast.makeText(
                this@MainActivity,
                "Saved to $location: $safeName",
                Toast.LENGTH_LONG
              ).show()
            }
            true
          }
        } catch (error: Exception) {
          runOnUiThread {
            Toast.makeText(
              this@MainActivity,
              "Could not save the file: ${error.message}",
              Toast.LENGTH_LONG
            ).show()
          }
          false
        }
      }

      // API 24–28: hand the bytes to the system file picker.
      pendingBinaryBytes = bytes
      pendingBinaryMime = resolvedMime
      runOnUiThread {
        try {
          val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = resolvedMime
            putExtra(Intent.EXTRA_TITLE, safeName)
          }
          startActivityForResult(intent, REQUEST_SAVE_BINARY)
        } catch (_: Exception) {
          pendingBinaryBytes = null
          Toast.makeText(
            this@MainActivity,
            "No file manager is available to save this file.",
            Toast.LENGTH_LONG
          ).show()
        }
      }
      return true
    }

    @JavascriptInterface
    fun printPdf(base64Data: String, filename: String) {
      val cleanFilename = if (filename.endsWith(".pdf", true)) filename else "$filename.pdf"
      val safeName = sanitizeFilename(cleanFilename, "scan.pdf")
      val file = try {
        File(cacheDir, safeName).apply { writeBytes(decodeBase64(base64Data)) }
      } catch (error: Exception) {
        runOnUiThread {
          Toast.makeText(
            this@MainActivity,
            "Could not prepare the file for printing: ${error.message}",
            Toast.LENGTH_LONG
          ).show()
        }
        return
      }

      runOnUiThread {
        try {
          val printManager =
            getSystemService(android.content.Context.PRINT_SERVICE) as PrintManager
          val adapter = object : PrintDocumentAdapter() {
            override fun onLayout(
              oldAttributes: PrintAttributes?,
              newAttributes: PrintAttributes?,
              cancellationSignal: android.os.CancellationSignal?,
              callback: PrintDocumentAdapter.LayoutResultCallback,
              extras: android.os.Bundle?
            ) {
              val info = PrintDocumentInfo.Builder(safeName)
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .build()
              callback.onLayoutFinished(info, true)
            }

            override fun onWrite(
              pages: Array<out PageRange>?,
              destination: android.os.ParcelFileDescriptor,
              cancellationSignal: android.os.CancellationSignal?,
              callback: PrintDocumentAdapter.WriteResultCallback
            ) {
              try {
                FileInputStream(file).use { input ->
                  FileOutputStream(destination.fileDescriptor).use { output ->
                    input.copyTo(output)
                  }
                }
                callback.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
              } catch (error: Exception) {
                callback.onWriteFailed(error.message)
              }
            }
          }
          printManager.print(safeName, adapter, PrintAttributes.Builder().build())
        } catch (error: Exception) {
          Toast.makeText(
            this@MainActivity,
            "Could not start printing: ${error.message}",
            Toast.LENGTH_LONG
          ).show()
        }
      }
    }

    @JavascriptInterface
    fun openExternalUrl(url: String) {
      val scheme = Uri.parse(url).scheme?.lowercase()
      if (scheme != "https" && scheme != "http") return
      runOnUiThread {
        try {
          startActivity(
            Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
          )
        } catch (error: Exception) {
          Toast.makeText(
            this@MainActivity,
            "Could not open the link: ${error.message}",
            Toast.LENGTH_SHORT
          ).show()
        }
      }
    }

    /**
     * GitHub-only GET for the update checker. Blocking is acceptable here: the
     * JS bridge runs this on its own thread, not the UI thread.
     */
    @JavascriptInterface
    fun fetchUrl(urlStr: String): String {
      return try {
        val allowedPrefixes = listOf(
          "https://api.github.com/",
          "https://raw.githubusercontent.com/",
          "https://github.com/",
          "https://objects.githubusercontent.com/"
        )
        if (allowedPrefixes.none { urlStr.startsWith(it) }) {
          return "ERROR: URL domain is not permitted"
        }
        val connection = (URL(urlStr).openConnection() as HttpURLConnection).apply {
          requestMethod = "GET"
          instanceFollowRedirects = false
          setRequestProperty("User-Agent", "Otium-Android")
          setRequestProperty("Accept", "application/vnd.github.v3+json")
          connectTimeout = 10_000
          readTimeout = 10_000
        }
        try {
          val stream = if (connection.responseCode in 200..299) {
            connection.inputStream
          } else {
            connection.errorStream
          }
          stream.bufferedReader().use { it.readText() }
        } finally {
          connection.disconnect()
        }
      } catch (error: Exception) {
        "ERROR:" + (error.message ?: "Network error")
      }
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

    if (requestCode == REQUEST_SAVE_BINARY) {
      val bytes = pendingBinaryBytes
      pendingBinaryBytes = null

      val uri = data?.data
      if (resultCode == RESULT_OK && bytes != null && uri != null) {
        Thread {
          val saved = try {
            contentResolver.openOutputStream(uri)?.use { stream ->
              stream.write(bytes)
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
    try { incomingPdfFile?.delete() } catch (_: Throwable) {}
    incomingPdfFile = null
    ttsBridge?.shutdown()
    ttsBridge = null
    appWebView = null
    super.onDestroy()
  }

  private fun handlePdfIntent(intent: Intent?) {
    if (intent == null) return

    val uris = try {
      extractPdfUris(intent)
    } catch (t: Throwable) {
      t.printStackTrace()
      emptyList()
    }
    if (uris.isEmpty()) return

    val generation = ++intentGeneration
    val uri = uris.first()

    Thread {
      try {
        val fileName = resolveDisplayName(uri)
        val tempFile = File(cacheDir, "incoming_opened_doc.pdf")
        if (tempFile.exists()) tempFile.delete()

        // Memory-safe stream directly from content provider into internal cache (safe against Telegram OOM)
        val copied = contentResolver.openInputStream(uri)?.use { input ->
          FileOutputStream(tempFile).use { output ->
            input.copyTo(output, bufferSize = 32 * 1024)
          }
        } ?: 0L

        if (copied <= 0L || !tempFile.exists()) return@Thread

        runOnUiThread {
          if (generation != intentGeneration || isDestroyed) return@runOnUiThread

          incomingPdfFile = tempFile
          incomingPdfName = fileName
          notifyWebIncomingPdf()
        }
      } catch (t: Throwable) {
        t.printStackTrace()
      }
    }.start()
  }

  private fun notifyWebIncomingPdf() {
    val webView = appWebView ?: return
    webView.post {
      try {
        webView.evaluateJavascript(
          "(function(){ try { if (window.__OTIUM_CHECK_INCOMING_PDF__) { window.__OTIUM_CHECK_INCOMING_PDF__(); return true; } } catch(e){} return false; })()",
          null
        )
      } catch (_: Throwable) {}
    }
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
    notifyWebIncomingPdf()
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
  private const val REQUEST_SAVE_BINARY = 0x0752
  }
}
