import Icon from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { CaseCard } from "@/src/components/CaseCard";
import { ModePill } from "@/src/components/ModePill";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { radius, spacing, useTheme } from "@/src/theme";

export default function Home() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [cases, setCases] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [unread, setUnread] = useState(0);
  const [radar, setRadar] = useState<{ count: number; areas: any[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ cases: any[] }>(`/cases?mode=${mode}`);
      setCases(Array.isArray(r?.cases) ? r.cases : []);
    } catch { /* noop */ }
    try {
      const n = await api<{ notifications: any[] }>("/notifications");
      setUnread((Array.isArray(n?.notifications) ? n.notifications : []).filter((x: any) => !x.read).length);
    } catch { /* noop */ }
    try {
      const rd = await api<{ count: number; areas: any[] }>(`/memory/nearby?mode=${mode}`);
      setRadar(rd);
    } catch { /* noop */ }
    setLoading(false); setRefreshing(false);
  }, [mode]);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="home-screen">
      <LinearGradient colors={[colors.glow, "transparent"]} style={{ position: "absolute", top: -80, left: -80, width: 320, height: 320, borderRadius: 999 }} />

      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <View style={styles.top}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.logoBox, { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
              <Icon name="shield-check" size={16} color={colors.brandPrimary} />
            </View>
            <Text style={{ color: colors.onSurface, fontWeight: "800", letterSpacing: 2 }}>TRACE</Text>
          </View>
          <ModePill />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable testID="notifications-btn" onPress={() => router.push("/notifications")} style={styles.profileBtn}>
              <Icon name="bell-outline" size={22} color={colors.onSurface} />
              {unread > 0 ? (
                <View style={[styles.badge, { backgroundColor: colors.brandPrimary, borderColor: colors.surface }]} testID="notif-badge">
                  <Text style={{ color: colors.onBrandPrimary, fontSize: 9, fontWeight: "800" }}>{unread > 9 ? "9+" : String(unread)}</Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable testID="profile-btn" onPress={() => router.push("/profile" as any)} style={styles.profileBtn} accessibilityLabel="Open profile">
              <Icon name="account-circle-outline" size={26} color={colors.onSurface} />
            </Pressable>
          </View>
        </View>
        <OfflineBanner />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 140 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.brandPrimary} onRefresh={() => { setRefreshing(true); load(); }} />}
      >
        <Text style={[styles.eyebrow, { color: colors.brandPrimary }]}>
          {mode === "civic" ? "CIVIC MODE · TRANSPARENT RESOLUTION" : "WOMEN MODE · SAFE & PRIVATE"}
        </Text>
        <Text style={[styles.h1, { color: colors.onSurface }]}>Was it actually</Text>
        <Text style={[styles.h1, { color: colors.brandPrimary }]}>fixed?</Text>
        <Text style={[styles.sub, { color: colors.muted }]}>
          {mode === "civic"
            ? "Every case follows a verifiable trail — report, action, proof, observation, outcome."
            : "Report privately. Approximate location by default. Same TRACE outcome trail."}
        </Text>

        <View style={styles.row}>
          <Pressable testID="cta-report" onPress={() => router.push("/report")} style={[styles.ctaP, { backgroundColor: colors.brandPrimary }]}>
            <Icon name="plus-circle-outline" size={16} color={colors.onBrandPrimary} />
            <Text style={{ color: colors.onBrandPrimary, fontWeight: "800" }}>Report an issue</Text>
          </Pressable>
          {user?.role === "authority" || user?.role === "admin" ? (
            <Pressable testID="cta-authority" onPress={() => router.push("/authority")} style={[styles.ctaS, { borderColor: colors.borderStrong }]}>
              <Icon name="briefcase-outline" size={16} color={colors.onSurface} />
              <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Authority</Text>
            </Pressable>
          ) : null}
        </View>

        {mode === "women" ? (
          <Pressable testID="women-washrooms" onPress={() => router.push("/women/washrooms")} style={[styles.pillNav, { borderColor: colors.borderStrong }]}>
            <Icon name="human-female" size={18} color={colors.brandPrimary} />
            <Text style={{ color: colors.onSurface, fontWeight: "700", flex: 1, marginLeft: 8 }}>Public washrooms</Text>
            <Icon name="chevron-right" size={20} color={colors.muted} />
          </Pressable>
        ) : null}

        {radar && radar.count > 0 ? (
          <Pressable
            testID="radar-chip"
            onPress={() => router.push("/(tabs)/memory")}
            style={[styles.radar, { borderColor: colors.warning, backgroundColor: "rgba(245,158,11,0.10)" }]}
          >
            <Icon name="radar" size={16} color={colors.warning} />
            <Text style={{ color: colors.warning, fontWeight: "800", fontSize: 12, flex: 1, marginLeft: 6 }}>
              {radar.count} recurring issue{radar.count === 1 ? "" : "s"} near you · {radar.areas.slice(0, 2).map((a) => a.area).join(" · ")}
            </Text>
            <Icon name="chevron-right" size={18} color={colors.warning} />
          </Pressable>
        ) : null}

        <View style={{ marginTop: spacing.xl, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[styles.sect, { color: colors.onSurface }]}>In the field</Text>
          <Pressable onPress={() => router.push("/(tabs)/cases")}><Text style={{ color: colors.brandPrimary, fontSize: 13, fontWeight: "700" }}>See all</Text></Pressable>
        </View>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={colors.brandPrimary} />
        ) : cases.length === 0 ? (
          <Text style={{ color: colors.muted, marginTop: spacing.lg, textAlign: "center" }} testID="home-empty">No cases yet. Be the first to report.</Text>
        ) : (
          <View style={{ gap: 12, marginTop: spacing.md }}>
            {cases.slice(0, 5).map((c) => <CaseCard key={c.id} item={c} />)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  logoBox: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  profileBtn: { padding: 4 },
  badge: { position: "absolute", top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 999, paddingHorizontal: 4, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  eyebrow: { marginTop: spacing.lg, fontSize: 11, fontWeight: "800", letterSpacing: 2 },
  h1: { fontSize: 40, fontWeight: "800", lineHeight: 44 },
  sub: { marginTop: 8, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: "row", gap: 10, marginTop: spacing.lg },
  ctaP: { flex: 1, borderRadius: radius.pill, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  ctaS: { borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 12, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1 },
  pillNav: { marginTop: spacing.lg, flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingVertical: 14, borderRadius: radius.lg, borderWidth: 1 },
  radar: { marginTop: spacing.md, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  sect: { fontSize: 15, fontWeight: "800", letterSpacing: 0.5 },
});
