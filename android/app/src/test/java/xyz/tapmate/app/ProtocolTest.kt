package xyz.tapmate.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigInteger

/**
 * Expected values came from outside this code: viem, Foundry's cast, and the vault deployed on
 * Monad testnet. They catch any encoding mismatch with the contract.
 */
class ProtocolTest {
    private val testKey = BigInteger("4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f362318", 16)
    private val testAddress = "0x2c7536e3605d9c16a7a3d7b1898e529396a65c23"
    private val other = "0x1111111111111111111111111111111111111111"
    private val codec = VaultCodec()
    private val wager = Wager(other, testAddress, 3, 4, Network.CHIP, 1_800_000_000, true)

    @Test
    fun addressMatchesViem() = assertEquals(testAddress, Eth.address(testKey))

    @Test
    fun signatureMatchesViem() {
        val digest = "0xcfab389a1c855a849406d8da752f63b52b91a2bdd3c6312c4877a17da37e94af".fromHex()
        val expected = "0x27cd9f6202a55b54561ea74c913b19216fda69d4ccf9e778cad9759bbc375b07" +
            "551d9da611d38e8b48a7874c00dcb5038bf7e19b308efe40fe93c30514f525671b"
        assertEquals(expected, Eth.sign(digest, testKey).toHex())
    }

    @Test
    fun recoverFindsTheSigner() {
        val digest = Eth.keccak("message")
        assertEquals(testAddress, Eth.recover(digest, Eth.sign(digest, testKey)))
    }

    @Test
    fun recoverRejectsMalformedSignatures() {
        assertNull(Eth.recover(Eth.keccak("message"), ByteArray(64)))
        assertNull(Eth.recover(Eth.keccak("message"), ByteArray(65)))
    }

    @Test
    fun domainMatchesLiveContract() = assertEquals(
        "0x2949cb07010bff6ee9b475314acf3b45c64f4ec391802a00833e1aac9151ca74",
        codec.domainSeparator.toHex(),
    )

    @Test
    fun wagerHashMatchesLiveContract() = assertEquals(
        "0x08b8d765f8d19bb9d921bc5aaaec29705ef3cced3880f15cc27c2925237693db",
        codec.wagerDigest(wager).toHex(),
    )

    @Test
    fun depositCalldataMatchesCast() = assertEquals(
        "0x120bae190000000000000000000000000000000000000000000000000000000000000003" +
            "000000000000000000000000000000000000000000000000000000006b49d200",
        codec.depositCall(3, 1_800_000_000).toHex(),
    )

    @Test
    fun settleCalldataMatchesCast() {
        val ticket = Ticket(
            wager = wager,
            sig0 = ByteArray(65) { 0xab.toByte() },
            sig1 = ByteArray(65) { 0xcd.toByte() },
            winner = testAddress,
            ply = 40,
            finalPositionHash = ByteArray(32) { 0xef.toByte() },
            loserSig = ByteArray(65) { 0xab.toByte() },
        )
        val expected = "0x2f3307b0" +
            "0000000000000000000000001111111111111111111111111111111111111111" +
            "0000000000000000000000002c7536e3605d9c16a7a3d7b1898e529396a65c23" +
            "0000000000000000000000000000000000000000000000000000000000000003" +
            "0000000000000000000000000000000000000000000000000000000000000004" +
            "000000000000000000000000000000000000000000000000016345785d8a0000" +
            "000000000000000000000000000000000000000000000000000000006b49d200" +
            "0000000000000000000000000000000000000000000000000000000000000001" +
            "0000000000000000000000000000000000000000000000000000000000000140" +
            "00000000000000000000000000000000000000000000000000000000000001c0" +
            "0000000000000000000000000000000000000000000000000000000000000240" +
            "0000000000000000000000000000000000000000000000000000000000000041" +
            "ab".repeat(65) + "00".repeat(31) +
            "0000000000000000000000000000000000000000000000000000000000000041" +
            "cd".repeat(65) + "00".repeat(31) +
            "0000000000000000000000002c7536e3605d9c16a7a3d7b1898e529396a65c23" +
            "0000000000000000000000000000000000000000000000000000000000000028" +
            "ef".repeat(32) +
            "0000000000000000000000000000000000000000000000000000000000000080" +
            "0000000000000000000000000000000000000000000000000000000000000041" +
            "ab".repeat(65) + "00".repeat(31)
        assertEquals(expected, codec.settleCall(ticket).toHex())
    }

    @Test
    fun rawTransactionMatchesCast() {
        val raw = Eth.signLegacyTx(
            priv = testKey,
            chainId = 10143,
            nonce = 7,
            gasPrice = BigInteger.valueOf(102_000_000_000),
            gasLimit = 100_000,
            to = other,
            value = BigInteger.ONE,
            data = "0xabcd".fromHex(),
        )
        assertEquals(
            "0xf869078517bfac7c00830186a09411111111111111111111111111111111111111110182abcd824f61" +
                "a0bdf10c932781c726fa08ee05ee90e40436fa27bef3099e5175e4be161b9a5d51" +
                "a0168f681ed05eabfc5207cc19849e4ca0eaba43e8ced9bbcfed42a89f35008151",
            raw.toHex(),
        )
    }

    @Test
    fun offerSurvivesBytesAndQr() {
        val offer = Offer(testAddress, 7, 1_800_000_000, "0x0102030405060708")
        assertEquals(37, offer.toBytes().size)
        assertEquals(offer, Offer.fromBytes(offer.toBytes()))
        assertEquals(offer, Offer.fromQrText(offer.toQrText()))
        assertNull(Offer.fromQrText("https://example.com"))
    }

    @Test
    fun hostAlwaysPlaysWhiteAndPlayersAreSorted() {
        val hostLow = buildWager(other, 1, 500, testAddress, 2, 400)
        assertEquals(other, hostLow.player0)
        assertEquals(true, hostLow.player0IsWhite)
        assertEquals(400, hostLow.settleBy)
        val hostHigh = buildWager(testAddress, 1, 500, other, 2, 400)
        assertEquals(other, hostHigh.player0)
        assertEquals(2, hostHigh.chip0)
        assertEquals(1, hostHigh.chip1)
        assertEquals(false, hostHigh.player0IsWhite)
    }

    @Test
    fun ticketSurvivesJson() {
        val ticket = Ticket(wager, ByteArray(65) { 1 }, ByteArray(65) { 2 }, testAddress, 4, ByteArray(32) { 3 }, ByteArray(65) { 4 })
        val restored = Ticket.fromJson(org.json.JSONObject(ticket.toJson().toString()))
        assertEquals(wager, restored.wager)
        assertEquals(ticket.ply, restored.ply)
        assertArrayEquals(ticket.loserSig, restored.loserSig)
    }
}
