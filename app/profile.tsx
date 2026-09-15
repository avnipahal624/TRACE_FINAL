import Icon from "@react-native-vector-icons/material-design-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/auth";
import { spacing, useTheme } from "@/src/theme";

export default function Profile() {
  const { colors } = useTheme(); const insets = useSafeAreaInsets(); const router = useRouter(); const { user, logout } = useAuth();
  const [approximate, setApproximate] = useState(true); const [privateMode, setPrivateMode] = useState(false);
  useEffect(() => { void Promise.all([AsyncStorage.getItem("trace.privacy.approximate"), AsyncStorage.getItem("trace.privacy.private")]).then(([a,p]) => { if (a !== null) setApproximate(a !== "false"); if (p !== null) setPrivateMode(p === "true"); }); }, []);
  const save = (key: string, value: boolean) => { void AsyncStorage.setItem(key, String(value)); };
  const confirmLogout = () => Alert.alert("Sign out?", "Your saved drafts remain on this device.", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => { void logout(); router.replace("/login"); } }]);
  return <View style={{ flex: 1, backgroundColor: colors.surface }}><ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.xl, paddingBottom: insets.bottom + 40 }}>
    <Pressable onPress={() => router.back()} style={styles.back}><Icon name="arrow-left" size={22} color={colors.onSurface} /><Text style={{ color: colors.onSurface, fontWeight: "800" }}>Profile</Text></Pressable>
    <View style={[styles.hero, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}><View style={[styles.avatar, { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary }]}><Text style={{ color: colors.brandPrimary, fontSize: 24, fontWeight: "900" }}>{(user?.name || "T").slice(0,1).toUpperCase()}</Text></View><Text style={{ color: colors.onSurface, fontSize: 22, fontWeight: "900", marginTop: 12 }}>{user?.name || "TRACE user"}</Text><Text style={{ color: colors.muted, marginTop: 4 }}>{user?.email}</Text><Text style={{ color: colors.brandPrimary, fontSize: 11, fontWeight: "800", marginTop: 12, letterSpacing: 1 }}>{(user?.role || "citizen").toUpperCase()}</Text></View>
    <Text style={[styles.section, { color: colors.onSurface }]}>Privacy controls</Text>
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
      <Row title="Approximate location by default" note="Sensitive reports never expose exact coordinates publicly." value={approximate} onChange={(v: boolean) => { setApproximate(v); save("trace.privacy.approximate", v); }} colors={colors} />
      <Row title="Private reporting mode" note="Keep women-mode reports out of public previews." value={privateMode} onChange={(v: boolean) => { setPrivateMode(v); save("trace.privacy.private", v); }} colors={colors} />
    </View>
    <Pressable onPress={confirmLogout} style={[styles.signout, { borderColor: colors.error }]}><Icon name="logout" size={18} color={colors.error} /><Text style={{ color: colors.error, fontWeight: "800" }}>Sign out</Text></Pressable>
  </ScrollView></View>;
}
function Row({ title, note, value, onChange, colors }: any) { return <View style={styles.row}><View style={{ flex: 1 }}><Text style={{ color: colors.onSurface, fontWeight: "800" }}>{title}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>{note}</Text></View><Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.brandSecondary }} thumbColor={value ? colors.brandPrimary : colors.muted} /></View>; }
const styles = StyleSheet.create({ back: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 }, hero: { borderWidth: 1, borderRadius: 24, padding: 24 }, avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 1, alignItems: "center", justifyContent: "center" }, section: { fontSize: 14, fontWeight: "900", letterSpacing: 1, marginTop: 28, marginBottom: 10, textTransform: "uppercase" }, card: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 16 }, row: { flexDirection: "row", alignItems: "center", paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: "rgba(148,163,184,0.14)" }, signout: { marginTop: 28, borderWidth: 1, borderRadius: 999, paddingVertical: 14, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 } });
