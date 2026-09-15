import Icon from "@react-native-vector-icons/material-design-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { spacing, useTheme } from "../theme";

const STEPS = [
  { key: "REPORT", icon: "flag-outline" },
  { key: "ACTION", icon: "hammer-wrench" },
  { key: "PROOF", icon: "camera-outline" },
  { key: "OBSERVE", icon: "timer-sand" },
  { key: "OUTCOME", icon: "check-decagram-outline" },
];

export function TraceLine({ activeIndex, disputed = false }: { activeIndex: number; disputed?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} testID="trace-line">
      {STEPS.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        const bg = done ? colors.brandPrimary : active ? colors.brandTertiary : colors.surfaceTertiary;
        const fg = done ? colors.onBrandPrimary : active ? colors.onBrandTertiary : colors.muted;
        return (
          <React.Fragment key={s.key}>
            <View style={styles.step}>
              <View style={[styles.dot, { backgroundColor: bg, borderColor: active ? colors.brandPrimary : "transparent" }]}>
                <Icon name={s.icon as any} size={16} color={fg} />
              </View>
              <Text style={[styles.label, { color: active ? colors.onSurface : colors.muted }]}>{s.key}</Text>
            </View>
            {i < STEPS.length - 1 ? (
              <View style={[styles.bar, { backgroundColor: i < activeIndex ? colors.brandPrimary : colors.border }]} />
            ) : null}
          </React.Fragment>
        );
      })}
      {disputed ? (
        <View style={[styles.disputed, { borderColor: colors.warning }]}>
          <Text style={{ color: colors.warning, fontSize: 10, fontWeight: "700" }}>DISPUTED</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, position: "relative" },
  step: { alignItems: "center", width: 56 },
  dot: { width: 36, height: 36, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  label: { fontSize: 9, fontWeight: "700", marginTop: 6, letterSpacing: 0.5 },
  bar: { flex: 1, height: 2, marginHorizontal: -2, marginBottom: 16 },
  disputed: { position: "absolute", right: 0, top: 0, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
});
