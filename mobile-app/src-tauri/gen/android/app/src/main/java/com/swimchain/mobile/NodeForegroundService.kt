package com.swimchain.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Holds a dataSync foreground notification so Android keeps this process -
 * and the in-process swimchain node - alive when the app is backgrounded.
 * The service does no work itself; the node runs in the shared app process.
 */
class NodeForegroundService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val channelId = "swimchain_node"
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(channelId, "Swimchain node", NotificationManager.IMPORTANCE_LOW)
        )
        val notification: Notification = Notification.Builder(this, channelId)
            .setContentTitle("Swimchain node running")
            .setContentText("Syncing with the network")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, notification)
        }
        return START_STICKY
    }
}
