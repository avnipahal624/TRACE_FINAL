import Icon from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { radius, spacing, useTheme } from "@/src/theme";

export default function Memory() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [leader, setLeader] = useState<{ top: any[]; bottom: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [clusters, setClusters] = useState<Record<string, any>>({});

  useFocusEffect(useCallback(() => {
    setLoading(true);
    Promise.all([
      api<{ memory: any[] }>("/memory"),
      api<any>("/memory/leaderboard"),
    ]).then(([m, l]) => {
      setItems(Array.isArray(m?.memory) ? m.memory : []);
      setLeader({ top: Array.isArray(l?.top) ? l.top : [], bottom: Array.isArray(l?.bottom) ? l.bottom : [] });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []));

  async function toggle(area: string) {
    if (expanded === area) { setExpanded(null); return; }
    setExpanded(area);
    if (!clusters[area]) {
      try {
        const r = await api<any>(`/memory/cluster?area=${encodeURIComponent(area)}`);
        setClusters((prev) => ({ ...prev, [area]: r }));
      } catch {}
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="memory-screen">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Text style={[styles.h1, { color: colors.onSurface }]}>Civic Memory</Text>
        <Text style={{ color: colors.muted }}>Assets remembered across time — recurrence, coverage, outcomes.</Text>
        <OfflineBanner />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 140, gap: 12 }}>
        {loading ? <ActivityIndicator color={colors.brandPrimary} /> : null}

        {leader && (leader.top.length > 0 || leader.bottom.length > 0) ? (
          <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, overflow: "hidden" }]} testID="leaderboard">
            <LinearGradient colors={[colors.glow, "transparent"]} style={StyleSheet.absoluteFill} />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="podium-gold" size={18} color={colors.brandPrimary} />
              <Text style={{ color: colors.onSurface, fontWeight: "800" }}>Neighbourhood leaderboard</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>By outcome PASSED rate — pressure and praise where it lands.</Text>
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: "800", letterSpacing: 0.5 }}>TOP</Text>
              {leader.top.slice(0, 5).map((row, i) => (
                <View key={`t-${row.area}`} style={styles.rankRow}>
                  <Text style={[styles.rankNum, { color: colors.success }]}>#{i + 1}</Text>
                  <Text style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>{row.area}</Text>
                  <Text style={{ color: colors.success, fontWeight: "800" }}>{row.resolution_rate}%</Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 4 }}>{row.resolved}/{row.total}</Text>
                </View>
              ))}
              {leader.bottom.length ? (
                <>
                  <Text style={{ color: colors.warning, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginTop: 10 }}>NEEDS ATTENTION</Text>
                  {leader.bottom.slice(0, 3).map((row, i) => (
                    <View key={`b-${row.area}`} style={styles.rankRow}>
                      <Text style={[styles.rankNum, { color: colors.warning }]}>#{i + 1}</Text>
                      <Text style={{ color: colors.onSurface, flex: 1 }} numberOfLines={1}>{row.area}</Text>
                      <Text style={{ color: colors.warning, fontWeight: "800" }}>{row.resolution_rate}%</Text>
                      <Text style={{ color: colors.muted, fontSize: 11, marginLeft: 4 }}>{row.resolved}/{row.total}</Text>
                    </View>
                  ))}
                </>
              ) : null}
            </View>
          </View>
        ) : null}

        {items.length === 0 && !loading ? <Text style={{ color: colors.muted, textAlign: "center" }} testID="memory-empty">No civic memory yet.</Text> : null}

        {items.map((m) => (
          <View key={m.area} style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]} testID={`memory-${m.area}`}>
            <Pressable onPress={() => toggle(m.area)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }} testID={`toggle-${m.area}`}>
              <Icon name="map-marker-radius-outline" size={18} color={colors.brandPrimary} />
              <Text style={{ color: colors.onSurface, fontWeight: "800", flex: 1 }}>{m.area}</Text>
              <Icon name={expanded === m.area ? "chevron-up" : "chevron-down"} size={22} color={colors.muted} />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Stat label="Interventions" value={m.interventions} color={colors.onSurface} muted={colors.muted} />
              <Stat label="Recurrences" value={m.recurrences} color={colors.warning} muted={colors.muted} />
              <Stat label="Corrective" value={m.open_corrective} color={colors.error} muted={colors.muted} />
              <Stat label="Coverage" value={`${m.evidence_coverage}%`} color={colors.success} muted={colors.muted} />
            </View>
            {expanded === m.area ? (
              <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: colors.border, paddingTop: 12 }} testID={`cluster-${m.area}`}>
                <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginBottom: 6 }}>RECURRENCE CLUSTER</Text>
                {clusters[m.area]?.cases?.map((c: any, i: number) => (
                  <View key={c.id}>
                    <Pressable onPress={() => router.push(`/case/${c.id}`)} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8 }}>
                      <View style={{ alignItems: "center", width: 24, marginRight: 8 }}>
                        <View style={[styles.timelineDot, { backgroundColor: c.outcome === "PASSED" ? colors.success : c.outcome === "FAILED" ? colors.error : colors.brandPrimary }]} />
                        {i < (clusters[m.area]?.cases.length || 0) - 1 ? <View style={[styles.timelineBar, { backgroundColor: colors.border }]} /> : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text style={{ color: colors.brandPrimary, fontSize: 11, fontWeight: "800" }}>{c.case_number}</Text>
                          {c.timeline_events?.some((e: any) => e.type === "RECURRENCE_DETECTED") ? (
                            <View style={[styles.evTag, { borderColor: colors.warning }]}><Text style={{ color: colors.warning, fontSize: 9, fontWeight: "800" }}>RECURRENCE</Text></View>
                          ) : null}
                        </View>
                        <Text style={{ color: colors.onSurface, fontSize: 13 }} numberOfLines={1}>{c.title}</Text>
                        <Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(c.created_at).toLocaleDateString()} · {c.outcome || c.status}</Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={colors.muted} />
                    </Pressable>
                  </View>
                )) || <ActivityIndicator color={colors.brandPrimary} />}
              </View>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, color, muted }: any) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color, fontSize: 18, fontWeight: "800" }}>{value}</Text>
      <Text style={{ color: muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>{label.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: "800" },
  card: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  rankRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rankNum: { width: 26, fontWeight: "800", fontSize: 12 },
  timelineDot: { width: 10, height: 10, borderRadius: 999 },
  timelineBar: { width: 2, flex: 1, marginTop: 2, minHeight: 20 },
  evTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
});
