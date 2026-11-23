package expo.modules.notificationlistener

import android.content.Context
import android.content.SharedPreferences

class WalletMappingStore(
  context: Context,
) {

  private val preferences: SharedPreferences =
    context.getSharedPreferences(
      PREFERENCES_NAME,
      Context.MODE_PRIVATE,
    )

  fun getWalletId(
    source: SupportedSource,
  ): String? {
    return preferences
      .getString(walletKey(source), null)
      ?.trim()
      ?.takeIf { it.isNotEmpty() }
  }

  fun setWalletId(
    source: SupportedSource,
    walletId: String,
  ) {
    require(walletId.isNotBlank()) {
      "walletId must not be blank"
    }

    preferences
      .edit()
      .putString(
        walletKey(source),
        walletId.trim(),
      )
      .apply()
  }

  fun getAllMappings(): Map<String, String> {
    return SupportedSource.entries
      .mapNotNull { source ->
        val walletId =
          getWalletId(source)
            ?: return@mapNotNull null

        source.backendSource to walletId
      }
      .toMap()
  }

  private fun walletKey(
    source: SupportedSource,
  ): String {
    return "wallet_id_${source.backendSource}"
  }

  companion object {
    private const val PREFERENCES_NAME =
      "notification_wallet_mappings"
  }
}