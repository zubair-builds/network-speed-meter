package expo.modules.networkusage

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
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

class SpeedService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private var running = false
  private var lastRx = 0L
  private var lastTx = 0L
  private var lastTime = 0L

  private var overlayView: LinearLayout? = null
  private var numberView: TextView? = null
  private var unitView: TextView? = null
  private var windowManager: WindowManager? = null

  private val CHANNEL_ID = "speed_service"
  private val NOTIF_ID = 1001

  override fun onCreate() {
    super.onCreate()
    createNotificationChannel()
    startForeground(NOTIF_ID, buildNotification("0 B/s", "Starting..."))
    startLoop()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

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

    if (rx < 0 || tx < 0) {
      updateNotification("Unsupported", "TrafficStats not available")
      return
    }

    if (lastTime > 0) {
      val elapsed = (now - lastTime) / 1000.0
      if (elapsed > 0) {
        val rxSpeed = (rx - lastRx) / elapsed
        val speedStr = formatSpeed(rxSpeed)
        updateOverlay(speedStr)
        updateNotification(speedStr, "Live")
      }
    }

    lastRx = rx
    lastTx = tx
    lastTime = now
  }

  private fun formatSpeed(bytesPerSec: Double): String {
    if (bytesPerSec < 1024) return "${bytesPerSec.toInt()} B/s"
    if (bytesPerSec < 1024 * 1024) return String.format("%.1f KB/s", bytesPerSec / 1024)
    return String.format("%.2f MB/s", bytesPerSec / (1024 * 1024))
  }

  private fun updateOverlay(speed: String) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) return

      val parts = speed.split(" ")
      val number = parts.getOrNull(0) ?: speed
      val unit = parts.getOrNull(1) ?: "B/s"

      if (overlayView == null) {
        windowManager = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val layout = LinearLayout(this).apply {
          orientation = LinearLayout.VERTICAL
          setBackgroundColor(Color.TRANSPARENT)
          setPadding(2, 0, 2, 0)
        }
        val num = TextView(this).apply {
          setTextColor(Color.WHITE)
          textSize = 11f
          setShadowLayer(1.2f, 0f, 0f, Color.BLACK)
          gravity = Gravity.CENTER
          text = number
        }
        val unitTv = TextView(this).apply {
          setTextColor(Color.WHITE)
          textSize = 8f
          setShadowLayer(1.2f, 0f, 0f, Color.BLACK)
          gravity = Gravity.CENTER
          text = unit
        }
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
        ).apply {
          gravity = Gravity.TOP or Gravity.START
          x = 88
          y = 1
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
    }
  }

  private fun updateNotification(speed: String, status: String) {
    val notif = buildNotification(speed, status)
    val nm = getSystemService(NotificationManager::class.java)
    nm.notify(NOTIF_ID, notif)
  }

  private fun buildNotification(speed: String, status: String): Notification {
    val intent = packageManager.getLaunchIntentForPackage(packageName)
    val pending = PendingIntent.getActivity(
      this, 0, intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Speed: $speed")
      .setContentText(status)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setOngoing(true)
      .setContentIntent(pending)
      .setPriority(NotificationCompat.PRIORITY_MIN)
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
      }
      getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacksAndMessages(null)
    try {
      overlayView?.let { windowManager?.removeView(it) }
    } catch (_: Exception) {}
    overlayView = null
    super.onDestroy()
  }
}
