package expo.modules.networkusage

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.*
import android.net.TrafficStats
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import androidx.core.graphics.drawable.IconCompat
import java.text.SimpleDateFormat
import java.util.*
import kotlin.math.roundToInt

class SpeedService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var running = false
  private var lastRx = 0L
  private var lastTx = 0L
  private var lastMobileRx = 0L
  private var lastMobileTx = 0L
  private var lastTime = 0L
  private var hasBaseline = false
  private var lastBaselineSave = 0L

  private var todayMobile = 0L
  private var todayWifi = 0L
  private var todayDate = ""

  private val CHANNEL_ID = "speed_service"
  private val NOTIF_ID = 1001
  private val PREFS = "speed_meter_prefs"
  private val MAX_DELTA_BYTES = 20L * 1024 * 1024
  private val MAX_GAP_MS = 5L * 60 * 1000

  companion object {
    @Volatile
    var instance: SpeedService? = null
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    loadTodayTotals()
    loadBaseline()
    createNotificationChannel()
    val notification = buildNotification("0", "KB/s", formatUsage())
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(NOTIF_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
    } else {
      startForeground(NOTIF_ID, notification)
    }
    startLoop()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  fun getTodayTotals(): Map<String, Long> {
    return mapOf("mobile" to todayMobile, "wifi" to todayWifi)
  }

  private fun todayISO(): String {
    return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
  }

  private fun loadTodayTotals() {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val storedDate = prefs.getString("date", "") ?: ""
    val current = todayISO()
    if (storedDate == current) {
      todayMobile = prefs.getLong("mobile", 0L)
      todayWifi = prefs.getLong("wifi", 0L)
      todayDate = current
    } else {
      todayMobile = 0L
      todayWifi = 0L
      todayDate = current
      saveTodayTotals()
    }
  }

  private fun loadBaseline() {
    val prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    lastRx = prefs.getLong("lastRx", 0L)
    lastTx = prefs.getLong("lastTx", 0L)
    lastMobileRx = prefs.getLong("lastMobileRx", 0L)
    lastMobileTx = prefs.getLong("lastMobileTx", 0L)
    lastTime = prefs.getLong("lastTime", 0L)
    hasBaseline = lastTime > 0 && lastRx > 0
  }

  private fun saveBaseline() {
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putLong("lastRx", lastRx)
      .putLong("lastTx", lastTx)
      .putLong("lastMobileRx", lastMobileRx)
      .putLong("lastMobileTx", lastMobileTx)
      .putLong("lastTime", lastTime)
      .apply()
  }

  private fun saveTodayTotals() {
    getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("date", todayDate)
      .putLong("mobile", todayMobile)
      .putLong("wifi", todayWifi)
      .apply()
  }

  private fun startLoop() {
    running = true
    handler.post(object : Runnable {
      override fun run() {
        if (!running) return
        updateSpeed()
        handler.postDelayed(this, 1000)
      }
    })
  }

  private fun updateSpeed() {
    val now = System.currentTimeMillis()
    val rx = TrafficStats.getTotalRxBytes()
    val tx = TrafficStats.getTotalTxBytes()
    var mRx = TrafficStats.getMobileRxBytes()
    var mTx = TrafficStats.getMobileTxBytes()

    if (rx < 0 || tx < 0) {
      updateNotification("--", "", "TrafficStats not available")
      return
    }

    val mobileSupported = mRx >= 0 && mTx >= 0
    if (!mobileSupported) {
      mRx = 0L
      mTx = 0L
    }

    val currentDate = todayISO()
    if (currentDate != todayDate) {
      todayDate = currentDate
      todayMobile = 0L
      todayWifi = 0L
      saveTodayTotals()
    }

    val gap = if (lastTime > 0) now - lastTime else Long.MAX_VALUE
    val baselineOk = hasBaseline && gap > 0 && gap < MAX_GAP_MS

    if (baselineOk) {
      val elapsed = gap / 1000.0
      var deltaRx = (rx - lastRx).coerceAtLeast(0)
      var deltaTx = (tx - lastTx).coerceAtLeast(0)
      var deltaMobile = if (mobileSupported) {
        ((mRx - lastMobileRx) + (mTx - lastMobileTx)).coerceAtLeast(0)
      } else 0L
      var deltaTotal = (deltaRx + deltaTx).coerceAtLeast(0)

      if (deltaTotal > MAX_DELTA_BYTES || deltaMobile > MAX_DELTA_BYTES) {
        deltaRx = 0
        deltaTx = 0
        deltaMobile = 0
        deltaTotal = 0
      }

      // Cap mobile so it never exceeds the total delta
      if (deltaMobile > deltaTotal) {
        deltaMobile = deltaTotal
      }

      val deltaWifi = if (mobileSupported) {
        (deltaTotal - deltaMobile).coerceAtLeast(0)
      } else {
        deltaTotal
      }

      todayMobile += deltaMobile
      todayWifi += deltaWifi
      if (deltaTotal > 0) saveTodayTotals()

      val rxSpeed = deltaRx / elapsed
      val (number, unit) = formatSpeedParts(rxSpeed)
      updateNotification(number, unit, formatUsage())
    } else {
      // First sample or large gap: set baseline only, do not count
      updateNotification("0", "KB/s", formatUsage())
    }

    lastRx = rx
    lastTx = tx
    lastMobileRx = if (mobileSupported) mRx else 0L
    lastMobileTx = if (mobileSupported) mTx else 0L
    lastTime = now
    hasBaseline = true
    if (now - lastBaselineSave > 15000) {
      lastBaselineSave = now
      saveBaseline()
    }
  }

  private fun formatSpeedParts(bytesPerSec: Double): Pair<String, String> {
    return when {
      bytesPerSec < 1024 -> Pair("0", "KB/s")
      bytesPerSec < 1024 * 1024 -> Pair("${(bytesPerSec / 1024).roundToInt()}", "KB/s")
      else -> {
        val mb = bytesPerSec / (1024.0 * 1024.0)
        Pair(String.format("%.1f", mb), "MB/s")
      }
    }
  }

  private fun formatBytes(bytes: Long): String {
    if (bytes <= 0) return "0 MB"
    val mb = bytes / (1024.0 * 1024.0)
    return if (mb < 1024) String.format("%.1f MB", mb)
    else String.format("%.2f GB", mb / 1024)
  }

  private fun formatUsage(): String {
    return "Mobile: ${formatBytes(todayMobile)}  WiFi: ${formatBytes(todayWifi)}"
  }

  private fun textBounds(paint: Paint, text: String): Rect {
    val r = Rect()
    paint.getTextBounds(text, 0, text.length, r)
    return r
  }

  private fun createSpeedIcon(number: String, unit: String): IconCompat {
    val width = 160
    val height = 128
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.TRANSPARENT)

    val inset = 1f
    val maxW = width - inset * 2
    val maxH = height - inset * 2
    val gap = 4f

    val condensedBold = Typeface.create("sans-serif-condensed", Typeface.BOLD)

    val numPaint = Paint().apply {
      color = Color.WHITE
      isAntiAlias = true
      textAlign = Paint.Align.CENTER
      typeface = condensedBold
    }

    val unitPaint = Paint().apply {
      color = Color.WHITE
      isAntiAlias = true
      textAlign = Paint.Align.CENTER
      typeface = condensedBold
    }

    var numSize = 102f
    var unitSize = 68f

    numPaint.textSize = numSize
    while (textBounds(numPaint, number).width() > maxW && numSize > 36f) {
      numSize -= 2f
      numPaint.textSize = numSize
    }

    unitPaint.textSize = unitSize
    while (textBounds(unitPaint, unit).width() > maxW && unitSize > 24f) {
      unitSize -= 1f
      unitPaint.textSize = unitSize
    }

    var numBounds = textBounds(numPaint, number)
    var unitBounds = textBounds(unitPaint, unit)
    var totalH = numBounds.height() + gap + unitBounds.height()

    while (totalH > maxH && numSize > 36f) {
      numSize -= 2f
      unitSize = (unitSize * 0.97f).coerceAtLeast(24f)
      numPaint.textSize = numSize
      unitPaint.textSize = unitSize
      numBounds = textBounds(numPaint, number)
      unitBounds = textBounds(unitPaint, unit)
      totalH = numBounds.height() + gap + unitBounds.height()
    }

    val top = (height - totalH) / 2f
    val numBaseline = top - numBounds.top
    val unitBaseline = top + numBounds.height() + gap - unitBounds.top

    val x = width / 2f
    canvas.drawText(number, x, numBaseline, numPaint)
    canvas.drawText(unit, x, unitBaseline, unitPaint)

    return IconCompat.createWithBitmap(bitmap)
  }

  private fun updateNotification(number: String, unit: String, usage: String) {
    val notif = buildNotification(number, unit, usage)
    val nm = getSystemService(NotificationManager::class.java)
    nm.notify(NOTIF_ID, notif)
  }

  private fun buildNotification(number: String, unit: String, usage: String): Notification {
    val intent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = PendingIntent.getActivity(
      this, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val icon = createSpeedIcon(number, unit)

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Speed: $number $unit")
      .setContentText(usage)
      .setSmallIcon(icon)
      .setOngoing(true)
      .setShowWhen(false)
      .setContentIntent(pending)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setSilent(true)
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Speed Meter",
        NotificationManager.IMPORTANCE_LOW
      ).apply {
        setSound(null, null)
        enableVibration(false)
        setShowBadge(false)
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  override fun onDestroy() {
    running = false
    instance = null
    handler.removeCallbacksAndMessages(null)
    super.onDestroy()
  }
}
