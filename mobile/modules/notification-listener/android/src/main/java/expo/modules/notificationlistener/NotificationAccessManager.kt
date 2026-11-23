package expo.modules.notificationlistener

import android.app.NotificationManager
import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

class NotificationAccessManager(
  private val context: Context,
) {
  private val listenerComponent =
    ComponentName(
      context,
      BankNotificationListenerService::class.java,
    )

  fun isAccessGranted(): Boolean {
    if (
      Build.VERSION.SDK_INT >=
      Build.VERSION_CODES.O_MR1
    ) {
      val notificationManager =
        context.getSystemService(
          NotificationManager::class.java,
        )

      return notificationManager
        .isNotificationListenerAccessGranted(
          listenerComponent,
        )
    }

    /*
     * Phương án dự phòng cho Android 7.0–8.0.
     */
    val enabledListeners =
      Settings.Secure.getString(
        context.contentResolver,
        ENABLED_NOTIFICATION_LISTENERS,
      ).orEmpty()

    return enabledListeners
      .split(":")
      .mapNotNull {
        ComponentName.unflattenFromString(it)
      }
      .any {
        it == listenerComponent
      }
  }

  fun openAccessSettings(): Boolean {
    val listenerSettingsIntent =
      Intent(
        Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS,
      ).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

    return try {
      context.startActivity(
        listenerSettingsIntent,
      )

      true
    } catch (
      error: ActivityNotFoundException
    ) {
      openGeneralSettings()
    }
  }

  private fun openGeneralSettings(): Boolean {
    val settingsIntent =
      Intent(Settings.ACTION_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }

    return try {
      context.startActivity(settingsIntent)
      true
    } catch (
      error: ActivityNotFoundException
    ) {
      false
    }
  }

  companion object {
    private const val ENABLED_NOTIFICATION_LISTENERS =
      "enabled_notification_listeners"
  }
}