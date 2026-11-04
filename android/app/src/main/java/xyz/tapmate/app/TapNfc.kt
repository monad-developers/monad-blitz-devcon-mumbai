package xyz.tapmate.app

import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.cardemulation.HostApduService
import android.nfc.tech.IsoDep
import android.os.Bundle
import android.util.Log
import java.io.IOException

private val AID = "F0544150".fromHex() + "4D415445".fromHex() // F0 marks a proprietary ID; the rest spells TAPMATE
private val SW_OK = byteArrayOf(0x90.toByte(), 0x00)
private val SW_NOT_READY = byteArrayOf(0x69, 0x85.toByte())
private val SW_UNKNOWN = byteArrayOf(0x6D, 0x00)

/** The offer the host phone is currently presenting over NFC. */
object TapState {
    @Volatile var offer: ByteArray? = null
}

/** The host phone acts as a contactless card whose only content is the game offer. */
class TapHceService : HostApduService() {
    override fun processCommandApdu(apdu: ByteArray, extras: Bundle?): ByteArray {
        val isSelect = apdu.size >= 5 && apdu[0] == 0.toByte() && apdu[1] == 0xA4.toByte() && apdu[2] == 4.toByte()
        if (!isSelect) return SW_UNKNOWN
        val offer = TapState.offer ?: return SW_NOT_READY
        return offer + SW_OK
    }

    override fun onDeactivated(reason: Int) = Unit
}

/** The joining phone reads the offer. A failed tap reports an error so the player can try again. */
class TapReader(
    private val onOffer: (Offer) -> Unit,
    private val onFailure: (String) -> Unit,
) : NfcAdapter.ReaderCallback {
    override fun onTagDiscovered(tag: Tag) {
        val iso = IsoDep.get(tag) ?: return
        try {
            iso.use {
                it.connect()
                it.timeout = TIMEOUT_MILLIS
                val select = byteArrayOf(0, 0xA4.toByte(), 4, 0, AID.size.toByte()) + AID + byteArrayOf(0)
                val reply = it.transceive(select)
                val ok = reply.size >= 2 && reply[reply.size - 2] == SW_OK[0] && reply[reply.size - 1] == SW_OK[1]
                val offer = if (ok) Offer.fromBytes(reply.copyOf(reply.size - 2)) else null
                if (offer != null) onOffer(offer) else onFailure("That phone isn't hosting a game. Tap Create game on it first.")
            }
        } catch (e: IOException) {
            Log.w("TapMateNfc", "tap failed", e)
            onFailure("Tap didn't finish. Hold the phones together and try again.")
        }
    }

    companion object {
        private const val TIMEOUT_MILLIS = 2_000
        const val FLAGS = NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK or
            NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
    }
}
