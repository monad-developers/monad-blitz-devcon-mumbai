package xyz.tapmate.app

import com.github.bhlangonijr.chesslib.Side
import com.github.bhlangonijr.chesslib.Square
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ChessGameTest {
    private fun started(localSide: Side? = null, clock: Long = 60_000): ChessGame {
        val game = ChessGame(localSide = localSide, clockMillis = clock)
        game.advanceClock(0)
        assertTrue(game.play(Square.E2, Square.E4))
        return game
    }

    @Test
    fun clockDoesNotRunBeforeFirstMove() {
        val game = ChessGame()
        game.advanceClock(0)
        game.advanceClock(30_000)
        assertEquals(60_000, game.whiteMillis)
    }

    @Test
    fun timeBeforeAMoveIsChargedToTheMover() {
        val game = started()
        game.advanceClock(100)
        game.advanceClock(180) // Black moves 80 ms after the last timer tick.
        assertTrue(game.play(Square.E7, Square.E5))
        game.advanceClock(200)
        assertEquals(59_820, game.blackMillis)
        assertEquals(59_980, game.whiteMillis)
    }

    @Test
    fun moveIsRejectedOnceTheFlagHasFallen() {
        val game = started(clock = 50)
        assertTrue(game.advanceClock(80))
        assertFalse(game.play(Square.E7, Square.E5))
        assertEquals(Side.WHITE, game.end?.winner)
        assertEquals(EndReason.TIMEOUT, game.end?.reason)
    }

    @Test
    fun opponentWithOnlyAKingCannotWinOnTime() {
       
        val game = ChessGame(clockMillis = 50, startFen = "7k/8/8/8/8/8/1Q6/K7 w - - 0 1")
        game.advanceClock(0)
        assertTrue(game.play(Square.B2, Square.B3))
        game.advanceClock(10)
        assertTrue(game.play(Square.H8, Square.H7))
        assertTrue(game.advanceClock(100))
        assertNull(game.end?.winner)
        assertEquals(EndReason.DRAW, game.end?.reason)
    }

    @Test
    fun opponentWithMaterialWinsOnTime() {
        val game = ChessGame(clockMillis = 50, startFen = "7k/8/8/8/8/8/1Q6/K7 w - - 0 1")
        game.advanceClock(0)
        assertTrue(game.play(Square.B2, Square.B3))
        assertTrue(game.advanceClock(100))
        assertEquals(Side.WHITE, game.end?.winner)
    }

    @Test
    fun remoteFlagWaitsForGraceBeforeEndingTheGame() {
        val game = ChessGame(localSide = Side.WHITE, clockMillis = 50)
        game.advanceClock(0)
        assertTrue(game.play(Square.E2, Square.E4))
        assertFalse(game.advanceClock(100))
        assertNull(game.end)
        assertFalse(game.advanceClock(3_200))
        assertEquals(Side.WHITE, game.end?.winner)
    }
}
