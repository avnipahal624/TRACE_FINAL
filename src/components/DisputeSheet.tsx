import Icon from "@react-native-vector-icons/material-design-icons";
import React, { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, spacing, useTheme } from "../theme";

const REASONS = [
  "Issue still exists",
  "Evidence looks outdated",
  "Evidence doesn't match",
  "Repair appears incomplete",
  "Other",
];

export function DisputeSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (reason: string, note: string) => Promise<void> | void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onSubmit(reason, note.trim());
      setNote("");
      setReason(REASONS[0]);
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} testID="dispute-backdrop" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surfaceSecondary,
              borderColor: colors.border,
              paddingBottom: insets.bottom + spacing.lg,
            },
          ]}
          testID="dispute-sheet"
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Icon name="alert-outline" size={20} color={colors.warning} />
            <Text style={[styles.title, { color: colors.onSurface }]}>Question this resolution</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 13, marginTop: 4 }}>
            Pick a reason. Your case moves to DISPUTED while its outcome remains a separate, reviewable axis.
          </Text>

          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>REASON</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {REASONS.map((r) => {
              const active = reason === r;
              return (
                <Pressable
                  key={r}
                  testID={`dispute-reason-${r.replace(/\s+/g, "-").toLowerCase()}`}
                  onPress={() => setReason(r)}
                  style={[
                    styles.chip,
                    {
                      borderColor: active ? colors.warning : colors.border,
                      backgroundColor: active ? "rgba(245,158,11,0.12)" : colors.surfaceTertiary,
                    },
                  ]}
                >
                  <Text style={{ color: active ? colors.warning : colors.onSurfaceSecondary, fontWeight: "700", fontSize: 12 }}>{r}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>NOTE (OPTIONAL)</Text>
          <TextInput
            testID="dispute-note"
            value={note}
            onChangeText={setNote}
            multiline
            placeholder="Add any detail that helps reviewers"
            placeholderTextColor={colors.muted}
            style={[
              styles.input,
              {
                borderColor: colors.border,
                backgroundColor: colors.surfaceTertiary,
                color: colors.onSurface,
              },
            ]}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.lg }}>
            <Pressable testID="dispute-cancel" onPress={onClose} style={[styles.btnS, { borderColor: colors.borderStrong }]}>
              <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="dispute-submit"
              disabled={busy}
              onPress={submit}
              style={[styles.btnP, { backgroundColor: colors.warning, opacity: busy ? 0.6 : 1 }]}
            >
              {busy ? <ActivityIndicator color={colors.onWarning} /> : <Text style={{ color: colors.onWarning, fontWeight: "800" }}>Submit dispute</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.55)" },
  wrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    padding: spacing.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
  },
  grabber: { width: 44, height: 4, borderRadius: 999, alignSelf: "center", marginBottom: spacing.md },
  title: { fontSize: 17, fontWeight: "800" },
  label: { marginTop: spacing.lg, marginBottom: 8, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    fontSize: 14,
    minHeight: 88,
    textAlignVertical: "top",
  },
  btnS: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
  btnP: { flex: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center" },
});
