package com.otium.reader

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Native half of the Android update flow.
 *
 * The web layer only decides that an update exists. This bridge fetches the
 * release feed, downloads the APK in the background, verifies its hash, and
 * opens the system Package Installer. Android is never allowed to install an
 * update silently.
 */
class AndroidUpdateBridge(
  private val activity: Activity,
  private val webView: WebView
) {
  @JavascriptInterface
  fun fetchReleaseFeed(requestId: String) {
    Thread {
      try {
        val body = httpGet(FEED_URL)
        emit(
          "window.__OTIUM_UPDATE_FEED__ && window.__OTIUM_UPDATE_FEED__(" +
            "${quote(requestId)}, ${quote(body)}, null)"
        )
      } catch (error: Exception) {
        emit(
          "window.__OTIUM_UPDATE_FEED__ && window.__OTIUM_UPDATE_FEED__(" +
            "${quote(requestId)}, null, ${quote(error.message ?: "Could not reach the update server.")})"
        )
      }
    }.start()
  }

  @JavascriptInterface
  fun downloadAndInstall(url: String, expectedSha256: String) {
    if (!url.startsWith("https://")) {
      emitError("Only HTTPS update downloads are allowed.")
      return
    }

    if (!expectedSha256.matches(Regex("^[0-9a-fA-F]{64}$"))) {
      emitError("The update checksum is missing or invalid, so the download was refused.")
      return
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
      !activity.packageManager.canRequestPackageInstalls()
    ) {
      activity.runOnUiThread {
        try {
          activity.startActivity(
            Intent(
              Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
              Uri.parse("package:${activity.packageName}")
            )
          )
        } catch (_: Exception) {
          // Some OEMs hide this screen; the installer prompt will explain.
        }
      }
      emitError("Allow Otium to install unknown apps, then tap Update again.")
      return
    }

    Thread { downloadApk(url, expectedSha256) }.start()
  }

  private fun downloadApk(url: String, expectedSha256: String) {
    val updateDir = File(activity.cacheDir, "updates").apply { mkdirs() }
    val target = File(updateDir, "otium-update.apk")
    if (target.exists()) target.delete()

    var connection: HttpURLConnection? = null
    try {
      connection = (URL(url).openConnection() as HttpURLConnection).apply {
        instanceFollowRedirects = true
        connectTimeout = 20_000
        readTimeout = 30_000
        requestMethod = "GET"
        setRequestProperty("Accept", "application/vnd.android.package-archive")
        setRequestProperty("User-Agent", "Otium-Android-Updater")
      }

      val status = connection.responseCode
      if (status !in 200..299) {
        throw IOException("Update server returned HTTP $status.")
      }

      val total = connection.contentLengthLong.takeIf { it > 0 } ?: -1L
      val digest = MessageDigest.getInstance("SHA-256")
      var downloaded = 0L
      var lastEmit = 0L

      connection.inputStream.use { input ->
        FileOutputStream(target).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
            digest.update(buffer, 0, read)
            downloaded += read

            val now = System.currentTimeMillis()
            if (now - lastEmit >= 120) {
              lastEmit = now
              emitProgress(downloaded, total)
            }
          }
        }
      }

      emitProgress(downloaded, total)

      val actualSha256 = digest.digest().joinToString("") { byte -> "%02x".format(byte) }
      if (!actualSha256.equals(expectedSha256, ignoreCase = true)) {
        target.delete()
        throw IOException("Downloaded APK failed its integrity check.")
      }

      launchInstaller(target)
    } catch (error: Exception) {
      target.delete()
      emitError(error.message ?: "Could not download the update.")
    } finally {
      connection?.disconnect()
    }
  }

  private fun launchInstaller(apk: File) {
    val uri = FileProvider.getUriForFile(
      activity,
      "${activity.packageName}.fileprovider",
      apk
    )

    val intent = Intent(Intent.ACTION_VIEW).apply {
      setDataAndType(uri, "application/vnd.android.package-archive")
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
    }

    activity.runOnUiThread {
      try {
        activity.startActivity(intent)
        emit("window.__OTIUM_UPDATE_READY__ && window.__OTIUM_UPDATE_READY__()")
      } catch (error: Exception) {
        emitError(error.message ?: "No package installer is available on this device.")
      }
    }
  }

  private fun httpGet(url: String): String {
    val connection = (URL(url).openConnection() as HttpURLConnection).apply {
      instanceFollowRedirects = true
      connectTimeout = 15_000
      readTimeout = 20_000
      requestMethod = "GET"
      setRequestProperty("Accept", "application/json")
      setRequestProperty("User-Agent", "Otium-Android-Updater")
    }

    try {
      val status = connection.responseCode
      if (status !in 200..299) {
        throw IOException("Update server returned HTTP $status.")
      }
      return connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
        val buffer = CharArray(16 * 1024)
        val body = StringBuilder()
        while (true) {
          val read = reader.read(buffer)
          if (read < 0) break
          body.append(buffer, 0, read)
          if (body.length > 1_000_000) {
            throw IOException("Update feed is too large.")
          }
        }
        body.toString()
      }
    } finally {
      connection.disconnect()
    }
  }

  private fun emitProgress(downloaded: Long, total: Long) {
    val percent = if (total > 0) {
      ((downloaded * 100) / total).toInt().coerceIn(0, 100)
    } else {
      0
    }
    emit("window.__OTIUM_UPDATE_PROGRESS__ && window.__OTIUM_UPDATE_PROGRESS__($downloaded, $total, $percent)")
  }

  private fun emitError(message: String) {
    emit("window.__OTIUM_UPDATE_ERROR__ && window.__OTIUM_UPDATE_ERROR__(${quote(message)})")
  }

  private fun emit(script: String) {
    webView.post {
      try {
        webView.evaluateJavascript(script, null)
      } catch (_: Exception) {
        // The activity may have been destroyed while the download finished.
      }
    }
  }

  private fun quote(value: String): String = JSONObject.quote(value)

  companion object {
    private const val FEED_URL =
      "https://github.com/XRTM8/Otium/releases/latest/download/latest.json"
  }
}
