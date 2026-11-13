import { Check, Download, Inbox, MessageCircle, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";
import { useApp } from "../store";
import { colors, radii } from "../theme";
import {
  B,
  Button,
  Card,
  Chip,
  Input,
  LinkButton,
  M,
  Pill,
  Radio,
  Row,
  Screen,
  T,
} from "../ui";

/** Soft drifting blobs, the native stand-in for the CSS radial gradients. */
function Blob({
  size,
  color,
  style,
  dx,
  dy,
  duration,
}: {
  size: number;
  color: string;
  style: object;
  dx: number;
  dy: number;
  duration: number;
}) {
  // Animated values are state, not refs: they are read while rendering.
  const [progress] = useState(() => new Animated.Value(0));
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, duration, reduceMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: 0.55,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, dx],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, dy],
              }),
            },
          ],
        },
        style,
      ]}
    />
  );
}

function Dots({ step }: { step: 0 | 1 | 2 }) {
  return (
    <Row gap={6} style={{ justifyContent: "center", marginBottom: 14 }}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={{
            height: 6,
            width: i === step ? 22 : 6,
            borderRadius: 3,
            backgroundColor:
              i === step ? colors.lime : "rgba(255,255,255,0.25)",
          }}
        />
      ))}
    </Row>
  );
}

