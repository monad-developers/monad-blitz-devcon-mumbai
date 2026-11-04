package xyz.tapmate.app

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.nfc.NfcAdapter
import android.nfc.cardemulation.CardEmulation
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.asImageBitmap
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
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import com.journeyapps.barcodescanner.ScanContract
import com.journeyapps.barcodescanner.ScanOptions
import kotlinx.coroutines.delay
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode

private val Background = Color(0xFF14111F)
private val Panel = Color(0xFF221C36)
private val Purple = Color(0xFF836EF9)
private val LightSquare = Color(0xFFE9E4F7)
private val DarkSquare = Color(0xFF7A6BB8)
private val SelectedSquare = Color(0xFFF5C451)
private val LastMoveSquare = Color(0xFFBFD46A)
private val CheckSquare = Color(0xFFE5484D)
private val Warning = Color(0xFFFFB4B4)
private val Muted = Color.White.copy(alpha = 0.7f)

class MainActivity : ComponentActivity() {
    private var reader: TapReader? = null
    private var pendingOffer = mutableStateOf<Offer?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // A sleeping screen would lose a bullet game.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        readDebugOffer(intent)
        setContent { TapMateApp(this, pendingOffer) }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        readDebugOffer(intent)
    }

    /** Debug builds accept an offer from adb, so the flow can be tested without a physical tap. */
    private fun readDebugOffer(intent: Intent?) {
        if (!BuildConfig.DEBUG) return
        intent?.getStringExtra("offer")?.let { pendingOffer.value = Offer.fromQrText(it) }
    }

    override fun onResume() {
        super.onResume()
        reader?.let { enableReader(it) }
    }

    override fun onPause() {
        super.onPause()
        NfcAdapter.getDefaultAdapter(this)?.disableReaderMode(this)
    }

    /** Reader mode only works while the app is in the foreground, so onResume turns it back on. */
    fun setReader(newReader: TapReader?) {
        reader = newReader
        val adapter = NfcAdapter.getDefaultAdapter(this) ?: return
        if (newReader == null) adapter.disableReaderMode(this) else enableReader(newReader)
    }

    private fun enableReader(active: TapReader) {
        NfcAdapter.getDefaultAdapter(this)?.enableReaderMode(this, active, TapReader.FLAGS, null)
    }

    /** Gives this app priority for the tap while it hosts a game. */
    fun setCardPriority(enabled: Boolean) {
        val adapter = NfcAdapter.getDefaultAdapter(this) ?: return
        val cards = CardEmulation.getInstance(adapter)
        if (enabled) cards.setPreferredService(this, ComponentName(this, TapHceService::class.java))
        else cards.unsetPreferredService(this)
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

private fun formatMon(wei: BigInteger?): String {
    if (wei == null) return "—"
    return BigDecimal(wei).movePointLeft(18).setScale(3, RoundingMode.DOWN).stripTrailingZeros().toPlainString() + " MON"
}

private fun shortAddress(address: String) = address.take(6) + "…" + address.takeLast(4)

private fun openTransaction(context: Context, hash: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("${Network.EXPLORER}/tx/$hash")))
}

@Composable
private fun TapMateApp(activity: MainActivity, pendingOffer: androidx.compose.runtime.MutableState<Offer?>) {
    val scope = rememberCoroutineScope()
    val model = remember { AppModel(activity.applicationContext, scope) }
    var pendingAction by remember { mutableStateOf<(() -> Unit)?>(null) }
    DisposableEffect(Unit) { onDispose { model.release() } }

    val permissionRequest = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { results ->
        if (results.values.all { it }) pendingAction?.invoke()
        else model.notice = "Nearby devices and location permissions are needed to connect."
        pendingAction = null
    }
    val withPermissions = { action: () -> Unit ->
        pendingAction = action
        permissionRequest.launch(linkPermissions())
    }

    val scanner = rememberLauncherForActivityResult(ScanContract()) { result ->
        val text = result.contents ?: return@rememberLauncherForActivityResult
        val offer = Offer.fromQrText(text)
        if (offer != null) model.onOffer(offer) else model.onScanRejected()
    }

    LaunchedEffect(pendingOffer.value, model.screen) {
        val offer = pendingOffer.value
        if (offer != null && model.screen == Screen.JOIN) {
            model.onOffer(offer)
            pendingOffer.value = null
        }
    }

    // A stray back gesture must not end a live game. Otherwise back returns home.
    val inLiveGame = model.screen == Screen.GAME && model.game.end == null
    BackHandler(enabled = model.screen != Screen.HOME) {
        if (!inLiveGame) model.goHome()
    }

    Box(Modifier.fillMaxSize().background(Background).safeDrawingPadding().padding(12.dp)) {
        when (model.screen) {
            Screen.HOME -> HomeScreen(model, withPermissions)
            Screen.TOP_UP -> TopUpScreen(model)
            Screen.HOST -> HostScreen(model, activity)
            Screen.JOIN -> JoinScreen(model, activity) {
                scanner.launch(
                    ScanOptions()
                        .setDesiredBarcodeFormats(ScanOptions.QR_CODE)
                        .setPrompt("Scan the TapMate code on your friend's phone")
                        .setBeepEnabled(false)
                        .setOrientationLocked(false),
                )
            }
            Screen.CONNECTING -> ConnectingScreen(model)
            Screen.GAME -> GameScreen(model)
            Screen.TICKETS -> TicketsScreen(model)
        }
    }
}

