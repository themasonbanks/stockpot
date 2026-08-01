import { StatusBar } from "expo-status-bar";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Stockpot</Text>
      <Text style={styles.tagline}>Make more of what you’ve got.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#f6f3ea",
    flex: 1,
    justifyContent: "center",
    padding: 24,
  },
  tagline: {
    color: "#40513b",
    fontSize: 18,
  },
  title: {
    color: "#183a2c",
    fontSize: 40,
    fontWeight: "700",
    marginBottom: 8,
  },
});
