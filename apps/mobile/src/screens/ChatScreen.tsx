import { useRef } from "react";
import type { ComponentRef } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useApp } from "../store";
import { Markdown } from "../Markdown";
import { formatPaise } from "../domain";
import type { AppState } from "../domain";
import { colors, gradients } from "../theme";
import {
  B,
  Button,
  Card,
  EmptyState,
  Input,
  M,
  PageHeader,
  Row,
  Screen,
  T,
} from "../ui";

const MODEL_LABEL: Record<AppState["model"], string> = {
  auto: "Auto, Kilo Auto Free",
  "openai-compatible": "OpenAI-compatible BYOK",
  "qwen-1.5b": "Qwen 1.5B",
  "qwen-3b": "Qwen 3B",
  claude: "Claude API-key BYOK",
  gemini: "Auto, Gemini",
  free: "Free tier",
};

const SUGGESTIONS = [
  { label: "Who owes me?", text: "Who owes me?" },
  { label: "Monthly spend", text: "What did I spend this month?" },
  { label: "Food spend", text: "How much on food?" },
  { label: "Pending review", text: "What is pending?" },
];

export function ChatScreen() {
  const { state, dispatch } = useApp();
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const proposal = state.transactions.find(
    (t) => t.id === state.chatProposalId,
  );

  return (
    <Screen variant="fixed" contentStyle={{ paddingHorizontal: 0 }}>
      <View style={{ paddingHorizontal: 20 }}>
        <PageHeader
          title="Assistant"
          onBack={() => dispatch({ type: "back" })}
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={MODEL_LABEL[state.model]}
              onPress={() => dispatch({ type: "navigate", screen: "models" })}
              style={({ pressed }) => [
                {
                  minHeight: 44,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  backgroundColor: colors.limeBg,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <T size={12} weight="bold" color={colors.lime}>
                {MODEL_LABEL[state.model]}
              </T>
              <Feather name="chevron-down" size={14} color={colors.lime} />
            </Pressable>
          }
        />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: false })
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 12,
            gap: 14,
          }}
        >
          {state.chatMessages.length === 0 ? (
            <EmptyState
              title="Ask or add by message"
              copy="Ask read-only questions about your ledger. The assistant cannot add or approve entries."
            />
          ) : null}

          <M size={12} style={{ lineHeight: 17 }}>
            {state.model === "openai-compatible"
              ? "Questions and read-only ledger context are sent to your configured service. Check its data policy; use synthetic data only."
              : state.model === "claude"
                ? "Questions and read-only ledger context are sent directly to Anthropic's Messages API using your API key. Check Anthropic's data policy; use synthetic data only."
                : "Kilo Auto Free may route prompts to providers that log them. Do not enter personal or confidential data; use synthetic data only."}
          </M>

          {state.chatMessages.map((m) =>
            m.role === "user" ? (
              <LinearGradient
                key={m.id}
                colors={gradients.bubble}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "80%",
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  borderBottomLeftRadius: 20,
                  borderBottomRightRadius: 6,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                }}
              >
                <T size={15} weight="semi" color={colors.limeDark}>
                  {m.text}
                </T>
              </LinearGradient>
            ) : (
              <Markdown key={m.id} text={m.text} style={{ maxWidth: "90%" }} />
            ),
          )}

          {state.chatSteps.length > 0 ? (
            <LinearGradient
              colors={gradients.hero}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={{
                borderRadius: 18,
                borderWidth: 1,
                borderColor: "rgba(190,255,120,0.28)",
                paddingVertical: 4,
                paddingHorizontal: 14,
              }}
            >
              {state.chatSteps.map((step, index) => (
                <Row
                  key={step.tool}
                  start
                  gap={10}
                  style={[
                    { paddingVertical: 10, alignItems: "flex-start" },
                    index > 0 && {
                      borderTopWidth: 1,
                      borderTopColor: colors.hairline,
                    },
                  ]}
                >
                  {step.state === "done" ? (
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
                  ) : step.state === "running" ? (
                    <ActivityIndicator
                      size="small"
                      color={colors.lime}
                      style={{ width: 18, height: 18, marginTop: 1 }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 2,
                        borderColor: "#f5a524",
                        marginTop: 1,
                      }}
                    />
                  )}
                  <View style={{ flex: 1 }}>
                    <B size={14}>{step.label}</B>
                    <Row
                      start
                      gap={6}
                      style={{ marginTop: 4, flexWrap: "wrap" }}
                    >
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
              ))}
            </LinearGradient>
          ) : null}

          {state.chatMode === "thinking" ? (
            <M size={12}>
              {state.model === "openai-compatible"
                ? "Asking your selected provider…"
                : state.model === "claude"
                  ? "Asking Anthropic Claude…"
                  : "Asking Kilo Auto Free…"}
            </M>
          ) : null}

          {proposal && state.chatMode === "approval" ? (
            <Card tone="soft">
              <Row>
                <B>{proposal.title}</B>
                <B>{formatPaise(proposal.amountPaise)}</B>
              </Row>
              <M>Paid by you, today</M>
              <Row
                style={{
                  marginTop: 12,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: "rgba(255,255,255,0.1)",
                }}
              >
                <M>{proposal.category}</M>
                <B color={colors.lime}>{formatPaise(proposal.amountPaise)}</B>
              </Row>
              <Row gap={8} style={{ marginTop: 14 }}>
                <Button
                  label="Approve"
                  small
                  style={{ flex: 1.4 }}
                  onPress={() => dispatch({ type: "approve", id: proposal.id })}
                />
                <Button
                  label="Edit"
                  variant="ghost"
                  small
                  style={{ flex: 1 }}
                  onPress={() =>
                    dispatch({ type: "open_review", id: proposal.id })
                  }
                />
                <Button
                  label="Reject"
                  variant="ghost"
                  small
                  style={{ flex: 1 }}
                  onPress={() => dispatch({ type: "reject", id: proposal.id })}
                />
              </Row>
            </Card>
          ) : null}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginBottom: 8 }}
          contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
        >
          {SUGGESTIONS.map((chip) => (
            <Pressable
              key={chip.label}
              accessibilityRole="button"
              accessibilityLabel={chip.label}
              disabled={state.chatMode === "thinking"}
              onPress={() =>
                dispatch({ type: "send_chat_text", text: chip.text })
              }
              style={({ pressed }) => [
                {
                  height: 44,
                  paddingHorizontal: 16,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(190,255,120,0.25)",
                  backgroundColor: "rgba(9,22,11,0.9)",
                  alignItems: "center",
                  justifyContent: "center",
                },
                pressed && { opacity: 0.7 },
              ]}
            >
              <T size={14} weight="semi">
                {chip.label}
              </T>
            </Pressable>
          ))}
        </ScrollView>

        <Row
          gap={4}
          style={{
            marginHorizontal: 12,
            marginBottom: 14,
            height: 60,
            borderRadius: 30,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.panelBorder,
            paddingLeft: 18,
            paddingRight: 8,
          }}
        >
          <View style={{ flex: 1 }}>
            <Input
              label="Message"
              placeholder="Message"
              textStyle={{
                flex: 1,
                minHeight: 44,
                textAlignVertical: "center",
              }}
              value={state.chatInput}
              onChangeText={(value) =>
                dispatch({ type: "set_chat_input", value })
              }
              onSubmitEditing={() => dispatch({ type: "send_chat" })}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voice input"
            onPress={() =>
              dispatch({
                type: "show_toast",
                message: "Voice input is not connected in this UI preview.",
              })
            }
            style={styles.round}
          >
            <Feather name="mic" size={22} color={colors.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: state.chatMode === "thinking" }}
            disabled={state.chatMode === "thinking"}
            onPress={() => dispatch({ type: "send_chat" })}
            style={[styles.round, { backgroundColor: colors.lime }]}
          >
            <Feather name="arrow-up" size={20} color={colors.limeDark} />
          </Pressable>
        </Row>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = {
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
};
