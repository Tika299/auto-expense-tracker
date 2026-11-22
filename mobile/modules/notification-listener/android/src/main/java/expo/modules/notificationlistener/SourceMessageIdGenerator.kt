package expo.modules.notificationlistener

import java.nio.charset.StandardCharsets
import java.security.MessageDigest

object SourceMessageIdGenerator {

  fun generate(
    packageName: String,
    notificationKey: String,
    postTime: Long,
  ): String {
    require(packageName.isNotBlank()) {
      "packageName must not be blank"
    }

    require(notificationKey.isNotBlank()) {
      "notificationKey must not be blank"
    }

    val input = buildString {
      append(packageName)
      append("|")
      append(notificationKey)
      append("|")
      append(postTime)
    }

    val digest =
      MessageDigest
        .getInstance("SHA-256")
        .digest(
          input.toByteArray(StandardCharsets.UTF_8),
        )

    return digest.toLowercaseHex()
  }

  private fun ByteArray.toLowercaseHex(): String {
    val hexChars = "0123456789abcdef"
    val output = CharArray(size * 2)

    forEachIndexed { index, byte ->
      val value = byte.toInt() and 0xff

      output[index * 2] =
        hexChars[value ushr 4]

      output[index * 2 + 1] =
        hexChars[value and 0x0f]
    }

    return String(output)
  }
}