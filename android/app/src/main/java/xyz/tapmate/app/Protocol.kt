package xyz.tapmate.app

import org.json.JSONObject
import java.math.BigInteger

/** Deployment settings for the vault on Monad testnet. See DEPLOYMENTS.md. */
object Network {
    const val CHAIN_ID = 10143L
    const val RPC_URL = "https://testnet-rpc.monad.xyz"
    const val VAULT = "0x4423c58852ff2c63648e83f0c00985fde56cc5f9"
    const val EXPLORER = "https://testnet.monadvision.com"
    val CHIP: BigInteger = BigInteger("100000000000000000") // 0.1 MON
    val CHIP_DEPOSIT: BigInteger = CHIP * BigInteger.valueOf(3) // stake plus a bond of two chips
    const val LOCK_SECONDS = 24 * 60 * 60L
}

/** Mirrors TapMateVault.Wager. Both players sign this before the game starts. */
data class Wager(
    val player0: String,
    val player1: String,
    val chip0: Long,
    val chip1: Long,
    val stake: BigInteger,
    val settleBy: Long,
    val player0IsWhite: Boolean,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("player0", player0)
        .put("player1", player1)
        .put("chip0", chip0)
        .put("chip1", chip1)
        .put("stake", stake.toString())
        .put("settleBy", settleBy)
        .put("player0IsWhite", player0IsWhite)

    companion object {
        fun fromJson(json: JSONObject) = Wager(
            player0 = json.getString("player0"),
            player1 = json.getString("player1"),
            chip0 = json.getLong("chip0"),
            chip1 = json.getLong("chip1"),
            stake = BigInteger(json.getString("stake")),
            settleBy = json.getLong("settleBy"),
            player0IsWhite = json.getBoolean("player0IsWhite"),
        )
    }
}

