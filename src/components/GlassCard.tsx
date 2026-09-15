import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet, View, ViewProps } from "react-native";
import { radius, useTheme } from "../theme";

export function GlassCard({ style, children, ...rest }: ViewProps) {
  const { colors } = useTheme();
  if (Platform.OS === "web") {
    return (
      <View
        {...rest}
        style={[
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: radius.lg,
            overflow: "hidden",
          },
          style,
        ]}
      >
        {children}
      </View>
    );
  }
  return (
    <View
      {...rest}
      style={[
        {
          borderRadius: radius.lg,
          overflow: "hidden",
          borderColor: colors.border,
          borderWidth: 1,
          backgroundColor: colors.surfaceSecondary + "CC",
        },
        style,
      ]}
    >
      <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}
