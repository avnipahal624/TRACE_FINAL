import Icon from "@react-native-vector-icons/material-design-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/src/theme";

function TabIcon({ name, focused, colors, label }: any) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", paddingTop: 4 }}>
      <Icon name={name} size={22} color={focused ? colors.brandPrimary : colors.muted} />
      <Text style={{ fontSize: 10, fontWeight: "700", color: focused ? colors.brandPrimary : colors.muted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            borderTopWidth: 1,
            height: 64 + insets.bottom,
            paddingBottom: insets.bottom,
            paddingTop: 4,
            ...(Platform.OS === "web" ? { height: 72 } : {}),
          },
          tabBarItemStyle: { alignSelf: "center" },
        }}
      >
        <Tabs.Screen name="home" options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="home-variant-outline" colors={colors} label="Home" /> }} />
        <Tabs.Screen name="cases" options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="folder-multiple-outline" colors={colors} label="Cases" /> }} />
        <Tabs.Screen name="activity" options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="pulse" colors={colors} label="Activity" /> }} />
        <Tabs.Screen name="memory" options={{ tabBarIcon: ({ focused }) => <TabIcon focused={focused} name="book-clock-outline" colors={colors} label="Memory" /> }} />
      </Tabs>

      <Pressable
        testID="report-fab"
        onPress={() => router.push("/report")}
        style={[styles.fab, { bottom: 64 + insets.bottom + 12 }]}
      >
        <LinearGradient colors={[colors.brand, colors.brandPrimary]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <Icon name="plus" size={22} color={colors.onBrandPrimary} />
        <Text style={[styles.fabTxt, { color: colors.onBrandPrimary }]}>Report</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    right: 20,
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  fabTxt: { fontSize: 14, fontWeight: "800" },
});
