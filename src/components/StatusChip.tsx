import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { radius, spacing, useTheme } from "../theme";

const MAP: Record<string, { bg: string; fg: string; label?: string }> = {};

export function StatusChip({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "good" | "warn" | "bad" | "info" | "brand" }) {
  const { colors } = useTheme();
  const map = {
    neutral: { bg: colors.surfaceTertiary, fg: colors.onSurfaceTertiary },
    good: { bg: "rgba(16,185,129,0.15)", fg: colors.success },
    warn: { bg: "rgba(245,158,11,0.15)", fg: colors.warning },
    bad: { bg: "rgba(239,68,68,0.15)", fg: colors.error },
    info: { bg: "rgba(59,130,246,0.15)", fg: colors.info },
    brand: { bg: colors.brandTertiary, fg: colors.onBrandTertiary },
  } as const;
  const t = map[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg }]} testID={`status-chip-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <Text style={[styles.txt, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, alignSelf: "flex-start" },
  txt: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
});
