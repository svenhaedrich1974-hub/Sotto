package app.sotto.diary

import android.util.Base64
import android.webkit.JavascriptInterface
import java.io.File
import java.io.FileOutputStream

/**
 * JavaScript-Bruecke "KammerAndroid". Gleiche Funktionen wie die bisherige Huelle,
 * damit vorhandene Daten (filesDir/kammer-db.json) beim Update uebernommen werden.
 */
class Bridge(private val act: MainActivity) {

    private val dbFile = File(act.filesDir, "kammer-db.json")
    private val tmpFile = File(act.filesDir, "kammer-db.json.tmp")
    private val chunkSize = 200_000
    private var chunks: List<String> = emptyList()
    private var incoming: StringBuilder? = null

    private var saveOut: FileOutputStream? = null
    private var saveFile: File? = null
    private var saveName = "datei.bin"
    private var saveMime = "application/octet-stream"

    // ---- Datenbank ----
    @JavascriptInterface
    @Synchronized
    fun dbChunks(): Int {
        val text = try { if (dbFile.exists()) dbFile.readText(Charsets.UTF_8) else "" } catch (e: Exception) { "" }
        chunks = if (text.isEmpty()) emptyList() else text.chunked(chunkSize)
        return chunks.size
    }

    @JavascriptInterface
    @Synchronized
    fun dbChunk(i: Int): String = chunks.getOrNull(i) ?: ""

    @JavascriptInterface
    @Synchronized
    fun beginDb() {
        incoming = StringBuilder()
    }

    @JavascriptInterface
    @Synchronized
    fun appendDb(s: String?) {
        incoming?.append(s ?: "")
    }

    @JavascriptInterface
    @Synchronized
    fun commitDb() {
        val sb = incoming ?: return
        incoming = null
        try {
            tmpFile.writeText(sb.toString(), Charsets.UTF_8)
            if (!tmpFile.renameTo(dbFile)) {
                dbFile.delete()
                tmpFile.renameTo(dbFile)
            }
        } catch (_: Exception) { }
    }

    // ---- Dateien speichern (PDF, Sicherung, Export) ----
    @JavascriptInterface
    @Synchronized
    fun beginSave(name: String?, mime: String?) {
        abortLocked()
        saveName = safeName(name)
        saveMime = safeMime(mime)
        val dir = File(act.cacheDir, "exports").apply { mkdirs() }
        dir.listFiles()?.forEach { if (System.currentTimeMillis() - it.lastModified() > 86_400_000L) it.delete() }
        val f = File(dir, saveName)
        saveFile = f
        saveOut = try { FileOutputStream(f) } catch (e: Exception) { null }
    }

    @JavascriptInterface
    @Synchronized
    fun appendSave(b64: String?) {
        try {
            saveOut?.write(Base64.decode(b64 ?: "", Base64.DEFAULT))
        } catch (e: Exception) {
            abortLocked()
        }
    }

    @JavascriptInterface
    @Synchronized
    fun finishSave() {
        val f = saveFile ?: return
        val out = saveOut ?: return
        try { out.close() } catch (_: Exception) { }
        saveOut = null
        saveFile = null
        val name = saveName
        val mime = saveMime
        act.runOnUiThread { act.deliverFile(f, name, mime) }
    }

    @JavascriptInterface
    @Synchronized
    fun abortSave() = abortLocked()

    private fun abortLocked() {
        try { saveOut?.close() } catch (_: Exception) { }
        saveFile?.delete()
        saveOut = null
        saveFile = null
    }

    private fun safeName(n: String?): String {
        val s = (n ?: "").replace(Regex("[^A-Za-z0-9._ -]"), "_").trim().take(90)
        return if (s.isEmpty() || s.startsWith(".")) "datei.bin" else s
    }

    private fun safeMime(m: String?): String {
        val base = (m ?: "").substringBefore(';').trim().lowercase()
        val ok = setOf("application/pdf", "application/json", "text/plain", "text/csv", "image/png", "image/jpeg", "text/calendar")
        return if (base in ok) base else "application/octet-stream"
    }

    // ---- Sotto Pro (Google Play Billing) ----
    @JavascriptInterface
    fun hasBilling(): Boolean = act.billing != null

    @JavascriptInterface
    fun isPro(): Boolean = act.billing?.isPro() ?: false

    @JavascriptInterface
    fun proPrice(): String = act.billing?.price() ?: ""

    @JavascriptInterface
    fun buyPro() {
        act.runOnUiThread { act.billing?.buy() }
    }

    @JavascriptInterface
    fun restorePro() {
        act.runOnUiThread { act.billing?.refresh(true) }
    }

    // ---- Taegliche Erinnerung ----
    @JavascriptInterface
    fun setReminder(on: Boolean, hour: Int, minute: Int, title: String?, text: String?) {
        act.runOnUiThread {
            Reminder.set(act, on, hour, minute, title ?: "", text ?: "")
            if (on) act.askNotificationPermission()
        }
    }
}
