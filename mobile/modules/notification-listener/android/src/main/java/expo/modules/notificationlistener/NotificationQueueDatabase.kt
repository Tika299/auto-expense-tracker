package expo.modules.notificationlistener

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

internal class NotificationQueueDatabase(
  context: Context,
) : SQLiteOpenHelper(
  context,
  DATABASE_NAME,
  null,
  DATABASE_VERSION,
) {

  init {
    setWriteAheadLoggingEnabled(true)
  }

  override fun onCreate(database: SQLiteDatabase) {
    database.execSQL(CREATE_QUEUE_TABLE)
    database.execSQL(CREATE_STATUS_INDEX)
    database.execSQL(CREATE_RETRY_INDEX)
  }

  override fun onUpgrade(
    database: SQLiteDatabase,
    oldVersion: Int,
    newVersion: Int,
  ) {
    /*
     * Tuyệt đối không DROP bảng hàng đợi.
     *
     * Khi tăng DATABASE_VERSION, phải viết migration tương ứng
     * để không làm mất thông báo tài chính chưa đồng bộ.
     */
    throw IllegalStateException(
      "Missing notification queue migration " +
        "from $oldVersion to $newVersion",
    )
  }

  override fun onDowngrade(
    database: SQLiteDatabase,
    oldVersion: Int,
    newVersion: Int,
  ) {
    throw IllegalStateException(
      "Notification queue downgrade is not supported: " +
        "$oldVersion to $newVersion",
    )
  }

  companion object {
    const val DATABASE_NAME =
      "notification_queue.db"

    const val DATABASE_VERSION = 1

    const val TABLE_QUEUE =
      "notification_queue"

    const val COLUMN_ID = "id"
    const val COLUMN_SOURCE_MESSAGE_ID = "source_message_id"
    const val COLUMN_SOURCE = "source"
    const val COLUMN_CHANNEL = "channel"
    const val COLUMN_PACKAGE_NAME = "package_name"
    const val COLUMN_NOTIFICATION_KEY = "notification_key"
    const val COLUMN_NOTIFICATION_ID = "notification_id"
    const val COLUMN_CHANNEL_ID = "channel_id"
    const val COLUMN_TITLE = "title"
    const val COLUMN_TEXT = "text"
    const val COLUMN_BIG_TEXT = "big_text"
    const val COLUMN_SUB_TEXT = "sub_text"
    const val COLUMN_TEXT_LINES_JSON = "text_lines_json"
    const val COLUMN_NOTIFICATION_TIME = "notification_time"
    const val COLUMN_OBSERVED_AT = "observed_at"
    const val COLUMN_RAW_TEXT = "raw_text"
    const val COLUMN_RAW_PAYLOAD_JSON = "raw_payload_json"
    const val COLUMN_WALLET_ID = "wallet_id"
    const val COLUMN_STATUS = "status"
    const val COLUMN_ATTEMPT_COUNT = "attempt_count"
    const val COLUMN_NEXT_ATTEMPT_AT = "next_attempt_at"
    const val COLUMN_LAST_ATTEMPT_AT = "last_attempt_at"
    const val COLUMN_LAST_HTTP_STATUS = "last_http_status"
    const val COLUMN_LAST_ERROR_CODE = "last_error_code"
    const val COLUMN_SERVER_OBSERVATION_ID =
      "server_observation_id"
    const val COLUMN_CREATED_AT = "created_at"
    const val COLUMN_UPDATED_AT = "updated_at"

    private val CREATE_QUEUE_TABLE =
      """
      CREATE TABLE $TABLE_QUEUE (
        $COLUMN_ID INTEGER PRIMARY KEY AUTOINCREMENT,
        $COLUMN_SOURCE_MESSAGE_ID TEXT NOT NULL UNIQUE,
        $COLUMN_SOURCE TEXT NOT NULL
          CHECK ($COLUMN_SOURCE IN (
            'VIETCOMBANK',
            'MBBANK',
            'MOMO'
          )),
        $COLUMN_CHANNEL TEXT NOT NULL
          CHECK ($COLUMN_CHANNEL = 'ANDROID_NOTIFICATION'),
        $COLUMN_PACKAGE_NAME TEXT NOT NULL,
        $COLUMN_NOTIFICATION_KEY TEXT NOT NULL,
        $COLUMN_NOTIFICATION_ID INTEGER NOT NULL,
        $COLUMN_CHANNEL_ID TEXT,
        $COLUMN_TITLE TEXT,
        $COLUMN_TEXT TEXT,
        $COLUMN_BIG_TEXT TEXT,
        $COLUMN_SUB_TEXT TEXT,
        $COLUMN_TEXT_LINES_JSON TEXT NOT NULL,
        $COLUMN_NOTIFICATION_TIME TEXT NOT NULL,
        $COLUMN_OBSERVED_AT TEXT NOT NULL,
        $COLUMN_RAW_TEXT TEXT NOT NULL,
        $COLUMN_RAW_PAYLOAD_JSON TEXT NOT NULL,
        $COLUMN_WALLET_ID TEXT,
        $COLUMN_STATUS TEXT NOT NULL
          CHECK ($COLUMN_STATUS IN (
            'PENDING',
            'WAITING_WALLET',
            'SENDING',
            'RETRY_WAIT',
            'AUTH_REQUIRED',
            'SENT',
            'SENT_DUPLICATE',
            'DELIVERED_REJECTED',
            'DEAD_LETTER'
          )),
        $COLUMN_ATTEMPT_COUNT INTEGER NOT NULL DEFAULT 0,
        $COLUMN_NEXT_ATTEMPT_AT TEXT,
        $COLUMN_LAST_ATTEMPT_AT TEXT,
        $COLUMN_LAST_HTTP_STATUS INTEGER,
        $COLUMN_LAST_ERROR_CODE TEXT,
        $COLUMN_SERVER_OBSERVATION_ID TEXT,
        $COLUMN_CREATED_AT TEXT NOT NULL,
        $COLUMN_UPDATED_AT TEXT NOT NULL
      )
      """.trimIndent()

    private val CREATE_STATUS_INDEX =
      """
      CREATE INDEX notification_queue_status_idx
      ON $TABLE_QUEUE (
        $COLUMN_STATUS,
        $COLUMN_CREATED_AT
      )
      """.trimIndent()

    private val CREATE_RETRY_INDEX =
      """
      CREATE INDEX notification_queue_retry_idx
      ON $TABLE_QUEUE (
        $COLUMN_STATUS,
        $COLUMN_NEXT_ATTEMPT_AT
      )
      """.trimIndent()
  }
}