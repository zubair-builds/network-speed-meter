package expo.modules.networkusage

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.TrafficStats
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoNetworkUsageModule : Module() {
  private var overlayView: LinearLayout? = null
  private var numberView: TextView? = null
  private var unitView: TextView? = null
  private var windowManager: WindowManager? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  override fun definition() = ModuleDefinition {
    Name("ExpoNetworkUsage")

    AsyncFunction("getTotalBytes") { promise: Promise ->
      val rx = TrafficStats.getTotalRxBytes()
      val tx = TrafficStats.getTotalTxBytes()
      promise.resolve(mapOf("rx" to rx, "tx" to tx))
    }

    AsyncFunction("getMobileBytes") { promise: Promise ->
      val rx = TrafficStats.getMobileRxBytes()
      val tx = TrafficStats.getMobileTxBytes()
      promise.resolve(mapOf("rx" to rx, "tx" to tx))
    }

    AsyncFunction("canDrawOverlay") { promise: Promise ->
      try {
        val ctx = appContext.reactContext
        if (ctx == null) {
          promise.resolve(false)
          return@AsyncFunction
        }
        val can = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          Settings.canDrawOverlays(ctx)
        } else true
        promise.resolve(can)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("requestOverlayPermission") { promise: Promise ->
      try {
        val ctx = appContext.reactContext
        if (ctx == null) {
          promise.resolve(false)
          return@AsyncFunction
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
          val intent = android.content.Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            android.net.Uri.parse("package:" + ctx.packageName)
          )
          intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
          ctx.startActivity(intent)
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("showOverlay") { text: String, promise: Promise ->
      mainHandler.post {
        try {
          val ctx = appContext.reactContext
          if (ctx == null) {
            promise.resolve(false)
            return@post
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
            promise.resolve(false)
            return@post
          }

          val parts = text.split("\n")
          val number = parts.getOrNull(0) ?: text
          val unit = parts.getOrNull(1) ?: ""

          if (overlayView == null) {
            windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager

            val layout = LinearLayout(ctx)
            layout.orientation = LinearLayout.VERTICAL
            layout.setBackgroundColor(Color.TRANSPARENT)
            layout.setPadding(2, 0, 2, 0)

            val num = TextView(ctx)
            num.setTextColor(Color.WHITE)
            num.textSize = 11f
            num.setShadowLayer(1.2f, 0f, 0f, Color.BLACK)
            num.gravity = Gravity.CENTER
            num.text = number

            val unitTv = TextView(ctx)
            unitTv.setTextColor(Color.WHITE)
            unitTv.textSize = 8f
            unitTv.setShadowLayer(1.2f, 0f, 0f, Color.BLACK)
            unitTv.gravity = Gravity.CENTER
            unitTv.text = unit

            layout.addView(num)
            layout.addView(unitTv)

            val params = WindowManager.LayoutParams(
              WindowManager.LayoutParams.WRAP_CONTENT,
              WindowManager.LayoutParams.WRAP_CONTENT,
              if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
              else
                WindowManager.LayoutParams.TYPE_PHONE,
              WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
              PixelFormat.TRANSLUCENT
            )
            params.gravity = Gravity.TOP or Gravity.START
            params.x = 88
            params.y = 1

            windowManager?.addView(layout, params)
            overlayView = layout
            numberView = num
            unitView = unitTv
          } else {
            numberView?.text = number
            unitView?.text = unit
          }
          promise.resolve(true)
        } catch (e: Exception) {
          e.printStackTrace()
          promise.resolve(false)
        }
      }
    }

    AsyncFunction("hideOverlay") { promise: Promise ->
      mainHandler.post {
        try {
          overlayView?.let { view ->
            windowManager?.removeView(view)
          }
          overlayView = null
          numberView = null
          unitView = null
          promise.resolve(true)
        } catch (e: Exception) {
          promise.resolve(false)
        }
      }
    }
  }
}
