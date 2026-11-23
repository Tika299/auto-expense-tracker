import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  AppState,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";

import NotificationListener from "../../modules/notification-listener/src/NotificationListenerModule";
import type { QueueCounts } from "../../modules/notification-listener/src/NotificationListener.types";

export default function NotificationAccessCard() {
  const [accessEnabled, setAccessEnabled] = useState<boolean | null>(null);

  const [collectionPaused, setCollectionPaused] = useState(false);

  const [queueCounts, setQueueCounts] = useState<QueueCounts | null>(null);

  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [access, paused, counts] = await Promise.all([
        NotificationListener.isNotificationAccessEnabledAsync(),
        NotificationListener.getCollectionPausedAsync(),
        NotificationListener.getQueueCountsAsync(),
      ]);

      setAccessEnabled(access);
      setCollectionPaused(paused);
      setQueueCounts(counts);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Không thể đọc trạng thái Notification Listener.");
    }
  }, []);

  useEffect(() => {
    const initialRefreshTimeout = setTimeout(() => {
      void refresh();
    }, 0);

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void refresh();
      }
    });

    return () => {
      clearTimeout(initialRefreshTimeout);
      subscription.remove();
    };
  }, [refresh]);

  const showAccessExplanation = () => {
    Alert.alert(
      "Cho phép đọc thông báo",
      [
        "Ứng dụng chỉ thu thập thông báo từ Vietcombank, MB Bank và MoMo.",
        "Thông báo được lưu tạm trên thiết bị để xử lý giao dịch.",
        "Bạn có thể tạm dừng việc thu thập bất cứ lúc nào.",
      ].join("\n\n"),
      [
        {
          text: "Hủy",
          style: "cancel",
        },
        {
          text: "Mở cài đặt",
          onPress: () => {
            void openAccessSettings();
          },
        },
      ],
    );
  };

  const openAccessSettings = async () => {
    try {
      const opened =
        await NotificationListener.openNotificationAccessSettingsAsync();

      if (!opened) {
        Alert.alert(
          "Không mở được cài đặt",
          "Hãy mở Cài đặt Android và tìm mục Quyền truy cập thông báo.",
        );
      }
    } catch {
      Alert.alert(
        "Không mở được cài đặt",
        "Hãy thử lại hoặc mở cài đặt Android thủ công.",
      );
    }
  };

  const changePausedState = async (nextPaused: boolean) => {
    setBusy(true);

    try {
      const savedPaused =
        await NotificationListener.setCollectionPausedAsync(nextPaused);

      setCollectionPaused(savedPaused);
      setErrorMessage(null);
    } catch {
      setErrorMessage("Không thể thay đổi trạng thái thu thập.");
    } finally {
      setBusy(false);
    }
  };

  const accessText =
    accessEnabled === null
      ? "Đang kiểm tra..."
      : accessEnabled
        ? "Đã cấp quyền"
        : "Chưa cấp quyền";

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Thu thập thông báo</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Quyền Notification Access</Text>

        <Text
          style={[
            styles.value,
            accessEnabled ? styles.success : styles.warning,
          ]}
        >
          {accessText}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={showAccessExplanation}
        style={styles.button}
      >
        <Text style={styles.buttonText}>Mở cài đặt quyền</Text>
      </Pressable>

      <View style={styles.switchRow}>
        <View style={styles.switchText}>
          <Text style={styles.label}>Tạm dừng thu thập</Text>

          <Text style={styles.description}>
            Khi bật, thông báo mới sẽ không được lưu.
          </Text>
        </View>

        <Switch
          disabled={busy}
          onValueChange={(value) => {
            void changePausedState(value);
          }}
          value={collectionPaused}
        />
      </View>

      <View style={styles.queue}>
        <Text style={styles.label}>Hàng đợi trên thiết bị</Text>

        <Text style={styles.description}>
          Chờ gắn ví: {queueCounts?.WAITING_WALLET ?? 0}
        </Text>

        <Text style={styles.description}>
          Sẵn sàng gửi: {queueCounts?.PENDING ?? 0}
        </Text>
      </View>

      {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 20,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    gap: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  row: {
    gap: 4,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1f2937",
  },
  value: {
    fontSize: 14,
  },
  success: {
    color: "#15803d",
  },
  warning: {
    color: "#b45309",
  },
  button: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#2563eb",
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#ffffff",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  switchText: {
    flex: 1,
    gap: 4,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: "#6b7280",
  },
  queue: {
    gap: 4,
  },
  error: {
    fontSize: 13,
    color: "#b91c1c",
  },
});
