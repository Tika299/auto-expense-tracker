package expo.modules.notificationlistener

data class CapturedNotification(
  val source: SupportedSource,
  val packageName: String,
  val notificationKey: String?,
  val notificationId: Int,
  val channelId: String?,
  val title: String?,
  val text: String?,
  val bigText: String?,
  val subText: String?,
  val textLines: List<String>,
  val notificationTime: String,
  val observedAt: String,
  val rawText: String,
)