package xyz.tapmate.app

import org.bouncycastle.crypto.digests.KeccakDigest
import org.bouncycastle.crypto.digests.SHA256Digest
import org.bouncycastle.crypto.ec.CustomNamedCurves
import org.bouncycastle.crypto.params.ECDomainParameters
import org.bouncycastle.crypto.params.ECPrivateKeyParameters
import org.bouncycastle.crypto.signers.ECDSASigner
import org.bouncycastle.crypto.signers.HMacDSAKCalculator
import org.bouncycastle.math.ec.ECAlgorithms
import org.bouncycastle.math.ec.ECPoint
import java.io.ByteArrayOutputStream
import java.math.BigInteger

fun ByteArray.toHex(): String = "0x" + joinToString("") { "%02x".format(it) }

fun String.fromHex(): ByteArray {
    val clean = removePrefix("0x")
    require(clean.length % 2 == 0) { "odd hex length" }
    return ByteArray(clean.length / 2) { clean.substring(it * 2, it * 2 + 2).toInt(16).toByte() }
}

/** The Ethereum primitives this app needs. Everything here works with no network. */
object Eth {
    private val x9 = CustomNamedCurves.getByName("secp256k1")
    private val dom = ECDomainParameters(x9.curve, x9.g, x9.n, x9.h)

    fun keccak(vararg parts: ByteArray): ByteArray {
        val d = KeccakDigest(256)
        parts.forEach { d.update(it, 0, it.size) }
        return ByteArray(32).also { d.doFinal(it, 0) }
    }

    fun keccak(text: String): ByteArray = keccak(text.toByteArray(Charsets.UTF_8))

    fun word(value: BigInteger): ByteArray {
        require(value.signum() >= 0 && value.bitLength() <= 256) { "value does not fit in a word" }
        val raw = value.toByteArray()
        val out = ByteArray(32)
        val n = minOf(raw.size, 32)
        System.arraycopy(raw, raw.size - n, out, 32 - n, n)
        return out
    }

    fun word(value: Long): ByteArray = word(BigInteger.valueOf(value))

    fun wordAddress(address: String): ByteArray {
        val raw = address.fromHex()
        require(raw.size == 20) { "bad address" }
        return ByteArray(12) + raw
    }

    fun address(priv: BigInteger): String {
        val encoded = dom.g.multiply(priv).normalize().getEncoded(false)
        return keccak(encoded.copyOfRange(1, 65)).copyOfRange(12, 32).toHex()
    }

    /** Returns 65 bytes r||s||v with low s and v of 27 or 28. Nonces are deterministic (RFC 6979). */
    fun sign(digest: ByteArray, priv: BigInteger): ByteArray {
        val signer = ECDSASigner(HMacDSAKCalculator(SHA256Digest()))
        signer.init(true, ECPrivateKeyParameters(priv, dom))
        val parts = signer.generateSignature(digest)
        val r = parts[0]
        val s = if (parts[1] > dom.n.shiftRight(1)) dom.n - parts[1] else parts[1]
        val publicKey = dom.g.multiply(priv).normalize()
        val recovery = (0..1).first { recoverPoint(digest, r, s, it) == publicKey }
        return word(r) + word(s) + byteArrayOf((27 + recovery).toByte())
    }

    /** Returns the lowercase signer address, or null if the signature is malformed or high-s. */
    fun recover(digest: ByteArray, signature: ByteArray): String? {
        if (signature.size != 65) return null
        val v = signature[64].toInt() and 0xFF
        if (v != 27 && v != 28) return null
        val r = BigInteger(1, signature.copyOfRange(0, 32))
        val s = BigInteger(1, signature.copyOfRange(32, 64))
        if (r.signum() == 0 || s.signum() == 0 || r >= dom.n || s > dom.n.shiftRight(1)) return null
        val point = recoverPoint(digest, r, s, v - 27) ?: return null
        val encoded = point.getEncoded(false)
        return keccak(encoded.copyOfRange(1, 65)).copyOfRange(12, 32).toHex()
    }

    private fun recoverPoint(digest: ByteArray, r: BigInteger, s: BigInteger, odd: Int): ECPoint? {
        val encoded = ByteArray(33)
        encoded[0] = (0x02 + odd).toByte()
        System.arraycopy(word(r), 0, encoded, 1, 32)
        val rPoint = runCatching { dom.curve.decodePoint(encoded) }.getOrNull() ?: return null
        val e = BigInteger(1, digest)
        val rInverse = r.modInverse(dom.n)
        return ECAlgorithms.sumOfTwoMultiplies(
            dom.g,
            (dom.n - e).multiply(rInverse).mod(dom.n),
            rPoint,
            s.multiply(rInverse).mod(dom.n),
        ).normalize()
    }

    /** Signs a legacy EIP-155 transaction and returns the raw bytes to broadcast. */
    fun signLegacyTx(
        priv: BigInteger,
        chainId: Long,
        nonce: Long,
        gasPrice: BigInteger,
        gasLimit: Long,
        to: String,
        value: BigInteger,
        data: ByteArray,
    ): ByteArray {
        val fields = listOf(
            rlpInt(BigInteger.valueOf(nonce)),
            rlpInt(gasPrice),
            rlpInt(BigInteger.valueOf(gasLimit)),
            to.fromHex(),
            rlpInt(value),
            data,
        )
        val unsigned = fields + listOf(rlpInt(BigInteger.valueOf(chainId)), ByteArray(0), ByteArray(0))
        val signature = sign(keccak(rlpList(unsigned)), priv)
        val v = BigInteger.valueOf((signature[64].toInt() - 27) + 35 + 2 * chainId)
        val r = BigInteger(1, signature.copyOfRange(0, 32))
        val s = BigInteger(1, signature.copyOfRange(32, 64))
        return rlpList(fields + listOf(rlpInt(v), rlpInt(r), rlpInt(s)))
    }

    private fun rlpInt(value: BigInteger): ByteArray {
        if (value.signum() == 0) return ByteArray(0)
        val raw = value.toByteArray()
        return if (raw[0] == 0.toByte()) raw.copyOfRange(1, raw.size) else raw
    }

    private fun rlpBytes(item: ByteArray): ByteArray =
        if (item.size == 1 && item[0] >= 0) item else rlpLength(item.size, 0x80) + item

    private fun rlpList(items: List<ByteArray>): ByteArray {
        val body = ByteArrayOutputStream()
        items.forEach { body.write(rlpBytes(it)) }
        return rlpLength(body.size(), 0xC0) + body.toByteArray()
    }

    private fun rlpLength(length: Int, offset: Int): ByteArray {
        if (length < 56) return byteArrayOf((offset + length).toByte())
        val raw = rlpInt(BigInteger.valueOf(length.toLong()))
        return byteArrayOf((offset + 55 + raw.size).toByte()) + raw
    }
}
