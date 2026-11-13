/**
 * Native chat primitives, modelled on the shape of Vercel AI Elements'
 * composable pieces (reasoning block, tool card, message actions) but written
 * against React Native views and Vittaz's own tokens.
 *
 * AI Elements itself cannot be used here: it requires Next.js, shadcn/ui and
 * Tailwind, and has no React Native build. assistant-ui does ship a native
 * package, but it takes over thread state and expects a server chat endpoint
 * whose transport streams from `/api/chat`; Vittaz runs its read-only QA loop
 * on the device with BYOK keys, so adopting it would move the safety-critical
 * layer off-device. The visual vocabulary is therefore reproduced natively.
 *
 * Animation follows the app's existing convention: `useNativeDriver` and
 * Reduce Motion is honoured, matching OnboardingScreen.
 */
import { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Feather } from "@expo/vector-icons";
import { colors } from "./theme";
import type { ChatStep } from "./domain";
import { B, M, Row, T } from "./ui";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function useReduceMotion(): boolean {
  const [reduce, set_reduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(set_reduce);
  }, []);
  return reduce;
}

/** Loops a native-driver value 0→1 while `active`, stopping under Reduce Motion. */
function useLoop(active: boolean, duration = 1400): Animated.Value {
  const [value] = useState(() => new Animated.Value(0));
  const reduce = useReduceMotion();
  useEffect(() => {
    if (!active || reduce) return;
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [active, duration, reduce, value]);
  return value;
}

/**
 * Three-dot "working" mark drawn as SVG rather than a spinner, so the shape
 * matches the rest of the app instead of the platform default.
 */
export function ThinkingDots({ label }: { label: string }) {
  // The dots fade in sequence; a single driver value drives all three offsets.
  const progress = useLoop(true);
  const reduce = useReduceMotion();
  const dots = [0, 1, 2];
  return (
    <Row start gap={8} style={{ alignItems: "center" }}>
      <Svg width={34} height={14} accessibilityElementsHidden>
        {dots.map((index) => {
          // Stagger by shifting this dot's slice of the shared 0→1 loop.
          const shift = index / dots.length;
          const opacity = reduce
            ? 0.75
            : progress.interpolate({
                inputRange: [0, shift, shift + 0.2, 1],
                outputRange: [0.25, 0.25, 1, 0.25],
                extrapolate: "clamp",
              });
          return (
            <AnimatedCircle
              key={index}
              cx={5 + index * 11}
              cy={7}
              r={3.6}
              fill={colors.lime}
              opacity={opacity}
            />
          );
        })}
      </Svg>
      <M size={12}>{label}</M>
    </Row>
  );
}

/**
 * Collapsible record of the read-only lookups behind an answer.
 *
 * AI Elements collapses a reasoning block once it completes. This one starts
 * expanded on purpose: in a ledger assistant the lookups are a trust signal —
 * the owner should be able to see what was read without hunting for it — so
 * collapsing is the owner's choice, never the default.
 */
export function ReasoningBlock({
  steps,
  running,
}: {
  steps: ChatStep[];
  running: boolean;
}) {
  const [open, set_open] = useState(true);
  if (steps.length === 0) return null;
  const summary =
    steps.length === 1
      ? "1 ledger lookup"
      : `${steps.length} ledger lookups`;
  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(190,255,120,0.22)",
        backgroundColor: "rgba(184,242,60,0.06)",
        overflow: "hidden",
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? `Hide ${summary}` : `Show ${summary}`}
        accessibilityState={{ expanded: open }}
        onPress={() => set_open((value) => !value)}
        style={({ pressed }) => [
          {
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 12,
            paddingHorizontal: 14,
            minHeight: 44,
          },
          pressed && { opacity: 0.7 },
        ]}
      >
        <Feather
          name={running ? "loader" : "check-circle"}
          size={14}
          color={colors.lime}
        />
        <T size={13} weight="semi" style={{ flex: 1 }}>
          {running ? "Reading your ledger" : summary}
        </T>
        <Feather
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
        />
      </Pressable>
      {open
        ? steps.map((step) => (
            <View
              key={step.tool}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderTopWidth: 1,
                borderTopColor: colors.hairline,
              }}
            >
              <Row start gap={10} style={{ alignItems: "flex-start" }}>
                <StepGlyph state={step.state} />
                <View style={{ flex: 1 }}>
                  <B size={14}>{step.label}</B>
                  <Row start gap={6} style={{ marginTop: 4, flexWrap: "wrap" }}>
                    <View
                      style={{
                        backgroundColor: "rgba(184,242,60,0.12)",
                        borderRadius: 8,
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                      }}
                    >
                      <T size={12} weight="bold" color={colors.lime}>
                        {step.tool}
                      </T>
                    </View>
                    <M size={12}>{step.detail}</M>
                  </Row>
                </View>
              </Row>
            </View>
          ))
        : null}
    </View>
  );
}

function StepGlyph({ state }: { state: ChatStep["state"] }) {
  if (state === "done")
    return (
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.lime,
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        <Feather name="check" size={11} color={colors.limeDark} />
      </View>
    );
  if (state === "running") return <SpinningRing />;
  return (
    <View
      style={{
        width: 18,
        height: 18,
        borderRadius: 9,
        borderWidth: 2,
        borderColor: colors.amber,
        marginTop: 1,
      }}
    />
  );
}

/** A ring that rotates via SVG, avoiding the platform ActivityIndicator. */
function SpinningRing() {
  const spin = useLoop(true, 900);
  const reduce = useReduceMotion();
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  return (
    <Animated.View
      style={{ width: 18, height: 18, marginTop: 1, transform: [{ rotate }] }}
    >
      <Svg width={18} height={18}>
        <Circle
          cx={9}
          cy={9}
          r={7}
          stroke={reduce ? colors.lime : "rgba(184,242,60,0.25)"}
          strokeWidth={2.5}
          fill="none"
        />
        {reduce ? null : (
          <Path
            d="M9 2 a7 7 0 0 1 7 7"
            stroke={colors.lime}
            strokeWidth={2.5}
            strokeLinecap="round"
            fill="none"
          />
        )}
      </Svg>
    </Animated.View>
  );
}

/** Copy affordance under an assistant answer. */
export function MessageActions({ text }: { text: string }) {
  const [copied, set_copied] = useState(false);
  return (
    <Row start gap={4} style={{ marginTop: 2 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={copied ? "Answer copied" : "Copy answer"}
        onPress={() => {
          void Clipboard.setStringAsync(text).then(() => {
            set_copied(true);
          });
        }}
        style={({ pressed }) => [
          {
            minHeight: 44,
            minWidth: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 10,
            borderRadius: 10,
          },
          pressed && { opacity: 0.6 },
        ]}
      >
        <Feather
          name={copied ? "check" : "copy"}
          size={13}
          color={copied ? colors.lime : colors.dim}
        />
        <T size={11} weight="semi" color={copied ? colors.lime : colors.dim}>
          {copied ? "Copied" : "Copy"}
        </T>
      </Pressable>
    </Row>
  );
}

/**
 * Composer microphone, drawn to Vittaz's own line weight instead of borrowing
 * the platform glyph set. Same 1.7 stroke and 24-unit grid as the other marks,
 * so it reads as part of the app rather than a stock icon.
 */
export function MicGlyph({ size = 20, color }: { size?: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={9}
        y={2.5}
        width={6}
        height={11}
        rx={3}
        stroke={color}
        strokeWidth={1.7}
      />
      <Path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <Path
        d="M12 18v3.4"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
      />
    </Svg>
  );
}
