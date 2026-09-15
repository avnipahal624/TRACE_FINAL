import Icon from "@react-native-vector-icons/material-design-icons";
import React, { useRef, useState } from "react";
import { Dimensions, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { spacing, useTheme } from "@/src/theme";

const { width: W, height: H } = Dimensions.get("window");

export function PhotoCompareSheet({
  visible,
  onClose,
  images,
  startIndex = 0,
}: {
  visible: boolean;
  onClose: () => void;
  images: { uri: string; type?: string; captured_at?: string }[];
  startIndex?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(startIndex);
  const listRef = useRef<FlatList<any>>(null);

  React.useEffect(() => { if (visible) setIndex(startIndex); }, [visible, startIndex]);

  const label = (t?: string) => (t === "before" ? "BEFORE" : t === "after" ? "AFTER" : "EVIDENCE");

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.backdrop, { backgroundColor: "rgba(0,0,0,0.95)" }]}>
        <FlatList
          ref={listRef}
          data={images}
          horizontal
          pagingEnabled
          keyExtractor={(_, i) => String(i)}
          initialScrollIndex={startIndex}
          getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / W))}
          renderItem={({ item }) => (
            <View style={{ width: W, height: H, alignItems: "center", justifyContent: "center" }}>
              <Image source={{ uri: item.uri }} style={styles.img} resizeMode="contain" />
            </View>
          )}
        />

        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={[styles.badge, { backgroundColor: colors.brandPrimary }]}>
              <Text style={{ color: colors.onBrandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 0.6 }}>{label(images[index]?.type)}</Text>
            </View>
            {images[index]?.captured_at ? (
              <Text style={{ color: "#F8FAFC", fontSize: 12 }}>{new Date(images[index].captured_at!).toLocaleString()}</Text>
            ) : null}
            <View style={{ flex: 1 }} />
            <Text style={{ color: "#F8FAFC", fontSize: 12, fontWeight: "700" }}>{index + 1} / {images.length}</Text>
          </View>
        </View>

        <Pressable testID="compare-close" onPress={onClose} style={[styles.close, { top: insets.top + 8 }]}>
          <Icon name="close" size={24} color="#F8FAFC" />
        </Pressable>

        {images.length > 1 ? (
          <View style={styles.dots} pointerEvents="none">
            {images.map((_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === index ? colors.brandPrimary : "rgba(255,255,255,0.35)" }]} />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  img: { width: W, height: H * 0.75 },
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: spacing.lg, paddingBottom: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  close: { position: "absolute", right: spacing.lg, width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)" },
  dots: { position: "absolute", bottom: 32, left: 0, right: 0, flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 999 },
});
