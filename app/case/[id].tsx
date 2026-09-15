import Icon from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { BeforeAfter } from "@/src/components/BeforeAfter";
import { DisputeSheet } from "@/src/components/DisputeSheet";
import { PhotoCompareSheet } from "@/src/components/PhotoCompareSheet";
import { StatusChip } from "@/src/components/StatusChip";
import { TraceLine } from "@/src/components/TraceLine";
import { radius, spacing, useTheme } from "@/src/theme";

const BACKEND = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/$/, "");

function stageIndex(c: any): number {
  if (c.outcome) return 5;
  if (c.observation) return 3;
  if (c.intervention) return 2;
  if (c.status === "SUBMITTED" || c.status === "UNDER_REVIEW") return 1;
  return 0;
}

export default function CaseDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<{ case: any; events: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [eiOpen, setEiOpen] = useState(true);
  const [reply, setReply] = useState("");
  const [compareOpen, setCompareOpen] = useState<{ start: number } | null>(null);

  const load = useCallback(async () => {
    if (authLoading) return;
    try {
      const r = await api<{ case: any; events: any[] }>(`/cases/${id}`);
      setData(r);
    } catch (e) { console.warn(e); }
    setLoading(false);
  }, [id, authLoading]);

  React.useEffect(() => { load(); }, [load]);

  async function post(path: string, body?: any) {
    setBusy(true);
    try { await api(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }); await load(); }
    catch (e: any) { alert(e.message); }
    finally { setBusy(false); }
  }

  if (loading || !data) return (
    <View style={{ flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={colors.brandPrimary} />
    </View>
  );

  const c = data.case;
  const before = c.evidence?.find((e: any) => e.type === "before")?.url;
  const after = c.evidence?.find((e: any) => e.type === "after")?.url;
  const obs = c.observation;
  const pct = obs ? Math.round((obs.days_elapsed / Math.max(1, obs.days_total)) * 100) : 0;
  const disputed = c.review_status === "DISPUTED";
  const isAuthority = user?.role === "authority" || user?.role === "admin";
  const isOwner = user?.id === c.created_by;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }} testID="case-detail-screen">
      <LinearGradient colors={[colors.glow, "transparent"]} style={{ position: "absolute", top: -80, right: -80, width: 300, height: 300, borderRadius: 999 }} />
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable testID="detail-back" onPress={() => router.back()} style={{ padding: 4 }}>
          <Icon name="arrow-left" size={22} color={colors.onSurface} />
        </Pressable>
        <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 16 }}>{c.case_number}</Text>
        <View style={{ flex: 1 }} />
        <Pressable testID="share-btn" onPress={async () => {
          const shareUrl = `${BACKEND}/api/share/${c.case_number}`;
          const message = `${c.case_number} — ${c.title}\n${c.outcome || c.status} · Follow the TRACE outcome trail:\n${shareUrl}`;
          try {
            if (Platform.OS === "web" && (navigator as any)?.clipboard?.writeText) {
              await (navigator as any).clipboard.writeText(shareUrl);
              alert("Share link copied to clipboard.");
            } else {
              await Share.share({ message, url: shareUrl });
            }
          } catch { /* user dismissed */ }
        }} style={{ padding: 4 }}>
          <Icon name="share-variant-outline" size={22} color={colors.onSurface} />
        </Pressable>
        <Pressable testID="open-integrity" onPress={() => router.push(`/integrity/${c.id}`)} style={{ padding: 4 }}>
          <Icon name="shield-lock-outline" size={22} color={colors.brandPrimary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingBottom: insets.bottom + spacing.xxxl }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <StatusChip label={c.category} tone="brand" />
          <StatusChip label={c.status} />
          {c.outcome ? <StatusChip label={c.outcome} tone={c.outcome === "PASSED" ? "good" : c.outcome === "FAILED" ? "bad" : "warn"} /> : null}
          {disputed ? <StatusChip label="DISPUTED" tone="warn" /> : null}
          {c.demo ? <StatusChip label="DEMO" tone="info" /> : null}
        </View>
        <Text style={[styles.h, { color: colors.onSurface }]}>{c.title}</Text>
        <Text style={{ color: colors.muted }}>{c.location?.area || "Approximate area"}</Text>

        <TraceLine activeIndex={stageIndex(c)} disputed={disputed} />

        {data.events?.some((e: any) => e.type === "RECURRENCE_DETECTED") ? (
          <View style={[styles.banner, { borderColor: colors.warning, backgroundColor: "rgba(245,158,11,0.08)" }]} testID="recurrence-banner">
            <Icon name="restart-alert" size={18} color={colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.warning, fontWeight: "800", fontSize: 12, letterSpacing: 0.5 }}>POSSIBLE RECURRENCE</Text>
              <Text style={{ color: colors.onSurface, fontSize: 13, marginTop: 2 }}>
                A resolved case was found in this area within the last 30 days. Requires review — not automatically a failure.
              </Text>
            </View>
          </View>
        ) : null}

        {before && after ? (
          <View style={{ marginTop: spacing.md }}>
            <Pressable testID="open-compare" onPress={() => setCompareOpen({ start: 0 })}>
              <BeforeAfter before={before} after={after} beforeDate={new Date(c.created_at).toLocaleDateString()} afterDate={c.intervention ? new Date(c.intervention.submitted_at).toLocaleDateString() : ""} />
            </Pressable>
            <Text style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>
              Evidence supports the recorded intervention — outcome pending observation. <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Tap to compare full-screen</Text>
            </Text>
          </View>
        ) : before ? (
          <Pressable testID="open-compare" onPress={() => setCompareOpen({ start: 0 })} style={{ marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary }}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Awaiting authority proof. Tap to view current evidence.</Text>
          </Pressable>
        ) : null}

        {c.evidence_signals?.length ? (
          <View style={{ marginTop: spacing.xl }}>
            <Pressable onPress={() => setEiOpen((v) => !v)} testID="evidence-intel-toggle" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="shield-search" size={16} color={colors.brandPrimary} />
              <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 14, letterSpacing: 0.4, flex: 1 }}>EVIDENCE INTELLIGENCE</Text>
              <Icon name={eiOpen ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
            </Pressable>
            {eiOpen ? (
              <View style={{ marginTop: 10 }} testID="evidence-intel">
                {c.detection ? (
                  <View style={[styles.eiBox, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Icon name="magnify-scan" size={16} color={colors.brandPrimary} />
                      <Text style={{ color: colors.onSurface, fontWeight: "800" }}>Detection</Text>
                      <View style={[styles.demoTag, { borderColor: colors.warning }]}>
                        <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "800" }}>DEMO SIGNAL</Text>
                      </View>
                    </View>
                    <Text style={{ color: colors.onSurface, marginTop: 6 }}>
                      Possible <Text style={{ color: colors.brandPrimary, fontWeight: "800" }}>{c.detection.issue}</Text>
                      <Text style={{ color: colors.muted }}>  · confidence {c.detection.confidence}%</Text>
                    </Text>
                    <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Visual evidence: {c.detection.quality} · {c.detection.recommendation}</Text>
                  </View>
                ) : null}
                {c.integrity_score ? (
                  <View style={[styles.eiBox, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, marginTop: 10 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Icon name="shield-check-outline" size={16} color={colors.brandPrimary} />
                      <Text style={{ color: colors.onSurface, fontWeight: "800" }}>Evidence integrity</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={{ color: c.integrity_score.band === "high" ? colors.success : c.integrity_score.band === "medium" ? colors.warning : colors.error, fontWeight: "800", fontSize: 18 }}>{c.integrity_score.score}</Text>
                      <Text style={{ color: colors.muted, fontSize: 12 }}>/100</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden", marginTop: 8 }}>
                      <View style={{ height: "100%", width: `${c.integrity_score.score}%`, backgroundColor: c.integrity_score.band === "high" ? colors.success : c.integrity_score.band === "medium" ? colors.warning : colors.error }} />
                    </View>
                    <View style={{ marginTop: 8, gap: 4 }}>
                      {c.integrity_score.subs.map((s: any) => (
                        <View key={s.key} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Icon name={s.ok ? "check-circle" : "alert-circle-outline"} size={13} color={s.ok ? colors.success : colors.warning} />
                          <Text style={{ color: s.ok ? colors.onSurface : colors.warning, fontSize: 12, flex: 1 }}>{s.label}</Text>
                          {s.note ? <Text style={{ color: colors.muted, fontSize: 10 }}>{s.note}</Text> : null}
                        </View>
                      ))}
                    </View>
                    <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
                      A transparent multi-signal score. Signals summarise the evidence — they never prove reality.
                    </Text>
                  </View>
                ) : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }} testID="evidence-signals">
                  {c.evidence_signals.map((s: any) => (
                    <StatusChip key={s.key} label={s.label} tone={s.tone} />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        <Section title="Outcome commitment" colors={colors}>
          <KV k="Intervention" v={c.commitment.intervention} colors={colors} />
          <KV k="Target" v={`${c.commitment.target_hours} hours`} colors={colors} />
          <KV k="Observation" v={`${c.commitment.observation_days} days`} colors={colors} />
          <KV k="Acceptance" v={c.commitment.acceptance_rule} colors={colors} />
        </Section>

        {obs ? (
          <Section title="Observation window" colors={colors}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: "hidden" }}>
              <View style={{ width: `${pct}%`, height: "100%", backgroundColor: colors.brandPrimary }} />
            </View>
            <Text style={{ color: colors.onSurfaceSecondary, marginTop: 6, fontSize: 12 }}>Day {obs.days_elapsed} of {obs.days_total} · {pct}%</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              {(obs.review_points || [7, 30, 60, 90].filter((d: number) => d <= obs.days_total)).map((d: number) => (
                <Pressable key={d} testID={`advance-${d}`} disabled={busy} onPress={() => post(`/cases/${c.id}/observation/advance`, { days: d })}
                  style={[styles.simBtn, { borderColor: colors.borderStrong }]}>
                  <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 12 }}>+{d}d</Text>
                </Pressable>
              ))}
              <View style={[styles.simTag, { borderColor: colors.warning }]}>
                <Text style={{ color: colors.warning, fontSize: 10, fontWeight: "800" }}>DEMO SIMULATION</Text>
              </View>
            </View>
          </Section>
        ) : null}

        {c.intervention && isOwner && !disputed ? (
          <Section title="Does this look resolved?" colors={colors}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable testID="review-accept" disabled={busy} onPress={() => post(`/cases/${c.id}/review`, { decision: "accept" })} style={[styles.actP, { backgroundColor: colors.success }]}>
                <Icon name="check" size={16} color="#022C22" />
                <Text style={{ color: "#022C22", fontWeight: "800" }}>Looks resolved</Text>
              </Pressable>
              <Pressable testID="review-dispute" disabled={busy} onPress={() => setDisputeOpen(true)} style={[styles.actS, { borderColor: colors.warning }]}>
                <Icon name="alert-outline" size={16} color={colors.warning} />
                <Text style={{ color: colors.warning, fontWeight: "800" }}>Question this</Text>
              </Pressable>
            </View>
          </Section>
        ) : null}

        {isAuthority ? (
          <Section title="Authority actions" colors={colors}>
            {!c.intervention ? (
              <Pressable testID="submit-intervention" disabled={busy} onPress={() => post(`/cases/${c.id}/intervention`, { description: c.commitment.intervention, proof_urls: ["https://images.unsplash.com/photo-1517511620798-cec17d428bc0?w=800"] })} style={[styles.actP, { backgroundColor: colors.brandPrimary }]}>
                <Icon name="hammer-wrench" size={16} color={colors.onBrandPrimary} />
                <Text style={{ color: colors.onBrandPrimary, fontWeight: "800" }}>Submit intervention & proof</Text>
              </Pressable>
            ) : null}
            {c.intervention && !c.outcome ? (
              <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                <Pressable testID="outcome-passed" disabled={busy} onPress={() => post(`/cases/${c.id}/outcome`, { outcome: "PASSED" })} style={[styles.actS, { borderColor: colors.success }]}><Text style={{ color: colors.success, fontWeight: "800" }}>Mark PASSED</Text></Pressable>
                <Pressable testID="outcome-failed" disabled={busy} onPress={() => post(`/cases/${c.id}/outcome`, { outcome: "FAILED" })} style={[styles.actS, { borderColor: colors.error }]}><Text style={{ color: colors.error, fontWeight: "800" }}>Mark FAILED</Text></Pressable>
                <Pressable testID="outcome-inconclusive" disabled={busy} onPress={() => post(`/cases/${c.id}/outcome`, { outcome: "INCONCLUSIVE" })} style={[styles.actS, { borderColor: colors.warning }]}><Text style={{ color: colors.warning, fontWeight: "800" }}>Inconclusive</Text></Pressable>
              </View>
            ) : null}
            {c.outcome === "FAILED" ? (
              <Pressable testID="create-corrective" disabled={busy} onPress={() => post(`/cases/${c.id}/corrective`, { intervention: "Corrective action required", observation_days: 60 })} style={[styles.actS, { borderColor: colors.warning, marginTop: 8 }]}>
                <Text style={{ color: colors.warning, fontWeight: "800" }}>Create corrective obligation</Text>
              </Pressable>
            ) : null}
            {c.review_status === "DISPUTED" ? (
              <View style={{ marginTop: 10, gap: 8 }} testID="dispute-resolution">
                <Text style={{ color: colors.warning, fontSize: 12 }}>Dispute: {c.dispute_resolution || "OPEN"}</Text>
                <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
                  {(["UPHELD", "OVERTURNED", "WITHDRAWN"] as const).map((resolution) => <Pressable key={resolution} disabled={busy} onPress={() => post(`/cases/${c.id}/dispute/resolve`, { resolution })} style={[styles.actS, { borderColor: colors.warning }]}><Text style={{ color: colors.warning, fontWeight: "800", fontSize: 11 }}>{resolution}</Text></Pressable>)}
                </View>
              </View>
            ) : null}
          </Section>
        ) : null}

        {c.outcome_evaluation ? (
          <Section title="Outcome engine" colors={colors}>
            <View style={[styles.eiBox, { borderColor: c.outcome === "PASSED" ? colors.success : c.outcome === "FAILED" ? colors.error : colors.warning, backgroundColor: colors.surfaceSecondary }]} testID="outcome-panel">
              <Text style={{ color: colors.onSurface, fontWeight: "900" }}>{c.outcome || "INCONCLUSIVE"} · {c.outcome_source === "manual" ? "manual override" : "engine evaluated"}</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>Rule: {c.outcome_evaluation.rule_type}</Text>
              {(c.outcome_evaluation.reasons || []).map((reason: string, i: number) => <Text key={i} style={{ color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 5 }}>• {reason}</Text>)}
            </View>
          </Section>
        ) : null}
        {c.recurrence_signals?.length ? (
          <Section title="Recurrence signals" colors={colors}>
            {c.recurrence_signals.map((signal: any) => <View key={signal.id} style={[styles.eiBox, { borderColor: signal.confirmed ? colors.error : colors.warning, backgroundColor: signal.confirmed ? "rgba(239,68,68,0.08)" : "rgba(245,158,11,0.08)" }]}><Text style={{ color: signal.confirmed ? colors.error : colors.warning, fontWeight: "900", fontSize: 12 }}>{signal.confirmed ? "CONFIRMED RECURRENCE" : "POSSIBLE RECURRENCE · UNCONFIRMED"}</Text><Text style={{ color: colors.muted, fontSize: 12, marginTop: 5 }}>{signal.note}</Text>{!signal.confirmed && (isAuthority || isOwner) ? <Pressable onPress={() => post(`/cases/${c.id}/recurrence/${signal.id}/confirm`)} style={[styles.actS, { borderColor: colors.warning, marginTop: 8 }]}><Text style={{ color: colors.warning, fontWeight: "800" }}>Confirm signal</Text></Pressable> : null}</View>)}
          </Section>
        ) : null}

        {c.corrective?.length ? (
          <Section title="Corrective obligations" colors={colors}>
            {c.corrective.map((co: any) => (
              <View key={co.id} style={{ padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, marginBottom: 8, backgroundColor: "rgba(245,158,11,0.06)" }}>
                <Text style={{ color: colors.warning, fontWeight: "800", fontSize: 12 }}>OPEN OBLIGATION</Text>
                <Text style={{ color: colors.onSurface, marginTop: 4 }}>{co.intervention}</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Observation {co.observation_days} days · {co.required_evidence}</Text>

                {co.checkpoints?.length ? (
                  <View style={{ marginTop: 10 }} testID={`checkpoints-${co.id}`}>
                    <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 }}>CHECKPOINTS</Text>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                      {co.checkpoints.map((cp: any) => {
                        const s = checkpointStyle(cp.status, colors);
                        return (
                          <View key={cp.day} style={[styles.cpChip, { borderColor: s.border, backgroundColor: s.bg }]}>
                            <Icon name={s.icon as any} size={12} color={s.fg} />
                            <Text style={{ color: s.fg, fontWeight: "800", fontSize: 11 }}>Day {cp.day} · {cp.status.replace("_", " ")}</Text>
                          </View>
                        );
                      })}
                    </View>
                    {isAuthority ? (
                      <View style={{ marginTop: 10, gap: 6 }}>
                        {co.checkpoints.map((cp: any) => (
                          <View key={`ctrl-${cp.day}`} style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", width: 54 }}>Day {cp.day}</Text>
                            {(["on_track", "at_risk", "met", "missed"] as const).map(st => (
                              <Pressable
                                key={st}
                                testID={`cp-${co.id}-${cp.day}-${st}`}
                                disabled={busy}
                                onPress={() => post(`/cases/${c.id}/corrective/${co.id}/checkpoint`, { day: cp.day, status: st })}
                                style={[styles.cpBtn, { borderColor: cp.status === st ? checkpointStyle(st, colors).border : colors.border, backgroundColor: cp.status === st ? checkpointStyle(st, colors).bg : "transparent" }]}
                              >
                                <Text style={{ color: cp.status === st ? checkpointStyle(st, colors).fg : colors.onSurfaceSecondary, fontWeight: "700", fontSize: 10 }}>
                                  {st.replace("_", " ")}
                                </Text>
                              </Pressable>
                            ))}
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            ))}
          </Section>
        ) : null}

        {(c.category || "").toLowerCase().startsWith("broken streetlight") && c.observation ? (
          <Section title="Night check" colors={colors}>
            <View style={[styles.night, { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Icon name="weather-night" size={16} color={colors.brandPrimary} />
                <Text style={{ color: colors.onSurface, fontWeight: "800" }}>Scheduled after dark · around 8 PM</Text>
              </View>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
                Independent night verification strengthens the outcome. Tap once you can see the pole tonight.
              </Text>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Pressable testID="night-on" disabled={busy} onPress={() => post(`/cases/${c.id}/night-check`, { outcome: "on" })} style={[styles.nightP, { backgroundColor: colors.success }]}>
                  <Icon name="lightbulb-on-outline" size={14} color="#022C22" />
                  <Text style={{ color: "#022C22", fontWeight: "800", fontSize: 12 }}>Light is ON</Text>
                </Pressable>
                <Pressable testID="night-off" disabled={busy} onPress={() => post(`/cases/${c.id}/night-check`, { outcome: "off" })} style={[styles.nightS, { borderColor: colors.error }]}>
                  <Icon name="lightbulb-off-outline" size={14} color={colors.error} />
                  <Text style={{ color: colors.error, fontWeight: "800", fontSize: 12 }}>Still OFF</Text>
                </Pressable>
              </View>
              {c.night_checks?.length ? (
                <View style={{ marginTop: 10, gap: 4 }}>
                  {c.night_checks.slice(-3).reverse().map((n: any) => (
                    <Text key={n.id} style={{ color: n.outcome === "on" ? colors.success : colors.error, fontSize: 11 }}>
                      · {n.outcome.toUpperCase()} · {new Date(n.at).toLocaleString()}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          </Section>
        ) : null}

        <DisputeSheet
          visible={disputeOpen}
          onClose={() => setDisputeOpen(false)}
          onSubmit={async (reason, note) => {
            await post(`/cases/${c.id}/review`, { decision: "dispute", reason, note });
          }}
        />

        <Section title="Authority updates" colors={colors}>
          {(c.replies || []).length === 0 ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>No public updates yet.</Text>
          ) : (
            <View style={{ gap: 8 }} testID="reply-thread">
              {c.replies.map((r: any) => (
                <View key={r.id} style={[styles.reply, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Icon name="account-tie" size={13} color={colors.brandPrimary} />
                    <Text style={{ color: colors.brandPrimary, fontWeight: "800", fontSize: 12 }}>{r.author_name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 10 }}>{new Date(r.created_at).toLocaleString()}</Text>
                  </View>
                  <Text style={{ color: colors.onSurface, marginTop: 4, fontSize: 13 }}>{r.body}</Text>
                </View>
              ))}
            </View>
          )}
          {isAuthority ? (
            <View style={{ marginTop: 10, flexDirection: "row", gap: 8 }}>
              <TextInput
                testID="reply-input"
                value={reply}
                onChangeText={setReply}
                placeholder="Post a public update (e.g., Water tanker dispatched at 3pm)"
                placeholderTextColor={colors.muted}
                multiline
                maxLength={500}
                style={[styles.replyInput, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary, color: colors.onSurface }]}
              />
              <Pressable
                testID="reply-submit"
                disabled={busy || !reply.trim()}
                onPress={async () => {
                  await post(`/cases/${c.id}/replies`, { body: reply.trim() });
                  setReply("");
                }}
                style={[styles.replyBtn, { backgroundColor: colors.brandPrimary, opacity: busy || !reply.trim() ? 0.5 : 1 }]}
              >
                <Icon name="send" size={16} color={colors.onBrandPrimary} />
              </Pressable>
            </View>
          ) : null}
        </Section>

        <Section title="Audit history" colors={colors}>
          {data.events.map((e) => (
            <View key={e.id} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border }}>
              <Text style={{ color: colors.onSurface, fontWeight: "700", fontSize: 13 }}>{e.type.replace(/_/g, " ")}</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{new Date(e.created_at).toLocaleString()} · {e.actor_role}</Text>
              <Text style={{ color: colors.muted, fontSize: 10, fontFamily: "monospace" }}>{e.hash.slice(0, 24)}…</Text>
            </View>
          ))}
        </Section>
      </ScrollView>

      <PhotoCompareSheet
        visible={!!compareOpen}
        onClose={() => setCompareOpen(null)}
        startIndex={compareOpen?.start ?? 0}
        images={(c.evidence || []).map((e: any) => ({ uri: e.url, type: e.type, captured_at: e.captured_at }))}
      />
    </View>
  );
}

function Section({ title, colors, children }: any) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={{ color: colors.onSurface, fontWeight: "800", fontSize: 14, letterSpacing: 0.4, marginBottom: 10 }}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}
function KV({ k, v, colors }: any) {
  return (
    <View style={{ paddingVertical: 6, flexDirection: "row" }}>
      <Text style={{ color: colors.muted, fontSize: 12, width: 110, fontWeight: "700" }}>{k}</Text>
      <Text style={{ color: colors.onSurface, flex: 1, fontSize: 13 }}>{v}</Text>
    </View>
  );
}

function checkpointStyle(status: string, colors: any) {
  switch (status) {
    case "met": return { border: colors.success, bg: "rgba(16,185,129,0.15)", fg: colors.success, icon: "check-circle" };
    case "on_track": return { border: colors.info, bg: "rgba(59,130,246,0.15)", fg: colors.info, icon: "progress-check" };
    case "at_risk": return { border: colors.warning, bg: "rgba(245,158,11,0.15)", fg: colors.warning, icon: "progress-alert" };
    case "missed": return { border: colors.error, bg: "rgba(239,68,68,0.15)", fg: colors.error, icon: "close-circle" };
    default: return { border: colors.border, bg: colors.surfaceTertiary, fg: colors.muted, icon: "circle-outline" };
  }
}

const styles = StyleSheet.create({
  h: { fontSize: 24, fontWeight: "800", marginTop: spacing.sm },
  simBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  simTag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "center" },
  actP: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, paddingVertical: 12, flex: 1 },
  actS: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: spacing.md, borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  cpChip: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  cpBtn: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 },
  eiBox: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  demoTag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  reply: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  replyInput: { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 13, minHeight: 44, maxHeight: 96, textAlignVertical: "top" },
  replyBtn: { width: 44, height: 44, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  night: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md },
  nightP: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  nightS: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
});
