import type { ComponentType } from "react";
import { BookOpen, ChevronLeft, ChevronRight, House, Inbox, Plus, Settings, Users, X } from "lucide-react-native";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";
import { colors, fonts, gradients, radii, space } from "./theme";
import type { FontWeight } from "./theme";
import { formatPaise } from "./domain";
import type { Screen as ScreenId, Transaction } from "./domain";
import { useApp } from "./store";

export const NAV_SCREENS: ScreenId[] = [
  "home",
  "inbox",
  "ledger",
  "people",
  "settings",
];

/* ---------------------------------------------------------------- text */

export function T({
  children,
  size = 15,
  weight = "regular",
  color = colors.text,
  style,
  numberOfLines,
  accessibilityRole,
}: {
  children: ReactNode;
  size?: number;
  weight?: FontWeight;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  accessibilityRole?: "header" | "text" | "link";
}) {
  return (
    <Text
      accessibilityRole={accessibilityRole}
      numberOfLines={numberOfLines}
      style={[{ color, fontSize: size, fontFamily: fonts[weight] }, style]}
    >
      {children}
    </Text>
  );
}

export function M({
  children,
  size = 13,
  style,
}: {
  children: ReactNode;
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <T size={size} color={colors.muted} style={style}>
      {children}
    </T>
  );
}

export function B({
  children,
  size = 16,
  color = colors.text,
  style,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <T size={size} weight="bold" color={color} style={style}>
      {children}
    </T>
  );
}

/* -------------------------------------------------------------- layout */

export function Row({
  children,
  style,
  gap = 0,
  start = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
  start?: boolean;
}) {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: start ? "flex-start" : "space-between",
          gap,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Card({
  children,
  style,
  tone,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  tone?: "hero" | "soft" | "plain";
}) {
  const base = [styles.card, style];
  if (!tone || tone === "plain") return <View style={base}>{children}</View>;
  return (
    <LinearGradient
      colors={tone === "hero" ? gradients.hero : gradients.soft}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={[styles.card, styles.cardGradient, style]}
    >
      {children}
    </LinearGradient>
  );
}

/**
 * Screen chrome: the gradient backdrop, safe-area padding and scroll body of
 * the preview's `.s` container. `footer` reproduces the sticky action buttons.
 */
export function Screen({
  children,
  footer,
  variant = "scroll",
  contentStyle,
}: {
  children: ReactNode;
  footer?: ReactNode;
  variant?: "scroll" | "fixed";
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const { state } = useApp();
  const showNav = NAV_SCREENS.includes(state.screen);
  const navPad = showNav ? space.navHeight + space.navInset + 10 : 0;

  return (
    <View style={styles.flex} accessibilityViewIsModal={false}>
      <LinearGradient
        colors={gradients.screen}
        locations={[0, 0.42, 1]}
        start={{ x: 0.85, y: 0 }}
        end={{ x: 0.1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {variant === "fixed" ? (
        <View
          style={[
            styles.flex,
            {
              paddingHorizontal: space.screenX,
              paddingTop: insets.top + space.screenTop,
              paddingBottom: insets.bottom,
            },
            contentStyle,
          ]}
        >
          {children}
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            {
              paddingHorizontal: space.screenX,
              paddingTop: insets.top + space.screenTop,
              paddingBottom: insets.bottom + navPad + 20,
            },
            contentStyle,
          ]}
        >
          {children}
        </ScrollView>
      )}
      {footer ? (
        <View
          style={{
            paddingHorizontal: space.screenX,
            paddingTop: 8,
            paddingBottom: insets.bottom + navPad + 12,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}

export function PageHeader({
  title,
  onBack,
  right,
  large = false,
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  large?: boolean;
}) {
  return (
    <Row style={{ minHeight: 44 }}>
      <Row start gap={6} style={{ flexShrink: 1 }}>
        {onBack ? (
          <IconBtn label="Back" onPress={onBack}>
            <ChevronLeft size={22} color={colors.text} />
          </IconBtn>
        ) : null}
        <T
          accessibilityRole="header"
          size={large ? 26 : 20}
          weight={large ? "heavy" : "bold"}
          numberOfLines={1}
        >
          {title}
        </T>
      </Row>
      {right}
    </Row>
  );
}

/* ------------------------------------------------------------- buttons */

export function IconBtn({
  label,
  onPress,
  children,
  variant = "plain",
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  variant?: "plain" | "fab";
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconBtn,
        variant === "fab" && styles.fab,
        pressed && styles.pressed,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = "lime",
  disabled = false,
  small = false,
  icon,
  style,
  labelColor,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: "lime" | "ghost";
  disabled?: boolean;
  small?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  labelColor?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        small && { height: 44 },
        variant === "lime" ? styles.lime : styles.ghost,
        disabled && styles.disabled,
        pressed && styles.pressed,
        style,
      ]}
    >
      {icon}
      <T
        size={small ? 14 : 16}
        weight={variant === "lime" ? "bold" : "semi"}
        color={
          labelColor ?? (variant === "lime" ? colors.limeDark : colors.text)
        }
      >
        {label}
      </T>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected ? { backgroundColor: colors.lime } : styles.chipGhost,
        pressed && styles.pressed,
      ]}
    >
      <T
        size={14}
        weight="bold"
        color={selected ? colors.limeDark : colors.text}
      >
        {label}
      </T>
    </Pressable>
  );
}

export function LinkButton({
  label,
  onPress,
  color = colors.muted,
  style,
}: {
  label: string;
  onPress: () => void;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        { paddingVertical: 6, paddingHorizontal: 4 },
        pressed && styles.pressed,
        style,
      ]}
    >
      <T size={13} color={color}>
        {label}
      </T>
    </Pressable>
  );
}

export function Pill({
  children,
  tone = "lime",
}: {
  children: ReactNode;
  tone?: "lime" | "amber";
}) {
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: tone === "lime" ? colors.limeBg : colors.amberBg,
        },
      ]}
    >
      <T
        size={tone === "lime" ? 12 : 11}
        weight={tone === "lime" ? "bold" : "regular"}
        color={tone === "lime" ? colors.lime : colors.amber}
      >
        {children}
      </T>
    </View>
  );
}

