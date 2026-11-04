package xyz.tapmate.app

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.math.BigInteger
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The wallet key lives on this phone so it can sign with no network. Android Keystore has no
 * secp256k1 support, so the key is sealed with a non-exportable AES key and sits in app memory
 * while the app runs. That is fine for testnet, but not for real funds.
 */
class KeyVault(context: Context) {
    private val file = File(context.noBackupFilesDir, "wallet.bin")

    fun loadOrCreate(): BigInteger {
        if (file.exists()) {
            val sealed = file.readBytes()
            val cipher = Cipher.getInstance(TRANSFORM)
            cipher.init(Cipher.DECRYPT_MODE, wrapKey(), GCMParameterSpec(128, sealed, 0, 12))
            return BigInteger(1, cipher.doFinal(sealed, 12, sealed.size - 12))
        }
        val random = SecureRandom()
        var key: BigInteger
        do {
            key = BigInteger(256, random)
        } while (key.signum() == 0 || key >= CURVE_ORDER)
        val cipher = Cipher.getInstance(TRANSFORM)
        cipher.init(Cipher.ENCRYPT_MODE, wrapKey())
        file.writeBytes(cipher.iv + cipher.doFinal(Eth.word(key)))
        return key
    }

    private fun wrapKey(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as SecretKey?)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ALIAS = "tapmate_wrap"
        const val TRANSFORM = "AES/GCM/NoPadding"
        val CURVE_ORDER = BigInteger("FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141", 16)
    }
}
