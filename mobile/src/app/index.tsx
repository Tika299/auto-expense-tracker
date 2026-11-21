import { StyleSheet, Text, View } from "react-native";

export default function HomeScreen() {
  const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Auto Expense Tracker</Text>

      <Text style={styles.status}>Fast Refresh đã hoạt động</Text>

      <Text style={styles.label}>Backend:</Text>
      <Text style={styles.value}>
        {apiBaseUrl ?? "Chưa cấu hình EXPO_PUBLIC_API_BASE_URL"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#f7f7f7",
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    marginBottom: 16,
  },
  status: {
    fontSize: 17,
    color: "#15803d",
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: "#555",
  },
  value: {
    marginTop: 4,
    fontSize: 14,
    color: "#111",
  },
});
