package xyz.tapmate.app

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
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
private val Warning = Color(0xFFFFB4B4)

private enum class Screen { HOME, LOBBY, GAME }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A sleeping screen would lose a bullet game.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContent { TapMateApp() }
    }
}

private fun linkPermissions(): Array<String> = buildList {
    add(Manifest.permission.ACCESS_COARSE_LOCATION)
    add(Manifest.permission.ACCESS_FINE_LOCATION)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        add(Manifest.permission.BLUETOOTH_ADVERTISE)
        add(Manifest.permission.BLUETOOTH_CONNECT)
        add(Manifest.permission.BLUETOOTH_SCAN)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        add(Manifest.permission.NEARBY_WIFI_DEVICES)
    }
}.toTypedArray()

@Composable
private fun TapMateApp() {
    val context = LocalContext.current
    var screen by remember { mutableStateOf(Screen.HOME) }
    var game by remember { mutableStateOf(ChessGame()) }
    var selected by remember { mutableStateOf<Square?>(null) }
    var linkStatus by remember { mutableStateOf("") }
    var peerName by remember { mutableStateOf("Opponent") }
    var peerGone by remember { mutableStateOf(false) }
    var pendingHost by remember { mutableStateOf<Boolean?>(null) }
    // Compose cannot observe ChessGame's fields, so this counter triggers a redraw after each change.
    var revision by remember { mutableIntStateOf(0) }
    val redraw = { revision += 1 }

    val link = remember {
        PhoneLink(context) { event ->
            when (event) {
                is LinkEvent.Status -> linkStatus = event.text
                is LinkEvent.Connected -> {
                    peerName = event.peerName
                    peerGone = false
                    selected = null
                    game = ChessGame(localSide = if (pendingHost == true) Side.WHITE else Side.BLACK)
                    screen = Screen.GAME
                }
                LinkEvent.Disconnected -> peerGone = true
                is LinkEvent.Message -> {
                    val parts = event.text.split("|")
                    val opponent = game.localSide?.flip()
                    game.advanceClock(SystemClock.elapsedRealtime())
                    when (parts[0]) {
                        "M" -> game.playRemote(
                            Square.valueOf(parts[1]),
                            Square.valueOf(parts[2]),
                            parts[3].toLong(),
                        )
                        "R" -> opponent?.let { game.resign(it) }
                        "F" -> opponent?.let { game.flagFell(it) }
                        "N" -> {
                            game = ChessGame(localSide = game.localSide)
                            selected = null
                        }
                    }
                    revision += 1
                }
            }
        }
    }
    DisposableEffect(Unit) { onDispose { link.stop() } }

    val permissionRequest = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        if (results.values.all { it }) {
            if (pendingHost == true) link.host() else link.join()
        } else {
            linkStatus = "Nearby devices and location permissions are needed to connect."
        }
    }
    val startLink = { host: Boolean ->
        pendingHost = host
        linkStatus = ""
        screen = Screen.LOBBY
        permissionRequest.launch(linkPermissions())
    }
    val goHome = {
        link.stop()
        game = ChessGame()
        selected = null
        peerGone = false
        screen = Screen.HOME
    }

    LaunchedEffect(game, screen) {
        if (screen != Screen.GAME) return@LaunchedEffect
        while (game.end == null) {
            if (game.advanceClock(SystemClock.elapsedRealtime()) && game.localSide != null) link.send("F")
            redraw()
            delay(100)
        }
        redraw()
    }

    // A stray back gesture must not end a live game.
    BackHandler(enabled = screen == Screen.GAME && game.end == null) { }

    Box(Modifier.fillMaxSize().background(Background).safeDrawingPadding().padding(12.dp)) {
        when (screen) {
            Screen.HOME -> HomeScreen(
                onCreate = { startLink(true) },
                onJoin = { startLink(false) },
                onPractice = {
                    game = ChessGame()
                    selected = null
                    screen = Screen.GAME
                },
            )
            Screen.LOBBY -> LobbyScreen(linkStatus, goHome)
            Screen.GAME -> GameScreen(
                game = game,
                selected = selected,
                peerName = peerName,
                peerGone = peerGone,
                tick = revision,
                onSquare = { square ->
                    // Charge the time used so far before the turn can change. This can also end the game.
                    val flagFell = game.advanceClock(SystemClock.elapsedRealtime())
                    if (flagFell && game.localSide != null) link.send("F")
                    if (game.canMove) {
                        val current = selected
                        when {
                            current != null && square in game.legalTargets(current) -> {
                                val mover = game.sideToMove
                                game.play(current, square)
                                selected = null
                                if (game.localSide != null) {
                                    link.send("M|${current.name}|${square.name}|${game.clockOf(mover)}")
                                }
                            }
                            game.pieceAt(square).pieceSide == game.sideToMove -> selected = square
                            else -> selected = null
                        }
                        redraw()
                    }
                },
                onResign = { side ->
                    game.resign(side)
                    selected = null
                    if (game.localSide != null) link.send("R")
                    redraw()
                },
                onNewGame = {
                    game = ChessGame(localSide = game.localSide)
                    selected = null
                    if (game.localSide != null) link.send("N")
                    redraw()
                },
                onHome = goHome,
            )
        }
    }
}