export function OnboardingScreen() {
  const { state, dispatch } = useApp();
  const step = state.onboardingStep;
  const [apiKey, setApiKey] = useState("");
  const [provider, setProvider] = useState("Claude");

  return (
    <Screen variant="fixed">
      <Blob
        size={430}
        color="rgba(120,225,40,0.16)"
        style={{ left: -150, top: -140 }}
        dx={70}
        dy={90}
        duration={16000}
      />
      <Blob
        size={400}
        color="rgba(40,170,100,0.16)"
        style={{ right: -170, top: 260 }}
        dx={-80}
        dy={-60}
        duration={21000}
      />
      <Blob
        size={320}
        color="rgba(200,245,70,0.10)"
        style={{ left: 10, bottom: -110 }}
        dx={90}
        dy={-60}
        duration={25000}
      />

      {step === 0 ? (
        <>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 20,
              backgroundColor: colors.lime,
              alignItems: "center",
              justifyContent: "center",
              marginTop: 92 - 28,
            }}
          >
            <T size={30} weight="heavy" color={colors.limeDark}>
              V
            </T>
          </View>
          <T
            accessibilityRole="header"
            size={38}
            weight="heavy"
            style={{ marginTop: 28, marginBottom: 14, lineHeight: 42 }}
          >
            Hey mate, welcome to Vittaz
          </T>
          <T size={17} color="#c4d4c0" style={{ lineHeight: 26 }}>
            Track what you spend, lend and owe. Add entries by tapping or by
            messaging, and an AI helps keep them straight.
          </T>
          <View style={{ marginTop: 28 }}>
            {[
              "Your data stays on your phone",
              "The AI drafts, you approve",
              "Bring your own model or API key",
            ].map((text) => (
              <Row key={text} start gap={10} style={{ paddingVertical: 6 }}>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    backgroundColor: "rgba(184,242,60,0.18)",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Check size={11} color={colors.lime} />
                </View>
                <T size={15}>{text}</T>
              </Row>
            ))}
          </View>
          <View style={{ marginTop: "auto", paddingTop: 24 }}>
            <Dots step={step} />
            <Button
              label="Get started"
              onPress={() => dispatch({ type: "set_onboarding_step", step: 1 })}
            />
            <LinkButton
              label="Already have a backup? Restore"
              style={{ alignItems: "center", paddingTop: 12 }}
              onPress={() =>
                dispatch({
                  type: "show_toast",
                  message: "Restore is not connected in this UI preview.",
                })
              }
            />
          </View>
        </>
      ) : null}

      {step === 1 ? (
        <>
          <T
            accessibilityRole="header"
            size={32}
            weight="heavy"
            style={{ marginTop: 72 - 28, marginBottom: 6, lineHeight: 37 }}
          >
            How entries get in
          </T>
          <M size={15}>Everything lands in one ledger.</M>
          <View style={{ marginTop: 14 }}>
            {[
              {
                icon: Plus,
                title: "Tap it in",
                copy: "Amount, category, save. Entries you add yourself are marked verified.",
              },
              {
                icon: MessageCircle,
                title: "Message it",
                copy: "Send a text in the app or on Telegram. The AI drafts the entry and waits for you.",
              },
              {
                icon: Inbox,
                title: "Catch the rest",
                copy: "Bank alerts land in an inbox as unverified until you confirm them.",
              },
            ].map(({ icon: Icon, title, copy }) => (
              <Card key={title} style={{ marginTop: 12 }}>
                <Row start gap={14} style={{ alignItems: "flex-start" }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 14,
                      backgroundColor: "rgba(184,242,60,0.16)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon size={22} color={colors.lime} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <B size={16}>{title}</B>
                    <M size={14} style={{ marginTop: 4, lineHeight: 20 }}>
                      {copy}
                    </M>
                  </View>
                </Row>
              </Card>
            ))}
          </View>
          <View style={{ marginTop: "auto", paddingTop: 24 }}>
            <Dots step={step} />
            <Button
              label="Continue"
              onPress={() => dispatch({ type: "set_onboarding_step", step: 2 })}
            />
            <LinkButton
              label="Skip"
              style={{ alignItems: "center", paddingTop: 12 }}
              onPress={() => dispatch({ type: "finish_onboarding" })}
            />
          </View>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <T
            accessibilityRole="header"
            size={30}
            weight="heavy"
            style={{ marginTop: 56 - 28, marginBottom: 6, lineHeight: 35 }}
          >
            Pick how the AI runs
          </T>
          <M size={15} style={{ lineHeight: 21 }}>
            Use one or both. Auto picks the right one for each job.
          </M>
          <Card
            tone="soft"
            style={{ marginTop: 14, borderColor: "rgba(184,242,60,0.5)" }}
          >
            <Row>
              <Row start gap={10}>
                <Radio on />
                <B>On this phone</B>
              </Row>
              <Pill>Private</Pill>
            </Row>
            <M
              size={14}
              style={{ marginTop: 8, marginBottom: 12, lineHeight: 20 }}
            >
              Qwen 1.5B, 1.1 GB. Works offline and nothing leaves your phone.
            </M>
            <Button
              label="Download model"
              variant="ghost"
              small
              icon={<Download size={16} color={colors.text} />}
              onPress={() =>
                dispatch({
                  type: "show_toast",
                  message:
                    "Model downloads are not connected in this UI preview.",
                })
              }
            />
          </Card>
          <Card style={{ marginTop: 12 }}>
            <Row start gap={10}>
              <Radio on />
              <B>Your own API key</B>
            </Row>
            <Row start gap={8} style={{ marginVertical: 12, flexWrap: "wrap" }}>
              {["Claude", "Gemini", "OpenAI"].map((name) => (
                <Chip
                  key={name}
                  label={name}
                  selected={provider === name}
                  onPress={() => setProvider(name)}
                />
              ))}
            </Row>
            <View
              style={{
                height: 48,
                borderRadius: radii.tile,
                borderWidth: 1,
                borderColor: colors.cardBorder,
                backgroundColor: colors.card,
                paddingHorizontal: 14,
                justifyContent: "center",
              }}
            >
              <Input
                label="API key"
                placeholder="Paste your API key"
                secure
                value={apiKey}
                onChangeText={setApiKey}
              />
            </View>
            <M size={12} style={{ marginTop: 10, lineHeight: 17 }}>
              Demo only. Keys are not stored or sent in this preview.
            </M>
          </Card>
          <View style={{ marginTop: "auto", paddingTop: 24 }}>
            <Dots step={step} />
            <Button
              label="Finish setup"
              onPress={() => dispatch({ type: "finish_onboarding" })}
            />
            <LinkButton
              label="Skip for now, I will add entries by hand"
              style={{ alignItems: "center", paddingTop: 12 }}
              onPress={() => dispatch({ type: "finish_onboarding" })}
            />
          </View>
        </>
      ) : null}
    </Screen>
  );
}