@Composable
private fun WideButton(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().height(54.dp),
        colors = ButtonDefaults.buttonColors(containerColor = Purple),
    ) {
        Text(label, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun QuietLink(label: String, onClick: () -> Unit) {
    Text(
        label,
        color = Color.White.copy(alpha = 0.8f),
        fontSize = 15.sp,
        modifier = Modifier.clickable(onClick = onClick).padding(12.dp),
    )
}

@Composable
private fun Notice(text: String) {
    if (text.isNotEmpty()) {
        Text(
            text,
            color = Warning,
            fontSize = 14.sp,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().padding(vertical = 10.dp),
        )
    }
}

@Composable
private fun PanelBox(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Panel)
            .padding(16.dp),
    ) { content() }
}

@Composable
private fun StatRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(label, color = Muted, fontSize = 15.sp)
        Text(value, color = Color.White, fontSize = 15.sp, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun HomeScreen(model: AppModel, withPermissions: (() -> Unit) -> Unit) {
    val unclaimed = model.tickets.count { it.claimTx == null }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("TapMate", color = Color.White, fontSize = 40.sp, fontWeight = FontWeight.Bold)
        Text("1-minute chess, phone to phone", color = Muted, fontSize = 15.sp)
        Spacer(Modifier.height(24.dp))
        PanelBox {
            StatRow("Wallet", formatMon(model.balance))
            StatRow("Chips ready", "${model.chipsReady} × 0.1 MON")
            if (!model.online) Text("Offline: showing your last saved balance", color = Warning, fontSize = 13.sp)
        }
        Notice(model.notice)
        Spacer(Modifier.height(14.dp))
        WideButton("Create game") { withPermissions { model.startHosting() } }
        Spacer(Modifier.height(10.dp))
        WideButton("Join game") { withPermissions { model.startJoining() } }
        Spacer(Modifier.height(10.dp))
        WideButton("Add funds") { model.openTopUp() }
        Spacer(Modifier.height(10.dp))
        WideButton(if (unclaimed > 0) "Tickets to claim ($unclaimed)" else "Tickets") { model.openTickets() }
        Spacer(Modifier.height(6.dp))
        QuietLink("Practice on this phone") { model.startPractice() }
        Text("Testnet only. No monetary value.", color = Color.White.copy(alpha = 0.5f), fontSize = 13.sp)
    }
}

@Composable
private fun TopUpScreen(model: AppModel) {
    val context = LocalContext.current
    val canDeposit = (model.balance ?: BigInteger.ZERO) > Network.CHIP_DEPOSIT
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Add funds", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(12.dp))
        Text(
            "Send testnet MON to this address, then turn it into chips.",
            color = Muted,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(14.dp))
        QrImage(model.address, 220)
        Spacer(Modifier.height(8.dp))
        Text(
            model.address,
            color = Color.White,
            fontSize = 13.sp,
            fontFamily = FontFamily.Monospace,
            textAlign = TextAlign.Center,
        )
        QuietLink("Copy address") {
            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("TapMate address", model.address))
        }
        PanelBox {
            StatRow("Wallet", formatMon(model.balance))
            StatRow("Chips ready", "${model.chipsReady} × 0.1 MON")
            StatRow("Each chip costs", "0.3 MON")
            Text("0.1 is your stake. 0.2 is a bond against cheating.", color = Muted, fontSize = 13.sp)
        }
        Notice(model.notice)
        Spacer(Modifier.height(12.dp))
        WideButton(if (model.busy) "Adding chip…" else "Add 1 chip", enabled = canDeposit && !model.busy) { model.deposit() }
        QuietLink("Refresh balance") { model.refresh() }
        QuietLink("Back") { model.goHome() }
    }
}

