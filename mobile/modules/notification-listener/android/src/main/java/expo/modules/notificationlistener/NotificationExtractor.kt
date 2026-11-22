package expo.modules.notificationlistener

import android.app.Notification
import android.os.Build
import android.service.notification.StatusBarNotification
import java.time.Instant

object NotificationExtractor {

  fun extract(
    sbn: StatusBarNotification,
    source: SupportedSource,
  ): CapturedNotification? {
    // Chỉ tạo observedAt một lần.
    val observedAt = Instant.now().toString()

    val packageName = sbn.packageName
    val notificationKey = sbn.key
    val postTime = sbn.postTime

    if (packageName.isBlank()) {
      return null
    }

    if (notificationKey.isBlank()) {
      return null
    }

    if (source.packageName != packageName) {
      return null
    }

    val notification = sbn.notification ?: return null
    val extras = notification.extras

    val title =
      extras.getCharSequence(Notification.EXTRA_TITLE).trimmedOrNull()

    val text =
      extras.getCharSequence(Notification.EXTRA_TEXT).trimmedOrNull()

    val bigText =
      extras.getCharSequence(Notification.EXTRA_BIG_TEXT).trimmedOrNull()

    val subText =
      extras.getCharSequence(Notification.EXTRA_SUB_TEXT).trimmedOrNull()

    val textLines =
      extras
        .getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
        ?.mapNotNull { it.trimmedOrNull() }
        .orEmpty()

    val rawText =
      buildRawText(
        title = title,
        text = text,
        bigText = bigText,
        textLines = textLines,
      )

    // Từ chối cục bộ notification không có nội dung.
    if (rawText.isBlank()) {
      return null
    }

    val sourceMessageId =
      SourceMessageIdGenerator.generate(
        packageName = packageName,
        notificationKey = notificationKey,
        postTime = postTime,
      )

    val channelId =
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        notification.channelId.trimmedOrNull()
      } else {
        null
      }

    return CapturedNotification(
      sourceMessageId = sourceMessageId,
      source = source,
      packageName = packageName,
      notificationKey = notificationKey,
      notificationId = sbn.id,
      channelId = channelId,
      title = title,
      text = text,
      bigText = bigText,
      subText = subText,
      textLines = textLines,
      notificationTime =
        Instant.ofEpochMilli(postTime).toString(),
      observedAt = observedAt,
      rawText = rawText,
    )
  }

  internal fun buildRawText(
    title: String?,
    text: String?,
    bigText: String?,
    textLines: List<String>,
  ): String {
    val normalizedTitle = title.trimmedOrNull()

    // Theo contract: ưu tiên bigText rồi mới fallback text.
    val preferredBody =
      bigText.trimmedOrNull()
        ?: text.trimmedOrNull()

    val bodyParts = mutableListOf<String>()

    if (preferredBody != null) {
      bodyParts.add(preferredBody)
    }

    for (value in textLines) {
      val line = value.trimmedOrNull() ?: continue
      val currentBody = bodyParts.joinToString("\n")

      // Không thêm lại dòng đã xuất hiện trong body.
      if (!currentBody.contains(line)) {
        bodyParts.add(line)
      }
    }

    val body =
      bodyParts
        .joinToString("\n")
        .trimmedOrNull()

    return listOfNotNull(
      normalizedTitle,
      body,
    ).joinToString("\n")
  }

  private fun CharSequence?.trimmedOrNull(): String? {
    return this
      ?.toString()
      ?.trim()
      ?.takeIf { it.isNotEmpty() }
  }
}