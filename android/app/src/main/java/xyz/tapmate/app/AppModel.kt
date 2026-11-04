package xyz.tapmate.app

import android.content.Context
import android.os.SystemClock
import android.util.Log
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import com.github.bhlangonijr.chesslib.Side
import com.github.bhlangonijr.chesslib.Square
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import java.math.BigInteger
import java.security.SecureRandom

enum class Screen { HOME, TOP_UP, HOST, JOIN, CONNECTING, GAME, TICKETS }

/** App state and the full game flow: top up, connect, sign, play, and redeem. */
class AppModel(context: Context, private val scope: CoroutineScope) {
    private val store = Store(context)
    private val codec = VaultCodec()
    private val chain = Chain(codec)
    private val key: BigInteger = KeyVault(context).loadOrCreate()
    val address: String = Eth.address(key)

    var screen by mutableStateOf(Screen.HOME)
        private set
    var balance by mutableStateOf<BigInteger?>(null)
        private set
    var vault by mutableStateOf(store.vault)
        private set
    private var nextChip by mutableStateOf(store.nextChip)
    var online by mutableStateOf(true)
        private set
    var busy by mutableStateOf(false)
        private set
    var notice by mutableStateOf("")
    var connectionStatus by mutableStateOf("")
        private set
    var offerQr by mutableStateOf<String?>(null)
        private set

    var game by mutableStateOf(ChessGame())
        private set
    var selected by mutableStateOf<Square?>(null)
        private set
    var match by mutableStateOf<SignedMatch?>(null)
        private set
    var peerName by mutableStateOf("Opponent")
        private set
    var peerGone by mutableStateOf(false)
        private set
    var invalidReason by mutableStateOf<String?>(null)
        private set
    var wonTicket by mutableStateOf<StoredTicket?>(null)
        private set
    /** Compose cannot observe ChessGame's fields, so this counter triggers a redraw after each change. */
    var revision by mutableIntStateOf(0)
        private set

    val tickets = mutableStateListOf<StoredTicket>().apply { addAll(store.tickets()) }

    private var hostOffer: Offer? = null
    private var joinOffer: Offer? = null
    private var lossSent = false

    private val link = PhoneLink(context) { onLinkEvent(it) }

    init {
        Log.i(TAG, "wallet $address")
        refresh()
    }

    // ---------- wallet ----------

    /** The first chip this phone has not signed yet. */
    private val firstFreeChip: Long get() = maxOf(nextChip, vault?.chipStart ?: 0)

    val chipsReady: Long get() = ((vault?.chipEnd ?: 0) - firstFreeChip).coerceAtLeast(0)

    fun refresh() {
        scope.launch {
            try {
                balance = chain.balance(address)
                val latest = chain.vault(address)
                vault = latest
                store.vault = latest
                online = true
            } catch (e: ChainException) {
                online = !e.offline
                if (!e.offline) notice = e.message.orEmpty()
            }
        }
    }

    /** Moves 0.3 MON into the vault: a 0.1 stake chip plus its 0.2 bond. */
    fun deposit() = runChainAction("Chip added") {
        val now = System.currentTimeMillis() / 1000
        val lockUntil = maxOf(now + Network.LOCK_SECONDS, vault?.lockUntil ?: 0)
        chain.send(key, address, Network.CHIP_DEPOSIT, codec.depositCall(1, lockUntil))
    }

    private fun runChainAction(success: String, action: suspend () -> String) {
        if (busy) return
        busy = true
        notice = ""
        scope.launch {
            try {
                val hash = action()
                Log.i(TAG, "tx $hash")
                notice = success
            } catch (e: ChainException) {
                notice = e.message.orEmpty()
            } finally {
                busy = false
                refresh()
            }
        }
    }

    // ---------- navigation ----------

    fun openTopUp() {
        notice = ""
        screen = Screen.TOP_UP
        refresh()
    }

    fun openTickets() {
        notice = ""
        screen = Screen.TICKETS
        refresh()
    }

    fun goHome() {
        link.stop()
        TapState.offer = null
        hostOffer = null
        joinOffer = null
        offerQr = null
        match = null
        wonTicket = null
        invalidReason = null
        peerGone = false
        selected = null
        game = ChessGame()
        notice = ""
        screen = Screen.HOME
        refresh()
    }

    fun startPractice() {
        match = null
        selected = null
        game = ChessGame()
        screen = Screen.GAME
    }

    // ---------- connecting ----------

