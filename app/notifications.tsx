import Icon from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { radius, spacing, useTheme } from "@/src/theme";

export default function Notifications() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [digest, setDigest] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [n, d] = await Promise.all([
        api<{ notifications: any[] }>("/notifications"),
        api<any>("/notifications/digest"),
      ]);
      setItems(Array.isArray(n?.notifications) ? n.notifications : []);
      setDigest(d);
    } catch {}
    setLoading(false);
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  async function open(n: any) {
    if (!n.read) {
      try { await api(`/notifications/${n.id}/read`, { method: "POST" }); } catch {}
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    }
    if (n.case_id) router.push(`/case/${n.case_id}`);
  }

  const digestTotal = digest ? (digest.new_cases + digest.outcomes_verified + digest.disputes + digest.recurrences + digest.checkpoints) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="notifications-screen">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable testID="notif-back" onPress={() => router.back()} style={{ padding: 4 }}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 18 }}>Notifications</Text>
      </View>
      <View style={{ paddingHorizontal: spacing.xl }}><OfflineBanner /></View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl, gap: 10 }}>
        {digest && digestTotal > 0 ? (
          <View style={[styles.digest, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, overflow: "hidden" }]} testID="digest-card">
            <LinearGradient colors={[colors.glow, "transparent"]} style={StyleSheet.absoluteFill} />
            <Text style={{ color: colors.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1 }}>THIS WEEK IN YOUR TRAIL</Text>
            <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 16, marginTop: 6 }}>
              {digest.new_cases} case{digest.new_cases === 1 ? "" : "s"} filed · {digest.outcomes_verified} outcome{digest.outcomes_verified === 1 ? "" : "s"} verified
            </Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <DigestPill icon="alert-circle-outline" v={digest.disputes} label="Disputes" color={colors.warning} bg="rgba(245,158,11,0.15)" />
              <DigestPill icon="restart-alert" v={digest.recurrences} label="Recurrences" color={colors.warning} bg="rgba(245,158,11,0.15)" />
              <DigestPill icon="flag-checkered" v={digest.checkpoints} label="Checkpoints" color={colors.info} bg="rgba(59,130,246,0.15)" />
            </View>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : items.length === 0 ? (
          <Text style={{ color: colors.muted, textAlign: "center", marginTop: 40 }} testID="notif-empty">No TRACE updates yet.</Text>
        ) : (
          items.map((n) => (
            <Pressable
              key={n.id}
              testID={`notif-${n.id}`}
              onPress={() => open(n)}
              style={[styles.row, { backgroundColor: colors.surfaceSecondary, borderColor: n.read ? colors.border : colors.brandPrimary }]}
            >
              <View style={[styles.dot, { backgroundColor: n.read ? colors.muted : colors.brandPrimary }]} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 14 }}>{n.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{n.body}</Text>
                <Text style={{ color: colors.muted, fontSize: 10, marginTop: 4 }}>{new Date(n.created_at).toLocaleString()}</Text>
              </View>
              {n.case_id ? <Icon name="chevron-right" size={20} color={colors.muted} /> : null}
            </Pressable>
          ))
        )}
      </ScrollView>
    </View>
  );
}

function DigestPill({ icon, v, label, color, bg }: any) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}>
      <Icon name={icon} size={14} color={color} />
      <Text style={{ color, fontWeight: "800", fontSize: 12 }}>{v} {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  dot: { width: 8, height: 8, borderRadius: 999 },
  digest: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
});
