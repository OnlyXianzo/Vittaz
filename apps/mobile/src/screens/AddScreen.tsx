import { Pressable, View } from "react-native";
import { Feather, Ionicons } from "@expo/vector-icons";
import { useApp } from "../store";
import type { Direction, Mode } from "../domain";
import { colors, fonts } from "../theme";
import {
  B,
  Button,
  Card,
  Chip,
  Input,
  M,
  PageHeader,
  Pill,
  Row,
  Screen,
  T,
} from "../ui";

const DIRECTIONS: Direction[] = ["spent", "received", "lent"];
const CATEGORIES = ["Food", "Travel", "Shopping", "Rent"];
const MODES: Mode[] = ["Cash", "UPI", "Card"];

export function AddScreen() {
  const { state, dispatch } = useApp();
  const draft = state.addDraft;
  const nextMode = MODES[(MODES.indexOf(draft.mode) + 1) % MODES.length];

  return (
    <Screen
      footer={
        <View style={{ gap: 8 }}>
          <M size={12} style={{ textAlign: "center" }}>
            You entered this yourself, so it skips the review inbox.
          </M>
          <Button
            label="Save transaction"
            onPress={() => dispatch({ type: "add_transaction" })}
          />
        </View>
      }
    >
      <PageHeader
        title="Add transaction"
        onBack={() => dispatch({ type: "back" })}
        right={<Pill>Saves as verified</Pill>}
      />
      <Card style={{ marginTop: 12 }}>
        <M>Amount</M>
        <Row start gap={4} style={{ alignItems: "flex-end" }}>
          <T size={30} weight="heavy">
            ₹
          </T>
          <Input
            label="Amount"
            value={draft.amount}
            keyboardType="decimal-pad"
            onChangeText={(amount) =>
              dispatch({ type: "update_draft", patch: { amount } })
            }
            textStyle={{ fontSize: 38, fontFamily: fonts.heavy, flex: 1 }}
          />
        </Row>
      </Card>

      <Row start gap={8} style={{ marginTop: 10, flexWrap: "wrap" }}>
        {DIRECTIONS.map((d) => (
          <Chip
            key={d}
            label={d.charAt(0).toUpperCase() + d.slice(1)}
            selected={draft.direction === d}
            onPress={() =>
              dispatch({ type: "update_draft", patch: { direction: d } })
            }
          />
        ))}
      </Row>
      <Row start gap={8} style={{ marginTop: 10, flexWrap: "wrap" }}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={c}
            selected={draft.category === c}
            onPress={() =>
              dispatch({ type: "update_draft", patch: { category: c } })
            }
          />
        ))}
      </Row>

      <Row gap={10} style={{ marginTop: 10 }}>
        <Card style={{ flex: 1, paddingVertical: 10 }}>
          <Row>
            <M>Person</M>
            <Input
              label="Person"
              value={draft.person}
              onChangeText={(person) =>
                dispatch({ type: "update_draft", patch: { person } })
              }
              textStyle={{
                textAlign: "right",
                fontFamily: fonts.bold,
                flex: 1,
                marginLeft: 8,
              }}
            />
          </Row>
        </Card>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mode"
          accessibilityHint={`Changes the payment mode, currently ${draft.mode}`}
          onPress={() =>
            dispatch({ type: "update_draft", patch: { mode: nextMode } })
          }
          style={({ pressed }) => [
            {
              flex: 1,
              paddingVertical: 10,
              paddingHorizontal: 16,
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.cardBorder,
              borderRadius: 22,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <Row>
            <M>Mode</M>
            <Row gap={4}>
              <B size={15}>{draft.mode}</B>
              <Feather name="chevron-down" size={14} color={colors.muted} />
            </Row>
          </Row>
        </Pressable>
      </Row>

      <Card style={{ marginTop: 10, paddingVertical: 12 }}>
        <M>Note</M>
        <Input
          label="Note"
          value={draft.note}
          multiline
          onChangeText={(note) =>
            dispatch({ type: "update_draft", patch: { note } })
          }
          textStyle={{ height: 56, marginTop: 4, textAlignVertical: "top" }}
        />
      </Card>

      <Button
        label="Improve note"
        variant="ghost"
        small
        labelColor={colors.lime}
        icon={<Ionicons name="sparkles" size={18} color={colors.lime} />}
        style={{ marginTop: 10, borderColor: "rgba(184,242,60,0.5)" }}
        onPress={() => dispatch({ type: "improve_note" })}
      />

      {state.improvedNote ? (
        <Card
          tone="soft"
          style={{ marginTop: 10, borderColor: "rgba(184,242,60,0.4)" }}
        >
          <Row>
            <M>Improved note</M>
            <Pill>Local cleanup</Pill>
          </Row>
          <T size={15} style={{ marginTop: 6, lineHeight: 21 }}>
            {state.improvedNote}
          </T>
          <Row gap={8} style={{ marginTop: 10 }}>
            <Button
              label="Use this"
              small
              style={{ flex: 1 }}
              onPress={() => dispatch({ type: "use_improved_note" })}
            />
            <Button
              label="Keep mine"
              variant="ghost"
              small
              style={{ flex: 1 }}
              onPress={() => dispatch({ type: "keep_note" })}
            />
          </Row>
        </Card>
      ) : null}
    </Screen>
  );
}
