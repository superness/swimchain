package com.swimchain.mobile

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
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
