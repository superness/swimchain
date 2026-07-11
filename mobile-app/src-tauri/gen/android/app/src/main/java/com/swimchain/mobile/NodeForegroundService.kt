package com.swimchain.mobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.WifiManager
import android.os.Build
import android.os.IBinder

/**
 * Holds a dataSync foreground notification so Android keeps this process -
 * and the in-process swimchain node - alive when the app is backgrounded.
 * The service does no work itself; the node runs in the shared app process.
 *
 * It also holds a Wi-Fi MulticastLock: Android's Wi-Fi driver drops inbound
 * multicast packets by default, which would stop the node's mDNS LAN discovery
 * (`_swimchain._tcp.local`) from ever receiving peer announcements. The lock is
 * held for the node's lifetime and released in onDestroy.
 */
class NodeForegroundService : Service() {
    private var multicastLock: WifiManager.MulticastLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    private fun acquireMulticastLock() {
        if (multicastLock?.isHeld == true) return
        try {
            val wifi = applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
            multicastLock = wifi.createMulticastLock("swimchain-mdns").apply {
                setReferenceCounted(false)
                acquire()
            }
        } catch (e: Exception) {
            // mDNS just won't receive on this device; the node still works via
            // seed/DHT discovery.
        }
    }

    override fun onDestroy() {
        multicastLock?.let { if (it.isHeld) it.release() }
        multicastLock = null
        super.onDestroy()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        acquireMulticastLock()
        val channelId = "swimchain_node"
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(channelId, "Swimchain node", NotificationManager.IMPORTANCE_LOW)
        )
        val contentIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java).setFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            ),
            PendingIntent.FLAG_IMMUTABLE
        )
        val notification: Notification = Notification.Builder(this, channelId)
            .setContentTitle("Swimchain node running")
            .setContentText("Syncing with the network")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setContentIntent(contentIntent)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(1, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            startForeground(1, notification)
        }
        // Not sticky: if Android kills this process, a system-recreated
        // service would advertise a node that no longer exists (the node
        // runs in this same process and dies with it). The activity restarts
        // the service itself when the app is relaunched (see MainActivity).
        return START_NOT_STICKY
    }
}
