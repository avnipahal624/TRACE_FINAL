import Icon from "@react-native-vector-icons/material-design-icons";
import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { listQueue, syncOfflineQueue } from "@/src/services/offlineQueue";
import { useNetworkStatus } from "@/src/services/network";
import { radius, spacing, useTheme } from "@/src/theme";

export function OfflineBanner() {
  const { colors } = useTheme();
  const { online } = useNetworkStatus();
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const q = await listQueue();
    setQueuedCount(q.filter((x) => x.status !== "synced").length);
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, [refresh]);

  useEffect(() => {
    if (online && queuedCount > 0 && !syncing) {
      (async () => {
        setSyncing(true);
        const r = await syncOfflineQueue();
        setSyncMsg(r.synced > 0 ? `${r.synced} queued report${r.synced > 1 ? "s" : ""} synced` : null);
        setSyncing(false);
        refresh();
        setTimeout(() => setSyncMsg(null), 3500);
      })();
    }
  }, [online, queuedCount, syncing, refresh]);

  // Periodic retry every 8s while there are queued/errored items (self-heals transient failures)
  useEffect(() => {
    if (!online || queuedCount === 0) return;
    const t = setInterval(async () => {
      if (syncing) return;
      const r = await syncOfflineQueue();
      if (r.synced > 0) setSyncMsg(`${r.synced} queued report${r.synced > 1 ? "s" : ""} synced`);
      refresh();
    }, 8000);
    return () => clearInterval(t);
  }, [online, queuedCount, syncing, refresh]);

  if (online && !syncMsg && queuedCount === 0) return null;

  if (!online) {
    return (
      <View style={[styles.wrap, { backgroundColor: "rgba(245,158,11,0.14)", borderColor: colors.warning }]} testID="offline-banner">
        <Icon name="wifi-off" size={14} color={colors.warning} />
        <Text style={[styles.txt, { color: colors.warning }]}>Offline · Reports saved locally · Queued for sync</Text>
        {queuedCount > 0 ? <Text style={[styles.badge, { color: colors.warning }]}>{queuedCount}</Text> : null}
      </View>
    );
  }
  if (syncing) {
    return (
      <View style={[styles.wrap, { backgroundColor: "rgba(59,130,246,0.14)", borderColor: colors.info }]} testID="sync-banner">
        <Icon name="sync" size={14} color={colors.info} />
        <Text style={[styles.txt, { color: colors.info }]}>Syncing {queuedCount} queued report{queuedCount > 1 ? "s" : ""}…</Text>
      </View>
    );
  }
  if (syncMsg) {
    return (
      <View style={[styles.wrap, { backgroundColor: "rgba(16,185,129,0.14)", borderColor: colors.success }]} testID="synced-banner">
        <Icon name="cloud-check-outline" size={14} color={colors.success} />
        <Text style={[styles.txt, { color: colors.success }]}>{syncMsg}</Text>
      </View>
    );
  }
  if (queuedCount > 0) {
    return (
      <View style={[styles.wrap, { backgroundColor: "rgba(245,158,11,0.14)", borderColor: colors.warning }]} testID="queued-banner">
        <Icon name="cloud-upload-outline" size={14} color={colors.warning} />
        <Text style={[styles.txt, { color: colors.warning }]}>{queuedCount} queued locally · Waiting for connection</Text>
        <Pressable testID="retry-sync" onPress={() => syncOfflineQueue()}>
          <Text style={[styles.retry, { color: colors.warning }]}>Retry</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderWidth: 1, borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 6, alignSelf: "center",
    marginTop: spacing.xs,
  },
  txt: { fontSize: 11, fontWeight: "700" },
  badge: { fontSize: 11, fontWeight: "800", marginLeft: 4 },
  retry: { fontSize: 11, fontWeight: "800", textDecorationLine: "underline", marginLeft: 6 },
});
