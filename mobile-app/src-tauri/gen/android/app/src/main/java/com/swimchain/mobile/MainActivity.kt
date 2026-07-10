package com.swimchain.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // targetSdk 35+ enforces edge-to-edge: the WebView is laid out under the
    // system bars, so the web UI's bottom nav sits beneath Android's
    // back/home controls (Android WebView does not report safe-area insets
    // for the navigation bar, so the web side cannot pad itself). Inset the
    // root view by the system bars instead.
    ViewCompat.setOnApplyWindowInsetsListener(findViewById(android.R.id.content)) { v, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      // Padded bar areas show the window background; match the shell's dark
      // status strip (#10141a) instead of the theme default white.
      v.setBackgroundColor(0xFF10141A.toInt())
      WindowInsetsCompat.CONSUMED
    }
    // Node autostarts with the app (Rust setup hook), so the keep-alive
    // service starts with the activity. Notification permission (API 33+)
    // only gates visibility of the notification, not the keep-alive itself.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
    ) {
      requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }
    startForegroundService(Intent(this, NodeForegroundService::class.java))
  }

  override fun onRequestPermissionsResult(
    requestCode: Int,
    permissions: Array<out String>,
    grantResults: IntArray
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    // A notification enqueued before POST_NOTIFICATIONS was granted is never
    // shown (Android 13+ drops it silently). Restart the service so
    // onStartCommand re-posts it now that it is visible.
    if (requestCode == 1 && grantResults.any { it == PackageManager.PERMISSION_GRANTED }) {
      startForegroundService(Intent(this, NodeForegroundService::class.java))
    }
  }
}
