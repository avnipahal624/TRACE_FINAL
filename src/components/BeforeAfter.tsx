import React, { useRef, useState } from "react";
import { LayoutChangeEvent, PanResponder, StyleSheet, Text, View, Image } from "react-native";
import { radius, spacing, useTheme } from "../theme";

export function BeforeAfter({ before, after, beforeDate, afterDate }: { before: string; after: string; beforeDate?: string; afterDate?: string }) {
  const { colors } = useTheme();
  const [w, setW] = useState(1);
  const [pos, setPos] = useState(0.5);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (e, g) => {
        const x = Math.max(0, Math.min(w, g.moveX - (e.nativeEvent.pageX - g.moveX < 0 ? 0 : 0)));
        // simpler: use locationX via a ref? we use moveX with layout offset instead
        setPos(Math.max(0, Math.min(1, g.moveX / w)));
      },
    }),
  ).current;

  return (
    <View
      testID="before-after"
      style={[styles.wrap, { borderColor: colors.border }]}
      onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width || 1)}
    >
      <Image source={{ uri: after }} style={styles.img} />
      <View style={[styles.clip, { width: `${pos * 100}%` }]}>
        <Image source={{ uri: before }} style={[styles.img, { width: w }]} />
      </View>
      <View style={[styles.badge, styles.left, { backgroundColor: colors.surfaceInverse + "DD" }]}>
        <Text style={[styles.badgeTxt, { color: colors.onSurfaceInverse }]}>BEFORE{beforeDate ? ` · ${beforeDate}` : ""}</Text>
      </View>
      <View style={[styles.badge, styles.right, { backgroundColor: colors.surfaceInverse + "DD" }]}>
        <Text style={[styles.badgeTxt, { color: colors.onSurfaceInverse }]}>AFTER{afterDate ? ` · ${afterDate}` : ""}</Text>
      </View>
      <View style={[styles.handleTrack, { left: `${pos * 100}%` }]} pointerEvents="none">
        <View style={[styles.handleLine, { backgroundColor: "#FFFFFFE6" }]} />
      </View>
      <View
        testID="before-after-handle"
        style={[styles.handleHit, { left: `${pos * 100}%` }]}
        {...responder.panHandlers}
      >
        <View style={[styles.handleDot, { backgroundColor: colors.brandPrimary }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%", aspectRatio: 16 / 10, borderRadius: radius.lg, overflow: "hidden", borderWidth: 1, position: "relative", backgroundColor: "#000" },
  img: { width: "100%", height: "100%", resizeMode: "cover" },
  clip: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  badge: { position: "absolute", top: spacing.sm, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  left: { left: spacing.sm },
  right: { right: spacing.sm },
  badgeTxt: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  handleTrack: { position: "absolute", top: 0, bottom: 0, marginLeft: -1 },
  handleLine: { width: 2, height: "100%" },
  handleHit: { position: "absolute", top: 0, bottom: 0, width: 44, marginLeft: -22, alignItems: "center", justifyContent: "center" },
  handleDot: { width: 32, height: 32, borderRadius: 999, borderWidth: 3, borderColor: "#FFFFFF" },
});
