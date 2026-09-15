import Icon from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing, useTheme } from "@/src/theme";

export default function Welcome() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]} testID="welcome-screen">
      <LinearGradient
        colors={["rgba(0,229,255,0.20)", "transparent"]}
        style={{ position: "absolute", top: -80, left: -80, width: 320, height: 320, borderRadius: 999 }}
      />
      <LinearGradient
        colors={["rgba(240,98,146,0.15)", "transparent"]}
        style={{ position: "absolute", bottom: -100, right: -100, width: 300, height: 300, borderRadius: 999 }}
      />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.xxl, paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }}>
        <View style={styles.brand}>
          <View style={[styles.logoBox, { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
            <Icon name="shield-check" size={18} color={colors.brandPrimary} />
          </View>
          <Text style={[styles.brandTxt, { color: colors.onSurface }]}>TRACE</Text>
        </View>
        <Text style={[styles.eyebrow, { color: colors.brandPrimary }]}>TRANSPARENT · ACCOUNTABLE · CIVIC</Text>
        <Text style={[styles.h1, { color: colors.onSurface }]}>Was it actually</Text>
        <Text style={[styles.h1, { color: colors.brandPrimary }]}>fixed?</Text>
        <Text style={[styles.sub, { color: colors.onSurfaceSecondary }]}>
          TRACE follows civic problems after the resolution button — until the outcome is verified with real evidence.
        </Text>

        <View style={{ height: spacing.xl }} />

        <Pressable
          testID="cta-signin"
          onPress={() => router.push("/login")}
          style={[styles.cta, { backgroundColor: colors.brandPrimary }]}
        >
          <Text style={[styles.ctaTxt, { color: colors.onBrandPrimary }]}>Sign in</Text>
          <Icon name="arrow-right" size={18} color={colors.onBrandPrimary} />
        </Pressable>
        <Pressable
          testID="cta-signup"
          onPress={() => router.push("/register")}
          style={[styles.cta2, { borderColor: colors.borderStrong }]}
        >
          <Text style={[styles.ctaTxt2, { color: colors.onSurface }]}>Create account</Text>
        </Pressable>

        <View style={[styles.hint, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.hintTitle, { color: colors.onSurface }]}>Demo accounts (password: demo1234)</Text>
          <Text style={[styles.hintLine, { color: colors.muted }]}>citizen@trace.demo · Citizen</Text>
          <Text style={[styles.hintLine, { color: colors.muted }]}>authority@trace.demo · Authority</Text>
          <Text style={[styles.hintLine, { color: colors.muted }]}>admin@trace.demo · Admin</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBox: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  brandTxt: { fontSize: 18, fontWeight: "800", letterSpacing: 2 },
  eyebrow: { marginTop: spacing.xl, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  h1: { fontSize: 44, fontWeight: "800", lineHeight: 48 },
  sub: { marginTop: spacing.lg, fontSize: 15, lineHeight: 22 },
  cta: { marginTop: spacing.lg, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  ctaTxt: { fontSize: 15, fontWeight: "800" },
  cta2: { marginTop: spacing.md, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", borderWidth: 1 },
  ctaTxt2: { fontSize: 15, fontWeight: "700" },
  hint: { marginTop: spacing.xxl, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, gap: 4 },
  hintTitle: { fontSize: 12, fontWeight: "800", letterSpacing: 0.5, marginBottom: 4 },
  hintLine: { fontSize: 12 },
});
