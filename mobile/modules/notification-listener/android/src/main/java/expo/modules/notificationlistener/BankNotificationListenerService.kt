package expo.modules.notificationlistener

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification

class BankNotificationListenerService : NotificationListenerService() {

  override fun onListenerConnected() {
    super.onListenerConnected()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification?) {
  super.onNotificationPosted(sbn)

  val postedNotification = sbn ?: return

  // Exact match: package không hỗ trợ sẽ dừng ngay.
  val source =
    SupportedSource.fromPackageName(
      postedNotification.packageName,
    ) ?: return

  // Notification không có rawText sẽ bị từ chối.
  NotificationExtractor.extract(
    sbn = postedNotification,
    source = source,
  ) ?: return

  // Bước 2.6: tạo sourceMessageId.
  // Bước 2.7: lưu kết quả vào SQLite.
  //
  // Tuyệt đối không Log.d rawText tại đây.
}

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
  }
}