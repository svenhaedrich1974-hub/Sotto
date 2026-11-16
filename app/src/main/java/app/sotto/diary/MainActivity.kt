package app.sotto.diary

import android.Manifest
import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import java.io.File

class MainActivity : ComponentActivity() {

    companion object {
        const val HOST = "appassets.androidplatform.net"
        const val START = "https://$HOST/index.html"
    }

    lateinit var web: WebView
    private lateinit var bridge: Bridge
var billing: ProBilling? = null
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermission: PermissionRequest? = null

    private val pickFiles = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        val cb = fileCallback
        fileCallback = null
        if (cb != null) {
            val uris = mutableListOf<Uri>()
            val data = r.data
            if (r.resultCode == RESULT_OK && data != null) {
                val clip = data.clipData
                if (clip != null) {
                    for (i in 0 until clip.itemCount) uris.add(clip.getItemAt(i).uri)
                } else {
                    data.data?.let { uris.add(it) }
                }
            }
            cb.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
        }
    }

    private val askCamera = registerForActivityResult(ActivityResultContracts.RequestPermission()) { ok ->
        val p = pendingPermission
        pendingPermission = null
        if (p != null) {
            if (ok) p.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) else p.deny()
        }
    }

    private val askNotify = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val frame = FrameLayout(this)
        frame.setBackgroundColor(Color.parseColor(AppConfig.BG))
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor(AppConfig.BG))
        frame.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(frame)

        WindowCompat.getInsetsController(window, frame).apply {
            isAppearanceLightStatusBars = AppConfig.LIGHT_BARS
            isAppearanceLightNavigationBars = AppConfig.LIGHT_BARS
        }
        ViewCompat.setOnApplyWindowInsetsListener(frame) { v, insets ->
            val b = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout() or WindowInsetsCompat.Type.ime()
            )
            v.setPadding(b.left, b.top, b.right, b.bottom)
            WindowInsetsCompat.CONSUMED
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mediaPlaybackRequiresUserGesture = false
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
        }

        val loader = WebViewAssetLoader.Builder()
            .setDomain(HOST)
            .addPathHandler("/", WebViewAssetLoader.PathHandler { path -> asset(path) })
            .build()

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url
                if (u.host == HOST) return false
                if (u.scheme in setOf("https", "http", "mailto", "tel")) {
                    try { startActivity(Intent(Intent.ACTION_VIEW, u)) } catch (_: Exception) { }
                }
                return true
            }
        }

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = cb
                val accept = params.acceptTypes.filter { it.isNotBlank() }
                val intent = Intent(Intent.ACTION_GET_CONTENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = if (accept.isNotEmpty() && accept.all { it.startsWith("image/") }) "image/*" else "*/*"
                    if (params.mode == FileChooserParams.MODE_OPEN_MULTIPLE) putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
                }
                return try {
                    pickFiles.launch(intent)
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                runOnUiThread {
                    if (request.origin.host != HOST || !request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                        request.deny()
                    } else if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                    } else {
                        pendingPermission?.deny()
                        pendingPermission = request
                        askCamera.launch(Manifest.permission.CAMERA)
                    }
                }
            }
        }

        bridge = Bridge(this)
        web.addJavascriptInterface(bridge, "KammerAndroid")
    billing = ProBilling(this).also { it.start() }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("(window.__kammerBack && window.__kammerBack()) ? 1 : 0") { r ->
                    if (r != "1") {
                        if (web.canGoBack()) web.goBack() else finish()
                    }
                }
            }
        })

        web.loadUrl(START)
    }

    private fun asset(path: String): WebResourceResponse? {
        val p = path.trimStart('/').ifEmpty { "index.html" }
        if (p.contains("..")) return null
        return try {
            val mime = mimeFor(p)
            val enc = if (mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") || mime.contains("svg")) "utf-8" else null
            WebResourceResponse(mime, enc, assets.open("www/$p"))
        } catch (e: Exception) {
            null
        }
    }

    private fun mimeFor(p: String): String = when (p.substringAfterLast('.', "").lowercase()) {
        "html" -> "text/html"
        "js" -> "text/javascript"
        "css" -> "text/css"
        "json" -> "application/json"
        "svg" -> "image/svg+xml"
        "png" -> "image/png"
        "jpg", "jpeg" -> "image/jpeg"
        "webp" -> "image/webp"
        "woff2" -> "font/woff2"
        "woff" -> "font/woff"
        "webmanifest" -> "application/manifest+json"
        else -> "application/octet-stream"
    }

    override fun onPause() {
        web.evaluateJavascript("window.__kammerFlush && window.__kammerFlush()", null)
        super.onPause()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    fun js(code: String) = runOnUiThread { web.evaluateJavascript(code, null) }

    fun toast(msg: String) = runOnUiThread { Toast.makeText(this, msg, Toast.LENGTH_LONG).show() }

    fun askNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            askNotify.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    /** Gespeicherte Datei (PDF, Sicherung, Text) in Downloads ablegen und Teilen anbieten. */
    fun deliverFile(f: File, name: String, mime: String) {
        var saved = false
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                val v = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, name)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + AppConfig.FOLDER)
                }
                val uri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v)
                if (uri != null) {
                    contentResolver.openOutputStream(uri)?.use { out -> f.inputStream().use { it.copyTo(out) } }
                    saved = true
                }
            } catch (_: Exception) { }
        }
        if (saved) toast(getString(R.string.saved_downloads, AppConfig.FOLDER + "/" + name))
        try {
            val uri = FileProvider.getUriForFile(this, "$packageName.exports", f)
            val send = Intent(Intent.ACTION_SEND).apply {
                type = mime
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TITLE, name)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(send, name))
        } catch (_: Exception) {
            if (!saved) toast(getString(R.string.save_failed))
        }
    }
}
