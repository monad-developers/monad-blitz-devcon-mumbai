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

/** Chess rules and clocks with no Android UI, so the same logic can later run over the phone link. */
class ChessGame(private val clockMillis: Long = 60_000L) {
    private val board = Board()

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
        when {
            board.isMated -> end = GameEnd(board.sideToMove.flip(), EndReason.CHECKMATE)
            board.isDraw || board.isStaleMate -> end = GameEnd(null, EndReason.DRAW)
        }
        return true
    }

    /** Charges elapsed time to the side to move and ends the game when their flag falls. */
    fun tick(elapsedMillis: Long) {
        // The clock starts once White has made the first move.
        if (end != null || ply == 0) return
        if (sideToMove == Side.WHITE) whiteMillis = (whiteMillis - elapsedMillis).coerceAtLeast(0)
        else blackMillis = (blackMillis - elapsedMillis).coerceAtLeast(0)
        if (whiteMillis == 0L) end = GameEnd(Side.BLACK, EndReason.TIMEOUT)
        else if (blackMillis == 0L) end = GameEnd(Side.WHITE, EndReason.TIMEOUT)
    }

    fun resign(side: Side) {
        if (end == null) end = GameEnd(side.flip(), EndReason.RESIGN)
    }
}
