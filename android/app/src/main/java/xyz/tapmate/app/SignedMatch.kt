package xyz.tapmate.app

import com.github.bhlangonijr.chesslib.Side
import java.math.BigInteger

/** Everything both phones agreed and signed for one wager, plus the signing and checks during play. */
class SignedMatch(
    private val codec: VaultCodec,
    private val key: BigInteger,
    val me: String,
    val peer: String,
    val wager: Wager,
    private val myWagerSig: ByteArray,
    private val peerWagerSig: ByteArray,
) {
    val gameId: ByteArray = codec.wagerDigest(wager)

    val mySide: Side = run {
        val iAmPlayer0 = wager.player0.equals(me, ignoreCase = true)
        if (iAmPlayer0 == wager.player0IsWhite) Side.WHITE else Side.BLACK
    }

    fun signMove(ply: Int, fen: String): ByteArray =
        Eth.sign(codec.moveDigest(gameId, ply, positionHash(fen)), key)

    /** Also proves both phones reached the same position, since the signature covers its hash. */
    fun isPeerMove(ply: Int, fen: String, signature: ByteArray): Boolean =
        peer.equals(Eth.recover(codec.moveDigest(gameId, ply, positionHash(fen)), signature), ignoreCase = true)

    fun signLoss(ply: Int, fen: String): ByteArray =
        Eth.sign(codec.resultDigest(gameId, peer, ply, positionHash(fen)), key)

    /** Builds the redeem ticket if the opponent's signature really admits that this phone won. */
    fun ticketFromLoss(ply: Int, finalPositionHash: ByteArray, loserSig: ByteArray): Ticket? {
        val signer = Eth.recover(codec.resultDigest(gameId, me, ply, finalPositionHash), loserSig)
        if (!peer.equals(signer, ignoreCase = true)) return null
        val iAmPlayer0 = wager.player0.equals(me, ignoreCase = true)
        return Ticket(
            wager = wager,
            sig0 = if (iAmPlayer0) myWagerSig else peerWagerSig,
            sig1 = if (iAmPlayer0) peerWagerSig else myWagerSig,
            winner = me,
            ply = ply,
            finalPositionHash = finalPositionHash,
            loserSig = loserSig,
        )
    }

    companion object {
        fun positionHash(fen: String): ByteArray = Eth.keccak(fen)
    }
}
