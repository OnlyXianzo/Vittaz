import { useRef, useState } from "react";
import type { ComponentRef } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useApp } from "../store";
import { Markdown } from "../Markdown";
import {
  MessageActions,
  MicGlyph,
  ReasoningBlock,
  ThinkingDots,
} from "../chat_elements";
import { format_tokens } from "../assistant/tokens";
import { InstructionsScreen } from "./InstructionsScreen";
import { formatPaise } from "../domain";
import type { AppState } from "../domain";
import { colors, gradients } from "../theme";
import {
  B,
  Button,
  Card,
  IconBtn,
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

/**
 * Short form shown inside the header pill. The full route stays as the
 * accessible name, so nothing is lost for screen readers — the long label just
 * no longer eats half the header.
 */
const MODEL_SHORT: Record<AppState["model"], string> = {
  auto: "Auto",
  "openai-compatible": "BYOK",
  "qwen-1.5b": "Qwen 1.5B",
  "qwen-3b": "Qwen 3B",
  claude: "Claude",
  gemini: "Gemini",
  free: "Free",
};

const SUGGESTIONS = [
  { label: "Who owes me?", text: "Who owes me?" },
  { label: "Monthly spend", text: "What did I spend this month?" },
  { label: "Food spend", text: "How much on food?" },
  { label: "Pending review", text: "What is pending?" },
];

export function ChatScreen() {
  const {
    state,
    dispatch,
    conversations,
    activeConversationId,
    changeConversation,
    deleteConversation,
  } = useApp();
  const [show_menu, set_show_menu] = useState(false);
  const [subscreen, set_subscreen] = useState<
    "instructions" | "connectors" | null
  >(null);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const proposal = state.transactions.find(
    (t) => t.id === state.chatProposalId,
  );

  if (subscreen === "instructions")
    return <InstructionsScreen onBack={() => set_subscreen(null)} />;
  if (subscreen === "connectors")
    return (
      <Screen>
        <PageHeader title="Connectors" onBack={() => set_subscreen(null)} />
        <Card style={{ marginTop: 16, gap: 8 }}>
          <B>Connectors are not available in this mobile app</B>
          <M>
            Connecting external services and Telegram pairing are not available
            in this mobile interface yet. No external services can be connected
            or managed here.
          </M>
        </Card>
        <Button
          label="Back to chat"
          variant="ghost"
          onPress={() => set_subscreen(null)}
        />
      </Screen>
    );

  const privacy_note =
    state.model === "openai-compatible"
      ? "Questions and read-only ledger context are sent to your configured service. Check its data policy; use synthetic data only."
      : state.model === "claude"
        ? "Questions and read-only ledger context are sent directly to Anthropic's Messages API using your API key. Check Anthropic's data policy; use synthetic data only."
        : "Kilo Auto Free may route prompts to providers that log them. Do not enter personal or confidential data; use synthetic data only.";

  return (
    <View style={styles.flex}>
      <Screen variant="fixed" contentStyle={{ paddingHorizontal: 0 }}>
        <View style={{ paddingHorizontal: 12 }}>
          <PageHeader
            title="Assistant"
            onBack={() => dispatch({ type: "back" })}
            right={
              <Row start gap={2}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={MODEL_LABEL[state.model]}
                  onPress={() => dispatch({ type: "navigate", screen: "models" })}
                  style={({ pressed }) => [
                    styles.modelPill,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <T size={12} weight="bold" color={colors.lime}>
                    {MODEL_SHORT[state.model]}
                  </T>
                  <Feather name="chevron-down" size={14} color={colors.lime} />
                </Pressable>
                <IconBtn
                  label="Assistant menu"
                  onPress={() => set_show_menu(true)}
                >
                  <Feather name="menu" size={20} color={colors.text} />
                </IconBtn>
              </Row>
            }
          />
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              scrollRef.current?.scrollToEnd({ animated: false })
            }
            contentContainerStyle={{
              paddingHorizontal: 20,
              paddingTop: 8,
              paddingBottom: 8,
              gap: 18,
            }}
          >
            {state.chatMessages.length === 0 ? (
              <View style={{ paddingTop: 20, gap: 10 }}>
                <View style={styles.emptyGlyph}>
                  <Feather name="message-circle" size={22} color={colors.lime} />
                </View>
                <T size={24} weight="heavy" style={{ lineHeight: 30 }}>
                  How can I help?
                </T>
                <M size={13} style={{ lineHeight: 19 }}>
                  Ask read-only questions about your ledger. The assistant cannot
                  add or approve entries.
                </M>
              </View>
            ) : null}

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
                <View key={m.id} style={{ maxWidth: "92%", gap: 4 }}>
                  <Markdown text={m.text} />
                  <Row start gap={10} style={{ alignItems: "center" }}>
                    {m.tokens !== undefined ? (
                      <T size={11} color={colors.dim}>
                        {`${format_tokens(m.tokens)} tokens`}
                      </T>
                    ) : null}
                    <MessageActions text={m.text} />
                  </Row>
                </View>
              ),
            )}

            <ReasoningBlock
              steps={state.chatSteps}
              running={state.chatMode === "thinking"}
            />

            {state.chatMode === "thinking" ? (
              <ThinkingDots
                label={
                  state.model === "openai-compatible"
                    ? "Asking your selected provider…"
                    : state.model === "claude"
                      ? "Asking Anthropic Claude…"
                      : "Asking Kilo Auto Free…"
                }
              />
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

            {/*
              Data-handling disclosure. Kept at the end of the transcript rather
              than above it so the conversation starts clean, but still always
              present: it must be readable without opening any menu.
            */}
            <M size={11} style={styles.disclosure}>
              {privacy_note}
            </M>
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
                  styles.suggestion,
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
              <MicGlyph size={21} color={colors.muted} />
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
          {(state.chatTokens ?? 0) > 0 ? (
            // Session usage built only from counts the provider reported. No
            // prompt, reply or key text can reach this label.
            <T size={11} color={colors.dim} style={styles.sessionTokens}>
              {`${format_tokens(state.chatTokens ?? 0)} tokens this session`}
            </T>
          ) : null}
        </KeyboardAvoidingView>
      </Screen>

      {show_menu ? (
        <AssistantDrawer
          conversations={conversations}
          active_id={activeConversationId}
          busy={state.chatMode === "thinking"}
          onClose={() => set_show_menu(false)}
          onNew={() => {
            set_show_menu(false);
            void changeConversation(null);
          }}
          onOpen={(id) => {
            set_show_menu(false);
            void changeConversation(id);
          }}
          onDelete={(id) =>
            Alert.alert(
              "Delete conversation?",
              "This removes its saved messages from this device.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => {
                    void deleteConversation(id);
                  },
                },
              ],
            )
          }
          onInstructions={() => {
            set_show_menu(false);
            set_subscreen("instructions");
          }}
          onConnectors={() => {
            set_show_menu(false);
            set_subscreen("connectors");
          }}
          onSettings={() => {
            set_show_menu(false);
            dispatch({ type: "navigate", screen: "settings" });
          }}
        />
      ) : null}
    </View>
  );
}

