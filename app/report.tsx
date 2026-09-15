import Icon from "@react-native-vector-icons/material-design-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { clearDraft, loadDraft, useDraftAutosave } from "@/src/services/draft";
import { analyzeLocal, EvidenceAnalysis } from "@/src/services/evidence";
import { isOnline, useNetworkStatus } from "@/src/services/network";
import { enqueue } from "@/src/services/offlineQueue";
import { radius, spacing, useTheme } from "@/src/theme";

const CATEGORIES = [
  "Pothole", "Waterlogging", "Garbage / Waste", "Water Leak", "Broken Streetlight",
  "Unsafe Civic Infrastructure", "Women's Safety / Civic Safety", "Environmental Issue",
  "Deforestation / Tree Removal", "Washroom", "Other",
];

const STOCK_EVIDENCE = [
  "https://images.pexels.com/photos/2612386/pexels-photo-2612386.jpeg",
  "https://images.unsplash.com/photo-1699205269431-1ab18afabac6?w=800",
  "https://images.unsplash.com/photo-1517511620798-cec17d428bc0?w=800",
];

export default function Report() {
  const { colors, mode } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState("Pothole");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high">("medium");
  const [locState, setLocState] = useState<{ lat?: number; lng?: number; precision: "EXACT" | "APPROXIMATE" | "AREA"; area?: string; err?: string; loading?: boolean }>({ precision: mode === "women" ? "APPROXIMATE" : "EXACT" });
  const [evidence, setEvidence] = useState<string[]>([]);
  const [analyses, setAnalyses] = useState<Record<number, EvidenceAnalysis>>({});
  const [dupNote, setDupNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [resumeOffered, setResumeOffered] = useState(false);
  const [draftSavedTick, setDraftSavedTick] = useState(0);
  const { online } = useNetworkStatus();

  // Offer to resume any existing draft on first mount
  useEffect(() => {
    (async () => {
      const d = await loadDraft(user?.id);
      if (d && !resumeOffered) {
        setResumeOffered(true);
        setStep(d.step); setCategory(d.category); setTitle(d.title);
        setDescription(d.description); setSeverity(d.severity);
        setLocState({ ...(d.location || {}), precision: d.location?.precision || (mode === "women" ? "APPROXIMATE" : "EXACT") });
        setEvidence(d.evidence_urls || []);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    void AsyncStorage.getItem("trace.privacy.approximate").then((saved) => {
      if (saved === "true") setLocState((prev) => ({ ...prev, precision: "APPROXIMATE" }));
    });
  }, []);

  // Autosave the current draft snapshot every 5s
  useDraftAutosave(
    user?.id,
    { step, category, title, description, severity, mode, location: locState, evidence_urls: evidence, updated_at: "" },
    !busy,
  );

  // Visual "saved" tick that fires every 5s
  useEffect(() => {
    const t = setInterval(() => setDraftSavedTick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);

  async function toDataUri(uri: string): Promise<string> {
    if (uri.startsWith("data:")) return uri;
    // On web / native the picker with base64:true already returns a data URI via .base64; otherwise fetch and encode.
    const res = await fetch(uri);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.onloadend = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }

  async function ensurePerm(kind: "camera" | "gallery"): Promise<boolean> {
    if (Platform.OS === "web") return true;
    const req =
      kind === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (req.status === "granted") return true;
    if (!req.canAskAgain) {
      alert("Permission blocked. Open Settings to allow access.");
      try { await Linking.openSettings(); } catch {}
    }
    return false;
  }

  async function pickFromGallery() {
    if (picking) return;
    setPicking(true);
    try {
      if (!(await ensurePerm("gallery"))) return;
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.5,
        base64: true,
        selectionLimit: 5,
      });
      if (r.canceled) return;
      const uris = await Promise.all(
        r.assets.map(async (a) => (a.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : await toDataUri(a.uri))),
      );
      const merged = [...evidence, ...uris].slice(0, 5);
      setEvidence(merged);
      // analyze new ones
      const newAnalyses = { ...analyses };
      await Promise.all(uris.map(async (u) => {
        const idx = merged.indexOf(u);
        newAnalyses[idx] = await analyzeLocal(u);
      }));
      setAnalyses(newAnalyses);
    } catch (e: any) {
      alert(e?.message || "Unable to pick photo");
    } finally {
      setPicking(false);
    }
  }

  async function pickFromCamera() {
    if (picking) return;
    setPicking(true);
    try {
      if (!(await ensurePerm("camera"))) return;
      const r = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.5,
        base64: true,
      });
      if (r.canceled) return;
      const a = r.assets[0];
      const uri = a.base64 ? `data:${a.mimeType || "image/jpeg"};base64,${a.base64}` : await toDataUri(a.uri);
      const merged = [...evidence, uri].slice(0, 5);
      setEvidence(merged);
      const idx = merged.indexOf(uri);
      const analysis = await analyzeLocal(uri);
      setAnalyses({ ...analyses, [idx]: analysis });
    } catch (e: any) {
      alert(e?.message || "Unable to take photo");
    } finally {
      setPicking(false);
    }
  }

  function removeAt(i: number) {
    setEvidence((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function useGPS() {
    setLocState({ ...locState, loading: true });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") { setLocState({ precision: "APPROXIMATE", err: "Permission denied. Using approximate.", loading: false }); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocState({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: mode === "women" ? "APPROXIMATE" : "EXACT", area: "Detected location", loading: false });
    } catch (e: any) {
      setLocState({ precision: "APPROXIMATE", err: e?.message || "Unable to detect. Use approximate.", loading: false });
    }
  }

  async function checkDup() {
    if (!title || !description) return;
    try {
      const r = await api<{ candidates: any[]; ai_note?: string }>("/ai/duplicate-check", { method: "POST", body: JSON.stringify({ category, title, description }) });
      const candidates = Array.isArray(r?.candidates) ? r.candidates : [];
      setDupNote(r.ai_note || (candidates.length ? `Possible related: ${candidates.map(c => c.case_number).join(", ")}` : null));
    } catch {}
  }

  async function submit() {
    setBusy(true);
    try {
      const evidence_meta = evidence.map((_, i) => {
        const a = analyses[i];
        return a ? { hash: a.hash, size: a.size, width: a.width, height: a.height, exif_present: a.exif_present, mime: a.mime } : {};
      });
      const payload = {
        category, title, description, severity, mode,
        location: locState.lat ? { lat: locState.lat, lng: locState.lng, precision: locState.precision, area: locState.area } : { precision: "APPROXIMATE" as const, area: locState.area || "Approximate area" },
        evidence_urls: evidence,
        evidence_meta,
      };
      if (!isOnline() || !online) {
        const q = await enqueue(payload as any);
        await clearDraft(user?.id);
        alert(`Saved offline as ${q.local_id}. Will sync when connection returns.`);
        router.replace("/(tabs)/cases");
        return;
      }
      const r = await api<{ case: any }>("/cases", { method: "POST", body: JSON.stringify(payload) });
      await clearDraft(user?.id);
      router.replace(`/case/${r.case.id}`);
    } catch (e: any) {
      // network failure fallback: queue offline
      try {
        const evidence_meta = evidence.map((_, i) => {
          const a = analyses[i];
          return a ? { hash: a.hash, size: a.size, width: a.width, height: a.height, exif_present: a.exif_present, mime: a.mime } : {};
        });
        const q = await enqueue({
          category, title, description, severity, mode,
          location: locState.lat ? { lat: locState.lat, lng: locState.lng, precision: locState.precision, area: locState.area } : { precision: "APPROXIMATE" as any, area: locState.area || "Approximate area" },
          evidence_urls: evidence,
          evidence_meta,
        } as any);
        await clearDraft(user?.id);
        alert(`Network failed. Saved offline as ${q.local_id}. Will retry automatically.`);
        router.replace("/(tabs)/cases");
      } catch {
        alert(e?.message || "Failed to submit");
      }
    } finally { setBusy(false); }
  }

  const canNext = () => {
    if (step === 0) return !!category;
    if (step === 1) return true;
    if (step === 2) return evidence.length > 0;
    if (step === 3) return !!title && description.length >= 10;
    return true;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="report-screen">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.md, flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Pressable testID="report-back" onPress={() => step === 0 ? router.back() : setStep(step - 1)} style={{ padding: 4 }}>
            <Icon name="arrow-left" size={22} color={colors.onSurface} />
          </Pressable>
          <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 18 }}>Report an issue</Text>
        </View>

        <View style={{ paddingHorizontal: spacing.xl, flexDirection: "row", gap: 6 }}>
          {[0, 1, 2, 3, 4].map(i => (
            <View key={i} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? colors.brandPrimary : colors.border }} />
          ))}
        </View>
        <View style={{ paddingHorizontal: spacing.xl, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          {resumeOffered ? (
            <View testID="resume-hint" style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Icon name="restore" size={12} color={colors.brandPrimary} />
              <Text style={{ color: colors.brandPrimary, fontSize: 11, fontWeight: "700" }}>Resumed your last draft</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          <View testID="autosave-indicator" style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: draftSavedTick > 0 ? 1 : 0.5 }}>
            <Icon name="cloud-check-outline" size={12} color={colors.muted} />
            <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 }}>DRAFT AUTOSAVED · every 5s</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <View>
              <Text style={[styles.h, { color: colors.onSurface }]}>What happened?</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md }}>
                {CATEGORIES.map((c) => {
                  const active = category === c;
                  return (
                    <Pressable key={c} testID={`cat-${c}`} onPress={() => setCategory(c)}
                      style={[styles.chip, { borderColor: active ? colors.brandPrimary : colors.border, backgroundColor: active ? colors.brandTertiary : colors.surfaceSecondary }]}>
                      <Text style={{ color: active ? colors.onBrandTertiary : colors.onSurfaceSecondary, fontWeight: "700", fontSize: 13 }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 1 && (
            <View>
              <Text style={[styles.h, { color: colors.onSurface }]}>Where?</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                {mode === "women" ? "Sensitive reports use approximate location by default." : "Use GPS or choose approximate location."}
              </Text>
              <Pressable testID="use-gps" onPress={useGPS} style={[styles.btn, { borderColor: colors.borderStrong, marginTop: spacing.lg }]}>
                {locState.loading ? <ActivityIndicator color={colors.brandPrimary} /> : <Icon name="crosshairs-gps" size={18} color={colors.brandPrimary} />}
                <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Use my current location</Text>
              </Pressable>
              {locState.err ? <Text style={{ color: colors.warning, marginTop: 8 }}>{locState.err}</Text> : null}
              {locState.lat ? <Text style={{ color: colors.onSurfaceSecondary, marginTop: 8 }}>Detected: {locState.lat.toFixed(4)}, {locState.lng?.toFixed(4)} · {locState.precision}</Text> : null}
              <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Area label (optional)</Text>
              <TextInput testID="area-input" value={locState.area || ""} onChangeText={(t) => setLocState({ ...locState, area: t })}
                placeholder="e.g., MG Road · Segment 14" placeholderTextColor={colors.muted}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]} />
              <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Precision</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["EXACT", "APPROXIMATE", "AREA"] as const).map(p => (
                  <Pressable key={p} testID={`prec-${p}`} onPress={() => setLocState({ ...locState, precision: p })}
                    style={[styles.chip, { borderColor: locState.precision === p ? colors.brandPrimary : colors.border, backgroundColor: locState.precision === p ? colors.brandTertiary : colors.surfaceSecondary, flex: 1, alignItems: "center" }]}>
                    <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 12 }}>{p}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {step === 2 && (
            <View>
              <Text style={[styles.h, { color: colors.onSurface }]}>Evidence</Text>
              <Text style={{ color: colors.muted, marginTop: 4 }}>
                Attach photos from your camera or gallery. Or pick from the sample library.
              </Text>

              <View style={{ flexDirection: "row", gap: 10, marginTop: spacing.md }}>
                <Pressable
                  testID="pick-camera"
                  disabled={picking}
                  onPress={pickFromCamera}
                  style={[styles.pickBtn, { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}
                >
                  {picking ? <ActivityIndicator color={colors.brandPrimary} /> : <Icon name="camera-outline" size={18} color={colors.brandPrimary} />}
                  <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Take photo</Text>
                </Pressable>
                <Pressable
                  testID="pick-gallery"
                  disabled={picking}
                  onPress={pickFromGallery}
                  style={[styles.pickBtn, { borderColor: colors.borderStrong }]}
                >
                  {picking ? <ActivityIndicator color={colors.brandPrimary} /> : <Icon name="image-multiple-outline" size={18} color={colors.onSurface} />}
                  <Text style={{ color: colors.onSurface, fontWeight: "700" }}>Gallery</Text>
                </Pressable>
              </View>

              {evidence.length > 0 ? (
                <View style={{ marginTop: spacing.md }} testID="evidence-thumbs">
                  {evidence.map((uri, i) => {
                    const a = analyses[i];
                    return (
                      <View key={i} style={[styles.evRow, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                        <Image source={{ uri }} style={styles.thumb} />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={{ color: colors.onSurface, fontSize: 12, fontWeight: "700" }}>Evidence #{i + 1}</Text>
                          {a ? (
                            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                              {a.signals.map((s) => (
                                <View key={s.key} style={[styles.sigChip, { backgroundColor: s.ok ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)" }]}>
                                  <Text style={{ color: s.ok ? colors.success : colors.warning, fontSize: 10, fontWeight: "700" }}>{s.label}</Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Analyzing…</Text>
                          )}
                        </View>
                        <Pressable testID={`ev-remove-${i}`} onPress={() => { removeAt(i); const na = { ...analyses }; delete na[i]; setAnalyses(na); }} style={{ padding: 6 }}>
                          <Icon name="close" size={16} color={colors.muted} />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>OR PICK FROM SAMPLE LIBRARY</Text>
              <View style={{ gap: 8 }}>
                {STOCK_EVIDENCE.map((u, i) => {
                  const selected = evidence.includes(u);
                  return (
                    <Pressable key={i} testID={`ev-${i}`} onPress={() => setEvidence(selected ? evidence.filter(x => x !== u) : [...evidence, u])}
                      style={[styles.ev, { borderColor: selected ? colors.brandPrimary : colors.border, backgroundColor: colors.surfaceSecondary }]}>
                      <Icon name={selected ? "check-circle" : "image-outline"} size={22} color={selected ? colors.brandPrimary : colors.muted} />
                      <Text style={{ color: colors.onSurface, flex: 1 }}>Sample photo #{i + 1}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {step === 3 && (
            <View>
              <Text style={[styles.h, { color: colors.onSurface }]}>Details</Text>
              <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Title</Text>
              <TextInput testID="title-input" value={title} onChangeText={setTitle} onBlur={checkDup}
                placeholder="Short summary" placeholderTextColor={colors.muted}
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]} />
              <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Description</Text>
              <TextInput testID="desc-input" value={description} onChangeText={setDescription} onBlur={checkDup}
                placeholder="What happened, when, how severe" placeholderTextColor={colors.muted} multiline
                style={[styles.input, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface, minHeight: 100, textAlignVertical: "top" }]} />
              <Text style={[styles.label, { color: colors.onSurfaceSecondary }]}>Severity</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["low", "medium", "high"] as const).map(s => (
                  <Pressable key={s} testID={`sev-${s}`} onPress={() => setSeverity(s)}
                    style={[styles.chip, { borderColor: severity === s ? colors.brandPrimary : colors.border, backgroundColor: severity === s ? colors.brandTertiary : colors.surfaceSecondary, flex: 1, alignItems: "center" }]}>
                    <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 12 }}>{s.toUpperCase()}</Text>
                  </Pressable>
                ))}
              </View>
              {dupNote ? (
                <View style={{ marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.md, backgroundColor: "rgba(245,158,11,0.08)" }}>
                  <Text style={{ color: colors.warning, fontWeight: "800", fontSize: 12 }}>AI SIGNAL · REQUIRES REVIEW</Text>
                  <Text style={{ color: colors.onSurface, marginTop: 4, fontSize: 13 }}>{dupNote}</Text>
                </View>
              ) : null}
            </View>
          )}

          {step === 4 && (
            <View>
              <Text style={[styles.h, { color: colors.onSurface }]}>Review & submit</Text>
              <Row label="Category" value={category} colors={colors} />
              <Row label="Mode" value={mode.toUpperCase()} colors={colors} />
              <Row label="Title" value={title} colors={colors} />
              <Row label="Description" value={description} colors={colors} />
              <Row label="Severity" value={severity.toUpperCase()} colors={colors} />
              <Row label="Location" value={locState.area || (locState.lat ? `${locState.lat.toFixed(3)}, ${locState.lng?.toFixed(3)}` : "Approximate")} colors={colors} />
              <Row label="Precision" value={locState.precision} colors={colors} />
              <Row label="Evidence" value={`${evidence.length} photo(s)`} colors={colors} />
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { borderColor: colors.border, backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
          <Pressable
            testID="report-next"
            disabled={!canNext() || busy}
            onPress={() => step < 4 ? setStep(step + 1) : submit()}
            style={[styles.next, { backgroundColor: colors.brandPrimary, opacity: (!canNext() || busy) ? 0.5 : 1 }]}
          >
            {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <>
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "800" }}>{step < 4 ? "Continue" : "Submit report"}</Text>
                <Icon name="arrow-right" size={18} color={colors.onBrandPrimary} />
              </>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Row({ label, value, colors }: any) {
  return (
    <View style={{ flexDirection: "row", paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border, gap: 12 }}>
      <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", width: 96, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ color: colors.onSurface, flex: 1 }}>{value || "—"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 22, fontWeight: "800", marginTop: spacing.md },
  label: { marginTop: spacing.lg, marginBottom: 6, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 12, fontSize: 15 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, borderWidth: 1 },
  btn: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 12 },
  ev: { flexDirection: "row", alignItems: "center", gap: 10, padding: spacing.md, borderWidth: 1, borderRadius: radius.md },
  pickBtn: { flex: 1, borderWidth: 1, borderRadius: radius.pill, paddingVertical: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 },
  thumbWrap: { width: 88, height: 88, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, position: "relative" },
  thumb: { width: 72, height: 72, borderRadius: radius.sm },
  thumbClose: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  evRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: 8 },
  sigChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  footer: { position: "absolute", bottom: 0, left: 0, right: 0, borderTopWidth: 1, padding: spacing.lg },
  next: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: radius.pill, paddingVertical: 14 },
});