@Composable
private fun HomeScreen(onCreate: () -> Unit, onJoin: () -> Unit, onPractice: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("TapMate", color = Color.White, fontSize = 44.sp, fontWeight = FontWeight.Bold)
        Text("1-minute chess, phone to phone", color = Color.White.copy(alpha = 0.7f), fontSize = 16.sp)
        Spacer(Modifier.height(36.dp))
        WideButton("Create game", onCreate)
        Spacer(Modifier.height(12.dp))
        WideButton("Join game", onJoin)
        Spacer(Modifier.height(20.dp))
        Text(
            "Practice on this phone",
            color = Color.White.copy(alpha = 0.75f),
            fontSize = 15.sp,
            modifier = Modifier.clickable(onClick = onPractice).padding(12.dp),
        )
        Spacer(Modifier.height(20.dp))
        Text("Testnet only. No monetary value.", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
    }
}

@Composable
private fun WideButton(label: String, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(0.8f).height(56.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Purple),
    ) {
        Text(label, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun LobbyScreen(status: String, onCancel: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = Purple)
        Spacer(Modifier.height(20.dp))
        Text(status, color = Color.White, fontSize = 18.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text(
            "Keep both phones close, with Bluetooth on.",
            color = Color.White.copy(alpha = 0.65f),
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(24.dp))
        Text(
            "Cancel",
            color = Color.White.copy(alpha = 0.8f),
            fontSize = 16.sp,
            modifier = Modifier.clickable(onClick = onCancel).padding(12.dp),
        )
    }
}

@Composable
private fun GameScreen(
    game: ChessGame,
    selected: Square?,
    peerName: String,
    peerGone: Boolean,
    tick: Int,
    onSquare: (Square) -> Unit,
    onResign: (Side) -> Unit,
    onNewGame: () -> Unit,
    onHome: () -> Unit,
) {
    val end = game.end
    val local = game.localSide
    val bottomSide = local ?: Side.WHITE
    val topSide = bottomSide.flip()
    val online = local != null

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.SpaceBetween,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column {
            PlayerBar(
                name = if (online) peerName else "Black",
                millis = game.clockOf(topSide),
                active = end == null && game.sideToMove == topSide,
                canResign = end == null && !online,
                flipped = !online,
                tick = tick,
                onResign = { onResign(topSide) },
            )
            if (online && peerGone && end == null) {
                Text(
                    "Opponent disconnected. They lose if their clock runs out.",
                    color = Warning,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }

        Box(contentAlignment = Alignment.Center) {
            BoardView(game, selected, tick, onSquare)
            if (end != null) ResultPanel(end, local, peerGone, onNewGame, onHome)
        }

        PlayerBar(
            name = if (online) "You" else "White",
            millis = game.clockOf(bottomSide),
            active = end == null && game.sideToMove == bottomSide,
            canResign = end == null,
            flipped = false,
            tick = tick,
            onResign = { onResign(bottomSide) },
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
                color = if (lowTime) Warning else Color.White,
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
    val blackAtBottom = game.localSide == Side.BLACK
    val ranks = if (blackAtBottom) (0..7).toList() else (7 downTo 0).toList()
    val files = if (blackAtBottom) (7 downTo 0).toList() else (0..7).toList()
    BoxWithConstraints(Modifier.fillMaxWidth().aspectRatio(1f).clip(RoundedCornerShape(6.dp))) {
        val squareSize = maxWidth / 8
        Column {
            for (rank in ranks) {
                Row {
                    for (file in files) {
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
                                .semantics { contentDescription = "square-${square.name}" }
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
private fun ResultPanel(end: GameEnd, local: Side?, peerGone: Boolean, onNewGame: () -> Unit, onHome: () -> Unit) {
    val headline = when {
        end.winner == null -> "Draw"
        local == null -> if (end.winner == Side.WHITE) "White wins" else "Black wins"
        end.winner == local -> "You win"
        else -> "You lose"
    }
    val detail = when (end.reason) {
        EndReason.CHECKMATE -> "by checkmate"
        EndReason.TIMEOUT -> "on time"
        EndReason.RESIGN -> "by resignation"
        EndReason.DRAW -> "nobody pays"
    }
    Column(
        modifier = Modifier
            .fillMaxWidth(0.85f)
            .clip(RoundedCornerShape(14.dp))
            .background(Panel)
            .border(1.dp, Purple, RoundedCornerShape(14.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(headline, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Text(detail, color = Color.White.copy(alpha = 0.75f), fontSize = 15.sp)
        Spacer(Modifier.height(12.dp))
        if (!peerGone) {
            Button(onClick = onNewGame, colors = ButtonDefaults.buttonColors(containerColor = Purple)) {
                Text("New game")
            }
        }
        Text(
            "Home",
            color = Color.White.copy(alpha = 0.8f),
            fontSize = 15.sp,
            modifier = Modifier.clickable(onClick = onHome).padding(10.dp),
        )
    }
}