type DrawerChat = { id: string; title: string };

/**
 * Slide-over drawer. Mirrors the shape ChatGPT, Claude and Grok converged on —
 * destinations at the top, every saved conversation listed directly beneath
 * them, and the two controls that are places-you-go-to (search, settings) pinned
 * to the footer — while keeping Vittaz's own panel, type and accent tokens.
 *
 * History lives here rather than on its own screen on purpose: opening a past
 * conversation should cost one tap from the chat, not a navigation round trip
 * through a screen whose only job was to re-list what the drawer can show.
 */
function AssistantDrawer({
  conversations,
  active_id,
  busy,
  onClose,
  onNew,
  onOpen,
  onDelete,
  onInstructions,
  onConnectors,
  onSettings,
}: {
  conversations: readonly DrawerChat[];
  active_id: string | null;
  busy: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onInstructions: () => void;
  onConnectors: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [search_open, set_search_open] = useState(false);
  const [query, set_query] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle
    ? conversations.filter((chat) => chat.title.toLowerCase().includes(needle))
    : conversations;

  return (
    <View style={styles.overlay}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss menu"
        onPress={onClose}
        style={styles.backdrop}
      />
      <View
        style={[
          styles.drawer,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 12 },
        ]}
      >
        <Row style={{ paddingHorizontal: 8, marginBottom: 10 }}>
          <B size={16}>Assistant</B>
          <IconBtn label="Close menu" onPress={onClose}>
            <Feather name="x" size={20} color={colors.muted} />
          </IconBtn>
        </Row>

        {search_open ? (
          <Row
            gap={4}
            style={{
              marginBottom: 6,
              paddingLeft: 12,
              borderRadius: 999,
              backgroundColor: colors.panel,
              borderWidth: 1,
              borderColor: colors.panelBorder,
              minHeight: 44,
            }}
          >
            <View style={{ flex: 1 }}>
              <Input
                label="Search saved chats"
                placeholder="Search chats"
                value={query}
                onChangeText={set_query}
                autoCapitalize="none"
                textStyle={{ minHeight: 42, textAlignVertical: "center" }}
              />
            </View>
            <IconBtn
              label="Close search"
              onPress={() => {
                set_search_open(false);
                set_query("");
              }}
            >
              <Feather name="x" size={18} color={colors.muted} />
            </IconBtn>
          </Row>
        ) : null}

        <DrawerRow
          icon="edit"
          label="New chat"
          disabled={busy}
          onPress={onNew}
        />
        <DrawerRow
          icon="sliders"
          label="Custom instructions"
          onPress={onInstructions}
        />
        <DrawerRow icon="link-2" label="Connectors" onPress={onConnectors} />

        <View style={styles.drawerRule} />
        <T
          size={11}
          weight="bold"
          color={colors.dim}
          style={{ letterSpacing: 0.8, marginBottom: 4, marginLeft: 12 }}
        >
          {needle ? "RESULTS" : "RECENTS"}
        </T>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
        >
          {shown.length === 0 ? (
            <M size={12} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
              {needle
                ? "No saved chats match that search."
                : "No saved chats yet. Your conversations appear here."}
            </M>
          ) : (
            shown.map((chat) => (
              <View
                key={chat.id}
                style={[
                  styles.chatRow,
                  chat.id === active_id && styles.chatRowActive,
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open conversation: ${chat.title}`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => onOpen(chat.id)}
                  style={({ pressed }) => [
                    styles.chatOpen,
                    pressed && { opacity: 0.7 },
                    busy && { opacity: 0.5 },
                  ]}
                >
                  {chat.id === active_id ? (
                    <View style={styles.liveDot} />
                  ) : null}
                  <T size={13} weight="semi" numberOfLines={2} style={{ flex: 1 }}>
                    {chat.title}
                  </T>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Delete conversation: ${chat.title}`}
                  accessibilityState={{ disabled: busy }}
                  disabled={busy}
                  onPress={() => onDelete(chat.id)}
                  style={({ pressed }) => [
                    styles.chatDelete,
                    pressed && { opacity: 0.6 },
                    busy && { opacity: 0.4 },
                  ]}
                >
                  <Feather name="trash-2" size={14} color={colors.dim} />
                </Pressable>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.drawerRule} />
        <Row start gap={6} style={{ paddingTop: 4 }}>
          <IconBtn
            label="Search chats"
            onPress={() => set_search_open((open) => !open)}
          >
            <Feather
              name="search"
              size={19}
              color={search_open ? colors.lime : colors.muted}
            />
          </IconBtn>
          <IconBtn label="Settings" onPress={onSettings}>
            <Feather name="settings" size={19} color={colors.muted} />
          </IconBtn>
        </Row>
      </View>
    </View>
  );
}

function DrawerRow({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        pressed && { backgroundColor: colors.ghost },
        disabled && { opacity: 0.5 },
      ]}
    >
      <Feather name={icon} size={18} color={colors.lime} />
      <T size={15} weight="semi">
        {label}
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  modelPill: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: colors.limeBg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  emptyGlyph: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.limeBg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  disclosure: {
    lineHeight: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  suggestion: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(190,255,120,0.25)",
    backgroundColor: "rgba(9,22,11,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  sessionTokens: { textAlign: "center", marginBottom: 6 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(3,8,4,0.72)",
  },
  drawer: {
    width: 288,
    maxWidth: "82%",
    height: "100%",
    backgroundColor: "#0a1a0d",
    borderRightWidth: 1,
    borderRightColor: colors.panelBorder,
    paddingHorizontal: 10,
    paddingBottom: 16,
  },
  drawerRule: {
    height: 1,
    backgroundColor: colors.hairline,
    marginVertical: 10,
    marginHorizontal: 8,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    paddingRight: 2,
  },
  chatRowActive: { backgroundColor: colors.ghost },
  chatOpen: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingLeft: 12,
    paddingRight: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.lime,
  },
  chatDelete: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
});
