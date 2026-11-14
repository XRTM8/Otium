package com.otium.reader

import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.nio.file.Files

class IncomingPdfStoreTest {
  private val pdf = "%PDF-1.7\ncontent".toByteArray()
  @Test fun sessionsCannotReadOrAcknowledgeEachOther() {
    val directory = Files.createTempDirectory("otium-test").toFile()
    try {
      val store = IncomingPdfStore(directory)
      val first = store.begin(); store.copy(first, pdf.inputStream(), "one.pdf")
      val second = store.begin(); store.copy(second, pdf.inputStream(), "two.pdf")
      assertNull(store.read(first, 0, 10)); assertFalse(store.acknowledge(first))
      assertArrayEquals(pdf, store.read(second, 0, 100))
      assertTrue(store.acknowledge(second)); assertTrue(directory.listFiles()!!.isEmpty())
    } finally { directory.deleteRecursively() }
  }
  @Test fun invalidAndOversizedProvidersLeaveNoPartialFiles() {
    val directory = Files.createTempDirectory("otium-test").toFile()
    try {
      val store = IncomingPdfStore(directory, 20)
      for (bytes in listOf(ByteArray(0), "not a PDF".toByteArray(), ByteArray(21))) {
        val id = store.begin()
        try { store.copy(id, bytes.inputStream(), "bad.pdf"); fail("Expected rejection") } catch (_: IOException) {}
        assertTrue(directory.listFiles()!!.isEmpty())
        assertNull(store.info()!!.file)
      }
    } finally { directory.deleteRecursively() }
  }
  @Test fun rejectsInvalidChunkSizesAndNegativeOffsets() {
    val directory = Files.createTempDirectory("otium-test").toFile()
    try {
      val store = IncomingPdfStore(directory)
      val id = store.begin(); store.copy(id, pdf.inputStream(), "one.pdf")
      assertNull(store.read(id, -1, 10)); assertNull(store.read(id, 0, Int.MAX_VALUE))
      assertNull(store.read(id, 0, 0)); assertNull(store.read(id, pdf.size.toLong(), 1))
      store.close(); assertNull(store.info())
    } finally { directory.deleteRecursively() }
  }
  @Test fun removesOnlyItsOwnOrphanSnapshots() {
    val directory = Files.createTempDirectory("otium-test").toFile()
    try {
      val orphan = java.io.File(directory, "otium-incoming-old.pdf").apply { writeBytes(pdf) }
      val userFile = java.io.File(directory, "lesson.pdf").apply { writeBytes(pdf) }
      IncomingPdfStore(directory)
      assertFalse(orphan.exists()); assertTrue(userFile.exists())
    } finally { directory.deleteRecursively() }
  }
}
