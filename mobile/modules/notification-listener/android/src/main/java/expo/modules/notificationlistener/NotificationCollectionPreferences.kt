package expo.modules.notificationlistener

import android.content.Context

class NotificationCollectionPreferences(
  context: Context,
) {
  private val preferences =
    context.getSharedPreferences(
      PREFERENCES_NAME,
      Context.MODE_PRIVATE,
    )

  fun isPaused(): Boolean {
    return preferences.getBoolean(
      KEY_COLLECTION_PAUSED,
      false,
    )
  }

  fun setPaused(paused: Boolean) {
    preferences
      .edit()
      .putBoolean(
        KEY_COLLECTION_PAUSED,
        paused,
      )
      .apply()
  }

  companion object {
    private const val PREFERENCES_NAME =
      "notification_collection_preferences"

    private const val KEY_COLLECTION_PAUSED =
      "collection_paused"
  }
}