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
import android.provider.Settings
import android.view.Gravity
import android.view.WindowManager
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import java.text.SimpleDateFormat
import java.util.*

class SpeedService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var running = false
  private var lastRx = 0L
  private var lastTx = 0L
  private var lastMobileRx = 0L
  private var lastMobileTx = 0L
  private var lastTime = 0L

  private var todayMobile = 0L
  private var todayWifi = 0L
  private var todayDate = ""

  private var overlayView: LinearLayout? = null
  private var numberView: TextView? = null
  private var unitView: TextView? = null
  private var windowManager: WindowManager? = null

  private val CHANNEL_ID = "speed_service"
  private val NOTIF_ID = 1001
  private val PREFS = "speed_meter_prefs"
  private val MAX_DELTA_BYTES = 50L * 1024 * 1024

  companion object {
    @Volatile
    var instance: SpeedService? = null
  }

  override fun onCreate() {
    super.onCreate()
    instance = this
    loadTodayTotals()
    createNotificationChannel()
    val notification = buildNotification("0", "B/s", formatUsage())
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

    if (lastTime > 0) {
      val elapsed = (now - lastTime) / 1000.0
      if (elapsed > 0) {
        var deltaRx = (rx - lastRx).coerceAtLeast(0)
        var deltaTx = (tx - lastTx).coerceAtLeast(0)
        var deltaMobile = if (mobileSupported) {
          ((mRx - lastMobileRx) + (mTx - lastMobileTx)).coerceAtLeast(0)
        } else 0L
        var deltaTotal = (deltaRx + deltaTx).coerceAtLeast(0)

        if (deltaTotal > MAX_DELTA_BYTES) {
          deltaRx = 0
          deltaTx = 0
          deltaMobile = 0
          deltaTotal = 0
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
        val (number, unit) = splitSpeed(formatSpeed(rxSpeed))
        updateOverlay("$number $unit")
        updateNotification(number, unit, formatUsage())
      }
    }

    lastRx = rx
    lastTx = tx
    lastMobileRx = if (mobileSupported) mRx else 0L
    lastMobileTx = if (mobileSupported) mTx else 0L
    lastTime = now
  }

  private fun formatSpeed(bytesPerSec: Double): String {
    if (bytesPerSec < 1024) return "${bytesPerSec.toInt()} B/s"
    if (bytesPerSec < 1024 * 1024) return String.format("%.1f KB/s", bytesPerSec / 1024)
    return String.format("%.2f MB/s", bytesPerSec / (1024 * 1024))
  }

  private fun splitSpeed(speed: String): Pair<String, String> {
    val parts = speed.split(" ")
    return Pair(parts.getOrNull(0) ?: speed, parts.getOrNull(1) ?: "B/s")
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

  private fun createSpeedIcon(number: String): Icon {
    val size = 48
    val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.drawColor(Color.TRANSPARENT)

    val paint = Paint().apply {
      color = Color.WHITE
      textSize = if (number.length > 3) 14f else 18f
      isAntiAlias = true
      textAlign = Paint.Align.CENTER
      typeface = Typeface.DEFAULT_BOLD
    }

    val x = size / 2f
    val y = size / 2f - (paint.descent() + paint.ascent()) / 2f
    canvas.drawText(number, x, y, paint)

    return Icon.createWithBitmap(bitmap)
  }

  private fun canDraw(): Boolean {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      Settings.canDrawOverlays(this)
    } else true
  }

  private fun removeOverlay() {
    try {
      overlayView?.let { windowManager?.removeView(it) }
    } catch (_: Exception) {}
    overlayView = null
    numberView = null
    unitView = null
  }

  private fun getStatusBarHeight(): Int {
    var result = 0
    val resourceId = resources.getIdentifier("status_bar_height", "dimen", "android")
    if (resourceId > 0) {
      result = resources.getDimensionPixelSize(resourceId)
    }
    return result
  }

  private fun updateOverlay(speed: String) {
    try {
      if (!canDraw()) {
        removeOverlay()
        return
      }

      val parts = speed.split(" ")
      val number = parts.getOrNull(0) ?: speed
      val unit = parts.getOrNull(1) ?: "B/s"

      if (overlayView == null) {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val layout = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          setBackgroundColor(Color.TRANSPARENT)
          setPadding(4, 0, 4, 0)
        }
        val num = TextView(this).apply {
          setTextColor(Color.WHITE)
          textSize = 10f
          setShadowLayer(2f, 0f, 0f, Color.BLACK)
          gravity = Gravity.CENTER
          text = number
        }
        val unitTv = TextView(this).apply {
          setTextColor(Color.WHITE)
          textSize = 7f
          setShadowLayer(2f, 0f, 0f, Color.BLACK)
          gravity = Gravity.CENTER
          text = unit
        }
        layout.addView(num)
        layout.addView(unitTv)

        val statusBarHeight = getStatusBarHeight()
        val params = WindowManager.LayoutParams(
          WindowManager.LayoutParams.WRAP_CONTENT,
          WindowManager.LayoutParams.WRAP_CONTENT,
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
          else
            WindowManager.LayoutParams.TYPE_PHONE,
          WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
          PixelFormat.TRANSLUCENT
        ).apply {
          gravity = Gravity.TOP or Gravity.START
          x = 120
          y = (statusBarHeight / 2) - 16
        }

        windowManager?.addView(layout, params)
        overlayView = layout
        numberView = num
        unitView = unitTv
      } else {
        numberView?.text = number
        unitView?.text = unit
      }
    } catch (e: Exception) {
      e.printStackTrace()
      removeOverlay()
    }
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

    val icon = createSpeedIcon(number)

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Speed: $number $unit")
      .setContentText(usage)
      .setSmallIcon(icon)
      .setOngoing(true)
      .setContentIntent(pending)
      .setPriority(NotificationCompat.PRIORITY_MIN)
      .setSilent(true)
      .build()
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Speed Meter",
        NotificationManager.IMPORTANCE_MIN
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
    removeOverlay()
    super.onDestroy()
  }
}
