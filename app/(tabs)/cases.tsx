import Icon from "@react-native-vector-icons/material-design-icons";
import { useFocusEffect } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { CaseCard } from "@/src/components/CaseCard";
import { OfflineBanner } from "@/src/components/OfflineBanner";
import { StatusChip } from "@/src/components/StatusChip";
import { listQueue, QueuedReport, syncOfflineQueue } from "@/src/services/offlineQueue";
import { radius, spacing, useTheme } from "@/src/theme";

export default function Cases() {
  const { colors, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<any[]>([]);
  const [queue, setQueue] = useState<QueuedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ cases: any[] }>(`/cases?mode=${mode}`);
      setItems(Array.isArray(r?.cases) ? r.cases : []);
    } catch { /* offline */ }
    setQueue((await listQueue()).filter((x) => x.payload.mode === mode));
    setLoading(false);
  }, [mode]);

  useFocusEffect(useCallback(() => { load(); syncOfflineQueue().then(() => load()); }, [load]));

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const server = t
      ? items.filter((c) => [c.case_number, c.title, c.category, c.status, c.outcome, c.location?.area].filter(Boolean).join(" ").toLowerCase().includes(t))
      : items;
    const local = t
      ? queue.filter((c) => [c.local_id, c.payload.title, c.payload.category].filter(Boolean).join(" ").toLowerCase().includes(t))
      : queue;
    return { server, local };
  }, [items, queue, q]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="cases-screen">
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl }}>
        <Text style={[styles.h1, { color: colors.onSurface }]}>Cases</Text>
        <Text style={{ color: colors.muted }}>All active civic outcomes</Text>
        <OfflineBanner />
        <View style={[styles.search, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
          <Icon name="magnify" size={18} color={colors.muted} />
          <TextInput
            testID="case-search-input"
            value={q}
            onChangeText={setQ}
            placeholder="Search by case, area, or category"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, color: colors.onSurface, fontSize: 14, paddingVertical: 8 }}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {q ? <Icon name="close-circle" size={16} color={colors.muted} onPress={() => setQ("")} testID="case-search-clear" /> : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 140, gap: 12 }} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={colors.brandPrimary} /> : null}

        {filtered.local.length > 0 ? (
          <View style={{ gap: 10 }} testID="local-queue-list">
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "800", letterSpacing: 0.6, marginTop: 4 }}>LOCAL — WAITING FOR SYNC</Text>
            {filtered.local.map((q) => (
              <View key={q.local_id} style={[styles.qCard, { backgroundColor: colors.surfaceSecondary, borderColor: colors.warning }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: colors.warning, fontSize: 12, fontWeight: "800", letterSpacing: 1 }}>{q.local_id}</Text>
                  <StatusChip label={q.status === "error" ? "SYNC FAILED" : q.status.toUpperCase()} tone={q.status === "error" ? "bad" : "warn"} />
                </View>
                <Text style={{ color: colors.onSurface, marginTop: 4, fontWeight: "700" }} numberOfLines={1}>{q.payload.title || "(no title)"}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>{q.payload.category} · Saved {new Date(q.created_at_local).toLocaleString()}</Text>
                {q.error ? <Text style={{ color: colors.error, fontSize: 11, marginTop: 4 }}>{q.error}</Text> : null}
              </View>
            ))}
          </View>
        ) : null}

        {filtered.server.length === 0 && filtered.local.length === 0 && !loading ? (
          <Text style={{ color: colors.muted, textAlign: "center" }} testID="cases-empty">{q ? `No matches for “${q}”.` : "No cases yet."}</Text>
        ) : null}

        {filtered.server.map((c) => <CaseCard key={c.id} item={c} />)}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: "800" },
  search: {
    marginTop: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qCard: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
});
