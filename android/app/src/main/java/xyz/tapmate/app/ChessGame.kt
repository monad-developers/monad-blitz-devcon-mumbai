package xyz.tapmate.app

import com.github.bhlangonijr.chesslib.Board
import com.github.bhlangonijr.chesslib.Piece
import com.github.bhlangonijr.chesslib.PieceType
import com.github.bhlangonijr.chesslib.Side
import com.github.bhlangonijr.chesslib.Square
import com.github.bhlangonijr.chesslib.move.Move

enum class EndReason { CHECKMATE, TIMEOUT, RESIGN, DRAW }

/** winner is null for a draw. */
data class GameEnd(val winner: Side?, val reason: EndReason)

/**
 * Chess rules and clocks, with no Android UI.
 *
 * @param localSide the side this phone plays, or null when both players share one phone.
 */
class ChessGame(val localSide: Side? = null, clockMillis: Long = 60_000L) {
    private val board = Board()
    private var overdueMillis = 0L

    var whiteMillis = clockMillis
        private set
    var blackMillis = clockMillis
        private set
    var end: GameEnd? = null
        private set
    var lastMove: Move? = null
        private set
    var ply = 0
        private set

    val sideToMove: Side get() = board.sideToMove
    val fen: String get() = board.fen

    /** True when this phone may move right now. */
    val canMove: Boolean get() = end == null && (localSide == null || localSide == sideToMove)

    fun pieceAt(square: Square): Piece = board.getPiece(square)

    fun checkedKing(): Square? =
        if (board.isKingAttacked) board.getKingSquare(board.sideToMove) else null

    fun legalTargets(from: Square): Set<Square> =
        if (end != null) emptySet()
        else board.legalMoves().filter { it.from == from }.map { it.to }.toSet()

    /** Plays a legal move. Pawns reaching the last rank become queens, which suits bullet. */
    fun play(from: Square, to: Square): Boolean {
        if (end != null) return false
        val options = board.legalMoves().filter { it.from == from && it.to == to }
        val move = options.firstOrNull { it.promotion.pieceType == PieceType.QUEEN }
            ?: options.firstOrNull()
            ?: return false
        board.doMove(move)
        lastMove = move
        ply += 1
        overdueMillis = 0
        when {
            board.isMated -> end = GameEnd(board.sideToMove.flip(), EndReason.CHECKMATE)
            board.isDraw || board.isStaleMate -> end = GameEnd(null, EndReason.DRAW)
        }
        return true
    }

    /** Applies the opponent's move and adopts the clock value their phone reported. */
    fun playRemote(from: Square, to: Square, reportedMillis: Long): Boolean {
        val mover = sideToMove
        if (!play(from, to)) return false
        setClock(mover, reportedMillis)
        return true
    }

    /**
     * Charges elapsed time to the side to move. The clock starts after White's first move.
     *
     * A phone only calls its own flag immediately. For the opponent it allows a grace period, so a
     * move still in transit is not treated as a timeout, and a vanished opponent still loses on time.
     */
    fun tick(elapsedMillis: Long): Boolean {
        if (end != null || ply == 0) return false
        val mover = sideToMove
        val left = clockOf(mover) - elapsedMillis
        setClock(mover, left.coerceAtLeast(0))
        if (left > 0) return false
        val isLocalFlag = localSide == null || localSide == mover
        if (!isLocalFlag) {
            overdueMillis += elapsedMillis
            if (overdueMillis < REMOTE_FLAG_GRACE_MILLIS) return false
        }
        end = GameEnd(mover.flip(), EndReason.TIMEOUT)
        return isLocalFlag
    }

    fun resign(side: Side) {
        if (end == null) end = GameEnd(side.flip(), EndReason.RESIGN)
    }

    fun flagFell(side: Side) {
        if (end == null) {
            setClock(side, 0)
            end = GameEnd(side.flip(), EndReason.TIMEOUT)
        }
    }

    fun clockOf(side: Side): Long = if (side == Side.WHITE) whiteMillis else blackMillis

    private fun setClock(side: Side, millis: Long) {
        if (side == Side.WHITE) whiteMillis = millis else blackMillis = millis
    }

    private companion object {
        const val REMOTE_FLAG_GRACE_MILLIS = 3_000L
    }
}
