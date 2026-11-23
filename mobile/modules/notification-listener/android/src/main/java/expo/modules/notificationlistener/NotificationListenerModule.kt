package expo.modules.notificationlistener

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.Instant
import java.util.UUID

class NotificationListenerModule : Module() {

  override fun definition() =
    ModuleDefinition {
      Name("NotificationListener")

      Function("getModuleName") {
        "NotificationListener"
      }

      AsyncFunction("pingAsync") {
        true
      }

      AsyncFunction(
        "setWalletMappingAsync",
      ) { sourceValue: String, walletIdValue: String ->
        val context = requireApplicationContext()
        val source = requireSource(sourceValue)

        val walletId =
          try {
            UUID
              .fromString(walletIdValue.trim())
              .toString()
          } catch (error: IllegalArgumentException) {
            throw IllegalArgumentException(
              "walletId must be a valid UUID",
            )
          }

        val mappingStore =
          WalletMappingStore(context)

        mappingStore.setWalletId(
          source = source,
          walletId = walletId,
        )

        val repository =
          NotificationQueueRepository(context)

        try {
          val promotedCount =
            repository.promoteWaitingItems(
              source = source,
              walletId = walletId,
              updatedAt = Instant.now().toString(),
            )

          mapOf(
            "source" to source.backendSource,
            "walletId" to walletId,
            "promotedCount" to promotedCount,
          )
        } finally {
          repository.close()
        }
      }

      AsyncFunction(
        "getWalletMappingsAsync",
      ) {
        WalletMappingStore(
          requireApplicationContext(),
        ).getAllMappings()
      }

      AsyncFunction(
        "getQueueCountsAsync",
      ) {
        val repository =
          NotificationQueueRepository(
            requireApplicationContext(),
          )

        try {
          repository.countByStatus()
        } finally {
          repository.close()
        }
      }
    }

  private fun requireApplicationContext(): Context {
    return appContext
      .reactContext
      ?.applicationContext
      ?: throw IllegalStateException(
        "Android application context is unavailable",
      )
  }

  private fun requireSource(
    value: String,
  ): SupportedSource {
    val normalized = value.trim().uppercase()

    return SupportedSource.entries
      .firstOrNull {
        it.backendSource == normalized
      }
      ?: throw IllegalArgumentException(
        "Unsupported source: $value",
      )
  }
}