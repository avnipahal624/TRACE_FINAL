import Icon from "@react-native-vector-icons/material-design-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { radius, spacing, useTheme } from "@/src/theme";

const ROLES: { key: "citizen" | "authority" | "admin"; label: string; sub: string }[] = [
  { key: "citizen", label: "Citizen", sub: "Report and track civic issues" },
  { key: "authority", label: "Authority", sub: "Respond, intervene, submit proof" },
  { key: "admin", label: "Admin", sub: "System oversight" },
];

export default function Register() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<"citizen" | "authority" | "admin">("citizen");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setErr(null);
    try {
      await register(email.trim(), pw, name.trim(), role);
      router.replace("/(tabs)/home");
    } catch (e: any) { setErr(e.message || "Registration failed"); }
    finally { setBusy(false); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xxl }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, alignSelf: "flex-start" }} testID="back-btn">
            <Icon name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={[styles.h1, { color: colors.onSurface }]}>Create your TRACE account</Text>

          <View style={{ height: spacing.lg }} />
          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Choose role</Text>
          <View style={{ gap: 8 }}>
            {ROLES.map((r) => {
              const active = role === r.key;
              return (
                <Pressable
                  key={r.key}
                  testID={`role-${r.key}`}
                  onPress={() => setRole(r.key)}
                  style={[styles.role, { borderColor: active ? colors.brandPrimary : colors.border, backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.onSurface, fontWeight: "700" }}>{r.label}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{r.sub}</Text>
                  </View>
                  {active ? <Icon name="check-circle" size={20} color={colors.brandPrimary} /> : null}
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Name</Text>
          <TextInput testID="name-input" value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={colors.muted}
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]} />

          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Email</Text>
          <TextInput testID="email-input" value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={colors.muted}
            autoCapitalize="none" keyboardType="email-address"
            style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]} />

          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Password (min 6)</Text>
          <TextInput testID="password-input" value={pw} onChangeText={setPw} placeholder="••••••••" placeholderTextColor={colors.muted}
            secureTextEntry style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]} />

          {err ? <Text style={{ color: colors.error, marginTop: 8 }} testID="register-error">{err}</Text> : null}

          <Pressable testID="register-submit-button" disabled={busy} onPress={submit} style={[styles.cta, { backgroundColor: colors.brandPrimary, opacity: busy ? 0.6 : 1 }]}>
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={[styles.ctaTxt, { color: colors.onBrandPrimary }]}>Create account</Text>}
          </Pressable>

          <Pressable testID="go-login" onPress={() => router.replace("/login")} style={{ marginTop: spacing.lg, alignItems: "center" }}>
            <Text style={{ color: colors.muted }}>Already have an account? <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Sign in</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 24, fontWeight: "800", marginTop: spacing.lg, marginBottom: spacing.md },
  label: { marginTop: spacing.lg, marginBottom: 6, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  role: { borderWidth: 1, borderRadius: radius.md, padding: spacing.lg, flexDirection: "row", alignItems: "center" },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14, fontSize: 15 },
  cta: { marginTop: spacing.xl, borderRadius: radius.pill, paddingVertical: 14, alignItems: "center" },
  ctaTxt: { fontSize: 15, fontWeight: "800" },
});
