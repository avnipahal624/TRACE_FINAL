// TRACE theme — dark-first, dual-mode (Civic + Women)
import { useEffect, useMemo, useState } from "react";
import { StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

export type ColorScheme = "light" | "dark";
export type AppMode = "civic" | "women";

const base = {
  surface: "#060B14",
  onSurface: "#F8FAFC",
  surfaceSecondary: "#0A1220",
  onSurfaceSecondary: "#F1F5F9",
  surfaceTertiary: "#111D35",
  onSurfaceTertiary: "#E2E8F0",
  surfaceInverse: "#F8FAFC",
  onSurfaceInverse: "#060B14",
  muted: "#64748B",
  success: "#10B981",
  onSuccess: "#022C22",
  warning: "#F59E0B",
  onWarning: "#451A03",
  error: "#EF4444",
  onError: "#450A0A",
  info: "#3B82F6",
  onInfo: "#0F172A",
  border: "#1E293B",
  borderStrong: "#334155",
  divider: "#0F172A",
  brand: "#00E5FF",
  onBrand: "#060B14",
};

const civic = {
  ...base,
  brandPrimary: "#00C2D6",
  onBrandPrimary: "#002D33",
  brandSecondary: "#00808F",
  onBrandSecondary: "#E0FBFF",
  brandTertiary: "#003D47",
  onBrandTertiary: "#B3F6FF",
  glow: "rgba(0, 194, 214, 0.20)",
  glowStrong: "rgba(0, 229, 255, 0.35)",
};

const women = {
  ...base,
  brand: "#F06292",
  onBrand: "#2A0018",
  brandPrimary: "#C2185B",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#880E4F",
  onBrandSecondary: "#FCE4EC",
  brandTertiary: "#4A0024",
  onBrandTertiary: "#F8BBD0",
  glow: "rgba(194, 24, 91, 0.22)",
  glowStrong: "rgba(240, 98, 146, 0.35)",
};

export type ThemeColors = typeof civic;

export const themes: { civic: ThemeColors; women: ThemeColors } = { civic, women };

// Simple global mode subscribable
let currentMode: AppMode = "civic";
const listeners = new Set<(m: AppMode) => void>();
export function setAppMode(m: AppMode) {
  currentMode = m;
  void AsyncStorage.setItem("trace.mode", m);
  listeners.forEach((l) => l(m));
}
export function getAppMode(): AppMode {
  return currentMode;
}
export function subscribeMode(fn: (m: AppMode) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useAppMode(): [AppMode, (m: AppMode) => void] {
  const [m, setM] = useState<AppMode>(currentMode);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem("trace.mode").then((stored) => {
      if (active && (stored === "civic" || stored === "women")) setAppMode(stored);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { const unsubscribe = subscribeMode(setM); return () => { unsubscribe(); }; }, []);
  return [m, setAppMode];
}

export function useTheme(): { mode: AppMode; colors: ThemeColors } {
  const [mode] = useAppMode();
  return { mode, colors: themes[mode] };
}

// Back-compat alias for `colors` static import used in a few places
export const colors: ThemeColors = civic;

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors, mode: AppMode) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors, mode } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors, mode)), [colors, mode]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const radius = { sm: 6, md: 12, lg: 20, xl: 28, pill: 999 };
