package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import org.json.JSONArray
import org.json.JSONObject

enum class QueueEnqueueResult {
  INSERTED,
  ALREADY_EXISTS,
}

class NotificationQueueRepository(
  context: Context,
) {

  private val databaseHelper =
    NotificationQueueDatabase(
      context.applicationContext,
    )

  fun enqueue(
    notification: CapturedNotification,
    walletId: String?,
  ): QueueEnqueueResult {
    val normalizedWalletId =
      walletId
        ?.trim()
        ?.takeIf { it.isNotEmpty() }

    val initialStatus =
      if (normalizedWalletId == null) {
        QueueStatus.WAITING_WALLET
      } else {
        QueueStatus.PENDING
      }

    val values =
      ContentValues().apply {
        put(
          NotificationQueueDatabase.COLUMN_SOURCE_MESSAGE_ID,
          notification.sourceMessageId,
        )
        put(
          NotificationQueueDatabase.COLUMN_SOURCE,
          notification.source.backendSource,
        )
        put(
          NotificationQueueDatabase.COLUMN_CHANNEL,
          "ANDROID_NOTIFICATION",
        )
        put(
          NotificationQueueDatabase.COLUMN_PACKAGE_NAME,
          notification.packageName,
        )
        put(
          NotificationQueueDatabase.COLUMN_NOTIFICATION_KEY,
          notification.notificationKey,
        )
        put(
          NotificationQueueDatabase.COLUMN_NOTIFICATION_ID,
          notification.notificationId,
        )
        putNullable(
          NotificationQueueDatabase.COLUMN_CHANNEL_ID,
          notification.channelId,
        )
        putNullable(
          NotificationQueueDatabase.COLUMN_TITLE,
          notification.title,
        )
        putNullable(
          NotificationQueueDatabase.COLUMN_TEXT,
          notification.text,
        )
        putNullable(
          NotificationQueueDatabase.COLUMN_BIG_TEXT,
          notification.bigText,
        )
        putNullable(
          NotificationQueueDatabase.COLUMN_SUB_TEXT,
          notification.subText,
        )
        put(
          NotificationQueueDatabase.COLUMN_TEXT_LINES_JSON,
          JSONArray(notification.textLines).toString(),
        )
        put(
          NotificationQueueDatabase.COLUMN_NOTIFICATION_TIME,
          notification.notificationTime,
        )
        put(
          NotificationQueueDatabase.COLUMN_OBSERVED_AT,
          notification.observedAt,
        )
        put(
          NotificationQueueDatabase.COLUMN_RAW_TEXT,
          notification.rawText,
        )
        put(
          NotificationQueueDatabase.COLUMN_RAW_PAYLOAD_JSON,
          buildRawPayload(notification),
        )
        putNullable(
          NotificationQueueDatabase.COLUMN_WALLET_ID,
          normalizedWalletId,
        )
        put(
          NotificationQueueDatabase.COLUMN_STATUS,
          initialStatus.databaseValue,
        )
        put(
          NotificationQueueDatabase.COLUMN_ATTEMPT_COUNT,
          0,
        )
        put(
          NotificationQueueDatabase.COLUMN_CREATED_AT,
          notification.observedAt,
        )
        put(
          NotificationQueueDatabase.COLUMN_UPDATED_AT,
          notification.observedAt,
        )
      }

    val rowId =
      databaseHelper
        .writableDatabase
        .insertWithOnConflict(
          NotificationQueueDatabase.TABLE_QUEUE,
          null,
          values,
          SQLiteDatabase.CONFLICT_IGNORE,
        )

    return if (rowId == -1L) {
      QueueEnqueueResult.ALREADY_EXISTS
    } else {
      QueueEnqueueResult.INSERTED
    }
  }

  fun promoteWaitingItems(
    source: SupportedSource,
    walletId: String,
    updatedAt: String,
  ): Int {
    val values =
      ContentValues().apply {
        put(
          NotificationQueueDatabase.COLUMN_WALLET_ID,
          walletId,
        )
        put(
          NotificationQueueDatabase.COLUMN_STATUS,
          QueueStatus.PENDING.databaseValue,
        )
        put(
          NotificationQueueDatabase.COLUMN_UPDATED_AT,
          updatedAt,
        )
      }

    return databaseHelper
      .writableDatabase
      .update(
        NotificationQueueDatabase.TABLE_QUEUE,
        values,
        """
        ${NotificationQueueDatabase.COLUMN_SOURCE} = ?
        AND ${NotificationQueueDatabase.COLUMN_STATUS} = ?
        """.trimIndent(),
        arrayOf(
          source.backendSource,
          QueueStatus.WAITING_WALLET.databaseValue,
        ),
      )
  }

  fun countByStatus(): Map<String, Long> {
    val result =
      QueueStatus.entries.associate {
        it.databaseValue to 0L
      }.toMutableMap()

    databaseHelper
      .readableDatabase
      .query(
        NotificationQueueDatabase.TABLE_QUEUE,
        arrayOf(
          NotificationQueueDatabase.COLUMN_STATUS,
          "COUNT(*) AS item_count",
        ),
        null,
        null,
        NotificationQueueDatabase.COLUMN_STATUS,
        null,
        null,
      )
      .use { cursor ->
        val statusIndex =
          cursor.getColumnIndexOrThrow(
            NotificationQueueDatabase.COLUMN_STATUS,
          )

        val countIndex =
          cursor.getColumnIndexOrThrow("item_count")

        while (cursor.moveToNext()) {
          val status = cursor.getString(statusIndex)
          val count = cursor.getLong(countIndex)

          result[status] = count
        }
      }

    return result
  }

  fun close() {
    databaseHelper.close()
  }

  private fun buildRawPayload(
    notification: CapturedNotification,
  ): String {
    return JSONObject().apply {
      put("schemaVersion", 1)
      put("sourceMessageId", notification.sourceMessageId)
      put("packageName", notification.packageName)
      put("notificationKey", notification.notificationKey)
      put("notificationId", notification.notificationId)
      putNullable("channelId", notification.channelId)
      putNullable("title", notification.title)
      putNullable("text", notification.text)
      putNullable("bigText", notification.bigText)
      putNullable("subText", notification.subText)
      put(
        "textLines",
        JSONArray(notification.textLines),
      )
      put(
        "notificationTime",
        notification.notificationTime,
      )
      put("observedAt", notification.observedAt)
      put("rawText", notification.rawText)
    }.toString()
  }

  private fun ContentValues.putNullable(
    key: String,
    value: String?,
  ) {
    if (value == null) {
      putNull(key)
    } else {
      put(key, value)
    }
  }

  private fun JSONObject.putNullable(
    key: String,
    value: String?,
  ) {
    put(
      key,
      value ?: JSONObject.NULL,
    )
  }
}