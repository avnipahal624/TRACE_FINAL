import Icon from "@react-native-vector-icons/material-design-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { radius, spacing, useTheme } from "@/src/theme";

function status(v: string) {
  switch (v) {
    case "verified": return { icon: "check-circle", color: "#10B981", label: "Verified" };
    case "review": return { icon: "alert-circle-outline", color: "#F59E0B", label: "Needs review" };
    case "issue": return { icon: "close-circle-outline", color: "#EF4444", label: "Reported issue" };
    case "empty": return { icon: "close-circle-outline", color: "#EF4444", label: "Empty" };
    case "not_recent": return { icon: "circle-outline", color: "#64748B", label: "Not recently verified" };
    default: return { icon: "circle-outline", color: "#64748B", label: v };
  }
}

export default function Washrooms() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ washrooms: any[] }>("/washrooms").then(r => setItems(r.washrooms)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="washrooms-screen">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={{ padding: 4 }}><Icon name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 18 }}>Public Washrooms</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl, gap: 12 }}>
        <Text style={{ color: colors.muted }}>Status is evidence-based and reported by citizens. Approximate locations only.</Text>
        {loading ? <ActivityIndicator color={colors.brandPrimary} /> :
          items.map((w) => (
            <View key={w.id} style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 15 }}>{w.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>~{w.distance_m} m · Last verified {new Date(w.last_verified).toLocaleDateString()}</Text>
                </View>
                <Icon name="human-female" size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
              {[
                { label: "Cleanliness", v: w.cleanliness },
                { label: "Sanitary pad dispenser", v: w.pad_dispenser },
                { label: "Water", v: w.water },
                { label: "Accessibility", v: w.accessibility },
              ].map((r) => {
                const s = status(r.v);
                return (
                  <View key={r.label} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
                    <Icon name={s.icon as any} size={16} color={s.color} />
                    <Text style={{ color: colors.onSurface, fontSize: 13, marginLeft: 8, flex: 1 }}>{r.label}</Text>
                    <Text style={{ color: s.color, fontSize: 12, fontWeight: "700" }}>{s.label}</Text>
                  </View>
                );
              })}
              <Pressable testID={`report-issue-${w.id}`} onPress={() => router.push("/report")} style={[styles.btn, { borderColor: colors.borderStrong, marginTop: 10 }]}>
                <Icon name="flag-outline" size={16} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Report an issue here</Text>
              </Pressable>
            </View>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  btn: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8, borderRadius: 999, borderWidth: 1, paddingVertical: 10 },
});