@Composable
private fun QrImage(content: String, sizeDp: Int) {
    val image = remember(content) { qrBitmap(content) }
    Box(Modifier.clip(RoundedCornerShape(10.dp)).background(Color.White).padding(10.dp)) {
        Image(bitmap = image, contentDescription = "QR code", modifier = Modifier.size(sizeDp.dp))
    }
}

private fun qrBitmap(content: String, size: Int = 720): ImageBitmap {
    val matrix = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size)
    val pixels = IntArray(size * size) { i ->
        if (matrix[i % size, i / size]) android.graphics.Color.BLACK else android.graphics.Color.WHITE
    }
    return Bitmap.createBitmap(pixels, size, size, Bitmap.Config.ARGB_8888).asImageBitmap()
}

@Composable
private fun HostScreen(model: AppModel, activity: MainActivity) {
    DisposableEffect(Unit) {
        activity.setCardPriority(true)
        onDispose { activity.setCardPriority(false) }
    }
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Tap phones together", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(
            "Your friend taps Join game, then holds the backs of the phones together.",
            color = Muted,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))
        model.offerQr?.let { QrImage(it, 200) }
        Spacer(Modifier.height(8.dp))
        Text("Or they can scan this code", color = Muted, fontSize = 14.sp)
        Spacer(Modifier.height(16.dp))
        Text("You play White. Stake: 0.1 MON", color = Color.White, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
        Spacer(Modifier.height(8.dp))
        Text(model.connectionStatus, color = Muted, fontSize = 14.sp)
        QuietLink("Cancel") { model.goHome() }
    }
}

@Composable
private fun JoinScreen(model: AppModel, activity: MainActivity, onScan: () -> Unit) {
    DisposableEffect(Unit) {
        activity.setReader(
            TapReader(
                onOffer = { offer -> activity.runOnUiThread { model.onOffer(offer) } },
                onFailure = { message -> activity.runOnUiThread { model.onTapFailure(message) } },
            ),
        )
        onDispose { activity.setReader(null) }
    }
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = Purple)
        Spacer(Modifier.height(20.dp))
        Text("Tap phones together", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(8.dp))
        Text(
            "Hold the back of your phone against your friend's while their game is open.",
            color = Muted,
            fontSize = 15.sp,
            textAlign = TextAlign.Center,
        )
        Notice(model.notice)
        Spacer(Modifier.height(24.dp))
        WideButton("Scan QR code instead", onClick = onScan)
        QuietLink("Cancel") { model.goHome() }
    }
}

@Composable
private fun ConnectingScreen(model: AppModel) {
    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator(color = Purple)
        Spacer(Modifier.height(20.dp))
        Text(model.connectionStatus, color = Color.White, fontSize = 18.sp, textAlign = TextAlign.Center)
        Spacer(Modifier.height(8.dp))
        Text("Keep the phones close, with Bluetooth on.", color = Muted, fontSize = 14.sp)
        QuietLink("Cancel") { model.goHome() }
    }
}

