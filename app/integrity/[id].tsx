import Icon from "@react-native-vector-icons/material-design-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { radius, spacing, useTheme } from "@/src/theme";

export default function Integrity() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api(`/integrity/${id}`);
    setData(r);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function anchor() {
    setBusy(true);
    try { await api(`/integrity/${id}/anchor`, { method: "POST" }); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  if (!data) return <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const anchored = data.events?.some((e: any) => e.anchored);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="integrity-screen">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable testID="integrity-back" onPress={() => router.back()} style={{ padding: 4 }}><Icon name="arrow-left" size={22} color={colors.onSurface} /></Pressable>
        <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 18 }}>Trace Integrity</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>A tamper-evident record of every important case decision.</Text>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name={data.verified ? "shield-check" : "shield-alert-outline"} size={18} color={data.verified ? colors.success : colors.warning} />
            <Text style={{ color: colors.onSurface, fontWeight: "800" }}>{data.verified ? "Integrity verified" : "Integrity broken"}</Text>
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
          <KV k="Case" v={`${data.case.case_number} · ${data.case.title}`} colors={colors} mono={false} />
          <KV k="Events" v={String(data.event_count)} colors={colors} mono={false} />
          <KV k="Last hash" v={data.last_hash ? data.last_hash.slice(0, 24) + "…" : "—"} colors={colors} mono />
          <KV k="Last committed" v={data.last_committed ? new Date(data.last_committed).toLocaleString() : "—"} colors={colors} mono={false} />
          <KV k="Network" v={data.network} colors={colors} mono={false} />
          <KV k="Anchored" v={anchored ? "YES" : "NO"} colors={colors} mono={false} />

          {(user?.role === "authority" || user?.role === "admin") ? (
            <Pressable testID="anchor-btn" disabled={busy} onPress={anchor} style={[styles.btn, { backgroundColor: colors.brandPrimary, marginTop: 12 }]}>
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={{ color: colors.onBrandPrimary, fontWeight: "800" }}>Anchor integrity</Text>}
            </Pressable>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>{data.note}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border, marginTop: spacing.lg }]}>
          <Text style={{ color: colors.onSurface, fontWeight: "800", marginBottom: 8 }}>WHAT IT PROTECTS</Text>
          {["Event history", "Evidence commitments", "State transitions", "Outcome/review history"].map(x => (
            <Text key={x} style={{ color: colors.success, marginBottom: 4 }}>✓ {x}</Text>
          ))}
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: 10 }} />
          <Text style={{ color: colors.onSurface, fontWeight: "800", marginBottom: 8 }}>WHAT STAYS OFF-CHAIN</Text>
          {["Personal information", "Raw photos/videos", "Sensitive safety information", "Private locations"].map(x => (
            <Text key={x} style={{ color: colors.brandPrimary, marginBottom: 4 }}>✓ {x}</Text>
          ))}
        </View>

        <Text style={{ color: colors.onSurface, fontWeight: "800", marginTop: spacing.xl, marginBottom: 8 }}>EVENT CHAIN</Text>
        {data.events.map((e: any) => (
          <View key={e.id} style={[styles.event, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 11 }}>#{e.seq} · {e.type}</Text>
              <Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(e.created_at).toLocaleTimeString()}</Text>
            </View>
            <Text style={{ color: colors.muted, fontSize: 10, fontFamily: "monospace", marginTop: 4 }}>hash: {e.hash.slice(0, 32)}…</Text>
            <Text style={{ color: colors.muted, fontSize: 10, fontFamily: "monospace" }}>prev: {e.prev_hash.slice(0, 32)}…</Text>
          </View>
        ))}

        <Text style={{ color: colors.muted, fontSize: 11, marginTop: spacing.xl, textAlign: "center" }}>
          Blockchain does not prove that the city fixed the problem. TRACE uses cryptographic commitments to make the recorded history difficult to silently rewrite.
        </Text>
      </ScrollView>
    </View>
  );
}

function KV({ k, v, colors, mono }: any) {
  return (
    <View style={{ paddingVertical: 4, flexDirection: "row" }}>
      <Text style={{ color: colors.muted, fontSize: 11, width: 110, fontWeight: "700", letterSpacing: 0.4 }}>{k.toUpperCase()}</Text>
      <Text style={{ color: colors.onSurface, flex: 1, fontSize: 12, fontFamily: mono ? "monospace" : undefined }}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, marginTop: spacing.lg },
  event: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: 8 },
  btn: { flexDirection: "row", justifyContent: "center", alignItems: "center", borderRadius: 999, paddingVertical: 12 },
});
