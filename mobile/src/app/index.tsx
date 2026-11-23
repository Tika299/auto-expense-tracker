import { ScrollView, StyleSheet, Text } from "react-native";

import NotificationAccessCard from "../components/notification-access-card";

export default function HomeScreen() {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Auto Expense Tracker</Text>

      <Text style={styles.label}>Backend:</Text>

      <Text style={styles.value}>
        {apiBaseUrl ?? "Chưa cấu hình EXPO_PUBLIC_API_BASE_URL"}
      </Text>

      <NotificationAccessCard />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 16,
    backgroundColor: "#f3f4f6",
  },
  title: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: "700",
  },
  label: {
    fontSize: 14,
    color: "#555555",
  },
  value: {
    fontSize: 14,
    color: "#111111",
  },
});
