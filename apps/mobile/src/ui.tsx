import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  useColorScheme,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";

const palettes = {
  light: {
    background: "#F7F3EA",
    surface: "#FFFFFF",
    surfaceRaised: "#FFFFFF",
    surfaceMuted: "#E8E3D9",
    textPrimary: "#292D25",
    textSecondary: "#666A5D",
    action: "#A4432D",
    onAction: "#FFF9F2",
    borderControl: "#858B7A",
    divider: "#E8E3D9",
    sage: "#DCE5D3",
    olive: "#40522D",
    dangerBackground: "#FBE5DE",
    dangerText: "#9C302F",
    warningBackground: "#FFF0CC",
    warningText: "#785016",
  },
  dark: {
    background: "#191C17",
    surface: "#242820",
    surfaceRaised: "#30352C",
    surfaceMuted: "#30352C",
    textPrimary: "#F6F2E8",
    textSecondary: "#B8BEAE",
    action: "#E8A087",
    onAction: "#251D19",
    borderControl: "#7D8573",
    divider: "#42483B",
    sage: "#29351F",
    olive: "#CBDDAF",
    dangerBackground: "#432522",
    dangerText: "#FFB4A9",
    warningBackground: "#3D301D",
    warningText: "#F4CC83",
  },
};
export function useTheme() {
  return palettes[useColorScheme() === "dark" ? "dark" : "light"];
}
export function Screen({
  children,
  title,
  subtitle,
  eyebrow,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  eyebrow?: string;
}) {
  const t = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
          <View style={styles.content}>
            <Text style={[styles.wordmark, { color: t.action }]}>
              stockpot<Text style={{ color: t.olive }}>.</Text>
            </Text>
            {eyebrow ? (
              <Text style={[styles.eyebrow, { color: t.textSecondary }]}>{eyebrow}</Text>
            ) : null}
            <Text accessibilityRole="header" style={[styles.title, { color: t.textPrimary }]}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: t.textSecondary }]}>{subtitle}</Text>
            ) : null}
            <View style={styles.body}>{children}</View>
            <Text style={[styles.footer, { color: t.textSecondary }]}>
              Make more of what you’ve got.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: t.textPrimary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.textSecondary}
        autoCapitalize="none"
        {...props}
        style={[
          styles.input,
          { backgroundColor: t.surface, borderColor: t.borderControl, color: t.textPrimary },
          props.style,
        ]}
      />
    </View>
  );
}
export function Button({
  label,
  onPress,
  loading,
  secondary,
  disabled,
}: {
  label: string;
  onPress: () => void | Promise<void>;
  loading?: boolean;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: secondary ? t.surface : t.action,
          borderColor: pressed ? t.textPrimary : secondary ? t.borderControl : t.action,
          borderWidth: pressed ? 2 : 1,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={secondary ? t.textPrimary : t.onAction} /> : null}
      <Text style={[styles.buttonLabel, { color: secondary ? t.textPrimary : t.onAction }]}>
        {label}
      </Text>
    </Pressable>
  );
}
export function Notice({ children, error }: { children: ReactNode; error?: boolean }) {
  const t = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.notice, { backgroundColor: error ? t.dangerBackground : t.sage }]}
    >
      <Text style={[styles.noticeText, { color: error ? t.dangerText : t.olive }]}>{children}</Text>
    </View>
  );
}
export function TextLink({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void | Promise<void>;
}) {
  const t = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.link}>
      <Text style={[styles.linkLabel, { color: t.action }]}>{label}</Text>
    </Pressable>
  );
}
export function Card({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.surface }]}>{children}</View>;
}
export function Body({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.copy, { color: t.textSecondary }]}>{children}</Text>;
}
const styles = StyleSheet.create({
  page: { flexGrow: 1, paddingHorizontal: 20, paddingVertical: 32, justifyContent: "center" },
  content: { width: "100%", maxWidth: 480, alignSelf: "center" },
  wordmark: { fontSize: 29, fontWeight: "800", letterSpacing: -1.5, marginBottom: 48 },
  eyebrow: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
  title: { fontSize: 34, lineHeight: 41, fontWeight: "600", letterSpacing: -0.8 },
  subtitle: { fontSize: 17, lineHeight: 25, marginTop: 12 },
  body: { gap: 16, marginTop: 28 },
  footer: { fontSize: 13, lineHeight: 20, marginTop: 40 },
  label: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 17,
  },
  button: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 12,
  },
  buttonLabel: { fontSize: 17, lineHeight: 23, fontWeight: "600" },
  notice: { borderRadius: 12, padding: 16 },
  noticeText: { fontSize: 15, lineHeight: 22 },
  link: { minHeight: 48, justifyContent: "center", alignItems: "center", padding: 8 },
  linkLabel: { fontSize: 15, textDecorationLine: "underline", lineHeight: 22 },
  card: { borderRadius: 16, padding: 20, gap: 12 },
  copy: { fontSize: 17, lineHeight: 25 },
});