    /** A wager needs an unsigned chip whose funds stay locked long enough to claim. */
    private fun readyToWager(): Boolean {
        val lockUntil = vault?.lockUntil ?: 0
        val now = System.currentTimeMillis() / 1000
        return when {
            chipsReady < 1 -> {
                notice = "Add a chip first. Each game stakes one."
                false
            }
            lockUntil < now + MIN_TIME_TO_CLAIM_SECONDS -> {
                notice = "Your chips are about to unlock. Add a chip to extend them."
                false
            }
            else -> true
        }
    }

    fun startHosting() {
        if (!readyToWager()) return
        val session = ByteArray(8).also { SecureRandom().nextBytes(it) }.toHex()
        val offer = Offer(address, firstFreeChip, vault!!.lockUntil, session)
        hostOffer = offer
        joinOffer = null
        TapState.offer = offer.toBytes()
        offerQr = offer.toQrText()
        Log.i(TAG, "offer ${offer.toQrText()}")
        notice = ""
        screen = Screen.HOST
        link.host(session)
    }

    fun startJoining() {
        if (!readyToWager()) return
        hostOffer = null
        joinOffer = null
        notice = ""
        screen = Screen.JOIN
    }

    /** Called with an offer from an NFC tap or a QR code. Repeated reads of one tap are ignored. */
    fun onOffer(offer: Offer) {
        if (screen != Screen.JOIN || joinOffer != null) return
        if (offer.host.equals(address, ignoreCase = true)) {
            notice = "That's this phone's own game."
            return
        }
        joinOffer = offer
        notice = ""
        connectionStatus = "Connecting to your friend…"
        screen = Screen.CONNECTING
        link.join(offer.session)
    }

    fun onTapFailure(message: String) {
        if (screen == Screen.JOIN) notice = message
    }

    fun onScanRejected() {
        notice = "That QR code isn't a TapMate game."
    }

    private fun onLinkEvent(event: LinkEvent) {
        when (event) {
            is LinkEvent.Status -> connectionStatus = event.text
            is LinkEvent.Connected -> {
                peerName = event.peerName
                peerGone = false
                joinOffer?.let { sendJoin(it) }
            }
            LinkEvent.Disconnected -> {
                peerGone = true
                if (screen == Screen.CONNECTING || screen == Screen.HOST) {
                    goHome()
                    notice = "The connection dropped. Please try again."
                }
                revision += 1
            }
            is LinkEvent.Message -> onMessage(event.text)
        }
    }

    /** The joiner already knows the host's terms, so it signs first and sends everything in one message. */
    private fun sendJoin(offer: Offer) {
        val chip = firstFreeChip
        val lockUntil = vault?.lockUntil ?: 0
        val wager = buildWager(offer.host, offer.chip, offer.lockUntil, address, chip, lockUntil)
        store.burnChip(chip)
        nextChip = store.nextChip
        val signature = Eth.sign(codec.wagerDigest(wager), key)
        pendingWager = wager
        pendingSignature = signature
        link.send("J|$address|$chip|$lockUntil|${signature.toHex()}")
    }

    private var pendingWager: Wager? = null
    private var pendingSignature: ByteArray? = null

    private fun onHostSawJoin(parts: List<String>) {
        val offer = hostOffer ?: return
        val wager = buildWager(offer.host, offer.chip, offer.lockUntil, parts[1], parts[2].toLong(), parts[3].toLong())
        val peerSignature = parts[4].fromHex()
        val digest = codec.wagerDigest(wager)
        if (!parts[1].equals(Eth.recover(digest, peerSignature), ignoreCase = true)) {
            abandon("Your friend's signature didn't check out.")
            return
        }
        store.burnChip(offer.chip)
        nextChip = store.nextChip
        val signature = Eth.sign(digest, key)
        link.send("H|${signature.toHex()}")
        begin(wager, parts[1], signature, peerSignature)
    }

    private fun onJoinerSawHost(parts: List<String>) {
        val offer = joinOffer ?: return
        val wager = pendingWager ?: return
        val mine = pendingSignature ?: return
        val hostSignature = parts[1].fromHex()
        if (!offer.host.equals(Eth.recover(codec.wagerDigest(wager), hostSignature), ignoreCase = true)) {
            abandon("The host's signature didn't check out.")
            return
        }
        begin(wager, offer.host, mine, hostSignature)
    }