/* --------------------------------------------------------------- lists */

export function Avatar({
  transaction,
  size = 44,
}: {
  transaction: Transaction;
  size?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        {
          backgroundColor: transaction.color,
          width: size,
          height: size,
          borderRadius: size >= 56 ? 18 : 14,
        },
      ]}
    >
      <T size={16} weight="heavy" color={transaction.textColor ?? "#fff"}>
        {transaction.title.charAt(0).toUpperCase()}
      </T>
    </View>
  );
}

export function TxnRow({
  transaction,
  onPress,
  showStatus = true,
}: {
  transaction: Transaction;
  onPress?: () => void;
  showStatus?: boolean;
}) {
  const received = transaction.direction === "received";
  const amount = `${received ? "+" : ""}${formatPaise(transaction.amountPaise)}`;
  const meta = [transaction.category, transaction.mode, transaction.time]
    .filter(Boolean)
    .join(", ");
  const body = (
    <>
      <Row start gap={12} style={{ flex: 1 }}>
        <Avatar transaction={transaction} />
        <View style={{ flexShrink: 1 }}>
          <B size={15}>{transaction.title}</B>
          <M size={12}>{meta}</M>
        </View>
      </Row>
      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <B color={received ? colors.lime : colors.text}>{amount}</B>
        {showStatus && transaction.status !== "user_confirmed" ? (
          <Pill tone="amber">Unverified</Pill>
        ) : null}
      </View>
    </>
  );
  if (!onPress) return <Row style={styles.txnRow}>{body}</Row>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${transaction.title}, ${amount}`}
      onPress={onPress}
      style={({ pressed }) => [styles.txnRow, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

export function SettingRow({
  title,
  subtitle,
  right,
  onPress,
  first = false,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
}) {
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <B size={15}>{title}</B>
        <M size={12} style={{ marginTop: 2, lineHeight: 16 }}>
          {subtitle}
        </M>
      </View>
      {right}
      {onPress ? (
        <ChevronRight size={18} color={colors.dim} />
      ) : null}
    </>
  );
  const style = [styles.settingRow, !first && styles.hairlineTop];
  if (!onPress) return <Row style={style}>{body}</Row>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      {body}
    </Pressable>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onChange}
      style={styles.switchHit}
    >
      <View
        style={[
          styles.switchTrack,
          { backgroundColor: checked ? colors.lime : "rgba(255,255,255,0.18)" },
        ]}
      >
        <View
          style={[
            styles.switchKnob,
            {
              left: checked ? 21 : 3,
              backgroundColor: checked ? colors.limeDark : colors.text,
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

export function Radio({ on }: { on: boolean }) {
  return (
    <View style={[styles.radio, on && { borderColor: colors.lime }]}>
      {on ? <View style={styles.radioDot} /> : null}
    </View>
  );
}

/* -------------------------------------------------------------- inputs */

export function Input({
  label,
  value,
  onChangeText,
  placeholder,
  style,
  textStyle,
  multiline = false,
  secure = false,
  keyboardType,
  onSubmitEditing,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  multiline?: boolean;
  secure?: boolean;
  keyboardType?: "default" | "decimal-pad";
  onSubmitEditing?: () => void;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
}) {
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.dim}
      multiline={multiline}
      secureTextEntry={secure}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      onSubmitEditing={onSubmitEditing}
      blurOnSubmit={!multiline}
      returnKeyType={multiline ? "default" : "send"}
      selectionColor={colors.lime}
      style={[styles.input, textStyle, style]}
    />
  );
}

/* ------------------------------------------------------------ chrome */

const NAV: Array<{
  screen: ScreenId;
  label: string;
  icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
}> = [
  { screen: "home", label: "Home", icon: House },
  { screen: "inbox", label: "Inbox", icon: Inbox },
  { screen: "ledger", label: "Ledger", icon: BookOpen },
  { screen: "people", label: "People", icon: Users },
  { screen: "settings", label: "Settings", icon: Settings },
];

export function BottomNav({
  current,
  pendingCount,
}: {
  current: ScreenId;
  pendingCount: number;
}) {
  const { dispatch } = useApp();
  const insets = useSafeAreaInsets();
  const [add_open, set_add_open] = useState(false);
  return (
    <View
      accessibilityRole="tablist"
      style={[styles.nav, { bottom: insets.bottom + space.navInset }]}
    >
      {NAV.map(({ screen, label, icon: Icon }) => {
        const on = current === screen;
        return (
          <Pressable
            key={screen}
            accessibilityRole="tab"
            accessibilityLabel={label}
            accessibilityState={{ selected: on }}
            onPress={() => {
              set_add_open(false);
              dispatch({ type: "navigate", screen });
            }}
            style={styles.navItem}
          >
            <Icon
              size={18}
              color={on ? colors.lime : colors.muted}
              strokeWidth={2.2}
            />
            <T size={11} weight="semi" color={on ? colors.lime : colors.muted}>
              {label}
            </T>
            <View
              style={[
                styles.navUnderline,
                on && { backgroundColor: colors.lime },
              ]}
            />
            {screen === "inbox" && pendingCount > 0 ? (
              <View style={styles.navBadge}>
                <T size={10} weight="heavy" color="#1a1000">
                  {String(pendingCount)}
                </T>
              </View>
            ) : null}
          </Pressable>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add or ask"
        accessibilityState={{ expanded: add_open }}
        onPress={() => set_add_open((v) => !v)}
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.lime,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {add_open ? (
          <X size={24} color={colors.limeDark} strokeWidth={2.6} />
        ) : (
          <Plus size={24} color={colors.limeDark} strokeWidth={2.6} />
        )}
      </Pressable>
      {add_open ? (
        <View
          style={{
            position: "absolute",
            right: 0,
            bottom: space.navHeight + 8,
            backgroundColor: colors.panel,
            padding: 12,
            borderRadius: 16,
            gap: 8,
            width: 220,
            borderWidth: 1,
            borderColor: "rgba(190,255,120,0.25)",
          }}
        >
          <Button
            label="Ask by message"
            accessibilityLabel="Open assistant chat"
            onPress={() => {
              set_add_open(false);
              dispatch({ type: "navigate", screen: "chat" });
            }}
          />
          <Button
            label="Add transaction"
            accessibilityLabel="Add a transaction"
            variant="ghost"
            onPress={() => {
              set_add_open(false);
              dispatch({ type: "navigate", screen: "add" });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

export function Toast() {
  const { state, dispatch } = useApp();
  const insets = useSafeAreaInsets();
  if (!state.toast) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.toast, { bottom: insets.bottom + 92 }]}
    >
      <T size={13} style={{ flex: 1 }}>
        {state.toast}
      </T>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        onPress={() => dispatch({ type: "clear_toast" })}
        hitSlop={12}
      >
        <T size={18} color={colors.muted}>
          ×
        </T>
      </Pressable>
    </View>
  );
}

/** The hero sparkline, ported from the preview's inline SVG polyline. */
export function Sparkline() {
  return (
    <View accessibilityElementsHidden style={{ marginTop: 8 }}>
      <Svg viewBox="0 0 300 60" width="100%" height={60}>
        <Polyline
          fill="none"
          stroke={colors.lime}
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
          points="0,48 40,44 80,40 110,46 150,34 190,38 230,22 270,8 300,14"
        />
      </Svg>
    </View>
  );
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <Card style={{ marginTop: 16, gap: 6 }}>
      <B>{title}</B>
      <M>{copy}</M>
    </Card>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <T
      size={14}
      weight="bold"
      style={{ marginTop: 16, marginHorizontal: 4, marginBottom: 8 }}
    >
      {children}
    </T>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: radii.card,
    padding: space.card,
  },
  cardGradient: { backgroundColor: "transparent" },
  iconBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    backgroundColor: colors.lime,
    borderRadius: 22,
    width: 44,
    height: 44,
  },
  button: {
    height: 52,
    borderRadius: radii.chip,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 18,
  },
  lime: { backgroundColor: colors.lime },
  ghost: {
    backgroundColor: colors.ghost,
    borderWidth: 1,
    borderColor: colors.ghostBorder,
  },
  chip: {
    height: 44,
    borderRadius: radii.chip,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  chipGhost: { backgroundColor: colors.chip },
  pill: {
    borderRadius: radii.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
  avatar: { alignItems: "center", justifyContent: "center" },
  txnRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 9,
    minHeight: 62,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  hairlineTop: {
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  switchHit: {
    width: 48,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  switchTrack: { width: 46, height: 28, borderRadius: 14 },
  switchKnob: {
    position: "absolute",
    top: 3,
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.dim,
    alignItems: "center",
    justifyContent: "center",
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.lime,
  },
  input: {
    color: colors.text,
    fontFamily: fonts.regular,
    fontSize: 15,
    padding: 0,
  },
  nav: {
    position: "absolute",
    left: 12,
    right: 12,
    height: space.navHeight,
    borderRadius: radii.nav,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: "rgba(190,255,120,0.14)",
  },
  navItem: {
    minWidth: 56,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 4,
  },
  navUnderline: {
    height: 3,
    width: 18,
    borderRadius: 3,
    backgroundColor: "transparent",
  },
  navBadge: {
    position: "absolute",
    top: 0,
    right: 6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.amber,
    alignItems: "center",
    justifyContent: "center",
  },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: colors.toastBg,
    borderWidth: 1,
    borderColor: "rgba(184,242,60,0.4)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
});
