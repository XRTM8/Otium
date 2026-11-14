package com.otium.reader

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile
import java.util.UUID

/** Each launch owns a bounded, private snapshot, never a shared filename. */
class IncomingPdfStore(private val directory: File, private val limit: Long = 64L * 1024 * 1024) {
  data class Info(val id: String, val name: String = "document.pdf", val file: File? = null, val loading: Boolean = false, val error: String? = null)
  private var pending: Info? = null
  init {
    // A process killed during import cannot run onDestroy. Remove only our
    // private orphan snapshots on the next launch, never user documents.
    directory.listFiles { file -> file.name.startsWith("otium-incoming-") && file.name.endsWith(".pdf") }?.forEach { it.delete() }
  }

  @Synchronized fun begin(): String {
    pending?.file?.delete()
    val id = UUID.randomUUID().toString()
    pending = Info(id, loading = true)
    return id
  }
  @Synchronized fun info(): Info? = pending
  @Synchronized fun current(id: String) = pending?.id == id
  @Synchronized fun fail(id: String, message: String) {
    if (current(id)) { pending?.file?.delete(); pending = Info(id, error = message) }
  }
  @Synchronized fun acknowledge(id: String): Boolean {
    if (!current(id)) return false
    pending?.file?.delete(); pending = null; return true
  }
  @Synchronized fun close() { pending?.file?.delete(); pending = null }

  fun copy(id: String, input: InputStream, name: String) {
    val target = File.createTempFile("otium-incoming-", ".pdf", directory)
    try {
      var total = 0L
      target.outputStream().use { output ->
        val buffer = ByteArray(32 * 1024)
        while (true) {
          if (!current(id)) throw IOException("cancelled")
          val count = input.read(buffer)
          if (count < 0) break
          if (count == 0) throw IOException("تعذر متابعة قراءة الملف. أعد تنزيله وحاول مجدداً.")
          total += count
          if (total > limit) throw IOException("الملف أكبر من حد الفتح المباشر (${limit / 1024 / 1024} MB). افتح نسخة PDF أصغر.")
          output.write(buffer, 0, count)
        }
      }
      if (total == 0L) throw IOException("ملف PDF فارغ أو لم يكتمل تنزيله من تلغرام.")
      val header = target.inputStream().use { stream -> val bytes = ByteArray(1024); val size = stream.read(bytes); String(bytes, 0, size, Charsets.ISO_8859_1) }
      if (!header.contains("%PDF-")) throw IOException("الملف ليس PDF صالحاً. أكمل تنزيله من تلغرام وأعد المحاولة.")
      synchronized(this) {
        if (!current(id)) throw IOException("cancelled")
        pending = Info(id, name, target)
      }
    } catch (error: Exception) { target.delete(); throw error }
  }

  @Synchronized fun read(id: String, offset: Long, count: Int): ByteArray? {
    val value = pending ?: return null
    if (value.id != id || offset < 0 || count !in 1..(128 * 1024)) return null
    val file = value.file ?: return null
    val remaining = file.length() - offset
    if (remaining <= 0) return null
    return RandomAccessFile(file, "r").use { stream ->
      stream.seek(offset)
      ByteArray(minOf(count.toLong(), remaining).toInt()).also(stream::readFully)
    }
  }
}
