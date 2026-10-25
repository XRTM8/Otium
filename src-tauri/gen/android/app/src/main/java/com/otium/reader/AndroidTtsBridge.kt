package com.otium.reader

import android.app.Activity
import android.content.Intent
import android.media.AudioAttributes
import android.os.Bundle
import android.provider.Settings
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject
import java.util.Locale

/**
 * Native text-to-speech for the selection "listen" action.
 *
 * Android WebView frequently ships without a usable `speechSynthesis`
 * implementation, so the web layer calls this bridge instead. All engine work
 * happens on the UI thread; results are delivered back through
 * `window.__OTIUM_TTS_EVENT__`.
 */
class AndroidTtsBridge(
  private val activity: Activity,
  private val webView: WebView
) : TextToSpeech.OnInitListener {

  private data class SpeechRequest(
    val requestId: String,
    val text: String,
    val language: String,
    val rate: Float
  )

  private var engine: TextToSpeech? = null
  private var initStatus: Int? = null
  private var ready = false
  private var failed = false
  private var pending: SpeechRequest? = null
  private var activeRequestId: String? = null

  init {
    try {
      // Keep the engine attached to the activity context so it follows the
      // app's audio lifecycle, not an arbitrary application context.
      engine = TextToSpeech(activity, this)
      maybeInitialize()
    } catch (_: Exception) {
      failed = true
    }
  }

  override fun onInit(status: Int) {
    initStatus = status
    maybeInitialize()
  }

  private fun maybeInitialize() {
    if (ready || failed) return
    val status = initStatus ?: return
    val tts = engine ?: return

    if (status != TextToSpeech.SUCCESS) {
      failed = true
      val request = pending
      pending = null
      if (request != null) {
        emitError(request.requestId, "init", "Text-to-speech engine unavailable")
      }
      return
    }

    ready = true
    try {
      tts.setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_MEDIA)
          .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
          .build()
      )
    } catch (_: Exception) {
      // Older engines do not expose audio attributes; defaults are fine.
    }

    tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
      override fun onStart(utteranceId: String?) {
        if (utteranceId == null) return
        activeRequestId = utteranceId
        emit(utteranceId, "start")
      }

      override fun onDone(utteranceId: String?) {
        if (utteranceId == null) return
        if (activeRequestId == utteranceId) activeRequestId = null
        emit(utteranceId, "done")
      }

      @Deprecated("Deprecated in Java")
      override fun onError(utteranceId: String?) {
        failSpeech(utteranceId, "synthesis", "Playback failed")
      }

      override fun onError(utteranceId: String?, errorCode: Int) {
        failSpeech(utteranceId, "synthesis", "Playback failed ($errorCode)")
      }

      override fun onStop(utteranceId: String?, interrupted: Boolean) {
        if (utteranceId != null && activeRequestId == utteranceId) {
          activeRequestId = null
        }
      }
    })

    pending?.let { request ->
      pending = null
      speakInternal(request)
    }
  }

  @JavascriptInterface
  fun speak(requestId: String, text: String, language: String, rate: Double) {
    val request = SpeechRequest(
      requestId = requestId,
      text = text,
      language = language.ifBlank { "ar-SA" },
      rate = rate.toFloat()
    )
    activity.runOnUiThread {
      if (failed) {
        emitError(request.requestId, "init", "Text-to-speech engine unavailable")
        return@runOnUiThread
      }
      if (request.text.isBlank()) {
        emit(request.requestId, "done")
        return@runOnUiThread
      }
      if (!ready) {
        pending = request
        maybeInitialize()
        return@runOnUiThread
      }
      speakInternal(request)
    }
  }

  @JavascriptInterface
  fun stop() {
    activity.runOnUiThread {
      pending = null
      activeRequestId = null
      try {
        engine?.stop()
      } catch (_: Exception) {
        // The engine can disappear during shutdown.
      }
    }
  }

  @JavascriptInterface
  fun openSettings() {
    activity.runOnUiThread {
      val opened = try {
        activity.startActivity(
          Intent("com.android.settings.TTS_SETTINGS")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
      } catch (_: Exception) {
        false
      }

      if (!opened) {
        try {
          activity.startActivity(
            Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
        } catch (_: Exception) {
          // No settings screen is exposed on this device.
        }
      }
    }
  }

  fun shutdown() {
    pending = null
    activeRequestId = null
    try {
      engine?.stop()
      engine?.shutdown()
    } catch (_: Exception) {
      // Ignore a partially initialised engine.
    }
    engine = null
    ready = false
    failed = true
  }

  private fun speakInternal(request: SpeechRequest) {
    val tts = engine
    if (tts == null || failed) {
      emitError(request.requestId, "init", "Text-to-speech engine unavailable")
      return
    }

    if (!applyLanguage(tts, request.language)) {
      emitError(request.requestId, "language", "No installed voice for ${request.language}")
      return
    }

    try {
      tts.setSpeechRate(request.rate.coerceIn(0.5f, 2.0f))
      tts.setPitch(1.0f)
    } catch (_: Exception) {
      // Rate and pitch are suggestions; playback can still continue.
    }

    val result = try {
      tts.speak(
        request.text,
        TextToSpeech.QUEUE_FLUSH,
        Bundle(),
        request.requestId
      )
    } catch (_: Exception) {
      TextToSpeech.ERROR
    }

    if (result != TextToSpeech.SUCCESS) {
      emitError(request.requestId, "synthesis", "Text-to-speech could not start")
    }
  }

  private fun applyLanguage(tts: TextToSpeech, language: String): Boolean {
    val requested = try {
      Locale.forLanguageTag(language.ifBlank { "ar-SA" })
    } catch (_: Exception) {
      Locale.forLanguageTag("ar-SA")
    }

    val candidates = buildList {
      add(requested)
      add(Locale.forLanguageTag(requested.language))
      if (requested.language == "ar") {
        add(Locale.forLanguageTag("ar-EG"))
        add(Locale.forLanguageTag("ar-SA"))
      }
    }.distinctBy { it.toLanguageTag() }

    for (locale in candidates) {
      val result = try {
        tts.setLanguage(locale)
      } catch (_: Exception) {
        TextToSpeech.LANG_NOT_SUPPORTED
      }

      if (
        result == TextToSpeech.LANG_AVAILABLE ||
        result == TextToSpeech.LANG_COUNTRY_AVAILABLE ||
        result == TextToSpeech.LANG_COUNTRY_VAR_AVAILABLE
      ) {
        return true
      }
    }

    return false
  }

  private fun failSpeech(utteranceId: String?, code: String, message: String) {
    if (utteranceId == null) return
    if (activeRequestId == utteranceId) activeRequestId = null
    emitError(utteranceId, code, message)
  }

  private fun emitError(requestId: String, code: String, message: String) {
    val payload = JSONObject()
      .put("requestId", requestId)
      .put("type", "error")
      .put("code", code)
      .put("message", message)
    emitScript(payload)
  }

  private fun emit(requestId: String, type: String) {
    val payload = JSONObject()
      .put("requestId", requestId)
      .put("type", type)
    emitScript(payload)
  }

  private fun emitScript(payload: JSONObject) {
    val script =
      "window.__OTIUM_TTS_EVENT__ && window.__OTIUM_TTS_EVENT__($payload)"
    webView.post {
      try {
        webView.evaluateJavascript(script, null)
      } catch (_: Exception) {
        // The WebView may already be gone when speech finishes.
      }
    }
  }
}