    private fun begin(wager: Wager, peer: String, mine: ByteArray, theirs: ByteArray) {
        TapState.offer = null
        offerQr = null
        val signed = SignedMatch(codec, key, address.lowercase(), peer.lowercase(), wager, mine, theirs)
        match = signed
        game = ChessGame(localSide = signed.mySide)
        selected = null
        lossSent = false
        wonTicket = null
        invalidReason = null
        screen = Screen.GAME
        Log.i(TAG, "game ${signed.gameId.toHex()} as ${signed.mySide}")
    }

    private fun abandon(reason: String) {
        goHome()
        notice = reason
    }

    // ---------- playing ----------

    fun tickClock() {
        val flagFell = game.advanceClock(SystemClock.elapsedRealtime())
        if (flagFell && match != null) link.send("F")
        afterGameChange()
    }

    fun onSquare(square: Square) {
        tickClock()
        if (!game.canMove) return
        val from = selected
        when {
            from != null && square in game.legalTargets(from) -> {
                val mover = game.sideToMove
                game.play(from, square)
                selected = null
                match?.let { signed ->
                    val signature = signed.signMove(game.ply, game.fen)
                    link.send("M|${from.name}|${square.name}|${game.clockOf(mover)}|${signature.toHex()}")
                }
            }
            game.pieceAt(square).pieceSide == game.sideToMove -> selected = square
            else -> selected = null
        }
        afterGameChange()
    }

    fun resign(side: Side) {
        game.resign(side)
        selected = null
        if (match != null) link.send("R")
        afterGameChange()
    }

    fun newPracticeGame() {
        game = ChessGame()
        selected = null
        revision += 1
    }

    private fun onMessage(text: String) {
        val parts = text.split("|")
        Log.i(TAG, "recv ${parts[0]}")
        when (parts[0]) {
            "J" -> onHostSawJoin(parts)
            "H" -> onJoinerSawHost(parts)
            "M" -> onPeerMove(parts)
            "R" -> game.localSide?.flip()?.let { game.resign(it) }
            "F" -> game.localSide?.flip()?.let { game.flagFell(it) }
            "T" -> onLossSigned(parts)
        }
        afterGameChange()
    }

    private fun onPeerMove(parts: List<String>) {
        val signed = match ?: return
        game.advanceClock(SystemClock.elapsedRealtime())
        val applied = game.playRemote(Square.valueOf(parts[1]), Square.valueOf(parts[2]), parts[3].toLong())
        if (!applied) return
        if (!signed.isPeerMove(game.ply, game.fen, parts[4].fromHex())) {
            invalidReason = "Your opponent's move signature didn't match this board."
            Log.w(TAG, "bad move signature at ply ${game.ply}")
        }
    }

    /** The loser's phone admits the loss by signing the result, which becomes the winner's ticket. */
    private fun afterGameChange() {
        revision += 1
        val signed = match ?: return
        val end = game.end ?: return
        val winner = end.winner ?: return
        if (winner == signed.mySide || lossSent) return
        lossSent = true
        val signature = signed.signLoss(game.ply, game.fen)
        val positionHash = SignedMatch.positionHash(game.fen).toHex()
        link.send("T|${game.ply}|$positionHash|${signature.toHex()}")
        Log.i(TAG, "signed loss at ply ${game.ply}")
    }

    private fun onLossSigned(parts: List<String>) {
        val signed = match ?: return
        val ticket = signed.ticketFromLoss(parts[1].toInt(), parts[2].fromHex(), parts[3].fromHex())
        if (ticket == null) {
            invalidReason = "Your opponent's result signature was invalid."
            Log.w(TAG, "bad result signature")
            return
        }
        val stored = StoredTicket(ticket)
        tickets.add(stored)
        store.saveTickets(tickets)
        wonTicket = stored
        Log.i(TAG, "ticket saved for game ${signed.gameId.toHex()}")
    }

    // ---------- redeeming ----------

    /** Pays the winner. Running this again on a paid ticket shows the contract rejecting it. */
    fun claim(stored: StoredTicket) = runChainAction("Paid 0.2 MON to your wallet") {
        val hash = chain.send(key, address, BigInteger.ZERO, codec.settleCall(stored.ticket))
        val index = tickets.indexOf(stored)
        if (index >= 0) {
            tickets[index] = stored.copy(claimTx = hash)
            store.saveTickets(tickets)
        }
        hash
    }

    fun openClaimFromResult() {
        link.stop()
        openTickets()
    }

    fun release() {
        link.stop()
        TapState.offer = null
    }

    private companion object {
        const val TAG = "TapMate"
        const val MIN_TIME_TO_CLAIM_SECONDS = 10 * 60L
    }
}
