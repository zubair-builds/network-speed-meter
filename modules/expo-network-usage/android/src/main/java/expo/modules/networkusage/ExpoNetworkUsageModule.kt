package expo.modules.networkusage

import android.app.AppOpsManager
import android.app.usage.NetworkStats
import android.app.usage.NetworkStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.ConnectivityManager
import android.net.TrafficStats
import android.os.Build
import android.os.Process
import android.provider.Settings
import android.telephony.TelephonyManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise
import java.text.SimpleDateFormat
import java.util.*

class ExpoNetworkUsageModule : Module() {

  companion object {
    private var sessionStart = 0L
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
        if (!checkUsageAccess()) {
          promise.resolve(emptyList<Map<String, Any>>())
          return@AsyncFunction
        }
        if (sessionStart == 0L) {
          sessionStart = System.currentTimeMillis()
        }

        val nsm = ctx.getSystemService(Context.NETWORK_STATS_SERVICE) as NetworkStatsManager
        val pm = ctx.packageManager
        val now = System.currentTimeMillis()

        // Query from start of today so more apps appear
        val cal = Calendar.getInstance()
        cal.set(Calendar.HOUR_OF_DAY, 0)
        cal.set(Calendar.MINUTE, 0)
        cal.set(Calendar.SECOND, 0)
        cal.set(Calendar.MILLISECOND, 0)
        val from = cal.timeInMillis

        val subscriberId = getSubscriberId(ctx)

        val uidBytes = mutableMapOf<Int, Long>()
        var systemBytes = 0L
        var tetherBytes = 0L

        fun queryAndAdd(networkType: Int, subId: String?, isTether: Boolean) {
          var stats: NetworkStats? = null
          try {
            stats = nsm.querySummary(networkType, subId, from, now)
            val bucket = NetworkStats.Bucket()
            while (stats.hasNextBucket()) {
              stats.getNextBucket(bucket)
              val uid = bucket.uid
              val bytes = bucket.rxBytes + bucket.txBytes
              if (bytes <= 0) continue
              if (isTether || uid == 0) {
                tetherBytes += bytes
              } else if (uid < 10000 || uid == Process.SYSTEM_UID) {
                systemBytes += bytes
              } else {
                uidBytes[uid] = (uidBytes[uid] ?: 0L) + bytes
              }
            }
          } catch (e: Exception) {
            e.printStackTrace()
          } finally {
            stats?.close()
          }
        }

        // Mobile and WiFi for apps; DUN is real tether
        queryAndAdd(ConnectivityManager.TYPE_MOBILE, subscriberId, false)
        queryAndAdd(ConnectivityManager.TYPE_WIFI, null, false)

        try {
          val dun = ConnectivityManager::class.java.getField("TYPE_MOBILE_DUN").getInt(null)
          queryAndAdd(dun, subscriberId, true)
        } catch (e: Exception) {
          // TYPE_MOBILE_DUN not available
        }

        val result = mutableListOf<Map<String, Any>>()
        for ((uid, bytes) in uidBytes) {
          if (bytes < 512) continue
          val pkgs = pm.getPackagesForUid(uid) ?: continue
          // Prefer a package that has a real app label
          var chosen = pkgs.first()
          var label = chosen
          for (pkg in pkgs) {
            try {
              val info = pm.getApplicationInfo(pkg, 0)
              val appLabel = pm.getApplicationLabel(info).toString()
              if (appLabel.isNotBlank() && !appLabel.equals(pkg, ignoreCase = true)) {
                chosen = pkg
                label = appLabel
                break
              }
              label = appLabel
            } catch (e: Exception) {
              // keep default
            }
          }
          result.add(mapOf(
            "packageName" to chosen,
            "label" to label,
            "bytes" to bytes
          ))
        }

        if (tetherBytes >= 512) {
          result.add(mapOf(
            "packageName" to "hotspot",
            "label" to "Hotspot",
            "bytes" to tetherBytes
          ))
        }
        if (systemBytes >= 512) {
          result.add(mapOf(
            "packageName" to "system",
            "label" to "System",
            "bytes" to systemBytes
          ))
        }

        result.sortByDescending { it["bytes"] as Long }
        promise.resolve(result.take(80))
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

  private fun getSubscriberId(ctx: Context): String? {
    return try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        null
      } else {
        val tm = ctx.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
        @Suppress("DEPRECATION")
        tm.subscriberId
      }
    } catch (e: Exception) {
      null
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
}
