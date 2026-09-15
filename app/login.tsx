import Icon from "@react-native-vector-icons/material-design-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { radius, spacing, useTheme } from "@/src/theme";

export default function Login() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("citizen@trace.demo");
  const [pw, setPw] = useState("demo1234");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await login(email.trim(), pw);
      router.replace("/(tabs)/home");
    } catch (e: any) { setErr(e.message || "Login failed"); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, alignSelf: "flex-start" }} testID="back-btn">
            <Icon name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={[styles.h1, { color: colors.onSurface }]}>Welcome back</Text>
          <Text style={[styles.sub, { color: colors.muted }]}>Sign in to your TRACE account.</Text>

          <View style={{ height: spacing.xl }} />
          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Email</Text>
          <TextInput
            testID="email-input"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]}
          />
          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Password</Text>
          <TextInput
            testID="password-input"
            value={pw}
            onChangeText={setPw}
            placeholder="••••••••"
            placeholderTextColor={colors.muted}
            secureTextEntry
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]}
          />

          {err ? <Text style={{ color: colors.error, marginTop: 8 }} testID="login-error">{err}</Text> : null}

          <Pressable testID="login-submit-button" disabled={busy} onPress={submit} style={[styles.cta, { backgroundColor: colors.brandPrimary, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={[styles.ctaTxt, { color: colors.onBrandPrimary }]}>Sign in</Text>}
          </Pressable>

          <Pressable testID="go-register" onPress={() => router.replace("/register")} style={{ marginTop: spacing.lg, alignItems: "center" }}>
            <Text style={{ color: colors.muted }}>Don&apos;t have an account? <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Create one</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: "800", marginTop: spacing.lg },
  sub: { marginTop: 4, fontSize: 14 },
  label: { marginTop: spacing.lg, marginBottom: 6, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 15 },
  cta: { marginTop: spacing.xl, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  ctaTxt: { fontSize: 15, fontWeight: "800" },
});
