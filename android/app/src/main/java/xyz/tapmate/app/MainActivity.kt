package xyz.tapmate.app

import android.os.Bundle
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.github.bhlangonijr.chesslib.Piece
import com.github.bhlangonijr.chesslib.PieceType
import com.github.bhlangonijr.chesslib.Side
import com.github.bhlangonijr.chesslib.Square
import kotlinx.coroutines.delay

private val Background = Color(0xFF14111F)
private val Panel = Color(0xFF221C36)
private val Purple = Color(0xFF836EF9)
private val LightSquare = Color(0xFFE9E4F7)
private val DarkSquare = Color(0xFF7A6BB8)
private val SelectedSquare = Color(0xFFF5C451)
private val LastMoveSquare = Color(0xFFBFD46A)
private val CheckSquare = Color(0xFFE5484D)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { GameScreen() }
    }
}

@Composable
private fun GameScreen() {
    var game by remember { mutableStateOf(ChessGame()) }
    var selected by remember { mutableStateOf<Square?>(null) }
    // Compose cannot observe ChessGame's fields, so this counter triggers a redraw after each change.
    var revision by remember { mutableIntStateOf(0) }
    val redraw = { revision += 1 }

    LaunchedEffect(game) {
        var last = SystemClock.elapsedRealtime()
        while (game.end == null) {
            delay(100)
            val now = SystemClock.elapsedRealtime()
            game.tick(now - last)
            last = now
            redraw()
        }
    }

    // Reading revision here ties everything below to the redraw counter.
    val tick = revision
    val end = game.end

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
            .safeDrawingPadding()
            .padding(12.dp),
        verticalArrangement = Arrangement.SpaceBetween,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        PlayerBar(
            name = "Black",
            millis = game.blackMillis,
            active = end == null && game.sideToMove == Side.BLACK,
            canResign = end == null,
            flipped = true,
            tick = tick,
            onResign = { game.resign(Side.BLACK); selected = null; redraw() },
        )

        BoardView(game, selected, tick) { square ->
            if (game.end == null) {
                val current = selected
                when {
                    current != null && square in game.legalTargets(current) -> {
                        game.play(current, square)
                        selected = null
                    }
                    game.pieceAt(square).pieceSide == game.sideToMove -> selected = square
                    else -> selected = null
                }
                redraw()
            }
        }

        if (end != null) {
            ResultPanel(end) {
                game = ChessGame()
                selected = null
                redraw()
            }
        }

        PlayerBar(
            name = "White",
            millis = game.whiteMillis,
            active = end == null && game.sideToMove == Side.WHITE,
            canResign = end == null,
            flipped = false,
            tick = tick,
            onResign = { game.resign(Side.WHITE); selected = null; redraw() },
        )
    }
}

@Composable
private fun PlayerBar(
    name: String,
    millis: Long,
    active: Boolean,
    canResign: Boolean,
    flipped: Boolean,
    tick: Int,
    onResign: () -> Unit,
) {
    val lowTime = millis < 10_000
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .rotate(if (flipped) 180f else 0f)
            .clip(RoundedCornerShape(14.dp))
            .background(if (active) Purple else Panel)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(name, color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (canResign) {
                Text(
                    "Resign",
                    color = Color.White.copy(alpha = 0.75f),
                    fontSize = 14.sp,
                    modifier = Modifier
                        .clickable(onClick = onResign)
                        .padding(horizontal = 14.dp, vertical = 8.dp),
                )
            }
            Text(
                formatClock(millis, tick),
                color = if (lowTime) Color(0xFFFFB4B4) else Color.White,
                fontSize = 32.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}

/** Shows tenths of a second under 10s, when they matter. */
private fun formatClock(millis: Long, @Suppress("UNUSED_PARAMETER") tick: Int): String {
    val seconds = millis / 1000
    return if (millis < 10_000) "0:%02d.%d".format(seconds, (millis % 1000) / 100)
    else "%d:%02d".format(seconds / 60, seconds % 60)
}

@Composable
private fun BoardView(game: ChessGame, selected: Square?, @Suppress("UNUSED_PARAMETER") tick: Int, onTap: (Square) -> Unit) {
    val targets = selected?.let { game.legalTargets(it) }.orEmpty()
    val lastMove = game.lastMove
    val checked = game.checkedKing()
    BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(6.dp))) {
        val squareSize = maxWidth / 8
        Column {
            for (rank in 7 downTo 0) {
                Row {
                    for (file in 0..7) {
                        val square = Square.squareAt(rank * 8 + file)
                        val isLight = (rank + file) % 2 == 1
                        val color = when {
                            square == selected -> SelectedSquare
                            square == checked -> CheckSquare
                            lastMove != null && (square == lastMove.from || square == lastMove.to) -> LastMoveSquare
                            isLight -> LightSquare
                            else -> DarkSquare
                        }
                        Box(
                            modifier = Modifier
                                .size(squareSize)
                                .background(color)
                                .clickable { onTap(square) },
                            contentAlignment = Alignment.Center,
                        ) {
                            PieceGlyph(game.pieceAt(square), squareSize.value)
                            if (square in targets) {
                                Box(
                                    Modifier
                                        .size(squareSize * 0.3f)
                                        .clip(CircleShape)
                                        .background(Color(0x99222222)),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun PieceGlyph(piece: Piece, squareDp: Float) {
    if (piece == Piece.NONE) return
    // U+FE0E forces text style. Without it, Android can draw the pawn as a colour emoji.
    val glyph = when (piece.pieceType) {
        PieceType.KING -> "♚"
        PieceType.QUEEN -> "♛"
        PieceType.ROOK -> "♜"
        PieceType.BISHOP -> "♝"
        PieceType.KNIGHT -> "♞"
        else -> "♟"
    } + "︎"
    val isWhite = piece.pieceSide == Side.WHITE
    Box(contentAlignment = Alignment.Center) {
        // A dark outline keeps white pieces readable on light squares.
        if (isWhite) {
            Text(
                glyph,
                fontSize = (squareDp * 0.78f).sp,
                style = TextStyle(
                    color = Color(0xFF17121F),
                    drawStyle = Stroke(width = squareDp * 0.14f, join = StrokeJoin.Round),
                ),
            )
        }
        Text(glyph, color = if (isWhite) Color.White else Color(0xFF17121F), fontSize = (squareDp * 0.78f).sp)
    }
}

@Composable
private fun ResultPanel(end: GameEnd, onNewGame: () -> Unit) {
    val headline = when (end.winner) {
        Side.WHITE -> "White wins"
        Side.BLACK -> "Black wins"
        else -> "Draw"
    }
    val detail = when (end.reason) {
        EndReason.CHECKMATE -> "by checkmate"
        EndReason.TIMEOUT -> "on time"
        EndReason.RESIGN -> "by resignation"
        EndReason.DRAW -> "nobody pays"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Panel)
            .border(1.dp, Purple, RoundedCornerShape(14.dp))
            .padding(14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(headline, color = Color.White, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text(detail, color = Color.White.copy(alpha = 0.75f), fontSize = 15.sp)
        Spacer(Modifier.height(10.dp))
        Button(onClick = onNewGame, colors = ButtonDefaults.buttonColors(containerColor = Purple)) {
            Text("New game")
        }
    }
}
