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

    val source =
      SupportedSource.fromPackageName(
        postedNotification.packageName,
      ) ?: return

    val capturedNotification =
      NotificationExtractor.extract(
        sbn = postedNotification,
        source = source,
      ) ?: return

    // Bước 2.7 sẽ lưu nguyên capturedNotification vào SQLite.
    // Không tạo lại sourceMessageId trong quá trình gửi lại.
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
  }
}