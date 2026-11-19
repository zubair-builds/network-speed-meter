package expo.modules.networkusage

import android.content.Context
import android.content.Intent
import android.net.TrafficStats
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.text.SimpleDateFormat
import java.util.*

class ExpoNetworkUsageModule : Module() {

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

    AsyncFunction("getTodayTotals") { promise: Promise ->
      val svc = SpeedService.instance
      if (svc != null) {
        promise.resolve(svc.getTodayTotals())
      } else {
        val ctx = appContext.reactContext
        if (ctx != null) {
          val prefs = ctx.getSharedPreferences("speed_meter_prefs", Context.MODE_PRIVATE)
          val storedDate = prefs.getString("date", "") ?: ""
          val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
          if (storedDate == today) {
            promise.resolve(mapOf(
              "mobile" to prefs.getLong("mobile", 0L),
              "wifi" to prefs.getLong("wifi", 0L)
            ))
          } else {
            promise.resolve(mapOf("mobile" to 0L, "wifi" to 0L))
          }
        } else {
          promise.resolve(mapOf("mobile" to 0L, "wifi" to 0L))
        }
      }
    }

    AsyncFunction("getIconSettings") { promise: Promise ->
      val svc = SpeedService.instance
      if (svc != null) {
        promise.resolve(svc.getIconSettings())
      } else {
        val ctx = appContext.reactContext
        if (ctx != null) {
          val prefs = ctx.getSharedPreferences("speed_meter_prefs", Context.MODE_PRIVATE)
          promise.resolve(mapOf(
            "size" to prefs.getInt("icon_size", 48),
            "style" to (prefs.getString("icon_style", "normal") ?: "normal")
          ))
        } else {
          promise.resolve(mapOf("size" to 48, "style" to "normal"))
        }
      }
    }

    AsyncFunction("setIconSize") { size: Int, promise: Promise ->
      SpeedService.instance?.setIconSize(size)
      promise.resolve(true)
    }

    AsyncFunction("setIconStyle") { style: String, promise: Promise ->
      SpeedService.instance?.setIconStyle(style)
      promise.resolve(true)
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

    AsyncFunction("startSpeedService") { promise: Promise ->
      try {
        val ctx = appContext.reactContext ?: run {
          promise.resolve(false)
          return@AsyncFunction
        }
        val intent = Intent(ctx, SpeedService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          ctx.startForegroundService(intent)
        } else {
          ctx.startService(intent)
        }
        promise.resolve(true)
      } catch (e: Exception) {
        e.printStackTrace()
        promise.resolve(false)
      }
    }

    AsyncFunction("stopSpeedService") { promise: Promise ->
      try {
        val ctx = appContext.reactContext ?: run {
          promise.resolve(false)
          return@AsyncFunction
        }
        ctx.stopService(Intent(ctx, SpeedService::class.java))
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }
  }
}
