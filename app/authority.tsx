import Icon from "@react-native-vector-icons/material-design-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { CaseCard } from "@/src/components/CaseCard";
import { spacing, useTheme } from "@/src/theme";

export default function Authority() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    const q = filter ? `&status_filter=${filter}` : "";
    api<{ cases: any[] }>(`/cases?${q.slice(1)}`).then(r => setCases(r.cases)).catch(() => {}).finally(() => setLoading(false));
  }, [filter]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="authority-screen">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable testID="back-btn" onPress={() => router.back()} style={{ padding: 4 }}><Icon name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 18 }}>Authority console</Text>
      </View>
      <View style={{ paddingHorizontal: spacing.xl, marginTop: spacing.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {[null, "SUBMITTED", "OBSERVATION", "DISPUTED", "RESOLVED", "REOPENED"].map((f) => (
            <Pressable key={String(f)} testID={`filter-${f || "all"}`} onPress={() => setFilter(f)}
              style={[styles.chip, { borderColor: filter === f ? colors.brandPrimary : colors.border, backgroundColor: filter === f ? colors.brandTertiary : colors.surfaceSecondary }]}>
              <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 12 }}>{f || "ALL"}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl, gap: 12 }}>
        {loading ? <ActivityIndicator color={colors.brandPrimary} /> :
          cases.length === 0 ? <Text style={{ color: colors.muted, textAlign: "center" }}>No cases match this filter.</Text> :
          cases.map(c => <CaseCard key={c.id} item={c} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, flexShrink: 0 },
});
