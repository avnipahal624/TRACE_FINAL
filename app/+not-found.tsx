import { Link } from "expo-router";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "@/src/theme";
export default function NotFound() { const { colors } = useTheme(); return <View style={[styles.wrap, { backgroundColor: colors.surface }]}><Text style={[styles.code, { color: colors.brandPrimary }]}>404</Text><Text style={[styles.title, { color: colors.onSurface }]}>This trail ends here.</Text><Text style={[styles.note, { color: colors.muted }]}>The page you requested is not part of the current accountability record.</Text><Link href="/(tabs)/home" style={[styles.link, { color: colors.brandPrimary }]}>Return to TRACE</Link></View>; }
const styles = StyleSheet.create({ wrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }, code: { fontSize: 64, fontWeight: "900" }, title: { fontSize: 24, fontWeight: "900", marginTop: 12 }, note: { textAlign: "center", lineHeight: 22, marginTop: 8, maxWidth: 320 }, link: { marginTop: 28, fontWeight: "800" } });
