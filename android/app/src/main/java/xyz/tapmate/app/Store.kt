package xyz.tapmate.app

import android.annotation.SuppressLint
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.math.BigInteger

/** A winner's ticket and, once redeemed, the transaction that paid it. */
data class StoredTicket(val ticket: Ticket, val claimTx: String? = null)

/** Saved on the phone, so chips and tickets survive with no network and across restarts. */
class Store(context: Context) {
    private val prefs = context.getSharedPreferences("tapmate", Context.MODE_PRIVATE)

    val nextChip: Long get() = prefs.getLong(KEY_NEXT_CHIP, 0)

    /**
     * Retires a chip before it is signed. Signing one chip twice is what the contract punishes, so
     * this must reach disk first, which is why it uses commit rather than apply.
     */
    @SuppressLint("ApplySharedPref")
    fun burnChip(chip: Long) {
        check(prefs.edit().putLong(KEY_NEXT_CHIP, maxOf(chip + 1, nextChip)).commit()) { "Could not save chip" }
    }

    var vault: VaultInfo?
        get() = prefs.getString(KEY_VAULT, null)?.let {
            val json = JSONObject(it)
            VaultInfo(
                json.getLong("chipStart"),
                json.getLong("chipEnd"),
                json.getLong("consumed"),
                json.getLong("lockUntil"),
                BigInteger(json.getString("bond")),
            )
        }
        set(value) {
            val json = value?.let {
                JSONObject()
                    .put("chipStart", it.chipStart)
                    .put("chipEnd", it.chipEnd)
                    .put("consumed", it.consumed)
                    .put("lockUntil", it.lockUntil)
                    .put("bond", it.bond.toString())
                    .toString()
            }
            prefs.edit().putString(KEY_VAULT, json).apply()
        }

    fun tickets(): List<StoredTicket> {
        val array = JSONArray(prefs.getString(KEY_TICKETS, "[]"))
        return List(array.length()) { i ->
            val item = array.getJSONObject(i)
            StoredTicket(
                Ticket.fromJson(item.getJSONObject("ticket")),
                if (item.isNull("claimTx")) null else item.getString("claimTx"),
            )
        }
    }

    @SuppressLint("ApplySharedPref")
    fun saveTickets(tickets: List<StoredTicket>) {
        val array = JSONArray()
        tickets.forEach {
            array.put(JSONObject().put("ticket", it.ticket.toJson()).put("claimTx", it.claimTx ?: JSONObject.NULL))
        }
        check(prefs.edit().putString(KEY_TICKETS, array.toString()).commit()) { "Could not save ticket" }
    }

    private companion object {
        const val KEY_NEXT_CHIP = "nextChip"
        const val KEY_VAULT = "vault"
        const val KEY_TICKETS = "tickets"
    }
}
