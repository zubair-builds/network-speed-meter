package expo.modules.networkusage

import android.content.Context
import android.content.Intent
import android.net.TrafficStats
import android.os.Build
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
