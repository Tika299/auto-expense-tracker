# Mobile Notification Ingestion Contract

Version: 1
Status: Approved
Last updated: 2026-11-09

## 1. Supported Android packages

| Android package           | Backend source | Verified |
| ------------------------- | -------------- | -------- |
| com.VCB                   | VIETCOMBANK    | Yes      |
| com.mbmobile              | MBBANK         | Yes      |
| com.mservice.momotransfer | MOMO           | Yes      |

### Package filtering rules

- Compare `packageName` using exact string matching.
- Ignore any notification whose package is not in the table above immediately.
- Out of scope: Techcombank (`com.vn.techcombank.bb.app`) is excluded from the current scope.
- MoMo Android notification collection currently supports incoming transactions only. Outgoing MoMo transactions require another input method, such as share receipt or manual entry.

## 2. API endpoints

- **Development base URL (USB `adb reverse`):** `http://127.0.0.1:3000/api/v1`
- **Development base URL (LAN Wi-Fi):** `http://<PC_LAN_IP>:3000/api/v1`
- **Production base URL:** TBD - HTTPS required
- **Observation endpoint:** `POST /observations` (Full path: `POST /api/v1/observations`)

## 3. Request payload schema

```json
{
  "walletId": "UUID_OF_MAPPED_WALLET",
  "source": "MOMO",
  "channel": "ANDROID_NOTIFICATION",
  "sourceMessageId": "64_CHAR_HEX_SHA256",
  "rawText": "Nhận chuyển khoản từ NGUYEN VAN A\nSố tiền 5.000 ₫ về Túi Thần Tài.",
  "rawPayload": {
    "schemaVersion": 1,
    "packageName": "com.mservice.momotransfer",
    "notificationKey": "0|com.mservice.momotransfer|0|null|10123",
    "notificationId": 0,
    "channelId": "com.google.firebase.messaging.default_notification_channel_id",
    "title": "Nhận chuyển khoản từ NGUYEN VAN A",
    "text": "Số tiền 5.000 ₫ về Túi Thần Tài.",
    "bigText": "Số tiền 5.000 ₫ về Túi Thần Tài.",
    "subText": null,
    "textLines": [],
    "notificationTime": "2026-11-09T09:59:00.223Z",
    "observedAt": "2026-11-09T09:59:00.236Z"
  },
  "observedAt": "2026-11-09T09:59:00.236Z"
}
```

### Timestamp rules

- `notificationTime` must be created with `Instant.ofEpochMilli(sbn.postTime).toString()`.
- `observedAt` must be created once when captured using `Instant.now().toString()`.
- The top-level `observedAt` and `rawPayload.observedAt` must use the exact same timestamp value.

## 4. `sourceMessageId` generation

### Algorithm

`SHA-256(packageName + "|" + notificationKey + "|" + postTime)`

### Rules

- Use an empty string (`""`) if `notificationKey` is unavailable.
- Encode the input string using UTF-8 before hashing.
- Store the resulting hash as a lowercase hexadecimal string (64 characters).
- The ID is created once when the notification is captured and stored together with the offline queue item.
- Retries must reuse the stored ID; a retry must never generate a new `sourceMessageId`.
- `notificationId` alone must not be used.

## 5. `rawText` construction rules

1. Take `title.trim()`.
2. Prefer `bigText.trim()` if non-empty; otherwise fall back to `text.trim()`.
3. Append any lines in `textLines` that are not already present in the body.
4. Join `title` and `body` with `\n`.
5. Keep Vietnamese diacritics, casing, currency symbols, `+`, `-`, `.`, and `,` intact.
6. **Local rejection:** Reject the capture locally if the final `rawText` is empty or blank.

## 6. Wallet mapping

Each source (`VIETCOMBANK`, `MBBANK`, `MOMO`) must be explicitly mapped to a backend `walletId` by the user after fetching `GET /api/v1/wallets`.

If no mapping exists:

1. Capture the notification.
2. Save it locally in SQLite as `WAITING_WALLET`.
3. Do not send it to the backend.
4. Resume synchronization (change status to `PENDING`) after the user selects a wallet.

## 7. Authentication decision & Token access boundary

### MVP strategy

- Store access token securely in `expo-secure-store`.
- Stop synchronization on HTTP `401 Unauthorized` and mark items as `AUTH_REQUIRED`.
- Keep all queued observations in SQLite.
- Ask the user to sign in again and resume the queue after authentication succeeds.

### Token access boundary

- API synchronization is performed exclusively by the Expo/JavaScript layer, which reads the access token from `expo-secure-store`.
- The native notification listener only captures notifications and writes them to the local offline queue. It must **never** receive, handle, or log the access token.

### Production requirement

- Add refresh-token rotation or a scoped device ingestion token before
  production release.

## 8. Offline SQLite queue states & Retry policy

| Queue Status         | Meaning                                                                    |
| -------------------- | -------------------------------------------------------------------------- |
| `PENDING`            | Captured and mapped to a wallet, ready to send                             |
| `WAITING_WALLET`     | Source has not been mapped to a wallet yet (or HTTP 404 on wallet)         |
| `SENDING`            | Request currently in flight                                                |
| `RETRY_WAIT`         | Network failure or HTTP error, waiting for backoff retry                   |
| `AUTH_REQUIRED`      | Received HTTP 401, waiting for user re-authentication                      |
| `SENT`               | HTTP 201 with `duplicate: false`                                           |
| `SENT_DUPLICATE`     | HTTP 201 with `duplicate: true` (treated as success, stop retrying)        |
| `DELIVERED_REJECTED` | HTTP 422 `UNSUPPORTED_FORMAT` (saved on server as REJECTED, stop retrying) |
| `DEAD_LETTER`        | HTTP 400 malformed payload, requires manual inspection                     |

### Queue recovery rules

- Store `lastAttemptAt` and increment `attemptCount` before sending.
- If an item remains stuck in `SENDING` for more than 10 minutes (e.g. app crash during request), automatically change its status to `RETRY_WAIT`.
- Retrying must reuse the original `sourceMessageId`.
- A network timeout is treated as an unknown delivery result and routed to `RETRY_WAIT`.

### Retry policy

- **HTTP 429:** Move to `RETRY_WAIT`; respect the `Retry-After` header when available.
- **Network timeout / HTTP 500–599:** Move to `RETRY_WAIT`.
- **Backoff mechanism:** Calculate the retry delay using
  `min(30 seconds × 2^(attemptCount - 1), 1 hour)`.
- **Non-retriable errors:** HTTP 400 (Bad Request) and HTTP 422 (Unprocessable Entity) must **not** be retried automatically (moved to `DEAD_LETTER` or `DELIVERED_REJECTED`).

## 9. Privacy and logging

- Never write raw notification content or sensitive financial text to Logcat in production.
- Never include raw financial content in analytics.
- Never store access tokens in SQLite.
- Ignore notifications from unsupported packages.
- Do not upload screenshots or notification content without user consent.
- Provide a setting to pause notification collection.
- Display a clear explanation before opening Android notification-access settings.
