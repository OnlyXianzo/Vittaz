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
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  LoaderCircle,
} from "lucide-react-native";
import { colors } from "./theme";
import type { ChatStep } from "./domain";
import { B, M, Row, T } from "./ui";

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
  // Three plain views fading in sequence off one shared driver value. No SVG is
  // needed for circles, and animated Views are cheaper on the native thread.
  const progress = useLoop(true);
  const reduce = useReduceMotion();
  return (
    <Row start gap={8} style={{ alignItems: "center" }}>
      {[0, 1, 2].map((index) => {
        const shift = index / 3;
        const opacity = reduce
          ? 0.75
          : progress.interpolate({
              inputRange: [0, shift, shift + 0.2, 1],
              outputRange: [0.25, 0.25, 1, 0.25],
              extrapolate: "clamp",
            });
        return (
          <Animated.View
            key={index}
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: colors.lime,
              opacity,
            }}
          />
        );
      })}
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
    steps.length === 1 ? "1 ledger lookup" : `${steps.length} ledger lookups`;
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
        {running ? (
          <LoaderCircle size={14} color={colors.lime} strokeWidth={2.4} />
        ) : (
          <Check size={14} color={colors.lime} strokeWidth={3} />
        )}
        <T size={13} weight="semi" style={{ flex: 1 }}>
          {running ? "Reading your ledger" : summary}
        </T>
        {open ? (
          <ChevronUp size={16} color={colors.muted} strokeWidth={2.2} />
        ) : (
          <ChevronDown size={16} color={colors.muted} strokeWidth={2.2} />
        )}
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
        <Check size={11} color={colors.limeDark} strokeWidth={3} />
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

/** Running state: Lucide's LoaderCircle, rotated by a native driver value. */
function SpinningRing() {
  const spin = useLoop(true, 900);
  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  // `spin` never leaves 0 under Reduce Motion, so the ring simply stays still.
  return (
    <Animated.View style={{ transform: [{ rotate }], marginTop: 1 }}>
      <LoaderCircle size={17} color={colors.lime} strokeWidth={2.4} />
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
        {copied ? (
          <Check size={13} color={colors.lime} strokeWidth={3} />
        ) : (
          <Copy size={13} color={colors.dim} strokeWidth={2.2} />
        )}
        <T size={11} weight="semi" color={copied ? colors.lime : colors.dim}>
          {copied ? "Copied" : "Copy"}
        </T>
      </Pressable>
    </Row>
  );
}
