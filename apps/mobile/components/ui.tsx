import { useEffect, useRef, useState, type PropsWithChildren } from "react";
import {
  AccessibilityInfo,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { nativeTokens as t } from "@fluivix/ui-tokens/native";
import { useSession } from "../lib/session";

export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: t.canvas },
  content: {
    padding: 20,
    gap: 16,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
  },
  title: { fontSize: 24, fontWeight: "600", color: t.text },
  text: { fontSize: 16, lineHeight: 24, color: t.text },
  muted: { fontSize: 16, lineHeight: 24, color: t.muted },
  panel: {
    padding: 16,
    gap: 12,
    backgroundColor: t.surface,
    borderRadius: t.radiusPanel,
  },
  input: {
    minHeight: 48,
    borderColor: t.control,
    borderWidth: 1,
    borderRadius: t.radiusInput,
    padding: 12,
    fontSize: 16,
    color: t.text,
  },
  button: {
    minHeight: 48,
    padding: 12,
    borderRadius: t.radiusInput,
    backgroundColor: t.primary,
    justifyContent: "center",
  },
  buttonText: {
    color: t.surface,
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  error: { color: t.danger, fontSize: 16, lineHeight: 24 },
});
export function Body({ children }: PropsWithChildren) {
  return <Text style={styles.text}>{children}</Text>;
}
export function Panel({ children }: PropsWithChildren) {
  return <View style={styles.panel}>{children}</View>;
}
export function Screen({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  const session = useSession();
  return (
    <SafeAreaView style={styles.page} edges={["left", "right", "bottom"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <Text accessibilityRole="header" style={styles.title}>
            {title}
          </Text>
          {session.activeTenant?.status === "READ_ONLY" && (
            <Text accessibilityRole="alert" style={styles.error}>
              Trung tâm đang ở chế độ chỉ đọc. Bạn vẫn xem được dữ liệu theo
              quyền.
            </Text>
          )}
          {session.activeTenant?.status === "PAST_DUE_GRACE" && (
            <Text style={styles.muted}>
              Gói dịch vụ đang trong thời gian gia hạn.
            </Text>
          )}
          {session.child && (
            <Text style={styles.text}>Học viên: {session.child.fullName}</Text>
          )}
          {!session.online && (
            <Text accessibilityRole="alert" style={styles.error}>
              Mất kết nối. Các thao tác chưa được xác nhận trên máy chủ.
            </Text>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  primary = false,
  selected = false,
  label,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  selected?: boolean;
  label?: string;
}) {
  const [reduced, setReduced] = useState(true);
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => sub.remove();
  }, []);
  function press(value: number) {
    Animated.timing(scale, {
      toValue: reduced ? 1 : value,
      duration: t.pressMs,
      useNativeDriver: true,
    }).start();
  }
  return (
    <Animated.View
      style={{ transform: [{ scale }], opacity: disabled ? 0.55 : 1 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? title}
        accessibilityState={{ disabled, selected }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => press(0.98)}
        onPressOut={() => press(1)}
        style={[
          styles.button,
          { backgroundColor: primary || selected ? t.primary : t.border },
        ]}
      >
        <Text
          style={[
            styles.buttonText,
            { color: primary || selected ? t.surface : t.text },
          ]}
        >
          {title}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
export function Field({
  label,
  error,
  ...props
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.text}>{label}</Text>
      <TextInput {...props} accessibilityLabel={label} style={styles.input} />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
export function Failure({ error }: { error: unknown }) {
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {error instanceof Error ? error.message : String(error)}
    </Text>
  );
}
