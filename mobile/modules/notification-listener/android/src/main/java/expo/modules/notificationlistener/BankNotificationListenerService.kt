package expo.modules.notificationlistener

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

class BankNotificationListenerService :
  NotificationListenerService() {

  private lateinit var queueRepository:
    NotificationQueueRepository

  private lateinit var walletMappingStore:
    WalletMappingStore

  private lateinit var ioExecutor:
    ExecutorService

  override fun onCreate() {
    super.onCreate()

    queueRepository =
      NotificationQueueRepository(
        applicationContext,
      )

    walletMappingStore =
      WalletMappingStore(
        applicationContext,
      )

    ioExecutor =
      Executors.newSingleThreadExecutor()
  }

  override fun onListenerConnected() {
    super.onListenerConnected()
  }

  override fun onNotificationPosted(
    sbn: StatusBarNotification?,
  ) {
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

    ioExecutor.execute {
      try {
        val walletId =
          walletMappingStore.getWalletId(
            capturedNotification.source,
          )

        queueRepository.enqueue(
          notification = capturedNotification,
          walletId = walletId,
        )
      } catch (error: Exception) {
        /*
         * Chỉ log loại lỗi.
         * Không log rawText, title, số tiền hoặc payload.
         */
        Log.e(
          LOG_TAG,
          "Unable to persist queue item: " +
            error.javaClass.simpleName,
        )
      }
    }
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
  }

  override fun onDestroy() {
    if (::ioExecutor.isInitialized) {
      ioExecutor.execute {
        if (::queueRepository.isInitialized) {
          queueRepository.close()
        }
      }

      ioExecutor.shutdown()
    }

    super.onDestroy()
  }

  companion object {
    private const val LOG_TAG =
      "BankNotificationListener"
  }
}