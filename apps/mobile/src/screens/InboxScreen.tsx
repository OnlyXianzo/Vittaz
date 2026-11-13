import { SlidersHorizontal } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { useApp } from "../store";
import { formatPaise, selectInbox, selectPending } from "../domain";
import type { InboxFilter } from "../domain";
import { colors } from "../theme";
import {
  Avatar,
  B,
  Button,
  Card,
  Chip,
  EmptyState,
  IconBtn,
  M,
  PageHeader,
  Pill,
  Row,
  Screen,
  T,
} from "../ui";

const FILTERS: Array<{ id: InboxFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "upi", label: "UPI" },
  { id: "sms", label: "SMS" },
];

export function InboxScreen() {
  const { state, dispatch } = useApp();
  const rows = selectInbox(state);
  const pending = selectPending(state);
  const counts = {
    all: pending.length,
    upi: pending.filter((t) => t.mode === "UPI").length,
    sms: pending.filter((t) => t.mode === "SMS").length,
  };

  return (
    <Screen
      footer={
        <Button
          label={`Review selected (${state.selectedInboxIds.length})`}
          disabled={state.selectedInboxIds.length === 0}
          onPress={() => dispatch({ type: "review_selected" })}
        />
      }
    >
      <PageHeader
        title="Pending inbox"
        onBack={() => dispatch({ type: "back" })}
        right={
          <IconBtn
            label="Filter"
            onPress={() =>
              dispatch({ type: "set_inbox_filter", filter: "all" })
            }
          >
            <SlidersHorizontal size={22} color={colors.text} />
          </IconBtn>
        }
      />
      <Row start gap={8} style={{ marginTop: 10, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Chip
            key={f.id}
            label={`${f.label} ${counts[f.id]}`}
            selected={state.inboxFilter === f.id}
            onPress={() => dispatch({ type: "set_inbox_filter", filter: f.id })}
          />
        ))}
      </Row>

      {rows.length === 0 ? (
        <EmptyState
          title="Inbox is clear"
          copy="No pending entries match this filter."
        />
      ) : null}

      {rows.map((t) => {
        const selected = state.selectedInboxIds.includes(t.id);
        return (
          <Card
            key={t.id}
            style={[
              { marginTop: 12 },
              selected && { borderColor: "rgba(184,242,60,0.5)" },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Select ${t.title}`}
              accessibilityState={{ selected }}
              onPress={() =>
                dispatch({ type: "toggle_inbox_selected", id: t.id })
              }
              style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            >
              <Row>
                <Row start gap={12} style={{ flexShrink: 1 }}>
                  <Avatar transaction={t} />
                  <View style={{ flexShrink: 1 }}>
                    <B>{t.title}</B>
                    <M>
                      Today, {t.time}, {t.mode}
                    </M>
                  </View>
                </Row>
                <View style={{ alignItems: "flex-end", gap: 4 }}>
                  <B>{formatPaise(t.amountPaise)}</B>
                  {t.confidence ? <Pill>{t.confidence}% sure</Pill> : null}
                </View>
              </Row>
            </Pressable>
            <Row style={{ marginTop: 12 }}>
              <M style={{ flexShrink: 1 }}>{t.note}</M>
              <Pill tone="amber">Unverified</Pill>
            </Row>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Review"
              onPress={() => dispatch({ type: "open_review", id: t.id })}
              style={{
                marginTop: 8,
                paddingVertical: 4,
                alignSelf: "flex-start",
              }}
            >
              <T size={13} color={colors.lime}>
                Review
              </T>
            </Pressable>
          </Card>
        );
      })}
    </Screen>
  );
}
