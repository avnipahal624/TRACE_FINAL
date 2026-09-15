import Icon from "@react-native-vector-icons/material-design-icons";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { radius, spacing, useTheme } from "@/src/theme";

const ICONS: Record<string, string> = {
  CASE_CREATED: "flag-outline",
  INTERVENTION_SUBMITTED: "hammer-wrench",
  OBSERVATION_STARTED: "timer-sand",
  OBSERVATION_ADVANCED: "timer-sand-empty",
  CITIZEN_CHALLENGE: "alert-circle-outline",
  CITIZEN_ACCEPT: "check-circle-outline",
  OUTCOME_REVIEWED: "check-decagram-outline",
  CORRECTIVE_OBLIGATION_CREATED: "restart",
  INTEGRITY_ANCHORED: "shield-lock-outline",
};

export default function Activity() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api<{ events: any[] }>("/activity").then(r => setEvents(r.events)).catch(() => {}).finally(() => setLoading(false));
  }, []));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="activity-screen">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Text style={[styles.h1, { color: colors.onSurface }]}>Activity</Text>
        <Text style={{ color: colors.muted }}>Every important state change is recorded.</Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 140, gap: 10 }}>
        {loading ? <ActivityIndicator color={colors.brandPrimary} /> :
          events.length === 0 ? <Text style={{ color: colors.muted, textAlign: "center" }} testID="activity-empty">No activity yet.</Text> :
          events.map((e) => (
            <Pressable
              key={e.id}
              testID={`activity-${e.id}`}
              onPress={() => e.case && router.push(`/case/${e.case_id}`)}
              style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
            >
              <View style={[styles.icon, { backgroundColor: colors.brandTertiary }]}>
                <Icon name={(ICONS[e.type] as any) || "circle-small"} size={18} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 13 }}>{e.type.replace(/_/g, " ")}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
                  {e.case ? `${e.case.case_number} · ${e.case.title}` : "—"}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 2, fontFamily: "monospace" }} numberOfLines={1}>
                  {e.hash?.slice(0, 12)}… · {new Date(e.created_at).toLocaleString()}
                </Text>
              </View>
            </Pressable>
          ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: "800" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  icon: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center" },
});
