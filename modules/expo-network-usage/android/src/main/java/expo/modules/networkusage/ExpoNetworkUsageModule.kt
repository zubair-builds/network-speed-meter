package expo.modules.networkusage

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.net.TrafficStats
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.TextView
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

class ExpoNetworkUsageModule : Module() {
  private var overlayView: TextView? = null
  private var windowManager: WindowManager? = null

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
      val ctx = appContext.reactContext ?: run {
        promise.resolve(false)
        return@AsyncFunction
      }
      val can = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        Settings.canDrawOverlays(ctx)
      } else true
      promise.resolve(can)
    }

    AsyncFunction("requestOverlayPermission") { promise: Promise ->
      val ctx = appContext.reactContext ?: run {
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
    }

    AsyncFunction("showOverlay") { text: String, promise: Promise ->
      val ctx = appContext.reactContext ?: run {
        promise.resolve(false)
        return@AsyncFunction
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(ctx)) {
        promise.resolve(false)
        return@AsyncFunction
      }
      try {
        if (overlayView == null) {
          windowManager = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
          val tv = TextView(ctx)
          tv.setTextColor(Color.WHITE)
          tv.setBackgroundColor(Color.TRANSPARENT)
          tv.setPadding(4, 2, 4, 2)
          tv.textSize = 11f
          tv.setShadowLayer(1.5f, 0f, 0f, Color.BLACK)
          tv.text = text

          val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
              WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            else
              WindowManager.LayoutParams.TYPE_PHONE,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
              WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE,
            PixelFormat.TRANSLUCENT
          )
          params.gravity = Gravity.TOP or Gravity.START
          params.x = 90
          params.y = 2

          windowManager?.addView(tv, params)
          overlayView = tv
        } else {
          overlayView?.text = text
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("hideOverlay") { promise: Promise ->
      try {
        overlayView?.let { windowManager?.removeView(it) }
        overlayView = null
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }
  }
}