/** EIP-712 hashes and calldata that must match contracts/src/TapMateVault.sol exactly. */
class VaultCodec(chainId: Long = Network.CHAIN_ID, vault: String = Network.VAULT) {
    val domainSeparator: ByteArray = Eth.keccak(
        Eth.keccak("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
        Eth.keccak("TapMate"),
        Eth.keccak("1"),
        Eth.word(chainId),
        Eth.wordAddress(vault),
    )

    private fun digest(structHash: ByteArray) =
        Eth.keccak(byteArrayOf(0x19, 0x01), domainSeparator, structHash)

    /** The digest of a wager doubles as its gameId. */
    fun wagerDigest(w: Wager): ByteArray = digest(
        Eth.keccak(
            WAGER_TYPEHASH,
            Eth.wordAddress(w.player0),
            Eth.wordAddress(w.player1),
            Eth.word(w.chip0),
            Eth.word(w.chip1),
            Eth.word(w.stake),
            Eth.word(w.settleBy),
            Eth.word(if (w.player0IsWhite) 1 else 0),
        ),
    )

    fun moveDigest(gameId: ByteArray, ply: Int, positionHash: ByteArray): ByteArray =
        digest(Eth.keccak(MOVE_TYPEHASH, gameId, Eth.word(ply.toLong()), positionHash))

    fun resultDigest(gameId: ByteArray, winner: String, ply: Int, finalPositionHash: ByteArray): ByteArray =
        digest(
            Eth.keccak(RESULT_TYPEHASH, gameId, Eth.wordAddress(winner), Eth.word(ply.toLong()), finalPositionHash),
        )

    fun depositCall(chips: Long, lockUntil: Long): ByteArray =
        selector("deposit(uint32,uint40)") + Eth.word(chips) + Eth.word(lockUntil)

    fun vaultsCall(player: String): ByteArray = selector("vaults(address)") + Eth.wordAddress(player)

    fun settleCall(ticket: Ticket): ByteArray {
        val w = ticket.wager
        val head = wagerWords(w)
        val sig0 = encodeBytes(ticket.sig0)
        val sig1 = encodeBytes(ticket.sig1)
        val result = Eth.wordAddress(ticket.winner) +
            Eth.word(ticket.ply.toLong()) +
            ticket.finalPositionHash +
            Eth.word(4 * 32L) +
            encodeBytes(ticket.loserSig)
        val headSize = head.size + 3 * 32L
        return selector(SETTLE_SIGNATURE) + head +
            Eth.word(headSize) +
            Eth.word(headSize + sig0.size) +
            Eth.word(headSize + sig0.size + sig1.size) +
            sig0 + sig1 + result
    }

    private fun wagerWords(w: Wager): ByteArray =
        Eth.wordAddress(w.player0) + Eth.wordAddress(w.player1) + Eth.word(w.chip0) + Eth.word(w.chip1) +
            Eth.word(w.stake) + Eth.word(w.settleBy) + Eth.word(if (w.player0IsWhite) 1 else 0)

    private fun encodeBytes(data: ByteArray): ByteArray {
        val padding = (32 - data.size % 32) % 32
        return Eth.word(data.size.toLong()) + data + ByteArray(padding)
    }

    private fun selector(signature: String) = Eth.keccak(signature).copyOfRange(0, 4)

    private companion object {
        val WAGER_TYPEHASH = Eth.keccak(
            "Wager(address player0,address player1,uint32 chip0,uint32 chip1,uint96 stake,uint40 settleBy,bool player0IsWhite)",
        )
        val MOVE_TYPEHASH = Eth.keccak("Move(bytes32 gameId,uint16 ply,bytes32 positionHash)")
        val RESULT_TYPEHASH = Eth.keccak("Result(bytes32 gameId,address winner,uint16 ply,bytes32 finalPositionHash)")
        const val SETTLE_SIGNATURE =
            "settle((address,address,uint32,uint32,uint96,uint40,bool),bytes,bytes,(address,uint16,bytes32,bytes))"
    }
}

/** The winner's redeem ticket: everything the contract needs to pay out, usable at any later time. */
data class Ticket(
    val wager: Wager,
    val sig0: ByteArray,
    val sig1: ByteArray,
    val winner: String,
    val ply: Int,
    val finalPositionHash: ByteArray,
    val loserSig: ByteArray,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("wager", wager.toJson())
        .put("sig0", sig0.toHex())
        .put("sig1", sig1.toHex())
        .put("winner", winner)
        .put("ply", ply)
        .put("finalPositionHash", finalPositionHash.toHex())
        .put("loserSig", loserSig.toHex())

    companion object {
        fun fromJson(json: JSONObject) = Ticket(
            wager = Wager.fromJson(json.getJSONObject("wager")),
            sig0 = json.getString("sig0").fromHex(),
            sig1 = json.getString("sig1").fromHex(),
            winner = json.getString("winner"),
            ply = json.getInt("ply"),
            finalPositionHash = json.getString("finalPositionHash").fromHex(),
            loserSig = json.getString("loserSig").fromHex(),
        )
    }
}

/** The small game offer passed by NFC tap or QR code. It holds nothing secret. */
data class Offer(val host: String, val chip: Long, val lockUntil: Long, val session: String) {
    fun toBytes(): ByteArray =
        host.fromHex() + Eth.word(chip).copyOfRange(28, 32) + Eth.word(lockUntil).copyOfRange(27, 32) + session.fromHex()

    fun toQrText(): String = QR_PREFIX + toBytes().toHex().removePrefix("0x")

    companion object {
        private const val QR_PREFIX = "tapmate:"
        private const val SIZE = 20 + 4 + 5 + 8

        fun fromBytes(bytes: ByteArray): Offer? {
            if (bytes.size != SIZE) return null
            return Offer(
                host = bytes.copyOfRange(0, 20).toHex(),
                chip = BigInteger(1, bytes.copyOfRange(20, 24)).toLong(),
                lockUntil = BigInteger(1, bytes.copyOfRange(24, 29)).toLong(),
                session = bytes.copyOfRange(29, 37).toHex(),
            )
        }

        fun fromQrText(text: String): Offer? {
            if (!text.startsWith(QR_PREFIX)) return null
            return runCatching { fromBytes(text.removePrefix(QR_PREFIX).fromHex()) }.getOrNull()
        }
    }
}

/** Decides the wager both phones must sign. Players are sorted by address, as the contract requires. */
fun buildWager(hostAddress: String, hostChip: Long, hostLock: Long, joinAddress: String, joinChip: Long, joinLock: Long): Wager {
    val hostIsPlayer0 = hostAddress.lowercase() < joinAddress.lowercase()
    return Wager(
        player0 = if (hostIsPlayer0) hostAddress else joinAddress,
        player1 = if (hostIsPlayer0) joinAddress else hostAddress,
        chip0 = if (hostIsPlayer0) hostChip else joinChip,
        chip1 = if (hostIsPlayer0) joinChip else hostChip,
        stake = Network.CHIP,
        settleBy = minOf(hostLock, joinLock),
        player0IsWhite = hostIsPlayer0, // the host always plays White
    )
}
