package expo.modules.networkusage

import android.net.TrafficStats
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.Promise

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
  }
}
