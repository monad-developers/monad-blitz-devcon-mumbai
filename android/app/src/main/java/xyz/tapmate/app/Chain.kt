package xyz.tapmate.app

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.math.BigInteger
import java.net.HttpURLConnection
import java.net.URL

data class VaultInfo(val chipStart: Long, val chipEnd: Long, val consumed: Long, val lockUntil: Long, val bond: BigInteger)

/** A failure to show the player. offline is true when the network, not the chain, was the problem. */
class ChainException(message: String, val offline: Boolean = false) : Exception(message)

/** A small JSON-RPC client for Monad testnet. */
class Chain(private val codec: VaultCodec, private val url: String = Network.RPC_URL) {

    suspend fun balance(address: String): BigInteger =
        quantity(rpc("eth_getBalance", JSONArray().put(address).put("latest")))

    suspend fun vault(address: String): VaultInfo {
        val call = JSONObject().put("to", Network.VAULT).put("data", codec.vaultsCall(address).toHex())
        val raw = (rpc("eth_call", JSONArray().put(call).put("latest")) as String).fromHex()
        if (raw.size < 5 * 32) throw ChainException("Unexpected reply from the vault")
        fun word(i: Int) = BigInteger(1, raw.copyOfRange(i * 32, (i + 1) * 32))
        return VaultInfo(word(0).toLong(), word(1).toLong(), word(2).toLong(), word(3).toLong(), word(4))
    }

    /** Sends a contract call and waits for its receipt. A call that would revert is never sent. */
    suspend fun send(key: BigInteger, from: String, value: BigInteger, data: ByteArray): String {
        val request = JSONObject()
            .put("from", from)
            .put("to", Network.VAULT)
            .put("value", "0x" + value.toString(16))
            .put("data", data.toHex())
        // Monad charges for the gas limit rather than gas used, so the margin stays small.
        val estimate = quantity(rpc("eth_estimateGas", JSONArray().put(request))).toLong()
        val gasLimit = estimate + estimate / 10
        val gasPrice = quantity(rpc("eth_gasPrice", JSONArray()))
        val nonce = quantity(rpc("eth_getTransactionCount", JSONArray().put(from).put("pending"))).toLong()
        val raw = Eth.signLegacyTx(key, Network.CHAIN_ID, nonce, gasPrice, gasLimit, Network.VAULT, value, data)
        val hash = rpc("eth_sendRawTransaction", JSONArray().put(raw.toHex())) as String
        waitForSuccess(hash)
        return hash
    }

    private suspend fun waitForSuccess(hash: String) {
        repeat(RECEIPT_ATTEMPTS) {
            val receipt = rpc("eth_getTransactionReceipt", JSONArray().put(hash))
            if (receipt is JSONObject) {
                if (receipt.getString("status") == "0x1") return
                throw ChainException("The transaction failed onchain")
            }
            delay(RECEIPT_POLL_MILLIS)
        }
        throw ChainException("No receipt yet. Check the explorer: $hash")
    }

    private fun quantity(value: Any?): BigInteger = BigInteger((value as String).removePrefix("0x"), 16)

    private suspend fun rpc(method: String, params: JSONArray): Any? = withContext(Dispatchers.IO) {
        val body = JSONObject().put("jsonrpc", "2.0").put("id", 1).put("method", method).put("params", params)
        val reply = try {
            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = TIMEOUT_MILLIS
            connection.readTimeout = TIMEOUT_MILLIS
            connection.requestMethod = "POST"
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            connection.outputStream.use { it.write(body.toString().toByteArray()) }
            val stream = if (connection.responseCode < 400) connection.inputStream else connection.errorStream
            JSONObject(stream.bufferedReader().use { it.readText() })
        } catch (e: IOException) {
            throw ChainException("You're offline. Try again once you have internet.", offline = true)
        }
        reply.optJSONObject("error")?.let { throw ChainException(describeError(it)) }
        if (reply.isNull("result")) null else reply.get("result")
    }

    private fun describeError(error: JSONObject): String {
        val text = (error.opt("data")?.toString().orEmpty() + " " + error.optString("message")).lowercase()
        return REVERT_REASONS.entries.firstOrNull { (signature, _) ->
            Eth.keccak(signature).copyOfRange(0, 4).toHex().removePrefix("0x") in text
        }?.value ?: error.optString("message", "The network rejected this")
    }

    private companion object {
        const val TIMEOUT_MILLIS = 8_000
        const val RECEIPT_ATTEMPTS = 120
        const val RECEIPT_POLL_MILLIS = 250L
        val REVERT_REASONS = mapOf(
            "ChipSpent(address,uint32,bytes32)" to "Rejected by the contract: this ticket's chips were already paid out.",
            "ChipOutOfRange()" to "Rejected by the contract: a player's chip isn't funded.",
            "Expired()" to "Rejected by the contract: this ticket has expired.",
            "BadSig()" to "Rejected by the contract: a signature is invalid.",
            "LockTooShort()" to "Rejected by the contract: a player's funds unlock too early.",
            "BadLock()" to "Rejected by the contract: invalid lock time.",
            "BadDeposit()" to "Rejected by the contract: wrong deposit amount.",
        )
    }
}
