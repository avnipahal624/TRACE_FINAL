import Icon from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, useTheme } from "../theme";
import { StatusChip } from "./StatusChip";

export function CaseCard({ item, onPress }: { item: any; onPress?: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();

  const tone: any =
    item.outcome === "PASSED" ? "good" :
    item.outcome === "FAILED" ? "bad" :
    item.review_status === "DISPUTED" ? "warn" :
    item.status === "OBSERVATION" ? "info" :
    "neutral";
  const statusLabel = item.review_status === "DISPUTED" ? "DISPUTED" : (item.outcome || item.status);

  return (
    <Pressable
      testID={`case-card-${item.case_number}`}
      onPress={onPress || (() => router.push(`/case/${item.id}`))}
      style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}
    >
      <LinearGradient
        colors={[colors.glow, "transparent"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.rowTop}>
        <Text style={[styles.caseNo, { color: colors.brandPrimary }]}>{item.case_number}</Text>
        <StatusChip label={statusLabel} tone={tone} />
      </View>
      <Text numberOfLines={1} style={[styles.title, { color: colors.onSurface }]}>{item.title}</Text>
      <View style={styles.rowBottom}>
        <View style={styles.metaRow}>
          <Icon name="map-marker-outline" size={13} color={colors.muted} />
          <Text style={[styles.meta, { color: colors.muted }]} numberOfLines={1}>
            {(item.location && item.location.area) || "Location approximate"}
          </Text>
        </View>
        {item.observation ? (
          <Text style={[styles.obs, { color: colors.onSurfaceTertiary }]}>
            Obs · Day {item.observation.days_elapsed}/{item.observation.days_total}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    overflow: "hidden",
    gap: 8,
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  caseNo: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
  title: { fontSize: 16, fontWeight: "700" },
  rowBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1 },
  meta: { fontSize: 12 },
  obs: { fontSize: 11, fontWeight: "700" },
});
