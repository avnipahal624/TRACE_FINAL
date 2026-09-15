import { LinearGradient } from "expo-linear-gradient";
import Icon from "@react-native-vector-icons/material-design-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { radius, spacing, useTheme } from "../theme";

export function ModePill() {
  const { colors, mode } = useTheme();
  const setMode = require("../theme").setAppMode as (m: "civic" | "women") => void;
  return (
    <View style={[styles.pill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID="mode-pill">
      {(["civic", "women"] as const).map((m) => {
        const active = mode === m;
        return (
          <Pressable
            key={m}
            testID={`mode-${m}`}
            onPress={() => setMode(m)}
            style={styles.tab}
          >
            {active ? (
              <LinearGradient
                colors={m === "civic" ? ["#00E5FF", "#00C2D6"] : ["#F06292", "#C2185B"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.tabBg}
              />
            ) : null}
            <Icon name={m === "civic" ? "shield-check-outline" : "flower-outline"} size={14} color={active ? "#060B14" : colors.onSurfaceSecondary} />
            <Text style={[styles.tabTxt, { color: active ? "#060B14" : colors.onSurfaceSecondary }]}>
              {m === "civic" ? "Civic" : "Women"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    borderRadius: radius.pill,
    borderWidth: 1,
    padding: 4,
    alignSelf: "center",
    gap: 4,
  },
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    minWidth: 82,
    justifyContent: "center",
    overflow: "hidden",
  },
  tabBg: { ...StyleSheet.absoluteFill, borderRadius: radius.pill },
  tabTxt: { fontSize: 13, fontWeight: "700" },
});
