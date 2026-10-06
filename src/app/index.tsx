import { StyleSheet, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>mo-app</Text>
      <Text style={styles.subtitle}>Your hackathon app starts here.</Text>
      <Text style={styles.hint}>Edit src/app/index.tsx to build your first screen.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    padding: 24,
  },
  title: {
    color: "#0F172A",
    fontSize: 36,
    fontWeight: "700",
  },
  subtitle: {
    color: "#334155",
    fontSize: 18,
    marginTop: 12,
    textAlign: "center",
  },
  hint: {
    color: "#64748B",
    fontSize: 14,
    marginTop: 32,
    textAlign: "center",
  },
});