@Composable
private fun TicketsScreen(model: AppModel) {
    val context = LocalContext.current
    var showQrFor by remember { mutableStateOf<StoredTicket?>(null) }
    Column(
        modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Your tickets", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
        Spacer(Modifier.height(4.dp))
        Text("Winning tickets stay here until you redeem them.", color = Muted, fontSize = 15.sp)
        Notice(model.notice)
        Spacer(Modifier.height(10.dp))
        if (model.tickets.isEmpty()) {
            Text("No tickets yet. Win a game to get one.", color = Muted, fontSize = 15.sp, modifier = Modifier.padding(24.dp))
        }
        model.tickets.asReversed().forEach { stored ->
            PanelBox {
                val claimed = stored.claimTx != null
                StatRow("Winnings", "0.2 MON")
                StatRow("Moves played", stored.ticket.ply.toString())
                StatRow("Status", if (claimed) "Paid" else "Ready to claim")
                Spacer(Modifier.height(8.dp))
                if (!claimed) {
                    WideButton(if (model.busy) "Claiming…" else "Claim", enabled = !model.busy) { model.claim(stored) }
                } else {
                    WideButton("View payment") { openTransaction(context, stored.claimTx!!) }
                    QuietLink("Try claiming this ticket again") { model.claim(stored) }
                }
                QuietLink(if (showQrFor == stored) "Hide ticket code" else "Show ticket code") {
                    showQrFor = if (showQrFor == stored) null else stored
                }
                if (showQrFor == stored) {
                    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        QrImage(stored.ticket.toJson().toString(), 260)
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
        }
        QuietLink("Back") { model.goHome() }
    }
}

@Composable
private fun GameScreen(model: AppModel) {
    val game = model.game
    val end = game.end
    val local = game.localSide
    val bottomSide = local ?: Side.WHITE
    val topSide = bottomSide.flip()
    val online = model.match != null
    val tick = model.revision

    LaunchedEffect(game) {
        while (game.end == null) {
            model.tickClock()
            delay(100)
        }
        model.tickClock()
    }

    Column(
        modifier = Modifier.fillMaxSize(),
        verticalArrangement = Arrangement.SpaceBetween,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Column {
            PlayerBar(
                name = if (online) model.peerName else "Black",
                millis = game.clockOf(topSide),
                active = end == null && game.sideToMove == topSide,
                canResign = end == null && !online,
                flipped = !online,
                tick = tick,
                onResign = { model.resign(topSide) },
            )
            if (online && end == null && model.peerGone) {
                Text(
                    "Opponent disconnected. They lose if their clock runs out.",
                    color = Warning,
                    fontSize = 14.sp,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
            model.invalidReason?.let {
                Text(it, color = Warning, fontSize = 14.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }

        Box(contentAlignment = Alignment.Center) {
            BoardView(game, model.selected, tick, model::onSquare)
            if (end != null) ResultPanel(model, end)
        }

        PlayerBar(
            name = if (online) "You" else "White",
            millis = game.clockOf(bottomSide),
            active = end == null && game.sideToMove == bottomSide,
            canResign = end == null,
            flipped = false,
            tick = tick,
            onResign = { model.resign(bottomSide) },
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
private fun ResultPanel(model: AppModel, end: GameEnd) {
    val mySide = model.match?.mySide
    val iWon = mySide != null && end.winner == mySide
    val iLost = mySide != null && end.winner != null && end.winner != mySide
    val headline = when {
        end.winner == null -> "Draw"
        mySide == null -> if (end.winner == Side.WHITE) "White wins" else "Black wins"
        iWon -> "You win"
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
            .fillMaxWidth(0.88f)
            .clip(RoundedCornerShape(14.dp))
            .background(Panel)
            .border(1.dp, Purple, RoundedCornerShape(14.dp))
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(headline, color = Color.White, fontSize = 26.sp, fontWeight = FontWeight.Bold)
        Text(detail, color = Muted, fontSize = 15.sp)
        Spacer(Modifier.height(10.dp))
        when {
            mySide == null -> {
                Button(onClick = model::newPracticeGame, colors = ButtonDefaults.buttonColors(containerColor = Purple)) {
                    Text("New game")
                }
            }
            iWon && model.wonTicket != null -> {
                Text("Ticket saved for 0.2 MON. Claim it now or any time later.", color = Color.White, fontSize = 14.sp, textAlign = TextAlign.Center)
                Spacer(Modifier.height(10.dp))
                Button(onClick = model::openClaimFromResult, colors = ButtonDefaults.buttonColors(containerColor = Purple)) {
                    Text("Go to ticket")
                }
            }
            iWon && model.peerGone -> {
                Text("Your opponent left before signing, so there is no ticket for this game.", color = Warning, fontSize = 14.sp, textAlign = TextAlign.Center)
            }
            iWon -> {
                Text("Waiting for your opponent's phone to sign…", color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
            }
            iLost -> {
                Text("Your phone signed the result, so the winner can claim your 0.1 MON stake.", color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
            }
            else -> {
                Text("Your chips stay in the vault.", color = Muted, fontSize = 14.sp, textAlign = TextAlign.Center)
            }
        }
        QuietLink("Home", model::goHome)
    }
}
