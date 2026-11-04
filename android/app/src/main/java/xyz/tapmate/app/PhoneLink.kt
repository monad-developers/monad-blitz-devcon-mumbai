package xyz.tapmate.app

import android.content.Context
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.android.gms.nearby.Nearby
import com.google.android.gms.nearby.connection.AdvertisingOptions
import com.google.android.gms.nearby.connection.ConnectionInfo
import com.google.android.gms.nearby.connection.ConnectionLifecycleCallback
import com.google.android.gms.nearby.connection.ConnectionResolution
import com.google.android.gms.nearby.connection.DiscoveredEndpointInfo
import com.google.android.gms.nearby.connection.DiscoveryOptions
import com.google.android.gms.nearby.connection.EndpointDiscoveryCallback
import com.google.android.gms.nearby.connection.Payload
import com.google.android.gms.nearby.connection.PayloadCallback
import com.google.android.gms.nearby.connection.PayloadTransferUpdate
import com.google.android.gms.nearby.connection.Strategy

sealed interface LinkEvent {
    data class Status(val text: String) : LinkEvent
    data class Connected(val peerName: String) : LinkEvent
    data object Disconnected : LinkEvent
    data class Message(val text: String) : LinkEvent
}

/** Direct phone-to-phone messaging over Nearby Connections, with no internet or server. */
class PhoneLink(context: Context, private val onEvent: (LinkEvent) -> Unit) {
    private val client = Nearby.getConnectionsClient(context.applicationContext)
    private val handler = Handler(Looper.getMainLooper())
    private val localName = Build.MODEL
    private var peerId: String? = null
    private var peerName = "Opponent"
    private var foundEndpoint: String? = null

    private val payloads = object : PayloadCallback() {
        override fun onPayloadReceived(endpointId: String, payload: Payload) {
            val text = payload.asBytes()?.let { String(it, Charsets.UTF_8) } ?: return
            Log.i(TAG, "recv $text")
            onEvent(LinkEvent.Message(text))
        }

        override fun onPayloadTransferUpdate(endpointId: String, update: PayloadTransferUpdate) = Unit
    }

    private val lifecycle = object : ConnectionLifecycleCallback() {
        override fun onConnectionInitiated(endpointId: String, info: ConnectionInfo) {
            peerName = info.endpointName
            client.acceptConnection(endpointId, payloads)
        }

        override fun onConnectionResult(endpointId: String, resolution: ConnectionResolution) {
            Log.i(TAG, "connection result ${resolution.status.statusCode} for $endpointId")
            if (resolution.status.isSuccess) {
                peerId = endpointId
                client.stopAdvertising()
                client.stopDiscovery()
                onEvent(LinkEvent.Connected(peerName))
            } else {
                report("Connection failed: ${resolution.status.statusCode}")
                retryRequest()
            }
        }

        override fun onDisconnected(endpointId: String) {
            peerId = null
            onEvent(LinkEvent.Disconnected)
        }
    }

    private val discovery = object : EndpointDiscoveryCallback() {
        override fun onEndpointFound(endpointId: String, info: DiscoveredEndpointInfo) {
            if (foundEndpoint != null) return
            foundEndpoint = endpointId
            report("Found ${info.endpointName}, connecting…")
            requestConnection()
        }

        override fun onEndpointLost(endpointId: String) {
            if (foundEndpoint == endpointId) foundEndpoint = null
        }
    }

    fun host(session: String) {
        stop()
        report("Waiting for your friend…")
        val options = AdvertisingOptions.Builder().setStrategy(STRATEGY).build()
        client.startAdvertising(localName, serviceId(session), lifecycle, options)
            .addOnFailureListener { report("Could not start game: ${it.message}") }
    }

    fun join(session: String) {
        stop()
        report("Connecting to your friend…")
        val options = DiscoveryOptions.Builder().setStrategy(STRATEGY).build()
        client.startDiscovery(serviceId(session), discovery, options)
            .addOnFailureListener { report("Could not search: ${it.message}") }
    }

    fun send(text: String) {
        val id = peerId
        Log.i(TAG, "send $text to $id")
        if (id == null) return
        client.sendPayload(id, Payload.fromBytes(text.toByteArray(Charsets.UTF_8)))
            .addOnFailureListener { Log.w(TAG, "send failed", it) }
    }

    fun stop() {
        handler.removeCallbacksAndMessages(null)
        client.stopAdvertising()
        client.stopDiscovery()
        client.stopAllEndpoints()
        peerId = null
        foundEndpoint = null
    }

    /** The session comes from the tap or QR code, so only this pair of phones can find each other. */
    private fun serviceId(session: String) = "$SERVICE_PREFIX.${session.removePrefix("0x")}"

    private fun requestConnection() {
        val id = foundEndpoint ?: return
        client.requestConnection(localName, id, lifecycle)
            .addOnFailureListener {
                Log.w(TAG, "requestConnection failed", it)
                retryRequest()
            }
    }

    private fun retryRequest() {
        if (peerId == null) handler.postDelayed({ requestConnection() }, RETRY_MILLIS)
    }

    private fun report(text: String) {
        Log.i(TAG, text)
        onEvent(LinkEvent.Status(text))
    }

    private companion object {
        const val TAG = "TapMateLink"
        const val SERVICE_PREFIX = "xyz.tapmate.app.chess"
        const val RETRY_MILLIS = 1_500L
        val STRATEGY: Strategy = Strategy.P2P_POINT_TO_POINT
    }
}
