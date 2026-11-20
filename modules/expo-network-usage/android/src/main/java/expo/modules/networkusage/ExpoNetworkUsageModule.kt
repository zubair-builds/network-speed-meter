package expo.modules.networkusage

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.net.TrafficStats
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.text.SimpleDateFormat
import java.util.*

class ExpoNetworkUsageModule : Module() {

  companion object {
    private var sessionStart = 0L
    private val uidBaseline = mutableMapOf<Int, Long>()
  }

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

    AsyncFunction("hasUsageAccess") { promise: Promise ->
      promise.resolve(checkUsageAccess())
    }

    AsyncFunction("openUsageAccessSettings") { promise: Promise ->
      try {
        val ctx = appContext.reactContext ?: run {
          promise.resolve(false)
          return@AsyncFunction
        }
        val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
          flags = Intent.FLAG_ACTIVITY_NEW_TASK
        }
        ctx.startActivity(intent)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.resolve(false)
      }
    }

    AsyncFunction("startSession") { promise: Promise ->
      sessionStart = System.currentTimeMillis()
      uidBaseline.clear()
      snapshotBaselines()
      promise.resolve(sessionStart)
    }

    AsyncFunction("getSessionStart") { promise: Promise ->
      promise.resolve(sessionStart)
    }

    AsyncFunction("getAppUsage") { promise: Promise ->
      try {
        val ctx = appContext.reactContext ?: run {
          promise.resolve(emptyList<Map<String, Any>>())
          return@AsyncFunction
        }
        if (sessionStart == 0L) {
          sessionStart = System.currentTimeMillis()
          snapshotBaselines()
        }

        val pm = ctx.packageManager
        val apps = pm.getInstalledApplications(PackageManager.GET_META_DATA)
        val uidToApps = mutableMapOf<Int, MutableList<ApplicationInfo>>()

        for (app in apps) {
          val list = uidToApps.getOrPut(app.uid) { mutableListOf() }
          list.add(app)
        }

        val result = mutableListOf<Map<String, Any>>()

        for ((uid, appList) in uidToApps) {
          val currentRx = TrafficStats.getUidRxBytes(uid)
          val currentTx = TrafficStats.getUidTxBytes(uid)
          if (currentRx < 0 || currentTx < 0) continue

          val current = currentRx + currentTx
          val baseline = uidBaseline[uid] ?: current
          val delta = (current - baseline).coerceAtLeast(0)

          if (delta < 1024) continue

          val mainApp = appList.firstOrNull { (it.flags and ApplicationInfo.FLAG_SYSTEM) == 0 } ?: appList.first()
          val label = try {
            pm.getApplicationLabel(mainApp).toString()
          } catch (e: Exception) {
            mainApp.packageName
          }

          result.add(mapOf(
            "packageName" to mainApp.packageName,
            "label" to label,
            "bytes" to delta
          ))
        }

        result.sortByDescending { it["bytes"] as Long }
        promise.resolve(result.take(30))
      } catch (e: Exception) {
        e.printStackTrace()
        promise.resolve(emptyList<Map<String, Any>>())
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

  private fun checkUsageAccess(): Boolean {
    val ctx = appContext.reactContext ?: return false
    return try {
      val appOps = ctx.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          android.os.Process.myUid(),
          ctx.packageName
        )
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          android.os.Process.myUid(),
          ctx.packageName
        )
      }
      mode == AppOpsManager.MODE_ALLOWED
    } catch (e: Exception) {
      false
    }
  }

  private fun snapshotBaselines() {
    val ctx = appContext.reactContext ?: return
    try {
      val pm = ctx.packageManager
      val apps = pm.getInstalledApplications(0)
      val uids = apps.map { it.uid }.toSet()
      for (uid in uids) {
        val rx = TrafficStats.getUidRxBytes(uid)
        val tx = TrafficStats.getUidTxBytes(uid)
        if (rx >= 0 && tx >= 0) {
          uidBaseline[uid] = rx + tx
        }
      }
    } catch (e: Exception) {
      e.printStackTrace()
    }
  }
}
